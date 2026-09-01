// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAnalysis: vi.fn(),
  getJourney: vi.fn(),
  notFound: vi.fn(),
  project: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: () => mocks.notFound(),
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/lib/active-project', () => ({ requireActiveProject: mocks.project }))
vi.mock('@/services/coordinator/quality-journey-analysis-service', () => ({
  getQualityJourneyAnalysis: mocks.getAnalysis,
}))
vi.mock('@/services/coordinator/quality-journey-service', () => ({ getQualityJourney: mocks.getJourney }))
vi.mock('../quality-journey-actions', () => ({
  answerQualityJourneyAnalysisQuestionAction: vi.fn(),
  approveQualityJourneyAnalysisAction: vi.fn(),
  requestQualityJourneyAnalysisRevisionAction: vi.fn(),
}))

import QualityJourneyDetailPage from './page'
import { ServiceError } from '@/services/shared/errors'

const project = { id: 'project-1', displayName: 'Storefront' }
const digest = (character: string) => `sha256:${character.repeat(64)}`

const journey = (overrides: Record<string, unknown> = {}) => ({
  journey: {
    journeyId: 'journey-1',
    stage: 'ANALYSIS_REVIEW',
    stateHash: digest('a'),
    activeRevisionIds: {},
    analysisReviewHash: digest('b'),
    unresolvedQuestionIds: ['payment-method'],
    ...overrides,
  },
  runner: [{ role: 'REQUIREMENT_ANALYZER', stage: 'ANALYSIS_REVIEW', state: 'RUNNABLE', workItemId: 'work-1' }],
  blockers: [],
  events: [],
})

function analysisRevision({
  id,
  revision,
  publication,
  questionId,
}: {
  id: string
  revision: number
  publication: { reviewHash: string; publishedAt: Date } | null
  questionId: string
}) {
  return {
    id: `row-${id}`,
    artifactId: `artifact-${id}`,
    artifactRevisionId: id,
    revision,
    contentHash: digest(String(revision)),
    artifact: {
      artifactJson: JSON.stringify({
        objectives: [`Objective ${revision}`],
        scope: { included: ['Checkout'], excluded: [] },
        requirements: [],
        obligations: [],
        constraints: [],
        assumptions: [],
        risks: [],
        acceptanceSignals: [],
      }),
    },
    questions: [
      {
        id: `question-row-${revision}`,
        questionId,
        required: true,
        artifact: {
          artifactJson: JSON.stringify({ prompt: `Question for revision ${revision}`, rationale: 'Coverage.' }),
        },
        answers: [],
      },
    ],
    publication,
    decision: null,
  }
}

async function renderPage() {
  render(
    await QualityJourneyDetailPage({
      params: Promise.resolve({ journeyId: 'journey-1' }),
      searchParams: Promise.resolve({ project: 'project-1' }),
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue(project)
  mocks.getJourney.mockResolvedValue(journey())
  mocks.getAnalysis.mockResolvedValue({ revisions: [] })
})

describe('QualityJourneyDetailPage', () => {
  it('renders the active project-scoped Journey and blocks approval while required answers remain open', async () => {
    await renderPage()

    expect(screen.getByText('Quality Journey')).toBeInTheDocument()
    expect(screen.getByText('1 required question must be resolved before approval.')).toBeInTheDocument()
    expect(
      screen.getByText('Review the current published analysis revision or request a revision with durable feedback.'),
    ).toBeInTheDocument()
    expect(mocks.getJourney).toHaveBeenCalledWith({ journeyId: 'journey-1', targetProjectId: 'project-1' })
  })

  it('shows no pending decision once there are no open questions outside the review state', async () => {
    mocks.getJourney.mockResolvedValue(journey({ stage: 'INTAKE', unresolvedQuestionIds: [] }))

    await renderPage()

    expect(screen.getByText('No user decision is currently pending.')).toBeInTheDocument()
    expect(screen.getByText('The assigned Requirement Analyzer has not produced a charter yet.')).toBeInTheDocument()
  })

  it('selects the latest unpublished successor during analysis so Q&A can continue after a revision request', async () => {
    const user = userEvent.setup()
    mocks.getJourney.mockResolvedValue(
      journey({
        stage: 'ANALYSIS',
        activeRevisionIds: { analysis: 'analysis-revision-1' },
        analysisReviewHash: digest('d'),
        unresolvedQuestionIds: ['question-successor'],
      }),
    )
    mocks.getAnalysis.mockResolvedValue({
      revisions: [
        analysisRevision({
          id: 'analysis-revision-1',
          revision: 1,
          publication: { reviewHash: digest('b'), publishedAt: new Date('2026-09-01T00:00:00.000Z') },
          questionId: 'question-predecessor',
        }),
        analysisRevision({
          id: 'analysis-revision-2',
          revision: 2,
          publication: null,
          questionId: 'question-successor',
        }),
      ],
    })

    await renderPage()

    expect(screen.getByText(/Revision 2/)).toBeInTheDocument()
    expect(screen.getByText('Question for revision 2')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Answer'), 'Wallet payment.')
    expect(screen.getByRole('button', { name: 'Record answer' })).toBeEnabled()
  })

  it('keeps the published predecessor contextual but not answerable while a requested successor is still absent', async () => {
    mocks.getJourney.mockResolvedValue(
      journey({
        stage: 'ANALYSIS',
        activeRevisionIds: { analysis: 'analysis-revision-1' },
        analysisReviewHash: digest('d'),
        unresolvedQuestionIds: ['question-predecessor'],
      }),
    )
    mocks.getAnalysis.mockResolvedValue({
      revisions: [
        analysisRevision({
          id: 'analysis-revision-1',
          revision: 1,
          publication: { reviewHash: digest('b'), publishedAt: new Date('2026-09-01T00:00:00.000Z') },
          questionId: 'question-predecessor',
        }),
      ],
    })

    await renderPage()

    expect(screen.getByText('Question for revision 1')).toBeInTheDocument()
    expect(screen.queryByLabelText('Answer')).not.toBeInTheDocument()
  })

  it('uses the Next missing-resource path for a journey outside the active project', async () => {
    mocks.getJourney.mockRejectedValue(new ServiceError('missing', 'NOT_FOUND'))
    mocks.notFound.mockImplementation(() => {
      throw new Error('not found')
    })

    await expect(renderPage()).rejects.toThrow('not found')
  })
})
