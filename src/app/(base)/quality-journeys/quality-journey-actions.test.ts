import { trustedHumanCoordinatorSession } from '@/services/coordinator/quality-journey-coordinator-session'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  scheduleContinuation: vi.fn(),
  confirmDraft: vi.fn(),
  getDraft: vi.fn(),
  providerReadiness: vi.fn(),
  requireActiveProjectForMutation: vi.fn(),
  createAppManagedJourney: vi.fn(),
  getQualityJourney: vi.fn(),
  submitDurableQualityJourneyCommand: vi.fn(),
  answerQualityJourneyAnalysisQuestion: vi.fn(),
  decideQualityJourneyAnalysis: vi.fn(),
  requestQualityJourneyAnalysisRevision: vi.fn(),
  requestScenarioRevision: vi.fn(),
}))

vi.mock('@/services/coordinator/app-managed-progression-service', () => ({
  scheduleAppManagedJourneyContinuation: mocks.scheduleContinuation,
}))
vi.mock('@/services/coordinator/quality-journey-draft-service', () => ({
  confirmQualityJourneyDraft: mocks.confirmDraft,
  getQualityJourneyDraft: mocks.getDraft,
}))
vi.mock('@/services/coordinator/app-managed-journey-readiness', () => ({
  getManagedJourneyReadinessForProvider: mocks.providerReadiness,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.requireActiveProjectForMutation }))
vi.mock('@/services/coordinator/quality-journey-service', () => ({
  createAppManagedJourney: mocks.createAppManagedJourney,
  getQualityJourney: mocks.getQualityJourney,
  submitDurableQualityJourneyCommand: mocks.submitDurableQualityJourneyCommand,
}))
vi.mock('@/services/coordinator/quality-journey-scenario-service', () => ({
  requestQualityJourneyScenarioRevision: mocks.requestScenarioRevision,
  commentQualityJourneyScenarioPortfolio: vi.fn(),
  decideQualityJourneyScenarios: vi.fn(),
  disposeQualityJourneyScenarioComment: vi.fn(),
}))
vi.mock('@/services/coordinator/quality-journey-analysis-service', () => ({
  answerQualityJourneyAnalysisQuestion: mocks.answerQualityJourneyAnalysisQuestion,
  decideQualityJourneyAnalysis: mocks.decideQualityJourneyAnalysis,
  requestQualityJourneyAnalysisRevision: mocks.requestQualityJourneyAnalysisRevision,
}))

import {
  answerQualityJourneyAnalysisQuestionAction,
  approveQualityJourneyAnalysisAction,
  createQualityJourneyAction,
  confirmQualityJourneyDraftAction,
  requestQualityJourneyAnalysisRevisionAction,
  requestQualityJourneyScenarioRevisionAction,
} from './quality-journey-actions'

const digest = (character: string) => `sha256:${character.repeat(64)}`

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActiveProjectForMutation.mockResolvedValue({ id: 'project-1' })
  mocks.createAppManagedJourney.mockResolvedValue({
    journey: {
      journeyId: 'journey-1',
      stage: 'INTAKE',
      stateHash: digest('a'),
      activeRevisionIds: { journey: 'journey-revision-1' },
    },
  })
  mocks.submitDurableQualityJourneyCommand.mockResolvedValue({ outcome: 'COMMITTED' })
  mocks.getQualityJourney.mockResolvedValue({ journey: { journeyId: 'journey-1', stateHash: digest('b') } })
  mocks.confirmDraft.mockResolvedValue({ replayed: false, journeyId: 'journey-1' })
  mocks.getDraft.mockResolvedValue({ status: 'ACTIVE', managedWorkerProvider: 'CODEX' })
  mocks.providerReadiness.mockResolvedValue({ ready: true })
  mocks.scheduleContinuation.mockReset()
  mocks.answerQualityJourneyAnalysisQuestion.mockResolvedValue({ replayed: false, answer: { answerId: 'answer-1' } })
  mocks.decideQualityJourneyAnalysis.mockResolvedValue({ outcome: 'COMMITTED' })
  mocks.requestQualityJourneyAnalysisRevision.mockResolvedValue({ outcome: 'COMMITTED' })
  mocks.requestScenarioRevision.mockResolvedValue({ outcome: 'COMMITTED' })
})

describe('Quality Journey route actions', () => {
  it('creates a target-scoped journey then submits the immutable requirement transition', async () => {
    await expect(
      createQualityJourneyAction({
        requirement: {
          objective: 'A shopper can submit an order.',
          context: 'Card payments only.',
        },
        idempotencyKey: 'journey-create-1',
      }),
    ).resolves.toMatchObject({ success: true, data: { journeyId: 'journey-1' } })

    expect(mocks.createAppManagedJourney).toHaveBeenCalledWith({
      targetProjectId: 'project-1',
      idempotencyKey: 'journey-create-1',
      requirement: { objective: 'A shopper can submit an order.', context: 'Card payments only.' },
    })
    expect(mocks.submitDurableQualityJourneyCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        journeyId: 'journey-1',
        targetProjectId: 'project-1',
        actor: 'USER',
        command: 'SUBMIT_REQUIREMENT',
        idempotencyKey: 'submit-requirement:journey-create-1',
      }),
      undefined,
      trustedHumanCoordinatorSession,
    )
  })

  it('schedules Analysis after confirmation using the newly committed state', async () => {
    await expect(
      confirmQualityJourneyDraftAction({
        draftId: 'draft-1',
        expectedVersion: 1,
        expectedDraftHash: digest('a'),
        requirementHash: digest('c'),
      }),
    ).resolves.toMatchObject({ success: true, status: 201, data: { journeyId: 'journey-1' } })
    expect(mocks.confirmDraft).toHaveBeenCalledWith(expect.objectContaining({ targetProjectId: 'project-1' }))
    expect(mocks.scheduleContinuation).toHaveBeenCalledWith({
      journeyId: 'journey-1',
      targetProjectId: 'project-1',
      expectedStateHash: digest('b'),
    })
    expect(mocks.confirmDraft.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.scheduleContinuation.mock.invocationCallOrder[0]!,
    )
  })

  it('preserves successful creation when continuation registration fails', async () => {
    mocks.scheduleContinuation.mockImplementation(() => {
      throw new Error('Registration unavailable')
    })
    await expect(
      confirmQualityJourneyDraftAction({
        draftId: 'draft-1',
        expectedVersion: 1,
        expectedDraftHash: digest('a'),
        requirementHash: digest('c'),
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        journeyId: 'journey-1',
        continuationError: expect.stringMatching(/created/),
      },
    })
  })

  it('returns a confirmed replay without creating another Journey', async () => {
    mocks.getDraft.mockResolvedValue({ status: 'CONFIRMED', managedWorkerProvider: 'CODEX' })
    mocks.confirmDraft.mockResolvedValue({ replayed: true, journeyId: 'journey-1' })
    await expect(
      confirmQualityJourneyDraftAction({
        draftId: 'draft-1',
        expectedVersion: 1,
        expectedDraftHash: digest('a'),
        requirementHash: digest('c'),
      }),
    ).resolves.toMatchObject({ success: true, status: 200, data: { journeyId: 'journey-1', replayed: true } })
    expect(mocks.createAppManagedJourney).not.toHaveBeenCalled()
    expect(mocks.providerReadiness).not.toHaveBeenCalled()
  })

  it('answers an exact analysis question within the active project scope', async () => {
    await expect(
      answerQualityJourneyAnalysisQuestionAction({
        journeyId: 'journey-1',
        analysisRevisionId: 'analysis-revision-1',
        questionId: 'question-1',
        answerId: 'answer-1',
        idempotencyKey: 'answer-request-1',
        answer: 'Card payment is in scope.',
      }),
    ).resolves.toMatchObject({ success: true, data: { answerId: 'answer-1' } })

    expect(mocks.getQualityJourney).toHaveBeenCalledWith({ journeyId: 'journey-1', targetProjectId: 'project-1' })
    expect(mocks.answerQualityJourneyAnalysisQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        answer: expect.objectContaining({ targetProjectId: 'project-1', actor: 'USER', questionId: 'question-1' }),
      }),
      undefined,
      trustedHumanCoordinatorSession,
    )
  })

  it('delegates a revision request to the specialized exact-review service', async () => {
    await expect(
      requestQualityJourneyAnalysisRevisionAction({
        journeyId: 'journey-1',
        analysisRevisionId: 'analysis-revision-1',
        artifactId: 'analysis-charter-1',
        contentHash: digest('b'),
        expectedReviewHash: digest('c'),
        expectedStateHash: digest('d'),
        commandId: 'revision-command-1',
        idempotencyKey: 'revision-request-1',
        feedback: 'Clarify the payment boundary.',
      }),
    ).resolves.toMatchObject({ success: true })

    expect(mocks.requestQualityJourneyAnalysisRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedReviewHash: digest('c'),
        command: expect.objectContaining({
          targetProjectId: 'project-1',
          command: 'REQUEST_ANALYSIS_REVISION',
          actor: 'USER',
        }),
      }),
      undefined,
      trustedHumanCoordinatorSession,
    )
  })

  it('wakes the exact newly-issued Designer revision after its human review request commits', async () => {
    await expect(
      requestQualityJourneyScenarioRevisionAction({
        journeyId: 'journey-1',
        portfolioId: 'portfolio-1',
        portfolioRevisionId: 'portfolio-r1',
        portfolioHash: digest('a'),
        expectedStateHash: digest('b'),
        expectedReviewHash: digest('c'),
        commandId: 'scenario-revision',
        idempotencyKey: 'scenario-revision',
        feedback: 'Clarify checkout alternatives.',
      }),
    ).resolves.toMatchObject({ success: true })
    expect(mocks.requestScenarioRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          command: 'REQUEST_SCENARIO_REVISION',
          payload: expect.objectContaining({ feedback: 'Clarify checkout alternatives.' }),
        }),
      }),
      undefined,
      trustedHumanCoordinatorSession,
    )
    expect(mocks.scheduleContinuation).toHaveBeenCalledWith({
      journeyId: 'journey-1',
      targetProjectId: 'project-1',
      expectedStateHash: digest('b'),
    })
    expect(mocks.requestScenarioRevision.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.scheduleContinuation.mock.invocationCallOrder[0]!,
    )
  })

  it('submits approval only through the exact Analysis decision service', async () => {
    await expect(
      approveQualityJourneyAnalysisAction({
        journeyId: 'journey-1',
        analysisRevisionId: 'analysis-revision-1',
        artifactId: 'analysis-charter-1',
        contentHash: digest('b'),
        expectedStateHash: digest('d'),
        commandId: 'approval-command-1',
        idempotencyKey: 'approval-request-1',
      }),
    ).resolves.toMatchObject({ success: true })

    expect(mocks.decideQualityJourneyAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        targetProjectId: 'project-1',
        command: 'DECIDE_ANALYSIS',
        actor: 'USER',
      }),
      undefined,
      trustedHumanCoordinatorSession,
    )
  })
})
