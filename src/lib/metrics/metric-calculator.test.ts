import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TestRunTestCaseResult, TestRunTestCaseStatus } from '@prisma/client'

const {
  mockTestRunTestCaseFindMany,
  mockTestRunTestCaseFindFirst,
  mockTestCaseMetricsUpsert,
  mockTestCaseCount,
  mockTestCaseFindUnique,
  mockTestSuiteCount,
  mockTestSuiteFindUnique,
  mockTestRunCount,
  mockDashboardMetricsFindFirst,
  mockDashboardMetricsUpdate,
  mockDashboardMetricsCreate,
} = vi.hoisted(() => ({
  mockTestRunTestCaseFindMany: vi.fn(),
  mockTestRunTestCaseFindFirst: vi.fn(),
  mockTestCaseMetricsUpsert: vi.fn(),
  mockTestCaseCount: vi.fn(),
  mockTestCaseFindUnique: vi.fn(),
  mockTestSuiteCount: vi.fn(),
  mockTestSuiteFindUnique: vi.fn(),
  mockTestRunCount: vi.fn(),
  mockDashboardMetricsFindFirst: vi.fn(),
  mockDashboardMetricsUpdate: vi.fn(),
  mockDashboardMetricsCreate: vi.fn(),
}))

vi.mock('@/config/db-config', () => ({
  default: {
    testRunTestCase: {
      findMany: mockTestRunTestCaseFindMany,
      findFirst: mockTestRunTestCaseFindFirst,
    },
    testCaseMetrics: {
      findUnique: vi.fn(),
      upsert: mockTestCaseMetricsUpsert,
      count: vi.fn(),
    },
    testCase: {
      count: mockTestCaseCount,
      findUnique: mockTestCaseFindUnique,
    },
    testSuiteMetrics: {
      upsert: vi.fn(),
      count: vi.fn(),
    },
    testSuite: {
      count: mockTestSuiteCount,
      findUnique: mockTestSuiteFindUnique,
    },
    testRun: {
      count: mockTestRunCount,
      findUnique: vi.fn(),
    },
    dashboardMetrics: {
      findFirst: mockDashboardMetricsFindFirst,
      update: mockDashboardMetricsUpdate,
      create: mockDashboardMetricsCreate,
    },
  },
}))

import { recalculateTestCaseMetrics, updateDashboardMetrics } from './metric-calculator'

function completedCase(result: TestRunTestCaseResult, completedAt: Date) {
  return {
    result,
    testRun: {
      completedAt,
    },
  }
}

describe('recalculateTestCaseMetrics', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-12T00:00:00.000Z'))
    vi.clearAllMocks()
    mockTestCaseMetricsUpsert.mockResolvedValue({})
    mockTestCaseFindUnique.mockResolvedValue({ targetProjectId: 'project-1' })
    mockTestRunTestCaseFindFirst.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('summarizes recent runs and records recent execution dates', async () => {
    const failedAt = new Date('2026-05-11T00:00:00.000Z')
    const previousFailureAt = new Date('2026-05-10T00:00:00.000Z')
    const passedAt = new Date('2026-05-09T00:00:00.000Z')
    mockTestRunTestCaseFindMany.mockResolvedValue([
      completedCase(TestRunTestCaseResult.FAILED, failedAt),
      completedCase(TestRunTestCaseResult.FAILED, previousFailureAt),
      completedCase(TestRunTestCaseResult.PASSED, passedAt),
    ])

    await recalculateTestCaseMetrics('tc-1')

    expect(mockTestRunTestCaseFindMany).toHaveBeenCalledTimes(1)
    expect(mockTestRunTestCaseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          testCaseId: 'tc-1',
          status: TestRunTestCaseStatus.COMPLETED,
        }),
      }),
    )
    expect(mockTestCaseMetricsUpsert).toHaveBeenCalledWith({
      where: { testCaseId: 'tc-1' },
      create: expect.objectContaining({
        testCaseId: 'tc-1',
        targetProjectId: 'project-1',
        lastExecutedAt: failedAt,
        lastFailedAt: failedAt,
        lastPassedAt: passedAt,
        consecutiveFailures: 2,
        failedRecentRuns: 2,
        totalRecentRuns: 3,
        failureRate: 2 / 3,
        isFlaky: true,
        isRepeatedlyFailing: false,
      }),
      update: expect.objectContaining({
        lastExecutedAt: failedAt,
        lastFailedAt: failedAt,
        lastPassedAt: passedAt,
        consecutiveFailures: 2,
        failedRecentRuns: 2,
        totalRecentRuns: 3,
        failureRate: 2 / 3,
        isFlaky: true,
        isRepeatedlyFailing: false,
      }),
    })
  })

  it('falls back to older executions when recent runs do not provide dates', async () => {
    const olderPassAt = new Date('2026-04-20T00:00:00.000Z')
    const olderFailureAt = new Date('2026-04-19T00:00:00.000Z')
    mockTestRunTestCaseFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([completedCase(TestRunTestCaseResult.PASSED, olderPassAt)])
    mockTestRunTestCaseFindFirst.mockResolvedValue(completedCase(TestRunTestCaseResult.FAILED, olderFailureAt))

    await recalculateTestCaseMetrics('tc-2')

    expect(mockTestRunTestCaseFindMany).toHaveBeenCalledTimes(2)
    expect(mockTestRunTestCaseFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          testCaseId: 'tc-2',
          result: TestRunTestCaseResult.FAILED,
        }),
      }),
    )
    expect(mockTestCaseMetricsUpsert).toHaveBeenCalledWith({
      where: { testCaseId: 'tc-2' },
      create: expect.objectContaining({
        testCaseId: 'tc-2',
        targetProjectId: 'project-1',
        lastExecutedAt: olderPassAt,
        lastFailedAt: olderFailureAt,
        lastPassedAt: olderPassAt,
        consecutiveFailures: 0,
        failedRecentRuns: 0,
        totalRecentRuns: 0,
        failureRate: 0,
        isFlaky: false,
        isRepeatedlyFailing: false,
      }),
      update: expect.objectContaining({
        lastExecutedAt: olderPassAt,
        lastFailedAt: olderFailureAt,
        lastPassedAt: olderPassAt,
        consecutiveFailures: 0,
        failedRecentRuns: 0,
        totalRecentRuns: 0,
        failureRate: 0,
        isFlaky: false,
        isRepeatedlyFailing: false,
      }),
    })
  })
})

describe('updateDashboardMetrics', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-12T00:00:00.000Z'))
    vi.clearAllMocks()
    mockTestRunCount.mockResolvedValue(4)
    mockTestCaseCount.mockResolvedValueOnce(2).mockResolvedValueOnce(1)
    mockTestSuiteCount.mockResolvedValue(3)
    mockTestSuiteFindUnique.mockResolvedValue({ targetProjectId: 'project-1' })
    mockDashboardMetricsFindFirst.mockResolvedValue({ id: 'dashboard-metrics-1' })
    mockDashboardMetricsUpdate.mockResolvedValue({})
    mockDashboardMetricsCreate.mockResolvedValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts attention metrics from live entities instead of orphaned metric rows', async () => {
    await updateDashboardMetrics('project-1')

    expect(mockTestCaseCount).toHaveBeenNthCalledWith(1, {
      where: {
        targetProjectId: 'project-1',
        metrics: {
          is: {
            isRepeatedlyFailing: true,
          },
        },
      },
    })
    expect(mockTestCaseCount).toHaveBeenNthCalledWith(2, {
      where: {
        targetProjectId: 'project-1',
        metrics: {
          is: {
            isFlaky: true,
          },
        },
      },
    })
    expect(mockTestSuiteCount).toHaveBeenCalledWith({
      where: {
        targetProjectId: 'project-1',
        OR: [
          {
            metrics: {
              is: null,
            },
          },
          {
            metrics: {
              is: {
                lastExecutedAt: null,
              },
            },
          },
          {
            metrics: {
              is: {
                lastExecutedAt: {
                  lt: new Date('2026-05-05T00:00:00.000Z'),
                },
              },
            },
          },
        ],
      },
    })
    expect(mockDashboardMetricsUpdate).toHaveBeenCalledWith({
      where: { id: 'dashboard-metrics-1' },
      data: expect.objectContaining({
        failedRecentRunsCount: 4,
        repeatedlyFailingTestsCount: 2,
        flakyTestsCount: 1,
        suitesNotExecutedRecentlyCount: 3,
      }),
    })
  })
})
