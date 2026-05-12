import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TestRunTestCaseResult, TestRunTestCaseStatus } from '@prisma/client'

const { mockTestRunTestCaseFindMany, mockTestRunTestCaseFindFirst, mockTestCaseMetricsUpsert } = vi.hoisted(() => ({
  mockTestRunTestCaseFindMany: vi.fn(),
  mockTestRunTestCaseFindFirst: vi.fn(),
  mockTestCaseMetricsUpsert: vi.fn(),
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
    testSuiteMetrics: {
      upsert: vi.fn(),
      count: vi.fn(),
    },
    testRun: {
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    dashboardMetrics: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import { recalculateTestCaseMetrics } from './metric-calculator'

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
