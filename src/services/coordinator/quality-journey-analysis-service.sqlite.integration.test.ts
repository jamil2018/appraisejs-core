import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import { clearAgentFactoryProviderAdaptersForTest, registerAgentFactoryProviderAdapter } from '@/lib/quality-journey'
import {
  claimQualityJourneyWork,
  createQualityJourney,
  dispatchQualityJourneyWork,
  getQualityJourney,
  resumeQualityJourney,
  submitDurableQualityJourneyCommand,
} from './quality-journey-service'
import {
  answerQualityJourneyAnalysisQuestion,
  decideQualityJourneyAnalysis,
  getQualityJourneyAnalysis,
  publishQualityJourneyAnalysis,
  submitQualityJourneyAnalysisSuccessor,
} from './quality-journey-analysis-service'

const workspaces: string[] = []
const digest = (character: string) => `sha256:${character.repeat(64)}`

afterEach(async () => {
  clearAgentFactoryProviderAdaptersForTest()
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-quality-journey-analysis-'))
  workspaces.push(workspace)
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
  await client.targetProject.create({
    data: {
      id: 'target-analysis-1',
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `path:${workspace}`,
      canonicalPath: workspace,
      displayName: 'Analysis fixture',
      fingerprint: digest('a'),
    },
  })
  return client
}

function charter(journeyId: string, cycleId: string, suffix = '1') {
  return {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    charterId: `analysis-charter-${suffix}`,
    analysisRevisionId: `analysis-revision-${suffix}`,
    journeyId,
    targetProjectId: 'target-analysis-1',
    cycleId,
    requirementRevisionId: 'requirement-revision-1',
    objectives: ['Allow checkout.'],
    scope: { included: ['Checkout'], excluded: [] },
    actors: ['Shopper'],
    requirements: [
      { requirementId: 'REQ-CHECKOUT-1', statement: 'A shopper submits an order.', sourceRefs: ['brief:1'] },
    ],
    obligations: [
      {
        obligationId: 'OBL-CHECKOUT-1',
        requirementId: 'REQ-CHECKOUT-1',
        statement: 'A confirmation appears.',
        acceptanceSignals: ['Confirmation'],
      },
    ],
    constraints: [],
    assumptions: ['The user is authenticated.'],
    risks: [],
    acceptanceSignals: ['Confirmation'],
    retiredRequirementIds: [],
    questions: [
      {
        questionId: 'question-payment',
        prompt: 'Which payment method is in scope?',
        required: true,
        rationale: 'The scenario depends on it.',
      },
    ],
    resolvedQuestionAnswerIds: [],
  }
}

async function readyAnalyzer(client: PrismaClient) {
  const created = await createQualityJourney(
    { targetProjectId: 'target-analysis-1', idempotencyKey: 'create-analysis', requirement: { objective: 'Checkout' } },
    client,
  )
  await submitDurableQualityJourneyCommand(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      commandId: 'submit-requirement',
      journeyId: created.journey.journeyId,
      targetProjectId: 'target-analysis-1',
      actor: 'USER',
      command: 'SUBMIT_REQUIREMENT',
      expectedStateHash: created.journey.stateHash,
      idempotencyKey: 'submit-requirement',
      inputArtifactRefs: [],
      payload: { journeyRevisionId: 'requirement-revision-1', requirementHash: digest('b') },
    },
    client,
  )
  const state = await getQualityJourney(
    { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
    client,
  )
  const claim = await claimQualityJourneyWork(
    { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'REQUIREMENT_ANALYZER' },
    client,
  )
  registerAgentFactoryProviderAdapter({
    adapterId: 'analysis-test-adapter',
    supports: request => request.attemptId === claim.attempt.id,
    dispatch: async request => ({
      schemaVersion: 'appraise.quality-journey/v1',
      outcome: 'STARTED',
      spawnReceiptId: `receipt-${request.attemptId}`,
      assignmentId: request.assignmentId,
      workItemId: request.workItemId,
      attemptId: request.attemptId,
      roleDefinitionDigest: request.roleDefinitionDigest,
      capabilityProfileDigest: request.capabilityProfileDigest,
      effectiveWorker: {
        modelId: 'provider-selected',
        reasoningLevel: 'HIGH',
        latencyPreference: 'DELIBERATE',
        toolIds: request.scope.permittedTools,
      },
      boundaries: request.requiredBoundaries.map(boundary => ({
        boundary: boundary.boundary,
        requested: boundary.allowedValues,
        effective: boundary.allowedValues,
        status: 'VERIFIED',
        evidence: [digest('f')],
      })),
      startedAt: '2026-09-01T00:00:00.000Z',
    }),
  })
  await dispatchQualityJourneyWork(
    {
      journeyId: created.journey.journeyId,
      targetProjectId: 'target-analysis-1',
      workItemId: claim.workItem.id,
      leaseId: claim.attempt.leaseId,
      ownerToken: claim.ownerToken,
    },
    client,
  )
  return { created, state, claim }
}

function registerStartedAnalyzerAdapter(attemptId: string, adapterId: string) {
  registerAgentFactoryProviderAdapter({
    adapterId,
    supports: request => request.attemptId === attemptId,
    dispatch: async request => ({
      schemaVersion: 'appraise.quality-journey/v1',
      outcome: 'STARTED',
      spawnReceiptId: `receipt-${request.attemptId}`,
      assignmentId: request.assignmentId,
      workItemId: request.workItemId,
      attemptId: request.attemptId,
      roleDefinitionDigest: request.roleDefinitionDigest,
      capabilityProfileDigest: request.capabilityProfileDigest,
      effectiveWorker: {
        modelId: 'provider-selected',
        reasoningLevel: 'HIGH',
        latencyPreference: 'DELIBERATE',
        toolIds: request.scope.permittedTools,
      },
      boundaries: request.requiredBoundaries.map(boundary => ({
        boundary: boundary.boundary,
        requested: boundary.allowedValues,
        effective: boundary.allowedValues,
        status: 'VERIFIED',
        evidence: [digest('f')],
      })),
      startedAt: '2026-09-01T00:00:00.000Z',
    }),
  })
}

describe('Quality Journey Phase 3 analysis control plane', () => {
  it('keeps charter/question/answer lineage immutable and blocks approval until required Q&A resolves', async () => {
    const client = await fixture()
    try {
      const { created, claim } = await readyAnalyzer(client)
      const submitted = await submitQualityJourneyAnalysisSuccessor(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: claim.workItem.id,
          attemptId: claim.attempt.id,
          leaseId: claim.attempt.leaseId,
          ownerToken: claim.ownerToken,
          idempotencyKey: 'analysis-submit-1',
          charter: charter(created.journey.journeyId, created.journey.activeCycleId),
        },
        client,
      )
      expect(submitted.replayed).toBe(false)
      const afterSubmit = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      expect(afterSubmit.journey.unresolvedQuestionIds).toEqual(['question-payment'])
      expect(afterSubmit.journey.activeRevisionIds).not.toHaveProperty('analysisReview')
      expect(afterSubmit.journey.analysisReviewHash).toMatch(/^sha256:[a-f0-9]{64}$/)
      const contentHash = submitted.analysisRevision.contentHash
      const charterRef = {
        kind: 'ANALYSIS_CHARTER_REVISION',
        artifactId: 'analysis-charter-1',
        revisionId: 'analysis-revision-1',
        contentHash,
      }
      const publish = {
        schemaVersion: 'appraise.quality-journey/v1',
        commandId: 'publish-analysis-1',
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-analysis-1',
        actor: 'RUNNER',
        command: 'PUBLISH_ANALYSIS',
        expectedStateHash: afterSubmit.journey.stateHash,
        idempotencyKey: 'publish-analysis-1',
        inputArtifactRefs: [charterRef],
        payload: { artifactRevisionId: 'analysis-revision-1', artifactHash: contentHash },
      }
      await expect(publishQualityJourneyAnalysis(publish, client)).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(await client.qualityJourneyAnalysisPublication.count()).toBe(0)
      await answerQualityJourneyAnalysisQuestion(
        {
          idempotencyKey: 'answer-payment-1',
          answer: {
            schemaVersion: 'appraise.quality-journey/v1',
            answerId: 'answer-payment-1',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            analysisRevisionId: 'analysis-revision-1',
            questionId: 'question-payment',
            answer: 'Card payment.',
            actor: 'USER',
          },
        },
        client,
      )
      const answeredAnalysis = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      expect(answeredAnalysis.journey.unresolvedQuestionIds).toEqual([])
      await publishQualityJourneyAnalysis({ ...publish, expectedStateHash: answeredAnalysis.journey.stateHash }, client)
      await expect(
        publishQualityJourneyAnalysis({ ...publish, expectedStateHash: answeredAnalysis.journey.stateHash }, client),
      ).resolves.toMatchObject({ outcome: 'COMMITTED', replayed: true })
      await expect(
        publishQualityJourneyAnalysis(
          {
            ...publish,
            commandId: 'publish-analysis-1-changed',
            expectedStateHash: answeredAnalysis.journey.stateHash,
          },
          client,
        ),
      ).resolves.toMatchObject({ outcome: 'CONFLICT', code: 'IDEMPOTENCY_KEY_REUSED' })
      expect(await client.qualityJourneyAnalysisPublication.count()).toBe(1)
      const review = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const decide = {
        schemaVersion: 'appraise.quality-journey/v1',
        commandId: 'decide-analysis-1',
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-analysis-1',
        actor: 'USER',
        command: 'DECIDE_ANALYSIS',
        expectedStateHash: review.journey.stateHash,
        idempotencyKey: 'decide-analysis-1',
        inputArtifactRefs: [charterRef],
        payload: { revisionId: 'analysis-revision-1', contentHash, decision: 'APPROVED' },
      }
      await expect(decideQualityJourneyAnalysis(decide, client)).resolves.toMatchObject({
        outcome: 'COMMITTED',
        successorStage: 'DISCOVERY',
      })
      await expect(decideQualityJourneyAnalysis(decide, client)).resolves.toMatchObject({
        outcome: 'COMMITTED',
        replayed: true,
      })
      await expect(
        decideQualityJourneyAnalysis({ ...decide, commandId: 'decide-analysis-1-changed' }, client),
      ).resolves.toMatchObject({ outcome: 'CONFLICT', code: 'IDEMPOTENCY_KEY_REUSED' })
      expect(await client.qualityJourneyAnalysisDecision.count()).toBe(1)
      const analysis = await getQualityJourneyAnalysis(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      expect(analysis.revisions[0].questions[0].answers).toHaveLength(1)
      await expect(
        client.qualityJourneyArtifact.update({
          where: { id: analysis.revisions[0].artifactRecordId },
          data: { artifactJson: '{}' },
        }),
      ).rejects.toThrow()
      expect(
        (
          await client.qualityJourneyArtifact.findUniqueOrThrow({
            where: { id: analysis.revisions[0].artifactRecordId },
          })
        ).artifactJson,
      ).not.toBe('{}')
      await expect(
        client.qualityJourneyWorkAttempt.delete({ where: { id: submitted.analysisRevision.submittedAttemptId } }),
      ).rejects.toThrow()
      await expect(
        answerQualityJourneyAnalysisQuestion(
          {
            idempotencyKey: 'answer-payment-correction',
            answer: {
              schemaVersion: 'appraise.quality-journey/v1',
              answerId: 'answer-payment-2',
              journeyId: created.journey.journeyId,
              targetProjectId: 'target-analysis-1',
              analysisRevisionId: 'analysis-revision-1',
              questionId: 'question-payment',
              answer: 'Wallet payment.',
              actor: 'USER',
              correctionOfAnswerId: 'answer-payment-1',
            },
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('rolls back immutable analysis control rows when assigned-work completion cannot commit', async () => {
    const client = await fixture()
    try {
      const { created, claim } = await readyAnalyzer(client)
      await client.$executeRawUnsafe(`
        CREATE TRIGGER "QualityJourneyWorkItem_force_analysis_rollback"
        BEFORE UPDATE OF "status" ON "QualityJourneyWorkItem"
        WHEN NEW."status" = 'COMPLETED'
        BEGIN SELECT RAISE(ABORT, 'forced analysis completion rollback'); END;
      `)
      await expect(
        submitQualityJourneyAnalysisSuccessor(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            workItemId: claim.workItem.id,
            attemptId: claim.attempt.id,
            leaseId: claim.attempt.leaseId,
            ownerToken: claim.ownerToken,
            idempotencyKey: 'analysis-rollback',
            charter: charter(created.journey.journeyId, created.journey.activeCycleId, 'rollback'),
          },
          client,
        ),
      ).rejects.toThrow()
      expect(await client.qualityJourneyAnalysisRevision.count()).toBe(0)
      expect(await client.qualityJourneyAnalysisQuestion.count()).toBe(0)
      expect(await client.qualityJourneyArtifact.count({ where: { kind: { startsWith: 'ANALYSIS_' } } })).toBe(0)
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('replays the original publication after a correction but fails closed against its stale review identity', async () => {
    const client = await fixture()
    try {
      const { created, claim } = await readyAnalyzer(client)
      const submitted = await submitQualityJourneyAnalysisSuccessor(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: claim.workItem.id,
          attemptId: claim.attempt.id,
          leaseId: claim.attempt.leaseId,
          ownerToken: claim.ownerToken,
          idempotencyKey: 'analysis-review-hash-submit',
          charter: charter(created.journey.journeyId, created.journey.activeCycleId, 'review-hash'),
        },
        client,
      )
      await answerQualityJourneyAnalysisQuestion(
        {
          idempotencyKey: 'analysis-review-hash-answer',
          answer: {
            schemaVersion: 'appraise.quality-journey/v1',
            answerId: 'analysis-review-hash-answer',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            analysisRevisionId: 'analysis-revision-review-hash',
            questionId: 'question-payment',
            answer: 'Card payment.',
            actor: 'USER',
          },
        },
        client,
      )
      const answered = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const charterRef = {
        kind: 'ANALYSIS_CHARTER_REVISION',
        artifactId: 'analysis-charter-review-hash',
        revisionId: 'analysis-revision-review-hash',
        contentHash: submitted.analysisRevision.contentHash,
      }
      const publish = {
        schemaVersion: 'appraise.quality-journey/v1',
        commandId: 'analysis-review-hash-publish',
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-analysis-1',
        actor: 'RUNNER',
        command: 'PUBLISH_ANALYSIS',
        expectedStateHash: answered.journey.stateHash,
        idempotencyKey: 'analysis-review-hash-publish',
        inputArtifactRefs: [charterRef],
        payload: {
          artifactRevisionId: 'analysis-revision-review-hash',
          artifactHash: submitted.analysisRevision.contentHash,
        },
      }
      const published = await publishQualityJourneyAnalysis(publish, client)
      if (
        !('publication' in published) ||
        !published.publication ||
        typeof published.publication !== 'object' ||
        !('reviewHash' in published.publication) ||
        typeof published.publication.reviewHash !== 'string'
      )
        throw new Error('Expected a persisted analysis publication.')
      const publishedReviewHash = published.publication.reviewHash
      const review = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await answerQualityJourneyAnalysisQuestion(
        {
          idempotencyKey: 'analysis-review-hash-correction',
          answer: {
            schemaVersion: 'appraise.quality-journey/v1',
            answerId: 'analysis-review-hash-correction',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            analysisRevisionId: 'analysis-revision-review-hash',
            questionId: 'question-payment',
            answer: 'Wallet payment.',
            actor: 'USER',
            correctionOfAnswerId: 'analysis-review-hash-answer',
          },
        },
        client,
      )
      const corrected = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      expect(corrected.journey.stateHash).not.toBe(review.journey.stateHash)
      expect(corrected.journey.analysisReviewHash).not.toBe(review.journey.analysisReviewHash)
      expect(corrected.journey.activeRevisionIds).not.toHaveProperty('analysisReview')
      const replay = await publishQualityJourneyAnalysis(publish, client)
      expect(replay).toMatchObject({
        outcome: 'COMMITTED',
        replayed: true,
        publication: { reviewHash: publishedReviewHash },
      })
      await expect(
        publishQualityJourneyAnalysis({ ...publish, commandId: 'analysis-review-hash-publish-changed' }, client),
      ).resolves.toMatchObject({ outcome: 'CONFLICT', code: 'IDEMPOTENCY_KEY_REUSED' })
      await expect(
        decideQualityJourneyAnalysis(
          {
            schemaVersion: 'appraise.quality-journey/v1',
            commandId: 'analysis-review-hash-decide',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            actor: 'USER',
            command: 'DECIDE_ANALYSIS',
            expectedStateHash: corrected.journey.stateHash,
            idempotencyKey: 'analysis-review-hash-decide',
            inputArtifactRefs: [charterRef],
            payload: {
              revisionId: 'analysis-revision-review-hash',
              contentHash: submitted.analysisRevision.contentHash,
              decision: 'APPROVED',
            },
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('rejects stale exact publication identity without adding a publication record', async () => {
    const client = await fixture()
    try {
      const { created, claim } = await readyAnalyzer(client)
      const submitted = await submitQualityJourneyAnalysisSuccessor(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: claim.workItem.id,
          attemptId: claim.attempt.id,
          leaseId: claim.attempt.leaseId,
          ownerToken: claim.ownerToken,
          idempotencyKey: 'analysis-submit-2',
          charter: charter(created.journey.journeyId, created.journey.activeCycleId, '2'),
        },
        client,
      )
      const state = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await expect(
        publishQualityJourneyAnalysis(
          {
            schemaVersion: 'appraise.quality-journey/v1',
            commandId: 'publish-analysis-stale',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            actor: 'RUNNER',
            command: 'PUBLISH_ANALYSIS',
            expectedStateHash: state.journey.stateHash,
            idempotencyKey: 'publish-analysis-stale',
            inputArtifactRefs: [
              {
                kind: 'ANALYSIS_CHARTER_REVISION',
                artifactId: 'analysis-charter-2',
                revisionId: 'analysis-revision-2',
                contentHash: digest('e'),
              },
            ],
            payload: { artifactRevisionId: 'analysis-revision-2', artifactHash: digest('e') },
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(
        await client.qualityJourneyAnalysisPublication.count({ where: { journeyId: created.journey.journeyId } }),
      ).toBe(0)
      expect(
        await client.qualityJourneyArtifact.count({ where: { journeyId: created.journey.journeyId } }),
      ).toBeGreaterThan(0)
      expect(submitted.analysisRevision.contentHash).not.toBe(digest('e'))
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('rejects an old published revision after an Analyzer successor becomes active', async () => {
    const client = await fixture()
    try {
      const { created, claim } = await readyAnalyzer(client)
      const first = await submitQualityJourneyAnalysisSuccessor(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: claim.workItem.id,
          attemptId: claim.attempt.id,
          leaseId: claim.attempt.leaseId,
          ownerToken: claim.ownerToken,
          idempotencyKey: 'analysis-successor-first',
          charter: charter(created.journey.journeyId, created.journey.activeCycleId, 'first'),
        },
        client,
      )
      const firstAnswer = await answerQualityJourneyAnalysisQuestion(
        {
          idempotencyKey: 'analysis-successor-answer',
          answer: {
            schemaVersion: 'appraise.quality-journey/v1',
            answerId: 'analysis-successor-answer',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            analysisRevisionId: 'analysis-revision-first',
            questionId: 'question-payment',
            answer: 'Card payment.',
            actor: 'USER',
          },
        },
        client,
      )
      const afterAnswer = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const firstRef = {
        kind: 'ANALYSIS_CHARTER_REVISION',
        artifactId: 'analysis-charter-first',
        revisionId: 'analysis-revision-first',
        contentHash: first.analysisRevision.contentHash,
      }
      await publishQualityJourneyAnalysis(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'analysis-successor-publish-first',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          actor: 'RUNNER',
          command: 'PUBLISH_ANALYSIS',
          expectedStateHash: afterAnswer.journey.stateHash,
          idempotencyKey: 'analysis-successor-publish-first',
          inputArtifactRefs: [firstRef],
          payload: { artifactRevisionId: 'analysis-revision-first', artifactHash: first.analysisRevision.contentHash },
        },
        client,
      )
      const firstReview = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const firstRevisionRequest = {
        schemaVersion: 'appraise.quality-journey/v1',
        commandId: 'analysis-successor-request',
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-analysis-1',
        actor: 'USER',
        command: 'REQUEST_ANALYSIS_REVISION',
        expectedStateHash: firstReview.journey.stateHash,
        idempotencyKey: 'analysis-successor-request',
        inputArtifactRefs: [firstRef],
        payload: {
          reviewedRevisionId: 'analysis-revision-first',
          reviewedHash: first.analysisRevision.contentHash,
          feedback: 'Clarify the outcome.',
        },
      } as const
      await submitDurableQualityJourneyCommand(firstRevisionRequest, client)
      await expect(submitDurableQualityJourneyCommand(firstRevisionRequest, client)).resolves.toMatchObject({
        outcome: 'COMMITTED',
        replayed: true,
      })
      await expect(
        submitDurableQualityJourneyCommand(
          {
            ...firstRevisionRequest,
            commandId: 'analysis-successor-request-changed',
            payload: { ...firstRevisionRequest.payload, feedback: 'Different hidden context.' },
          },
          client,
        ),
      ).resolves.toMatchObject({ outcome: 'CONFLICT', code: 'IDEMPOTENCY_KEY_REUSED' })
      const successorClaim = await claimQualityJourneyWork(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'REQUIREMENT_ANALYZER' },
        client,
      )
      const predecessor = await getQualityJourneyAnalysis(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const predecessorRevision = predecessor.revisions[0]!
      const predecessorQuestion = predecessorRevision.questions[0]!
      const predecessorAnswer = predecessorQuestion.answers[0]!
      const feedbackArtifact = await client.qualityJourneyArtifact.findFirstOrThrow({
        where: {
          journeyId: created.journey.journeyId,
          kind: 'ANALYSIS_REVISION_FEEDBACK',
          revisionId: 'analysis-revision-first',
        },
      })
      expect(JSON.parse(feedbackArtifact.artifactJson)).toMatchObject({ feedback: 'Clarify the outcome.' })
      expect(
        await client.qualityJourneyArtifact.count({
          where: { journeyId: created.journey.journeyId, kind: 'ANALYSIS_REVISION_FEEDBACK' },
        }),
      ).toBe(1)
      expect(successorClaim.assignment.inputArtifacts).toEqual(
        expect.arrayContaining([
          {
            kind: predecessorRevision.artifact.kind,
            artifactId: predecessorRevision.artifact.artifactId,
            revisionId: predecessorRevision.artifact.revisionId,
            contentHash: predecessorRevision.artifact.contentHash,
          },
          {
            kind: predecessorQuestion.artifact.kind,
            artifactId: predecessorQuestion.artifact.artifactId,
            revisionId: predecessorQuestion.artifact.revisionId,
            contentHash: predecessorQuestion.artifact.contentHash,
          },
          {
            kind: predecessorAnswer.artifact.kind,
            artifactId: predecessorAnswer.artifact.artifactId,
            contentHash: predecessorAnswer.artifact.contentHash,
          },
          {
            kind: 'ANALYSIS_REVISION_FEEDBACK',
            artifactId: feedbackArtifact.artifactId,
            revisionId: 'analysis-revision-first',
            contentHash: feedbackArtifact.contentHash,
          },
        ]),
      )
      expect(JSON.stringify(successorClaim.assignment.inputArtifacts)).not.toContain(predecessorQuestion.id)
      expect(JSON.stringify(successorClaim.assignment.inputArtifacts)).not.toContain(predecessorAnswer.id)
      const originalAuthorization = await client.qualityJourneyWorkAuthorization.findFirstOrThrow({
        where: { workItemId: successorClaim.workItem.id, supersedesAuthorizationId: null },
      })
      const reauthorization = await client.qualityJourneyWorkAuthorization.findFirstOrThrow({
        where: { supersedesAuthorizationId: originalAuthorization.id },
      })
      expect(reauthorization.authorizationJson).not.toBe(originalAuthorization.authorizationJson)
      expect(JSON.parse(reauthorization.authorizationJson).inputArtifacts).toEqual(
        successorClaim.assignment.inputArtifacts,
      )
      expect(JSON.parse(reauthorization.authorizationJson).roleDefinition.version).toBe('2')
      registerAgentFactoryProviderAdapter({
        adapterId: 'analysis-successor-adapter',
        supports: request => request.attemptId === successorClaim.attempt.id,
        dispatch: async request => ({
          schemaVersion: 'appraise.quality-journey/v1',
          outcome: 'STARTED',
          spawnReceiptId: `receipt-${request.attemptId}`,
          assignmentId: request.assignmentId,
          workItemId: request.workItemId,
          attemptId: request.attemptId,
          roleDefinitionDigest: request.roleDefinitionDigest,
          capabilityProfileDigest: request.capabilityProfileDigest,
          effectiveWorker: {
            modelId: 'provider-selected',
            reasoningLevel: 'HIGH',
            latencyPreference: 'DELIBERATE',
            toolIds: request.scope.permittedTools,
          },
          boundaries: request.requiredBoundaries.map(boundary => ({
            boundary: boundary.boundary,
            requested: boundary.allowedValues,
            effective: boundary.allowedValues,
            status: 'VERIFIED',
            evidence: [digest('f')],
          })),
          startedAt: '2026-09-01T00:00:00.000Z',
        }),
      })
      await dispatchQualityJourneyWork(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: successorClaim.workItem.id,
          leaseId: successorClaim.attempt.leaseId,
          ownerToken: successorClaim.ownerToken,
        },
        client,
      )
      const secondCharter = {
        ...charter(created.journey.journeyId, created.journey.activeCycleId, 'second'),
        questions: [],
        resolvedQuestionAnswerIds: [firstAnswer.answer.answerId],
      }
      const second = await submitQualityJourneyAnalysisSuccessor(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: successorClaim.workItem.id,
          attemptId: successorClaim.attempt.id,
          leaseId: successorClaim.attempt.leaseId,
          ownerToken: successorClaim.ownerToken,
          idempotencyKey: 'analysis-successor-second',
          predecessorAnalysisRevisionId: first.analysisRevision.id,
          charter: secondCharter,
        },
        client,
      )
      const secondDraft = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const secondRef = {
        kind: 'ANALYSIS_CHARTER_REVISION',
        artifactId: 'analysis-charter-second',
        revisionId: 'analysis-revision-second',
        contentHash: second.analysisRevision.contentHash,
      }
      await publishQualityJourneyAnalysis(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'analysis-successor-publish-second',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          actor: 'RUNNER',
          command: 'PUBLISH_ANALYSIS',
          expectedStateHash: secondDraft.journey.stateHash,
          idempotencyKey: 'analysis-successor-publish-second',
          inputArtifactRefs: [secondRef],
          payload: {
            artifactRevisionId: 'analysis-revision-second',
            artifactHash: second.analysisRevision.contentHash,
          },
        },
        client,
      )
      const secondReview = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await submitDurableQualityJourneyCommand(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'analysis-successor-request-second',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          actor: 'USER',
          command: 'REQUEST_ANALYSIS_REVISION',
          expectedStateHash: secondReview.journey.stateHash,
          idempotencyKey: 'analysis-successor-request-second',
          inputArtifactRefs: [secondRef],
          payload: {
            reviewedRevisionId: 'analysis-revision-second',
            reviewedHash: second.analysisRevision.contentHash,
            feedback: 'Clarify the next outcome.',
          },
        },
        client,
      )
      const thirdClaim = await claimQualityJourneyWork(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'REQUIREMENT_ANALYZER' },
        client,
      )
      registerStartedAnalyzerAdapter(thirdClaim.attempt.id, 'analysis-third-adapter')
      await dispatchQualityJourneyWork(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: thirdClaim.workItem.id,
          leaseId: thirdClaim.attempt.leaseId,
          ownerToken: thirdClaim.ownerToken,
        },
        client,
      )
      const third = await submitQualityJourneyAnalysisSuccessor(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: thirdClaim.workItem.id,
          attemptId: thirdClaim.attempt.id,
          leaseId: thirdClaim.attempt.leaseId,
          ownerToken: thirdClaim.ownerToken,
          idempotencyKey: 'analysis-successor-third',
          predecessorAnalysisRevisionId: second.analysisRevision.id,
          charter: { ...charter(created.journey.journeyId, created.journey.activeCycleId, 'third'), questions: [] },
        },
        client,
      )
      const thirdDraft = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const thirdRef = {
        kind: 'ANALYSIS_CHARTER_REVISION',
        artifactId: 'analysis-charter-third',
        revisionId: 'analysis-revision-third',
        contentHash: third.analysisRevision.contentHash,
      }
      await publishQualityJourneyAnalysis(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'analysis-successor-publish-third',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          actor: 'RUNNER',
          command: 'PUBLISH_ANALYSIS',
          expectedStateHash: thirdDraft.journey.stateHash,
          idempotencyKey: 'analysis-successor-publish-third',
          inputArtifactRefs: [thirdRef],
          payload: { artifactRevisionId: 'analysis-revision-third', artifactHash: third.analysisRevision.contentHash },
        },
        client,
      )
      const thirdReview = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await submitDurableQualityJourneyCommand(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'analysis-successor-request-third',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          actor: 'USER',
          command: 'REQUEST_ANALYSIS_REVISION',
          expectedStateHash: thirdReview.journey.stateHash,
          idempotencyKey: 'analysis-successor-request-third',
          inputArtifactRefs: [thirdRef],
          payload: {
            reviewedRevisionId: 'analysis-revision-third',
            reviewedHash: third.analysisRevision.contentHash,
            feedback: 'One more authorized revision.',
          },
        },
        client,
      )
      const fourthClaim = await claimQualityJourneyWork(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'REQUIREMENT_ANALYZER' },
        client,
      )
      expect(fourthClaim.attempt.attempt).toBeGreaterThan(3)
      const fourthAuthorization = await client.qualityJourneyWorkAuthorization.findUniqueOrThrow({
        where: { id: fourthClaim.attempt.authorizationId! },
      })
      expect(await client.qualityJourneyWorkAttempt.count({ where: { authorizationId: fourthAuthorization.id } })).toBe(
        1,
      )
      const expireFourthAuthorizationAttempt = async (attemptId: string) => {
        await client.qualityJourneyWorkAttempt.update({
          where: { id: attemptId },
          data: { leaseExpiresAt: new Date('2020-01-01T00:00:00.000Z') },
        })
        await resumeQualityJourney(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            now: new Date('2026-09-02'),
          },
          client,
        )
      }
      await expireFourthAuthorizationAttempt(fourthClaim.attempt.id)
      const fifthClaim = await claimQualityJourneyWork(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'REQUIREMENT_ANALYZER' },
        client,
      )
      await expireFourthAuthorizationAttempt(fifthClaim.attempt.id)
      const sixthClaim = await claimQualityJourneyWork(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'REQUIREMENT_ANALYZER' },
        client,
      )
      await expireFourthAuthorizationAttempt(sixthClaim.attempt.id)
      const budgetBlocker = await client.qualityJourneyBlocker.findFirstOrThrow({
        where: { journeyId: created.journey.journeyId, reasonCode: 'ATTEMPT_BUDGET_EXHAUSTED' },
      })
      expect(JSON.parse(budgetBlocker.evidenceJson)).toMatchObject({
        authorizationId: fourthAuthorization.id,
        authorizationAttemptCount: 3,
        attemptSequence: sixthClaim.attempt.attempt,
        maxAttempts: 3,
      })
      await expect(
        decideQualityJourneyAnalysis(
          {
            schemaVersion: 'appraise.quality-journey/v1',
            commandId: 'analysis-successor-decide-old',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            actor: 'USER',
            command: 'DECIDE_ANALYSIS',
            expectedStateHash: secondReview.journey.stateHash,
            idempotencyKey: 'analysis-successor-decide-old',
            inputArtifactRefs: [firstRef],
            payload: {
              revisionId: 'analysis-revision-first',
              contentHash: first.analysisRevision.contentHash,
              decision: 'APPROVED',
            },
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)
})
