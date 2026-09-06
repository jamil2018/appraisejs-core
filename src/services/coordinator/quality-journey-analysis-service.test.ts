import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import { getQualityJourneyAnalysis } from './quality-journey-analysis-service'

describe('getQualityJourneyAnalysis', () => {
  it('uses a stable ID tie-breaker when answer timestamps are equal', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const client = {
      qualityJourney: { findFirst: vi.fn().mockResolvedValue({ id: 'journey-1' }) },
      qualityJourneyAnalysisRevision: { findMany },
    } as unknown as PrismaClient

    await getQualityJourneyAnalysis({ journeyId: 'journey-1', targetProjectId: 'project-1' }, client)

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          questions: expect.objectContaining({
            include: expect.objectContaining({
              answers: expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
            }),
          }),
        }),
      }),
    )
  })
})
