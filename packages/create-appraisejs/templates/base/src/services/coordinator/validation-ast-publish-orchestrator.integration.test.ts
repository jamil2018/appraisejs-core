import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { serializeYamlArtifact } from '@/lib/plan-contract'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { ensureCoordinatorPlanRuntimeTestSchema } from '@/test/plan-runtime-schema-test-helper'
import { sqliteTestClient } from '@/test/validation-ast-test-fixtures'

import { prepareValidationAstPublish } from './validation-ast-publish-journal-service'
import { resumeValidationAstPublish } from './validation-ast-publish-orchestrator'

const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`
const contractDigest = (value: unknown) => digest(canonicalContractJson(value))
const planSourceHash = `sha256:${'a'.repeat(64)}`
let workspace: string
let client: PrismaClient
let repository: PlanArtifactRepository
let planProjectionId: string
let targetProjectId: string

const validation = {
  version: '1',
  planId: 'journal-plan',
  revision: 1,
  baseRevision: { gitCommit: null, snapshotHash: planSourceHash, reducedAssurance: false },
  classificationOverrides: [],
  validations: [],
  approvals: [],
  validationDecisions: [],
  files: [],
  manifestPaths: [],
  baselineAttempts: [],
  baselineAcknowledgements: [],
  baselineDecision: 'pending',
} as const

// fallow-ignore-next-line code-duplication -- isolated real-SQLite harness
beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-journal-integration-'))
  await fs.writeFile(path.join(workspace, 'package.json'), '{"name":"journal-test"}')
  const databasePath = path.join(workspace, 'appraise.db')
  await fs.copyFile(path.join(process.cwd(), 'prisma', 'dev.db'), databasePath)
  await ensureCoordinatorPlanRuntimeTestSchema(databasePath)
  client = sqliteTestClient(databasePath)
  const target = await client.targetProject.create({
    data: {
      canonicalPath: workspace,
      displayName: 'Journal target',
      fingerprint: `sha256:${'b'.repeat(64)}`,
    },
  })
  targetProjectId = target.id
  const plan = await client.planProjection.create({
    data: {
      planId: 'journal-plan',
      revision: 1,
      lifecycle: 'preparing_validations',
      goal: 'Journal recovery',
      description: 'Journal recovery',
      sourceHash: planSourceHash,
      planPath: 'journal-plan.yaml',
      lastValidProjectedAt: new Date(),
      targetProjectId,
    },
  })
  planProjectionId = plan.id
  repository = new PlanArtifactRepository(workspace)
  await repository.create('plan', 'journal-plan', 'old-plan\n')
  await repository.create('review', 'journal-plan', 'old-review\n')
})

afterEach(async () => {
  await client.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

async function prepare(key: string) {
  const oldPlan = await repository.read('plan', 'journal-plan')
  const oldReview = await repository.read('review', 'journal-plan')
  const planContent = serializeYamlArtifact('plan', {
    version: '1',
    planId: 'journal-plan',
    revision: 1,
    lifecycle: 'awaiting_validation_review',
    goal: 'Journal recovery',
    description: 'Journal recovery',
    tasks: [],
    edges: [],
    implementationGroups: [],
  })
  const validationContent = serializeYamlArtifact('validation', validation)
  const reviewContent = oldReview.content
  const canonicalProjection = { validationNode: null, gherkin: [] }
  return prepareValidationAstPublish(
    {
      planId: 'journal-plan',
      planProjectionId,
      targetProjectId,
      targetFingerprint: `sha256:${'b'.repeat(64)}`,
      idempotencyKey: key,
      expectedPlanHash: planSourceHash,
      expectedPlanArtifactHash: oldPlan.hash,
      expectedReviewHash: oldReview.hash,
      planHash: digest(planContent),
      validationHash: digest(validationContent),
      reviewHash: digest(reviewContent),
      planContent,
      validationContent,
      reviewContent,
      astId: 'journal-ast',
      astHash: `sha256:${'c'.repeat(64)}`,
      contextHash: `sha256:${'d'.repeat(64)}`,
      previewHash: `sha256:${'e'.repeat(64)}`,
      receiptHash: `sha256:${'f'.repeat(64)}`,
      projectionHash: contractDigest(canonicalProjection),
      projectionJson: JSON.stringify(canonicalProjection),
      validationProjectionJson: JSON.stringify(validation),
      extensionReviews: [],
    },
    client,
  )
}

async function expectSinglePublishEvents() {
  expect(await client.planEvent.count({ where: { type: 'validation_ast_compiled' } })).toBe(1)
  expect(await client.planEvent.count({ where: { type: 'validation_review_ready' } })).toBe(1)
}

function updateOperation(operationId: string, data: Record<string, unknown>) {
  return client.validationAstPublishOperation.update({ where: { id: operationId }, data })
}

describe('Validation AST publish journal with real SQLite', () => {
  it('converges concurrent prepare calls on one immutable operation', async () => {
    const [first, second] = await Promise.all([prepare('same-key'), prepare('same-key')])
    expect(second.id).toBe(first.id)
    expect(await client.validationAstPublishOperation.count()).toBe(1)
  })

  it('recovers every commit boundary idempotently without duplicate lifecycle events', async () => {
    const operation = await prepare('crash-boundaries')
    await expect(
      resumeValidationAstPublish(operation.id, { client, projectDirectory: workspace, crashAfter: 'after_artifacts' }),
    ).rejects.toThrow('injected-after-artifacts')
    await expect(
      resumeValidationAstPublish(operation.id, { client, projectDirectory: workspace, crashAfter: 'after_projection' }),
    ).rejects.toThrow('injected-after-projection')
    await expect(
      resumeValidationAstPublish(operation.id, {
        client,
        projectDirectory: workspace,
        crashAfter: 'after_review_ready',
      }),
    ).rejects.toThrow('injected-after-review-ready')
    await expect(
      resumeValidationAstPublish(operation.id, { client, projectDirectory: workspace }),
    ).resolves.toMatchObject({
      phase: 'review_ready',
      failure: null,
    })
    await expectSinglePublishEvents()
    const projection = await client.planProjection.findUniqueOrThrow({ where: { id: planProjectionId } })
    await expect(
      client.planEvent.create({
        data: {
          planProjectionId,
          publishOperationId: operation.id,
          sequence: 3,
          type: 'validation_review_ready',
          payloadJson: '{}',
        },
      }),
    ).rejects.toBeTruthy()
    expect(projection.lifecycle).toBe('awaiting_validation_review')
  })

  it('serializes concurrent resume and rejects post-phase artifact drift with persisted failure', async () => {
    const operation = await prepare('concurrent')
    await expect(
      resumeValidationAstPublish(operation.id, { client, projectDirectory: workspace, crashAfter: 'after_artifacts' }),
    ).rejects.toThrow('injected-after-artifacts')
    const results = await Promise.allSettled([
      resumeValidationAstPublish(operation.id, { client, projectDirectory: workspace }),
      resumeValidationAstPublish(operation.id, { client, projectDirectory: workspace }),
    ])
    expect(results.every(result => result.status === 'fulfilled')).toBe(true)
    expect((await client.validationAstPublishOperation.findUniqueOrThrow({ where: { id: operation.id } })).phase).toBe(
      'review_ready',
    )
    await expectSinglePublishEvents()

    const driftOperation = await prepare('drift')
    await expect(
      resumeValidationAstPublish(driftOperation.id, {
        client,
        projectDirectory: workspace,
        crashAfter: 'after_artifacts',
      }),
    ).rejects.toThrow('injected-after-artifacts')
    await repository.compareAndWrite(
      'validation',
      'journal-plan',
      (await repository.read('validation', 'journal-plan')).hash,
      'drifted\n',
    )
    await expect(
      resumeValidationAstPublish(driftOperation.id, { client, projectDirectory: workspace }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(
      (await client.validationAstPublishOperation.findUniqueOrThrow({ where: { id: driftOperation.id } })).failure,
    ).toContain('drifted')
  })

  it('rejects stale ownership, payload tampering, and deletion while journal evidence exists', async () => {
    const operation = await prepare('integrity')
    await updateOperation(operation.id, {
      validationProjectionJson: JSON.stringify({ ...validation, baselineDecision: 'accepted' }),
    })
    await expect(
      resumeValidationAstPublish(operation.id, { client, projectDirectory: workspace }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await updateOperation(operation.id, { validationProjectionJson: operation.validationProjectionJson, failure: null })
    await updateOperation(operation.id, { validationContent: 'tampered\n' })
    await expect(
      resumeValidationAstPublish(operation.id, { client, projectDirectory: workspace }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await updateOperation(operation.id, { validationContent: operation.validationContent, failure: null })
    const hashOperation = await prepare('hash-tampering')
    await client.validationAstPublishOperation.update({
      where: { id: hashOperation.id },
      data: { validationHash: `sha256:${'8'.repeat(64)}` },
    })
    await expect(
      resumeValidationAstPublish(hashOperation.id, { client, projectDirectory: workspace }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(
      (await client.validationAstPublishOperation.findUniqueOrThrow({ where: { id: hashOperation.id } })).failure,
    ).toContain('payload hash mismatch')
    await client.planProjection.update({
      where: { id: planProjectionId },
      data: { sourceHash: `sha256:${'9'.repeat(64)}` },
    })
    await expect(
      resumeValidationAstPublish(operation.id, { client, projectDirectory: workspace }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(client.planProjection.delete({ where: { id: planProjectionId } })).rejects.toBeTruthy()
    await expect(client.targetProject.delete({ where: { id: targetProjectId } })).rejects.toBeTruthy()
  })
})
