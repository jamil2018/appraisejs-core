import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { expect, it, vi } from 'vitest'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import { canonicalRuntimeCapsuleJson, hashRuntimeCapsuleValue } from '@/lib/runtime-capsule/contracts'
import { spawnOwnedProcessGroup, stopOwnedProcessGroup } from '@/lib/process/owned-process-stop'
import type { SpawnedProcess } from '@/lib/process/task-spawner'
import { processManager } from '@/lib/test-run/process-manager'
import { RuntimeCapsuleTestRunService } from './runtime-capsule-test-run-service'
import { markCapsuleOutputCompleted, reconcileCancelledCapsuleTestRun } from './runtime-capsule-stop-service'

it.skipIf(process.platform === 'win32')(
  'persists an observed owned stop receipt across a fresh database client while final-output completion remains pending',
  async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'appraise-c31-stop-'))
    const database = path.join(directory, 'test.db')
    await copyMigratedTestDatabase(database)
    const client = new PrismaClient({ datasources: { db: { url: `file:${database}` } } })
    let owned: SpawnedProcess | undefined
    try {
      await client.targetProject.create({
        data: {
          id: 'stop-target',
          kind: 'LOCAL_WORKSPACE',
          canonicalIdentity: `path:${directory}`,
          canonicalPath: directory,
          displayName: 'Owned stop fixture',
          fingerprint: 'stop-fixture',
        },
      })
      await client.environment.create({
        data: {
          id: 'stop-env',
          targetProjectId: 'stop-target',
          name: 'Anonymous fixture',
          baseUrl: 'http://127.0.0.1',
        },
      })
      await client.testRun.create({
        data: {
          id: 'stop-run',
          runId: 'stop-public',
          targetProjectId: 'stop-target',
          environmentId: 'stop-env',
          name: 'Owned process fixture',
          status: 'RUNNING',
        },
      })
      await client.runtimeCapsule.create({
        data: {
          id: 'stop-capsule',
          targetProjectId: 'stop-target',
          testRunId: 'stop-run',
          validationHash: 'fixture',
          capsuleHash: 'fixture',
          manifestHash: 'fixture',
          manifestJson: '{}',
          storagePath: directory,
          integrityState: 'ready',
        },
      })
      await client.runtimeCapsuleExecutionAttempt.create({
        data: {
          id: 'stop-attempt',
          testRunId: 'stop-run',
          capsuleId: 'stop-capsule',
          receiptHash: 'fixture',
          preflightResultJson: '{}',
          preflightResultHash: 'fixture',
          preflightCheckedAt: new Date(),
          state: 'RUNNING',
          ownerToken: 'fixture-owner',
        },
      })
      const readyPath = path.join(directory, 'child-ready')
      // A synthetic resource acknowledges the same private fd3 close protocol as the managed browser.
      owned = await spawnOwnedProcessGroup(
        process.execPath,
        [
          '-e',
          "const fs=require('node:fs');process.on('SIGTERM',()=>{fs.writeSync(3,'appraise.browser.closed.v1\\n');process.exit(0)});fs.writeSync(3,'appraise.browser.launch-intent.v1\\n');fs.writeFileSync(process.argv[1],'ready');setInterval(()=>{},1000)",
          readyPath,
        ],
        {
          supervisorPath: path.join(process.cwd(), 'scripts/owned-process-supervisor.mjs'),
          cwd: directory,
          env: { NODE_ENV: 'test', PATH: process.env.PATH ?? '' },
          captureOutput: true,
          streamLogs: false,
          requireRuntimeBrowserClose: true,
        },
      )
      await vi.waitFor(async () => expect(await readFile(readyPath, 'utf8')).toBe('ready'))
      processManager.register('stop-public', owned)
      await expect(new RuntimeCapsuleTestRunService(client).cancel('stop-run')).resolves.toBe(true)
      const fresh = new PrismaClient({ datasources: { db: { url: `file:${database}` } } })
      try {
        const receipt = await fresh.runtimeCapsuleExecutionAttempt.findUniqueOrThrow({ where: { id: 'stop-attempt' } })
        expect(receipt.state).toBe('CANCELLED')
        expect(hashRuntimeCapsuleValue(JSON.parse(receipt.stopReceiptJson!))).toBe(receipt.stopReceiptHash)
        expect(JSON.parse(receipt.stopReceiptJson!)).toMatchObject({
          schema: 'appraise.runtime-capsule-stop/local-v1',
          testRunId: 'stop-run',
          runId: 'stop-public',
          attemptId: 'stop-attempt',
          kind: 'group_exit_observed',
          groupId: owned.pid,
          supervisorProtocol: 'appraise.owned-supervisor/v1',
          runtimeBrowserCleanup: 'CLOSE_ACKNOWLEDGED',
        })
        expect((await fresh.testRun.findUniqueOrThrow({ where: { id: 'stop-run' } })).status).toBe('CANCELLING')
        const before = receipt.stopReceiptHash
        await new RuntimeCapsuleTestRunService(fresh).cancel('stop-run')
        expect(
          (await fresh.runtimeCapsuleExecutionAttempt.findUniqueOrThrow({ where: { id: 'stop-attempt' } }))
            .stopReceiptHash,
        ).toBe(before)
        const logPath = path.join(directory, 'run.log')
        await writeFile(logPath, 'ready\n', { mode: 0o600 })
        await fresh.testRun.update({ where: { id: 'stop-run' }, data: { logPath } })
        await fresh.testRunLog.upsert({
          where: { testRunId: 'stop-public' },
          create: { testRunId: 'stop-public', logs: 'ready\n' },
          update: { logs: 'ready\n' },
        })
        await markCapsuleOutputCompleted(fresh, {
          testRunId: 'stop-run',
          attemptId: 'stop-attempt',
          ownerToken: 'fixture-owner',
        })
        const terminal = await fresh.testRun.findUniqueOrThrow({ where: { id: 'stop-run' } })
        expect(terminal.status).toBe('CANCELLED')
        expect(terminal.result).toBe('CANCELLED')
        await new RuntimeCapsuleTestRunService(fresh).cancel('stop-run')
        expect((await fresh.testRun.findUniqueOrThrow({ where: { id: 'stop-run' } })).completedAt).toEqual(
          terminal.completedAt,
        )

        // Simulate a crash after both durable prerequisites committed but before
        // either writer performed the terminal CAS. A separate client recovers it.
        const recoveryLogPath = path.join(directory, 'recovery.log')
        await writeFile(recoveryLogPath, 'final output\n', { mode: 0o600 })
        await fresh.testRun.create({
          data: {
            id: 'recovery-run',
            runId: 'recovery-public',
            targetProjectId: 'stop-target',
            environmentId: 'stop-env',
            name: 'Crash after readiness fixture',
            status: 'CANCELLING',
            logPath: recoveryLogPath,
          },
        })
        await fresh.runtimeCapsule.create({
          data: {
            id: 'recovery-capsule',
            targetProjectId: 'stop-target',
            testRunId: 'recovery-run',
            validationHash: 'recovery-fixture',
            capsuleHash: 'recovery-fixture',
            manifestHash: 'recovery-fixture',
            manifestJson: '{}',
            storagePath: path.join(directory, 'recovery'),
            integrityState: 'ready',
          },
        })
        const recoveryReceipt = {
          schema: 'appraise.runtime-capsule-stop/local-v1',
          testRunId: 'recovery-run',
          runId: 'recovery-public',
          attemptId: 'recovery-attempt',
          kind: 'group_exit_observed',
          groupId: 34567,
          observedAt: new Date().toISOString(),
          supervisorProtocol: 'appraise.owned-supervisor/v1',
          runtimeBrowserCleanup: 'CLOSE_ACKNOWLEDGED',
        }
        await fresh.runtimeCapsuleExecutionAttempt.create({
          data: {
            id: 'recovery-attempt',
            testRunId: 'recovery-run',
            capsuleId: 'recovery-capsule',
            receiptHash: 'fixture',
            preflightResultJson: '{}',
            preflightResultHash: 'fixture',
            preflightCheckedAt: new Date(),
            ownerToken: 'recovery-owner',
            state: 'CANCELLED',
            stopReceiptJson: canonicalRuntimeCapsuleJson(recoveryReceipt),
            stopReceiptHash: hashRuntimeCapsuleValue(recoveryReceipt),
            outputCompletedAt: new Date(),
          },
        })
        const restarted = new PrismaClient({ datasources: { db: { url: `file:${database}` } } })
        try {
          expect(await reconcileCancelledCapsuleTestRun(restarted, 'recovery-run')).toBe(true)
          const first = await restarted.testRun.findUniqueOrThrow({ where: { id: 'recovery-run' } })
          expect(first.status).toBe('CANCELLED')
          expect(await reconcileCancelledCapsuleTestRun(restarted, 'recovery-run')).toBe(true)
          expect((await restarted.testRun.findUniqueOrThrow({ where: { id: 'recovery-run' } })).completedAt).toEqual(
            first.completedAt,
          )
        } finally {
          await restarted.$disconnect()
        }
      } finally {
        await fresh.$disconnect()
      }
    } finally {
      if (owned) await stopOwnedProcessGroup(owned)
      processManager.unregister('stop-public')
      await client.$disconnect()
      await rm(directory, { recursive: true, force: true })
    }
  },
  30_000,
)
