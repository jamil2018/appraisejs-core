import { createHash } from 'node:crypto'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { resumeValidationAstPublish } from './validation-ast-publish-orchestrator'
import { projectCompiledValidationArtifacts } from './validation-canonical-projection-service'

vi.mock('./validation-canonical-projection-service', () => ({ projectCompiledValidationArtifacts: vi.fn() }))
const hash = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`
let workspace = ''
afterEach(async () => fs.rm(workspace, { recursive: true, force: true }))

describe('Validation AST publish recovery', () => {
  it('resumes every crash phase and emits review-ready exactly once', async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-publish-'))
    await fs.writeFile(path.join(workspace, 'package.json'), '{}')
    const repository = new PlanArtifactRepository(workspace)
    const oldPlan = await repository.create('plan', 'plan-one', 'old-plan\n')
    const oldReview = await repository.create('review', 'plan-one', 'old-review\n')
    const validationContent = 'validation\n',
      reviewContent = 'review\n',
      planContent = 'plan\n'
    const operation: any = {
      id: 'op',
      planId: 'plan-one',
      planProjectionId: 'projection',
      targetProjectId: 'target',
      expectedPlanHash: `sha256:${'d'.repeat(64)}`,
      targetFingerprint: `sha256:${'e'.repeat(64)}`,
      plan: { id: 'projection', sourceHash: `sha256:${'d'.repeat(64)}`, lifecycle: 'preparing_validations' },
      targetProject: { id: 'target', fingerprint: `sha256:${'e'.repeat(64)}` },
      phase: 'prepared',
      expectedPlanArtifactHash: oldPlan.hash,
      expectedValidationHash: null,
      expectedReviewHash: oldReview.hash,
      planHash: hash(planContent),
      validationHash: hash(validationContent),
      reviewHash: hash(reviewContent),
      planContent,
      validationContent,
      reviewContent,
      astId: 'ast',
      astHash: `sha256:${'a'.repeat(64)}`,
      receiptHash: `sha256:${'b'.repeat(64)}`,
      projectionJson: JSON.stringify({
        version: '1',
        planId: 'plan-one',
        revision: 1,
        baseRevision: { gitCommit: null, snapshotHash: `sha256:${'c'.repeat(64)}`, reducedAssurance: false },
        classificationOverrides: [],
        validations: [],
        approvals: [],
        validationDecisions: [],
        files: [],
        manifestPaths: [],
        baselineAttempts: [],
        baselineAcknowledgements: [],
        baselineDecision: 'pending',
      }),
      extensionReviews: [],
    }
    operation.validationProjectionJson = operation.projectionJson
    operation.plan.validationJson = operation.projectionJson
    operation.idempotencyKey = 'publish-one'
    operation.contextHash = `sha256:${'f'.repeat(64)}`
    operation.previewHash = `sha256:${'1'.repeat(64)}`
    operation.projectionHash = hash(canonicalContractJson(JSON.parse(operation.projectionJson)))
    operation.operationHash = hash(
      canonicalContractJson({
        planId: operation.planId,
        planProjectionId: operation.planProjectionId,
        targetProjectId: operation.targetProjectId,
        targetFingerprint: operation.targetFingerprint,
        idempotencyKey: operation.idempotencyKey,
        expectedPlanHash: operation.expectedPlanHash,
        expectedPlanArtifactHash: operation.expectedPlanArtifactHash,
        expectedValidationHash: null,
        expectedReviewHash: operation.expectedReviewHash,
        planHash: operation.planHash,
        validationHash: operation.validationHash,
        reviewHash: operation.reviewHash,
        planContent: operation.planContent,
        validationContent: operation.validationContent,
        reviewContent: operation.reviewContent,
        astId: operation.astId,
        astHash: operation.astHash,
        contextHash: operation.contextHash,
        previewHash: operation.previewHash,
        receiptHash: operation.receiptHash,
        projectionHash: operation.projectionHash,
        projectionJson: operation.projectionJson,
        validationProjectionJson: operation.validationProjectionJson,
        extensionReviewHashes: [],
      }),
    )
    const events: any[] = []
    const client: any = {
      validationAstPublishOperation: {
        findUnique: vi.fn(async () => operation),
        findUniqueOrThrow: vi.fn(async () => operation),
        updateMany: vi.fn(async ({ where, data }: any) =>
          operation.phase === where.phase ? (Object.assign(operation, data), { count: 1 }) : { count: 0 },
        ),
      },
      $transaction: async (fn: any) =>
        fn({
          validationAstPublishOperation: {
            findUniqueOrThrow: async () => operation,
            update: async ({ data }: any) => Object.assign(operation, data),
          },
          planProjection: { update: async () => ({ id: 'projection', revision: 1 }) },
          planEvent: {
            findFirst: async () => events.at(-1) ?? null,
            upsert: async ({ create }: any) => {
              const existing = events.find(
                event => event.publishOperationId === create.publishOperationId && event.type === create.type,
              )
              return existing ?? (events.push(create), create)
            },
          },
        }),
    }
    vi.mocked(projectCompiledValidationArtifacts).mockImplementation(async () => {
      operation.phase = 'projected'
      return { testCases: 1 } as never
    })
    await expect(
      resumeValidationAstPublish('op', { client, projectDirectory: workspace, crashAfter: 'after_artifacts' }),
    ).rejects.toThrow('injected-after-artifacts')
    await expect(
      resumeValidationAstPublish('op', { client, projectDirectory: workspace, crashAfter: 'after_projection' }),
    ).rejects.toThrow('injected-after-projection')
    operation.plan.lifecycle = 'validation_changes_requested'
    await expect(resumeValidationAstPublish('op', { client, projectDirectory: workspace })).resolves.toMatchObject({
      phase: 'review_ready',
    })
    expect(events.filter(event => event.type === 'validation_review_ready')).toHaveLength(1)
  })
})
