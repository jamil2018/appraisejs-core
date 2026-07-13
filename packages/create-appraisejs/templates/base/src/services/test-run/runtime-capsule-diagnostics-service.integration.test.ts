import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  canonicalRuntimeCapsuleJson,
  hashRuntimeCapsuleValue,
  RuntimeCapsuleMaterializer,
  RuntimeCapsulePreflight,
} from '@/lib/runtime-capsule'
import { processManager } from '@/lib/test-run/process-manager'
import { prepareCleanCoordinatorPlanRuntimeTestDatabase } from '@/test/plan-runtime-schema-test-helper'
import { seedReviewedCapsuleLifecycleFixture } from '@/test/reviewed-capsule-lifecycle-fixture'
import { sqliteTestClient } from '@/test/validation-ast-test-fixtures'
import { readRuntimeCapsuleDiagnostic } from './runtime-capsule-diagnostics-service'

describe('runtime capsule bounded diagnostics in SQLite', () => {
  let workspace: string
  let client: PrismaClient
  let environmentId: string
  let runId: string
  let projectId: string
  let attemptId: string
  let preflightJson: string

  beforeAll(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-capsule-diagnostic-'))
    const databasePath = path.join(workspace, 'diagnostic.db')
    await fs.copyFile(path.join(process.cwd(), 'prisma', 'dev.db'), databasePath)
    await prepareCleanCoordinatorPlanRuntimeTestDatabase(databasePath)
    client = sqliteTestClient(databasePath)
    const environment = await client.environment.create({
      data: { name: `diagnostic-${Date.now()}`, baseUrl: 'http://localhost' },
    })
    environmentId = environment.id
    projectId = 'diagnostic-project'
    runId = 'diagnostic-run'
    const fixture = await seedReviewedCapsuleLifecycleFixture({
      client,
      workspace,
      environmentId,
      projectId,
      planId: 'diagnostic-plan',
      runId,
    })
    const appraiseRoot = path.join(workspace, '.appraise')
    const materialized = await new RuntimeCapsuleMaterializer(client, appraiseRoot).materialize({
      operationId: fixture.operationId,
      testRunId: fixture.testRun!.id,
    })
    const preflight = await new RuntimeCapsulePreflight(client, appraiseRoot).check({
      projectId,
      validationHash: materialized.row.validationHash,
      testRunId: fixture.testRun!.id,
      runId,
    })
    expect(preflight.status).toBe('ready')
    preflightJson = canonicalRuntimeCapsuleJson(preflight)
    const attempt = await client.runtimeCapsuleExecutionAttempt.create({
      data: {
        testRunId: fixture.testRun!.id,
        capsuleId: materialized.row.id,
        receiptHash: materialized.manifest.commandReceipt.hash,
        preflightResultJson: preflightJson,
        preflightResultHash: hashRuntimeCapsuleValue(preflight),
        preflightCheckedAt: new Date(preflight.checkedAt),
        state: 'STARTING',
        ownerToken: 'owner-token-secret',
        failure: '/Users/private/project token=super-secret stack',
      },
    })
    attemptId = attempt.id
  })

  afterAll(async () => {
    processManager.clear()
    await client.$disconnect()
    await fs.rm(workspace, { recursive: true, force: true })
  })

  it('projects durable preflight identically after restart and redacts private state', async () => {
    const first = await readRuntimeCapsuleDiagnostic({ runId }, client, path.join(workspace, '.appraise'))
    const secondClient = sqliteTestClient(path.join(workspace, 'diagnostic.db'))
    const restarted = await readRuntimeCapsuleDiagnostic({ runId }, secondClient, path.join(workspace, '.appraise'))
    await secondClient.$disconnect()
    expect(restarted.preflight).toEqual(first.preflight)
    expect(first.attempt).toMatchObject({ state: 'STARTING', active: true })
    expect(first.blockers).toContainEqual({ code: 'ATTEMPT_STARTING', recoveryAction: 'WAIT_FOR_RUN' })
    expect(first.run.processRegistered).toBe(false)
    expect(JSON.stringify(first)).not.toMatch(/owner-token-secret|super-secret|\/Users\/private/)
  })

  it('reports registered and terminal attempt states without raw process identity', async () => {
    processManager.register(runId, { name: 'private-process-name' } as never)
    await client.runtimeCapsuleExecutionAttempt.update({ where: { id: attemptId }, data: { state: 'RUNNING' } })
    expect(
      (await readRuntimeCapsuleDiagnostic({ runId }, client, path.join(workspace, '.appraise'))).run.processRegistered,
    ).toBe(true)
    expect(
      (await readRuntimeCapsuleDiagnostic({ runId }, client, path.join(workspace, '.appraise'))).blockers,
    ).not.toContainEqual(expect.objectContaining({ code: 'PROCESS_REGISTRY_MISSING' }))
    processManager.unregister(runId)
    expect(
      (await readRuntimeCapsuleDiagnostic({ runId }, client, path.join(workspace, '.appraise'))).blockers,
    ).toContainEqual({ code: 'PROCESS_REGISTRY_MISSING', recoveryAction: 'CONTACT_OPERATOR' })
    const blockerByState = {
      COMPLETED: undefined,
      FAILED: 'ATTEMPT_FAILED',
      INTERRUPTED: 'ATTEMPT_INTERRUPTED',
      CANCELLED: 'ATTEMPT_CANCELLED',
    } as const
    for (const state of ['COMPLETED', 'FAILED', 'INTERRUPTED', 'CANCELLED'] as const) {
      await client.runtimeCapsuleExecutionAttempt.update({ where: { id: attemptId }, data: { state } })
      const diagnostic = await readRuntimeCapsuleDiagnostic({ runId }, client, path.join(workspace, '.appraise'))
      expect(diagnostic.attempt).toMatchObject({ state, active: false })
      if (blockerByState[state])
        expect(diagnostic.blockers).toContainEqual(expect.objectContaining({ code: blockerByState[state] }))
      else expect(diagnostic.blockers).toEqual([])
      expect(JSON.stringify(diagnostic)).not.toContain('private-process-name')
    }
  })

  it('projects a durable blocked preflight receipt without rerunning it', async () => {
    await client.runtimeCapsuleExecutionAttempt.update({ where: { id: attemptId }, data: { state: 'COMPLETED' } })
    const ready = JSON.parse(preflightJson) as { checks: Array<Record<string, unknown>>; resolved: object }
    const blocked = {
      ...ready,
      status: 'blocked',
      checks: ready.checks.map((check, index) =>
        index === 0
          ? { ...check, code: 'CAPSULE_NOT_READY', status: 'failed' }
          : { ...check, code: 'CHECK_PASSED', status: 'skipped' },
      ),
      blockers: [{ code: 'CAPSULE_NOT_READY', recoveryAction: 'Rematerialize the capsule.' }],
    }
    const blockedJson = canonicalRuntimeCapsuleJson(blocked)
    await client.runtimeCapsuleExecutionAttempt.update({
      where: { id: attemptId },
      data: { preflightResultJson: blockedJson, preflightResultHash: hashRuntimeCapsuleValue(blocked) },
    })
    const diagnostic = await readRuntimeCapsuleDiagnostic({ runId }, client, path.join(workspace, '.appraise'))
    expect(diagnostic.preflight.status).toBe('blocked')
    expect(diagnostic.blockers).toEqual([{ code: 'CAPSULE_NOT_READY', recoveryAction: 'RETRY_PREFLIGHT' }])
    await client.runtimeCapsuleExecutionAttempt.update({
      where: { id: attemptId },
      data: {
        preflightResultJson: preflightJson,
        preflightResultHash: hashRuntimeCapsuleValue(JSON.parse(preflightJson)),
      },
    })
  })

  it('rejects foreign ownership and corrupt durable preflight identity', async () => {
    const expectDiagnosticConflict = async () => {
      await expect(
        readRuntimeCapsuleDiagnostic({ runId }, client, path.join(workspace, '.appraise')),
      ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 })
    }
    await expect(
      readRuntimeCapsuleDiagnostic(
        { runId, expectedTargetProjectId: 'foreign' },
        client,
        path.join(workspace, '.appraise'),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
    await client.runtimeCapsuleExecutionAttempt.update({
      where: { id: attemptId },
      data: { preflightResultHash: `sha256:${'f'.repeat(64)}` },
    })
    await expectDiagnosticConflict()
    await client.runtimeCapsuleExecutionAttempt.update({
      where: { id: attemptId },
      data: { preflightResultHash: hashRuntimeCapsuleValue(JSON.parse(preflightJson)) },
    })
    const attempt = await client.runtimeCapsuleExecutionAttempt.findUniqueOrThrow({ where: { id: attemptId } })
    await client.runtimeCapsuleExecutionAttempt.update({
      where: { id: attemptId },
      data: { receiptHash: `sha256:${'e'.repeat(64)}` },
    })
    await expectDiagnosticConflict()
    await client.runtimeCapsuleExecutionAttempt.update({
      where: { id: attemptId },
      data: { receiptHash: attempt.receiptHash, preflightCheckedAt: new Date('2026-01-01T00:00:00.000Z') },
    })
    await expectDiagnosticConflict()
  })
})
