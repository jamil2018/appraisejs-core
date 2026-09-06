import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn() }))

vi.mock('@/config/db-config', () => ({
  default: { qualityJourney: { findMany: mocks.findMany, findFirst: mocks.findFirst } },
}))

import { getQualityJourneyStatusSnapshot, listQualityJourneys } from './quality-journey-query-service'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listQualityJourneys', () => {
  it('maps compact, UI-safe summaries from project-scoped journey records', async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: 'journey-1',
        stage: 'ANALYSIS_REVIEW',
        status: 'ACTIVE',
        activeCycleId: 'cycle-1',
        activeRevisionIdsJson: JSON.stringify({ journey: 'journey-revision-1', ignored: 12 }),
        unresolvedQuestionIdsJson: JSON.stringify(['question-1', 4]),
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T01:00:00.000Z'),
        revisions: [
          {
            id: 'requirement-1',
            revision: 1,
            contentHash: 'sha256:abc',
            contentJson: JSON.stringify({ objective: 'Checkout accepts cards', privateNote: 'do not expose' }),
          },
        ],
        _count: { analysisRevisions: 2, blockers: 1 },
      },
      {
        id: 'journey-2',
        stage: 'INTAKE',
        status: 'ACTIVE',
        activeCycleId: 'cycle-2',
        activeRevisionIdsJson: 'not-json',
        unresolvedQuestionIdsJson: 'not-json',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T01:00:00.000Z'),
        revisions: [{ id: 'requirement-2', revision: 1, contentHash: 'sha256:def', contentJson: JSON.stringify({}) }],
        _count: { analysisRevisions: 0, blockers: 0 },
      },
    ])

    await expect(listQualityJourneys({ targetProjectId: 'project-1' })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'journey-1',
          activeRevisionIds: { journey: 'journey-revision-1' },
          unresolvedQuestionIds: ['question-1'],
          requirement: expect.objectContaining({ summary: 'Checkout accepts cards' }),
        }),
        expect.objectContaining({
          id: 'journey-2',
          activeRevisionIds: {},
          unresolvedQuestionIds: [],
          requirement: expect.objectContaining({ summary: 'Requirement snapshot unavailable' }),
        }),
      ]),
    )
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { targetProjectId: 'project-1' } }))
  })
})

describe('getQualityJourneyStatusSnapshot', () => {
  it('returns only project-scoped lifecycle observation and presentation-safe attention', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 'journey-1',
      stage: 'ANALYSIS_REVIEW',
      status: 'ACTIVE',
      version: 4,
      stateHash: 'sha256:state',
      activeCycleId: 'cycle-1',
      activeRevisionIdsJson: JSON.stringify({ analysis: 'analysis-r2', ignored: 3 }),
      analysisReviewHash: 'sha256:review',
      unresolvedQuestionIdsJson: JSON.stringify(['question-1', false]),
      blockers: [
        {
          id: 'blocker-1',
          reasonCode: 'QUESTION_REQUIRED',
          summary: 'Answer the payment question.',
          responsibleActor: 'USER',
          requiredResolution: 'Provide the accepted payment methods.',
        },
      ],
      workItems: [
        {
          id: 'work-1',
          role: 'REQUIREMENT_ANALYZER',
          status: 'WAITING_FOR_INPUT',
          updatedAt: new Date('2026-09-07T00:00:00.000Z'),
        },
      ],
    })

    await expect(
      getQualityJourneyStatusSnapshot({ journeyId: 'journey-1', targetProjectId: 'project-1' }),
    ).resolves.toMatchObject({
      journeyId: 'journey-1',
      closed: false,
      lifecycle: {
        activeRevisionIds: { analysis: 'analysis-r2' },
        analysisReviewHash: 'sha256:review',
        stateHash: 'sha256:state',
        version: 4,
      },
      attention: {
        unresolvedQuestionCount: 1,
        activeBlockers: [expect.objectContaining({ id: 'blocker-1', responsibleActor: 'USER' })],
        activeWork: [expect.objectContaining({ id: 'work-1', updatedAt: '2026-09-07T00:00:00.000Z' })],
      },
    })
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'journey-1', targetProjectId: 'project-1' } }),
    )
    expect(mocks.findFirst.mock.calls[0][0].select).not.toHaveProperty('targetProject')
  })

  it('fails closed when the journey does not belong to the requested project', async () => {
    mocks.findFirst.mockResolvedValue(null)
    await expect(
      getQualityJourneyStatusSnapshot({ journeyId: 'journey-1', targetProjectId: 'other-project' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
