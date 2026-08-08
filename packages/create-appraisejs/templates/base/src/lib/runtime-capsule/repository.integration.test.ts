import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  copyMigratedTestDatabase,
  prepareCleanCoordinatorPlanRuntimeTestDatabase,
} from '@/test/plan-runtime-schema-test-helper'
import {
  capsuleCommandBytes as commandBytes,
  capsuleCommandHash as commandHash,
  capsuleValidationHash as validationHash,
  runtimeCapsuleManifestClosureFixture,
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
  await copyMigratedTestDatabase(databasePath)
  await prepareCleanCoordinatorPlanRuntimeTestDatabase(databasePath)
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
      where: { id: 'repository-capsule-local' },
      update: {},
      create: { id: 'repository-capsule-local', name: 'capsule-local', baseUrl: 'http://localhost' },
    })
    const plan = await prisma.planProjection.create({
      data: {
        planId: 'repository-capsule-plan',
        revision: 1,
        lifecycle: 'awaiting_validation_review',
        goal: 'Exercise capsule concurrency',
        description: 'Exercise capsule concurrency',
        sourceHash: validationHash,
        planPath: 'repository-capsule-plan.yaml',
        lastValidProjectedAt: new Date(),
        targetProjectId: project.id,
      },
    })
    await prisma.validationAstPublishOperation.create({
      data: {
        id: 'repository-capsule-operation',
        planId: plan.planId,
        planProjectionId: plan.id,
        targetProjectId: project.id,
        targetFingerprint: project.fingerprint,
        idempotencyKey: 'repository-capsule-operation',
        operationHash: validationHash,
        phase: 'review_ready',
        expectedPlanHash: validationHash,
        expectedPlanArtifactHash: validationHash,
        expectedReviewHash: validationHash,
        planHash: validationHash,
        validationHash,
        reviewHash: validationHash,
        planContent: '{}',
        validationContent: '{}',
        reviewContent: '{}',
        astId: 'repository-capsule-validation',
        astHash: validationHash,
        contextHash: validationHash,
        previewHash: validationHash,
        receiptHash: validationHash,
        projectionHash: validationHash,
        projectionJson: '{}',
        validationProjectionJson: '{}',
        runtimeInputHash: validationHash,
        runtimeInputJson: '{}',
      },
    })
    const publication = await prisma.validationNodePublication.create({
      data: {
        planId: plan.planId,
        targetProjectId: project.id,
        validationId: 'repository-capsule-validation',
        contentHash: validationHash,
        publishOperationId: 'repository-capsule-operation',
        operationHash: validationHash,
        runtimeInputHash: validationHash,
        projectionHash: validationHash,
        publicationHash: `sha256:${'d'.repeat(64)}`,
      },
    })
    const testRun = await prisma.testRun.create({
      data: {
        name: `capsule-${Date.now()}`,
        runId: 'run-one',
        environmentId: environment.id,
        targetProjectId: project.id,
        planId: plan.planId,
      },
    })
    const manifest = {
      schemaVersion: '2',
      projectId: project.id,
      validationHash,
      runId: testRun.runId,
      operationHash: validationHash,
      projectionHash: validationHash,
      receiptHash: validationHash,
      runtimeInputHash: validationHash,
      commandReceipt: { path: 'command-receipt.json', hash: commandHash },
      generator: { id: 'appraise.validation-ast-capsule', version: '2' },
      ...runtimeCapsuleManifestClosureFixture(),
      expectedCases: [],
      files: [{ path: 'command-receipt.json', role: 'command-receipt', hash: commandHash, size: commandBytes.length }],
    } as unknown as RuntimeCapsuleManifest
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
    const input = {
      projectId: project.id,
      testRunId: testRun.id,
      runId: testRun.runId,
      validationHash,
      publicationId: publication.id,
      manifest,
    }
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
