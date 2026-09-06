// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: vi.fn(),
  answer: vi.fn(),
  approve: vi.fn(),
  requestRevision: vi.fn(),
  freshness: { newerVersionAvailable: false, loadingNewerVersion: false, loadNewerVersion: vi.fn() },
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }))
vi.mock('../quality-journey-actions', () => ({
  answerQualityJourneyAnalysisQuestionAction: mocks.answer,
  approveQualityJourneyAnalysisAction: mocks.approve,
  requestQualityJourneyAnalysisRevisionAction: mocks.requestRevision,
}))
vi.mock('./journey-status-observation', () => ({ useJourneyStatusFreshness: () => mocks.freshness }))

import { AnalysisReviewControls } from './analysis-review-controls'

const digest = (character: string) => `sha256:${character.repeat(64)}`

const analysis = {
  id: 'analysis-row-1',
  artifactId: 'analysis-charter-1',
  analysisRevisionId: 'analysis-revision-1',
  revision: 1,
  contentHash: digest('a'),
  objectives: ['Checkout'],
  scope: { included: ['Checkout'], excluded: [] },
  requirements: [],
  obligations: [],
  constraints: [],
  assumptions: [],
  risks: [],
  acceptanceSignals: [],
  questions: [
    {
      id: 'question-row-1',
      questionId: 'payment-method',
      prompt: 'Which payment method is in scope?',
      rationale: 'Scenario coverage depends on it.',
      required: true,
      answers: [],
    },
  ],
  publication: { reviewHash: digest('b'), publishedAt: new Date('2026-09-01T00:00:00.000Z') },
  decision: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.answer.mockResolvedValue({ success: true })
  mocks.approve.mockResolvedValue({ success: true })
  mocks.requestRevision.mockResolvedValue({ success: true })
  mocks.freshness.newerVersionAvailable = false
})

describe('AnalysisReviewControls', () => {
  it('makes unresolved required questions visible and blocks approval', () => {
    render(
      <AnalysisReviewControls
        analysis={analysis}
        analysisReviewHash={digest('c')}
        answerable
        journeyId="journey-1"
        stage="ANALYSIS_REVIEW"
        stateHash={digest('c')}
        unresolvedQuestionIds={['payment-method']}
      />,
    )

    expect(screen.getByText('Required · Open')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve this version' })).toBeDisabled()
    expect(screen.getByText(/Answer 1 required question/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /publish/i })).not.toBeInTheDocument()
  })

  it('records a correction against the latest answer and requests a revision with the current review hash', async () => {
    const user = userEvent.setup()
    const correctedAnalysis = {
      ...analysis,
      questions: [
        {
          ...analysis.questions[0],
          answers: [
            {
              answerId: 'answer-original',
              answer: 'Card payment.',
              contentHash: digest('d'),
              correctionOfAnswerId: null,
              createdAt: new Date('2026-09-01T00:00:00.000Z'),
            },
          ],
        },
      ],
    }
    render(
      <AnalysisReviewControls
        analysis={correctedAnalysis}
        analysisReviewHash={digest('e')}
        answerable
        journeyId="journey-1"
        stage="ANALYSIS_REVIEW"
        stateHash={digest('c')}
        unresolvedQuestionIds={['payment-method']}
      />,
    )

    await user.type(screen.getByLabelText('Correct answer'), 'Wallet payment.')
    await user.click(screen.getByRole('button', { name: 'Record correction' }))

    expect(mocks.answer).toHaveBeenCalledWith(
      expect.objectContaining({
        journeyId: 'journey-1',
        analysisRevisionId: 'analysis-revision-1',
        questionId: 'payment-method',
        correctionOfAnswerId: 'answer-original',
        answerId: expect.stringMatching(/^analysis-answer:/),
        idempotencyKey: expect.stringMatching(/^analysis-answer-request:/),
      }),
    )
    expect(mocks.refresh).toHaveBeenCalled()

    await user.type(screen.getByLabelText('What should change?'), 'Clarify payment scope.')
    await user.click(screen.getByRole('button', { name: 'Request changes' }))

    expect(mocks.requestRevision).toHaveBeenCalledWith(
      expect.objectContaining({ expectedReviewHash: digest('e'), contentHash: digest('a') }),
    )
  })

  it('keeps a published predecessor readable but disables Q&A while waiting for a successor draft', () => {
    render(
      <AnalysisReviewControls
        analysis={analysis}
        analysisReviewHash={digest('c')}
        answerable={false}
        journeyId="journey-1"
        stage="ANALYSIS"
        stateHash={digest('c')}
        unresolvedQuestionIds={['payment-method']}
      />,
    )

    expect(screen.getByText('Which payment method is in scope?')).toBeInTheDocument()
    expect(screen.queryByLabelText('Answer')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record answer' })).not.toBeInTheDocument()
  })

  it('keeps optional unanswered questions separate from required questions and labels them accurately', () => {
    render(
      <AnalysisReviewControls
        analysis={{
          ...analysis,
          questions: [
            ...analysis.questions,
            {
              id: 'question-row-optional',
              questionId: 'preferred-browser',
              prompt: 'Is there a preferred browser?',
              rationale: 'This can refine compatibility coverage.',
              required: false,
              answers: [],
            },
          ],
        }}
        analysisReviewHash={digest('c')}
        answerable
        journeyId="journey-1"
        stage="ANALYSIS_REVIEW"
        stateHash={digest('c')}
        unresolvedQuestionIds={['payment-method']}
      />,
    )

    expect(screen.getByRole('region', { name: 'Required questions' })).toHaveTextContent('payment method')
    expect(screen.getByRole('region', { name: 'Optional questions' })).toHaveTextContent('preferred browser')
    expect(screen.getByText('Open—optional')).toBeInTheDocument()
  })

  it('keeps editable text local but disables exact analysis actions when a newer state is observed', () => {
    mocks.freshness.newerVersionAvailable = true
    render(
      <AnalysisReviewControls
        analysis={analysis}
        analysisReviewHash={digest('c')}
        answerable
        journeyId="journey-1"
        stage="ANALYSIS_REVIEW"
        stateHash={digest('c')}
        unresolvedQuestionIds={[]}
      />,
    )

    expect(screen.getByText(/Load it before recording answers or a review decision/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Answer')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve this version' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Request changes' })).toBeDisabled()
  })
})
