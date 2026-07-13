import { describe, expect, it, vi } from 'vitest'
import { TestRunTestCaseResult } from '@prisma/client'
import { getDashboardMetrics, getTestSuiteExecutionData } from './dashboard-service'

const { updateDashboardMetricsMock } = vi.hoisted(() => ({
  updateDashboardMetricsMock: vi.fn(),
}))

vi.mock('@/config/db-config', () => ({
  default: {
    testRun: { findMany: vi.fn() },
    report: { findMany: vi.fn() },
    dashboardMetrics: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/metrics/metric-calculator', () => ({
  updateDashboardMetrics: updateDashboardMetricsMock,
}))

import prisma from '@/config/db-config'

describe('getDashboardMetrics', () => {
  it('refreshes dashboard aggregates before returning the persisted row', async () => {
    const metrics = {
      failedRecentRunsCount: 0,
      repeatedlyFailingTestsCount: 0,
      flakyTestsCount: 0,
      suitesNotExecutedRecentlyCount: 0,
    }
    updateDashboardMetricsMock.mockResolvedValue(undefined)
    vi.mocked(prisma.dashboardMetrics.findFirst).mockResolvedValue(metrics as never)

    await expect(getDashboardMetrics('project-1')).resolves.toBe(metrics)

    expect(updateDashboardMetricsMock).toHaveBeenCalledOnce()
    expect(prisma.dashboardMetrics.findFirst).toHaveBeenCalledOnce()
  })
})

describe('getTestSuiteExecutionData', () => {
  it('returns empty array when no completed test runs', async () => {
    vi.mocked(prisma.testRun.findMany).mockResolvedValue([] as never)
    await expect(getTestSuiteExecutionData('project-1')).resolves.toEqual([])
    expect(prisma.report.findMany).not.toHaveBeenCalled()
  })

  it('aggregates per-suite counts from reports', async () => {
    vi.mocked(prisma.testRun.findMany).mockResolvedValue([{ id: 'run-1' }] as never)
    vi.mocked(prisma.report.findMany).mockResolvedValue([
      {
        id: 'rep-1',
        testCases: [
          {
            testRunTestCase: {
              result: TestRunTestCaseResult.PASSED,
              testCase: {
                TestSuite: [{ id: 'suite-a', name: 'Alpha' }],
              },
            },
          },
          {
            testRunTestCase: {
              result: TestRunTestCaseResult.FAILED,
              testCase: {
                TestSuite: [{ id: 'suite-a', name: 'Alpha' }],
              },
            },
          },
          {
            testRunTestCase: {
              result: TestRunTestCaseResult.UNTESTED,
              testCase: {
                TestSuite: [{ id: 'suite-b', name: 'Beta' }],
              },
            },
          },
        ],
      },
    ] as never)

    const data = await getTestSuiteExecutionData('project-1')

    expect(data).toHaveLength(2)
    const alpha = data.find(d => d.feature === 'Alpha')
    const beta = data.find(d => d.feature === 'Beta')
    expect(alpha).toMatchObject({
      passed: 1,
      failed: 1,
      cancelled: 0,
      unknown: 0,
      total: 2,
    })
    expect(beta).toMatchObject({
      passed: 0,
      failed: 0,
      cancelled: 1,
      unknown: 0,
      total: 1,
    })
  })

  it('maps non-pass/fail/untested results to unknown', async () => {
    vi.mocked(prisma.testRun.findMany).mockResolvedValue([{ id: 'run-1' }] as never)
    vi.mocked(prisma.report.findMany).mockResolvedValue([
      {
        id: 'rep-1',
        testCases: [
          {
            testRunTestCase: {
              result: 'OTHER' as TestRunTestCaseResult,
              testCase: {
                TestSuite: [{ id: 'suite-x', name: 'Gamma' }],
              },
            },
          },
        ],
      },
    ] as never)

    const data = await getTestSuiteExecutionData('project-1')
    expect(data).toEqual([
      expect.objectContaining({
        feature: 'Gamma',
        passed: 0,
        failed: 0,
        cancelled: 0,
        unknown: 1,
        total: 1,
      }),
    ])
  })
})
