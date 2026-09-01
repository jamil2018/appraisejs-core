import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }))

vi.mock('@/config/db-config', () => ({ default: { qualityJourney: { findMany: mocks.findMany } } }))

import { listQualityJourneys } from './quality-journey-query-service'

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
