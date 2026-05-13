import prisma from '@/config/db-config'
import { RECENT_PERIOD_DAYS } from '@/services/shared/constants'
import { TestRunTestCaseResult, TestRunTestCaseStatus } from '@prisma/client'

/**
 * Threshold for consecutive failures to be considered "repeatedly failing"
 */
const REPEATEDLY_FAILING_THRESHOLD = 3

/**
 * Threshold for failure rate to be considered "flaky" (5%)
 */
const FLAKY_THRESHOLD = 0.05

type CompletedTestRunTestCase = {
  result: TestRunTestCaseResult | null
  testRun: {
    completedAt: Date | null
  }
}

type TestCaseMetricSummary = {
  totalRecentRuns: number
  failedRecentRuns: number
  failureRate: number
  isFlaky: boolean
  consecutiveFailures: number
  isRepeatedlyFailing: boolean
}

type RecalculatedMetricDates = {
  lastExecutedAt: Date | null
  lastFailedAt: Date | null
  lastPassedAt: Date | null
}

type RecalculatedMetricUpdateData = {
  lastExecutedAt?: Date
  lastFailedAt?: Date | null
  lastPassedAt?: Date | null
  isRepeatedlyFailing: boolean
  isFlaky: boolean
  consecutiveFailures: number
  failureRate: number
  totalRecentRuns: number
  failedRecentRuns: number
}

/**
 * Calculate the date threshold for recent runs
 */
function getRecentPeriodDate(): Date {
  const now = new Date()
  now.setDate(now.getDate() - RECENT_PERIOD_DAYS)
  return now
}

function summarizeRecentTestCaseRuns(recentTestRunTestCases: CompletedTestRunTestCase[]): TestCaseMetricSummary {
  const totalRecentRuns = recentTestRunTestCases.length
  const failedRecentRuns = recentTestRunTestCases.filter(
    trtc => trtc.result === TestRunTestCaseResult.FAILED,
  ).length
  const failureRate = totalRecentRuns > 0 ? failedRecentRuns / totalRecentRuns : 0
  const consecutiveFailures = countConsecutiveFailures(recentTestRunTestCases)

  return {
    totalRecentRuns,
    failedRecentRuns,
    failureRate,
    isFlaky: failureRate > FLAKY_THRESHOLD && failureRate < 1.0,
    consecutiveFailures,
    isRepeatedlyFailing: consecutiveFailures >= REPEATEDLY_FAILING_THRESHOLD,
  }
}

function countConsecutiveFailures(testRunTestCases: CompletedTestRunTestCase[]): number {
  let consecutiveFailures = 0

  for (const trtc of testRunTestCases) {
    if (trtc.result === TestRunTestCaseResult.FAILED) {
      consecutiveFailures++
    } else if (trtc.result === TestRunTestCaseResult.PASSED) {
      break
    }
  }

  return consecutiveFailures
}

async function findRecentCompletedTestRunTestCases(
  testCaseId: string,
  recentPeriodDate: Date,
): Promise<CompletedTestRunTestCase[]> {
  return prisma.testRunTestCase.findMany({
    where: {
      testCaseId,
      status: TestRunTestCaseStatus.COMPLETED,
      testRun: {
        completedAt: {
          gte: recentPeriodDate,
        },
      },
    },
    include: {
      testRun: {
        select: {
          completedAt: true,
        },
      },
    },
    orderBy: {
      testRun: {
        completedAt: 'desc',
      },
    },
  })
}

/**
 * Updates metrics for a single test case
 * @param testCaseId - The test case ID
 * @param result - The test case result (PASSED, FAILED, UNTESTED)
 * @param executedAt - When the test case was executed
 */
export async function updateTestCaseMetrics(
  testCaseId: string,
  result: TestRunTestCaseResult,
  executedAt: Date,
): Promise<void> {
  try {
    // Get existing metrics or create new one
    await prisma.testCaseMetrics.findUnique({
      where: { testCaseId },
    })

    // Query recent runs for this test case (last 7 days)
    const recentPeriodDate = getRecentPeriodDate()

    const recentTestRunTestCases = await findRecentCompletedTestRunTestCases(testCaseId, recentPeriodDate)

    const {
      totalRecentRuns,
      failedRecentRuns,
      failureRate,
      isFlaky,
      consecutiveFailures,
      isRepeatedlyFailing,
    } = summarizeRecentTestCaseRuns(recentTestRunTestCases)

    // Determine which date fields to update
    const updateData: {
      lastExecutedAt: Date
      lastFailedAt?: Date
      lastPassedAt?: Date
      isRepeatedlyFailing: boolean
      isFlaky: boolean
      consecutiveFailures: number
      failureRate: number
      totalRecentRuns: number
      failedRecentRuns: number
    } = {
      lastExecutedAt: executedAt,
      isRepeatedlyFailing,
      isFlaky,
      consecutiveFailures,
      failureRate,
      totalRecentRuns,
      failedRecentRuns,
    }

    if (result === TestRunTestCaseResult.FAILED) {
      updateData.lastFailedAt = executedAt
    } else if (result === TestRunTestCaseResult.PASSED) {
      updateData.lastPassedAt = executedAt
    }

    // Upsert the metrics
    await prisma.testCaseMetrics.upsert({
      where: { testCaseId },
      create: {
        testCaseId,
        ...updateData,
      },
      update: updateData,
    })
  } catch (error) {
    console.error(`[MetricCalculator] Error updating test case metrics for ${testCaseId}:`, error)
    // Don't throw - metrics are non-critical
  }
}

/**
 * Updates lastExecutedAt for a test suite
 * @param testSuiteId - The test suite ID
 * @param executedAt - When the test suite was executed
 */
export async function updateTestSuiteMetrics(
  testSuiteId: string,
  executedAt: Date,
): Promise<void> {
  try {
    await prisma.testSuiteMetrics.upsert({
      where: { testSuiteId },
      create: {
        testSuiteId,
        lastExecutedAt: executedAt,
      },
      update: {
        lastExecutedAt: executedAt,
      },
    })
  } catch (error) {
    console.error(`[MetricCalculator] Error updating test suite metrics for ${testSuiteId}:`, error)
    // Don't throw - metrics are non-critical
  }
}

/**
 * Finds all test suites that had test cases in a test run and updates their metrics
 * @param testRunId - The test run ID
 * @param executedAt - When the test run was executed
 */
async function updateTestSuitesForTestRun(
  testRunId: string,
  executedAt: Date,
): Promise<void> {
  try {
    // Get all test cases in the test run
    const testRunTestCases = await prisma.testRunTestCase.findMany({
      where: { testRunId },
      include: {
        testCase: {
          include: {
            TestSuite: true,
          },
        },
      },
    })

    // Extract unique test suite IDs
    const testSuiteIds = new Set<string>()
    testRunTestCases.forEach(trtc => {
      if (trtc.testSuiteId) {
        testSuiteIds.add(trtc.testSuiteId)
        return
      }

      if (trtc.testCase && trtc.testCase.TestSuite) {
        trtc.testCase.TestSuite.forEach(suite => {
          testSuiteIds.add(suite.id)
        })
      }
    })

    // Log for debugging
    if (testSuiteIds.size === 0) {
      console.warn(
        `[MetricCalculator] No test suites found for test run ${testRunId}. Test cases: ${testRunTestCases.length}`,
      )
    } else {
      console.log(
        `[MetricCalculator] Updating metrics for ${testSuiteIds.size} test suite(s) for test run ${testRunId}`,
      )
    }

    // Update lastExecutedAt for each suite
    for (const suiteId of testSuiteIds) {
      await updateTestSuiteMetrics(suiteId, executedAt)
    }
  } catch (error) {
    console.error(`[MetricCalculator] Error updating test suite metrics for test run ${testRunId}:`, error)
    // Don't throw - metrics are non-critical
  }
}

/**
 * Updates dashboard metrics with aggregated counts
 */
export async function updateDashboardMetrics(): Promise<void> {
  try {
    const recentPeriodDate = getRecentPeriodDate()

    // Count failed recent runs
    const failedRecentRunsCount = await prisma.testRun.count({
      where: {
        result: 'FAILED',
        completedAt: {
          gte: recentPeriodDate,
        },
      },
    })

    // Count repeatedly failing tests
    const repeatedlyFailingTestsCount = await prisma.testCaseMetrics.count({
      where: {
        isRepeatedlyFailing: true,
      },
    })

    // Count flaky tests
    const flakyTestsCount = await prisma.testCaseMetrics.count({
      where: {
        isFlaky: true,
      },
    })

    // Count suites not executed recently
    const suitesNotExecutedRecentlyCount = await prisma.testSuiteMetrics.count({
      where: {
        OR: [
          {
            lastExecutedAt: {
              lt: recentPeriodDate,
            },
          },
          {
            lastExecutedAt: null,
          },
        ],
      },
    })

    // Update or create dashboard metrics (singleton pattern)
    const existingMetrics = await prisma.dashboardMetrics.findFirst()

    if (existingMetrics) {
      await prisma.dashboardMetrics.update({
        where: { id: existingMetrics.id },
        data: {
          failedRecentRunsCount,
          repeatedlyFailingTestsCount,
          flakyTestsCount,
          suitesNotExecutedRecentlyCount,
          lastUpdatedAt: new Date(),
        },
      })
    } else {
      await prisma.dashboardMetrics.create({
        data: {
          failedRecentRunsCount,
          repeatedlyFailingTestsCount,
          flakyTestsCount,
          suitesNotExecutedRecentlyCount,
          lastUpdatedAt: new Date(),
        },
      })
    }
  } catch (error) {
    console.error('[MetricCalculator] Error updating dashboard metrics:', error)
    // Don't throw - metrics are non-critical
  }
}

/**
 * Recalculates metrics for a single test case from scratch based on current database state
 * This is used when test runs are deleted and we need to recalculate metrics without
 * the deleted test run data.
 * @param testCaseId - The test case ID
 */
export async function recalculateTestCaseMetrics(testCaseId: string): Promise<void> {
  try {
    const recentPeriodDate = getRecentPeriodDate()

    const recentTestRunTestCases = await findRecentCompletedTestRunTestCases(testCaseId, recentPeriodDate)

    const metricSummary = summarizeRecentTestCaseRuns(recentTestRunTestCases)
    const recalculatedDates = await resolveRecalculatedMetricDates(
      testCaseId,
      recentPeriodDate,
      recentTestRunTestCases,
    )
    const updateData = buildRecalculatedMetricUpdateData(metricSummary, recalculatedDates)

    // Upsert the metrics
    await prisma.testCaseMetrics.upsert({
      where: { testCaseId },
      create: {
        testCaseId,
        lastExecutedAt: recalculatedDates.lastExecutedAt || undefined,
        lastFailedAt: recalculatedDates.lastFailedAt || undefined,
        lastPassedAt: recalculatedDates.lastPassedAt || undefined,
        ...updateData,
      },
      update: updateData,
    })
  } catch (error) {
    console.error(`[MetricCalculator] Error recalculating test case metrics for ${testCaseId}:`, error)
    // Don't throw - metrics are non-critical
  }
}

async function resolveRecalculatedMetricDates(
  testCaseId: string,
  recentPeriodDate: Date,
  recentTestRunTestCases: CompletedTestRunTestCase[],
): Promise<RecalculatedMetricDates> {
  const dates: RecalculatedMetricDates = {
    lastExecutedAt: getCompletedAt(recentTestRunTestCases[0]),
    lastFailedAt: getMostRecentResultDate(recentTestRunTestCases, TestRunTestCaseResult.FAILED),
    lastPassedAt: getMostRecentResultDate(recentTestRunTestCases, TestRunTestCaseResult.PASSED),
  }

  if (dates.lastExecutedAt && dates.lastFailedAt && dates.lastPassedAt) {
    return dates
  }

  const olderTestRunTestCases = await findMostRecentOlderTestRunTestCases(testCaseId, recentPeriodDate)
  const mostRecentOlderCompletedAt = getCompletedAt(olderTestRunTestCases[0])

  if (!dates.lastExecutedAt) {
    dates.lastExecutedAt = mostRecentOlderCompletedAt
  }

  if (!dates.lastFailedAt) {
    dates.lastFailedAt =
      getMostRecentResultDate(olderTestRunTestCases, TestRunTestCaseResult.FAILED) ??
      (await findOlderResultDate(testCaseId, recentPeriodDate, TestRunTestCaseResult.FAILED))
  }

  if (!dates.lastPassedAt) {
    dates.lastPassedAt =
      getMostRecentResultDate(olderTestRunTestCases, TestRunTestCaseResult.PASSED) ??
      (await findOlderResultDate(testCaseId, recentPeriodDate, TestRunTestCaseResult.PASSED))
  }

  return dates
}

function getCompletedAt(testRunTestCase?: CompletedTestRunTestCase): Date | null {
  return testRunTestCase ? testRunTestCase.testRun.completedAt || new Date() : null
}

function getMostRecentResultDate(
  testRunTestCases: CompletedTestRunTestCase[],
  result: TestRunTestCaseResult,
): Date | null {
  return getCompletedAt(testRunTestCases.find(testRunTestCase => testRunTestCase.result === result))
}

async function findMostRecentOlderTestRunTestCases(
  testCaseId: string,
  recentPeriodDate: Date,
): Promise<CompletedTestRunTestCase[]> {
  return prisma.testRunTestCase.findMany({
    where: {
      testCaseId,
      status: TestRunTestCaseStatus.COMPLETED,
      testRun: {
        completedAt: {
          lt: recentPeriodDate,
        },
      },
    },
    include: {
      testRun: {
        select: {
          completedAt: true,
        },
      },
    },
    orderBy: {
      testRun: {
        completedAt: 'desc',
      },
    },
    take: 1,
  })
}

async function findOlderResultDate(
  testCaseId: string,
  recentPeriodDate: Date,
  result: TestRunTestCaseResult,
): Promise<Date | null> {
  const testRunTestCase = await prisma.testRunTestCase.findFirst({
    where: {
      testCaseId,
      status: TestRunTestCaseStatus.COMPLETED,
      result,
      testRun: {
        completedAt: {
          lt: recentPeriodDate,
        },
      },
    },
    include: {
      testRun: {
        select: {
          completedAt: true,
        },
      },
    },
    orderBy: {
      testRun: {
        completedAt: 'desc',
      },
    },
  })

  return getCompletedAt(testRunTestCase)
}

function buildRecalculatedMetricUpdateData(
  metricSummary: TestCaseMetricSummary,
  dates: RecalculatedMetricDates,
): RecalculatedMetricUpdateData {
  const updateData: RecalculatedMetricUpdateData = {
    isRepeatedlyFailing: metricSummary.isRepeatedlyFailing,
    isFlaky: metricSummary.isFlaky,
    consecutiveFailures: metricSummary.consecutiveFailures,
    failureRate: metricSummary.failureRate,
    totalRecentRuns: metricSummary.totalRecentRuns,
    failedRecentRuns: metricSummary.failedRecentRuns,
  }

  if (dates.lastExecutedAt) {
    updateData.lastExecutedAt = dates.lastExecutedAt
  }
  if (dates.lastFailedAt !== null) {
    updateData.lastFailedAt = dates.lastFailedAt
  }
  if (dates.lastPassedAt !== null) {
    updateData.lastPassedAt = dates.lastPassedAt
  }

  return updateData
}

/**
 * Recalculates metrics for multiple test cases
 * @param testCaseIds - Array of test case IDs to recalculate
 */
export async function recalculateMetricsForTestCases(testCaseIds: string[]): Promise<void> {
  try {
    // Remove duplicates
    const uniqueTestCaseIds = [...new Set(testCaseIds)]

    for (const testCaseId of uniqueTestCaseIds) {
      await recalculateTestCaseMetrics(testCaseId)
    }
  } catch (error) {
    console.error(`[MetricCalculator] Error recalculating metrics for test cases:`, error)
    // Don't throw - metrics are non-critical
  }
}

/**
 * Updates all metrics for a test run when it completes
 * @param testRunId - The test run ID
 */
export async function updateMetricsForTestRun(testRunId: string): Promise<void> {
  try {
    // Get the test run with test cases
    const testRun = await prisma.testRun.findUnique({
      where: { id: testRunId },
      include: {
        testCases: {
          include: {
            testCase: true,
          },
        },
      },
    })

    if (!testRun) {
      console.warn(`[MetricCalculator] Test run ${testRunId} not found`)
      return
    }

    const executedAt = testRun.completedAt || testRun.startedAt

    // Update metrics for all test cases in the run
    for (const testRunTestCase of testRun.testCases) {
      if (testRunTestCase.status === TestRunTestCaseStatus.COMPLETED) {
        await updateTestCaseMetrics(
          testRunTestCase.testCaseId,
          testRunTestCase.result,
          executedAt,
        )
      }
    }

    // Update test suite metrics
    await updateTestSuitesForTestRun(testRunId, executedAt)

    // Update dashboard metrics
    await updateDashboardMetrics()
  } catch (error) {
    console.error(`[MetricCalculator] Error updating metrics for test run ${testRunId}:`, error)
    // Don't throw - metrics are non-critical
  }
}
