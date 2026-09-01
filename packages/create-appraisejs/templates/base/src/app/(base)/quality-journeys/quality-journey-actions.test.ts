import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireActiveProjectForMutation: vi.fn(),
  createQualityJourney: vi.fn(),
  getQualityJourney: vi.fn(),
  submitDurableQualityJourneyCommand: vi.fn(),
  answerQualityJourneyAnalysisQuestion: vi.fn(),
  decideQualityJourneyAnalysis: vi.fn(),
  requestQualityJourneyAnalysisRevision: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.requireActiveProjectForMutation }))
vi.mock('@/services/coordinator/quality-journey-service', () => ({
  createQualityJourney: mocks.createQualityJourney,
  getQualityJourney: mocks.getQualityJourney,
  submitDurableQualityJourneyCommand: mocks.submitDurableQualityJourneyCommand,
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
  requestQualityJourneyAnalysisRevisionAction,
} from './quality-journey-actions'

const digest = (character: string) => `sha256:${character.repeat(64)}`

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActiveProjectForMutation.mockResolvedValue({ id: 'project-1' })
  mocks.createQualityJourney.mockResolvedValue({
    journey: {
      journeyId: 'journey-1',
      stage: 'INTAKE',
      stateHash: digest('a'),
      activeRevisionIds: { journey: 'journey-revision-1' },
    },
  })
  mocks.submitDurableQualityJourneyCommand.mockResolvedValue({ outcome: 'COMMITTED' })
  mocks.getQualityJourney.mockResolvedValue({ journey: { journeyId: 'journey-1' } })
  mocks.answerQualityJourneyAnalysisQuestion.mockResolvedValue({ replayed: false, answer: { answerId: 'answer-1' } })
  mocks.decideQualityJourneyAnalysis.mockResolvedValue({ outcome: 'COMMITTED' })
  mocks.requestQualityJourneyAnalysisRevision.mockResolvedValue({ outcome: 'COMMITTED' })
})

describe('Quality Journey route actions', () => {
  it('creates a target-scoped journey then submits the immutable requirement transition', async () => {
    await expect(
      createQualityJourneyAction({
        objective: 'A shopper can submit an order.',
        context: 'Card payments only.',
        idempotencyKey: 'journey-create-1',
      }),
    ).resolves.toMatchObject({ success: true, data: { journeyId: 'journey-1' } })

    expect(mocks.createQualityJourney).toHaveBeenCalledWith({
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
    )
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
    )
  })
})
