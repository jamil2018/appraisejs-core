import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import { compareProjectReports } from './report-comparison-service'

const input = { targetProjectId: 'project-a', baselineReportId: 'report-a', candidateReportId: 'report-b' }

function client(rows: unknown[]) {
  return {
    report: { findMany: vi.fn().mockResolvedValue(rows) },
  } as unknown as PrismaClient
}

const report = (id: string, result: 'PASSED' | 'FAILED', caseResult: 'PASSED' | 'FAILED') => ({
  id,
  testRun: {
    id: `test-${id}`,
    runId: `run-${id}`,
    name: `Checkout ${id}`,
    status: 'COMPLETED',
    result,
    evidenceHealth: 'valid',
    completedAt: new Date('2026-11-28T00:00:00Z'),
  },
  testCases: [
    { testCaseId: 'case-checkout', testRunTestCase: { result: caseResult, testCase: { title: 'Checkout' } } },
  ],
})

describe('scoped report comparison', () => {
  it('compares only persisted outcomes for two exact reports', async () => {
    const db = client([report('report-a', 'FAILED', 'FAILED'), report('report-b', 'PASSED', 'PASSED')])
    const comparison = await compareProjectReports(input, db)
    expect(db.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['report-a', 'report-b'] },
          targetProjectId: 'project-a',
          testRun: { targetProjectId: 'project-a' },
        }),
        take: 2,
      }),
    )
    expect(comparison).toMatchObject({
      baseline: { reportId: 'report-a', result: 'FAILED' },
      candidate: { reportId: 'report-b', result: 'PASSED' },
      cases: [{ testCaseId: 'case-checkout', baseline: 'FAILED', candidate: 'PASSED' }],
    })
  })

  it('refuses a missing or foreign report without comparing a substitute', async () => {
    const db = client([report('report-a', 'FAILED', 'FAILED')])
    await expect(compareProjectReports(input, db)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses the same report twice before querying', async () => {
    const db = client([])
    await expect(
      compareProjectReports({ ...input, candidateReportId: input.baselineReportId }, db),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
    })
    expect(db.report.findMany).not.toHaveBeenCalled()
  })
})
