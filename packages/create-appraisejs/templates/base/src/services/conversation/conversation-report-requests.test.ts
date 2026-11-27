import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import { answerConversationReportRequest, parseConversationReportRequest } from './conversation-report-requests'

describe('conversation report requests', () => {
  it('reads a bounded project-scoped list and carries links back to the same project', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'report-1',
        createdAt: new Date('2026-01-01'),
        testRun: { id: 'run-1', name: 'Observed run', status: 'COMPLETED', result: 'FAILED', evidenceHealth: 'valid' },
      },
    ])
    const client = { report: { findMany } } as unknown as PrismaClient
    const result = await answerConversationReportRequest('project-1', { kind: 'RECENT' }, client)
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { targetProjectId: 'project-1', testRun: { targetProjectId: 'project-1' } },
        take: 5,
      }),
    )
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'report-1',
        result: 'FAILED',
        evidenceHealth: 'valid',
        href: '/reports/report-1?project=project-1',
      }),
    ])
  })

  it('recognizes only grounded report intents', () => {
    expect(parseConversationReportRequest('Compare latest reports')).toEqual({ kind: 'COMPARE_LATEST' })
    expect(parseConversationReportRequest('Export all secret reports')).toBeNull()
  })
})
