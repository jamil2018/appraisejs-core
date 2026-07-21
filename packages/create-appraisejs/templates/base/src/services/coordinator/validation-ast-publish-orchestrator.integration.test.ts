import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { serializeYamlArtifact } from '@/lib/plan-contract'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { createCustomExtensionPolicy } from '@/lib/validation-ast/extension-policy'
import { createPlanRuntimeTestWorkspace } from '@/test/validation-ast-test-fixtures'

import { prepareValidationAstPublish, validationAstPublishOperationId } from './validation-ast-publish-journal-service'
import { resumeValidationAstPublish } from './validation-ast-publish-orchestrator'
import { auditManagedValidationIntegrity } from './managed-validation-integrity-audit'

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

beforeEach(async () => {
  ;({ workspace, client } = await createPlanRuntimeTestWorkspace('appraise-journal-integration-', 'appraise.db'))
  await fs.writeFile(path.join(workspace, 'package.json'), '{"name":"journal-test"}')
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
  const receiptHash = digest(`receipt-${key}`)
  const action = { id: 'browser.navigation.goto', version: '1', contentHash: digest('action') }
  const canonicalProjection = {
    validationNode: {
      id: 'journal-ast',
      matrix: [{ browser: 'chromium', environment: 'local' }],
      testCaseIds: ['case-one'],
      appraiseArtifacts: {
        locators: [],
        testCases: [
          { id: 'case-one', steps: [{ id: 'step-one', templateStepName: `${action.id}@${action.version}` }] },
        ],
      },
    },
    gherkin: ['Scenario: one'],
  }
  const compilerReceipt = {
    schemaVersion: '1' as const,
    catalogHash: digest('catalog'),
    locatorGraphHash: digest('locators'),
    environments: ['local'],
    browsers: ['chromium'],
    runtimes: ['browser'],
  }
  const runtimeInput = {
    schemaVersion: '1' as const,
    targetProjectId,
    targetFingerprint: `sha256:${'b'.repeat(64)}`,
    astId: 'journal-ast',
    astHash: `sha256:${'c'.repeat(64)}`,
    contextHash: `sha256:${'d'.repeat(64)}`,
    previewHash: `sha256:${'e'.repeat(64)}`,
    receiptHash,
    compilerReceipt: { ...compilerReceipt, contentHash: contractDigest(compilerReceipt) },
    extensionPolicy: structuredClone(
      createCustomExtensionPolicy({
        projectId: targetProjectId,
        projectFingerprint: `sha256:${'b'.repeat(64)}`,
        capabilityImports: {},
      }),
    ),
    actions: [action],
    locators: [],
    extensions: [],
    matrix: canonicalProjection.validationNode.matrix,
    expected: {
      scenarios: [{ scenarioId: 'scenario-one', caseId: 'case-one', stepIds: ['step-one'] }],
      scenarioCount: 1,
    },
    gherkinHash: contractDigest(canonicalProjection.gherkin),
  }
  return prepareValidationAstPublish(
    {
      id: validationAstPublishOperationId(receiptHash),
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
      receiptHash,
      projectionHash: contractDigest(canonicalProjection),
      projectionJson: JSON.stringify(canonicalProjection),
      validationProjectionJson: JSON.stringify(validation),
      runtimeInputHash: contractDigest(runtimeInput),
      runtimeInputJson: canonicalContractJson(runtimeInput),
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

  it('keeps distinct publication identities and runtime inputs from cross-binding', async () => {
    const first = await prepare('first-publication')
    const second = await prepare('second-publication')
    expect(second.id).not.toBe(first.id)
    expect(second.runtimeInputHash).not.toBe(first.runtimeInputHash)
    await expect(
      updateOperation(second.id, { runtimeInputHash: `sha256:${'7'.repeat(64)}` }).then(() =>
        resumeValidationAstPublish(second.id, { client, projectDirectory: workspace }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('recovers every commit boundary idempotently without duplicate lifecycle events', async () => {
    const operation = await prepare('crash-boundaries')
    await expect(
      resumeValidationAstPublish(operation.id, { client, projectDirectory: workspace, crashAfter: 'after_artifacts' }),
    ).rejects.toThrow('injected-after-artifacts')
    expect((await repository.read('plan', 'journal-plan')).content).toBe('old-plan\n')
    expect((await client.planProjection.findUniqueOrThrow({ where: { id: planProjectionId } })).lifecycle).toBe(
      'preparing_validations',
    )
    expect(await client.planEvent.count({ where: { type: 'validation_review_ready' } })).toBe(0)
    await expect(
      resumeValidationAstPublish(operation.id, { client, projectDirectory: workspace, crashAfter: 'after_projection' }),
    ).rejects.toThrow('injected-after-projection')
    expect((await repository.read('plan', 'journal-plan')).content).toBe('old-plan\n')
    expect((await client.planProjection.findUniqueOrThrow({ where: { id: planProjectionId } })).lifecycle).toBe(
      'preparing_validations',
    )
    expect(await client.planEvent.count({ where: { type: 'validation_review_ready' } })).toBe(0)
    await repository.compareAndWrite('plan', 'journal-plan', operation.expectedPlanArtifactHash, operation.planContent)
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

  it('reports a legacy review lifecycle without a review-ready receipt as integrity blocked', async () => {
    const operation = await prepare('legacy-split')
    await expect(
      resumeValidationAstPublish(operation.id, { client, projectDirectory: workspace, crashAfter: 'after_artifacts' }),
    ).rejects.toThrow('injected-after-artifacts')
    await repository.compareAndWrite('plan', 'journal-plan', operation.expectedPlanArtifactHash, operation.planContent)
    await client.planProjection.update({
      where: { id: planProjectionId },
      data: { lifecycle: 'awaiting_validation_review' },
    })

    await expect(
      auditManagedValidationIntegrity('journal-plan', { client, projectDirectory: workspace }),
    ).resolves.toMatchObject({
      status: 'integrity_blocked',
      operationId: operation.id,
      operationPhase: 'artifacts_written',
      retryable: true,
      mismatches: expect.arrayContaining(['publish_operation_phase', 'validation_review_ready_event']),
    })
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
