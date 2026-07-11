import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureCoordinatorPlanRuntimeTestSchema } from '@/test/plan-runtime-schema-test-helper'
import {
  capsuleCommandBytes as commandBytes,
  capsuleCommandHash as commandHash,
  capsuleValidationHash as validationHash,
} from '@/test/runtime-capsule-test-fixtures'
import {
  materializeRuntimeCapsuleFile,
  resolveRuntimeCapsulePaths,
  RuntimeCapsuleBlobRepository,
  RuntimeCapsuleLeaseRepository,
  RuntimeCapsuleRepository,
  type RuntimeCapsuleManifest,
} from './index'

let workspace: string
let prisma: PrismaClient

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-capsule-sqlite-'))
  const databasePath = path.join(workspace, 'appraise.db')
  await fs.copyFile(path.join(process.cwd(), 'prisma', 'dev.db'), databasePath)
  await ensureCoordinatorPlanRuntimeTestSchema(databasePath)
  prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
})

afterEach(async () => {
  await prisma?.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('RuntimeCapsuleRepository SQLite concurrency', () => {
  it('converges concurrent identical creates onto one immutable run instance', async () => {
    const project = await prisma.targetProject.create({
      data: { canonicalPath: workspace, displayName: 'Target', fingerprint: `sha256:${'b'.repeat(64)}` },
    })
    const environment = await prisma.environment.upsert({
      where: { name: 'capsule-local' },
      update: {},
      create: { name: 'capsule-local', baseUrl: 'http://localhost' },
    })
    const testRun = await prisma.testRun.create({
      data: {
        name: `capsule-${Date.now()}`,
        runId: 'run-one',
        environmentId: environment.id,
        targetProjectId: project.id,
      },
    })
    const manifest: RuntimeCapsuleManifest = {
      schemaVersion: '1',
      projectId: project.id,
      validationHash,
      runId: testRun.runId,
      operationHash: validationHash,
      projectionHash: validationHash,
      receiptHash: validationHash,
      runtimeInputHash: validationHash,
      commandReceipt: { path: 'command-receipt.json', hash: commandHash },
      generator: { id: 'appraise.validation-ast-capsule', version: '1' },
      expectedCases: [],
      files: [{ path: 'command-receipt.json', role: 'command-receipt', hash: commandHash, size: commandBytes.length }],
    }
    const appraiseRoot = path.join(workspace, '.appraise')
    const blob = await new RuntimeCapsuleBlobRepository(prisma, appraiseRoot).put({
      projectId: project.id,
      contentHash: commandHash,
      bytes: commandBytes,
    })
    await materializeRuntimeCapsuleFile({
      paths: resolveRuntimeCapsulePaths({ appraiseRoot, projectId: project.id, validationHash, runId: testRun.runId }),
      filePath: 'command-receipt.json',
      blobPath: path.join(appraiseRoot, 'projects', project.id, blob.storagePath),
      contentHash: commandHash,
      expectedSize: commandBytes.length,
    })
    const repository = new RuntimeCapsuleRepository(prisma, appraiseRoot)
    const input = { projectId: project.id, testRunId: testRun.id, runId: testRun.runId, validationHash, manifest }
    const results = await Promise.all([repository.create(input), repository.create(input)])
    expect(new Set(results.map(result => result.id)).size).toBe(1)
    await expect(prisma.runtimeCapsule.count({ where: { testRunId: testRun.id } })).resolves.toBe(1)
  })

  it('prevents an expired owner from releasing a successor lease', async () => {
    const project = await prisma.targetProject.create({
      data: { canonicalPath: workspace, displayName: 'Lease target', fingerprint: `sha256:${'c'.repeat(64)}` },
    })
    let clock = new Date('2026-07-11T00:00:00.000Z')
    const repository = new RuntimeCapsuleLeaseRepository(prisma, () => clock)
    const identity = { projectId: project.id, validationHash, runId: 'run-lease', durationMs: 10_000 }
    await repository.acquire({ ...identity, ownerToken: 'owner-one' })
    await expect(repository.acquire({ ...identity, ownerToken: 'owner-two' })).rejects.toThrow(/already active/)
    clock = new Date(clock.getTime() + 10_001)
    await repository.acquire({ ...identity, ownerToken: 'owner-two' })
    await expect(repository.release({ ...identity, ownerToken: 'owner-one' })).resolves.toBe(false)
    await expect(repository.release({ ...identity, ownerToken: 'owner-two' })).resolves.toBe(true)
  })
})
