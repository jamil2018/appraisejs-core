import prisma from '@/config/db-config'
import { TestRunTestCaseResult, TestRunTestCaseStatus } from '@prisma/client'

/**
 * Time period for "recent" runs in days
 */
const RECENT_PERIOD_DAYS = 7

/**
 * Threshold for consecutive failures to be considered "repeatedly failing"
 */
const REPEATEDLY_FAILING_THRESHOLD = 3

/**
 * Threshold for failure rate to be considered "flaky" (5%)
 */
const FLAKY_THRESHOLD = 0.05

/**
 * Calculate the date threshold for recent runs
 */
function getRecentPeriodDate(): Date {
  const now = new Date()
  now.setDate(now.getDate() - RECENT_PERIOD_DAYS)
  return now
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
    const existingMetrics = await prisma.testCaseMetrics.findUnique({
      where: { testCaseId },
    })

    // Query recent runs for this test case (last 7 days)
    const recentPeriodDate = getRecentPeriodDate()

    const recentTestRunTestCases = await prisma.testRunTestCase.findMany({
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

    const totalRecentRuns = recentTestRunTestCases.length
    const failedRecentRuns = recentTestRunTestCases.filter(
      trtc => trtc.result === TestRunTestCaseResult.FAILED,
    ).length

    // Calculate failure rate
    const failureRate = totalRecentRuns > 0 ? failedRecentRuns / totalRecentRuns : 0

    // Determine if flaky (failure rate > 5% but < 100%)
    const isFlaky = failureRate > FLAKY_THRESHOLD && failureRate < 1.0

    // Calculate consecutive failures by examining the actual sequence of results
    // Start from the most recent and count backwards
    // This ensures accuracy even if test runs are processed out of order
    let consecutiveFailures = 0
    for (const trtc of recentTestRunTestCases) {
      if (trtc.result === TestRunTestCaseResult.FAILED) {
        consecutiveFailures++
      } else if (trtc.result === TestRunTestCaseResult.PASSED) {
        // Once we hit a pass, stop counting consecutive failures
        break
      }
      // UNTESTED results don't break the consecutive failure count
    }

    // Determine if repeatedly failing (3+ consecutive failures)
    const isRepeatedlyFailing = consecutiveFailures >= REPEATEDLY_FAILING_THRESHOLD

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
export async function updateTestSuitesForTestRun(
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

    // Query all recent test run test cases for this test case (last 7 days)
    const recentTestRunTestCases = await prisma.testRunTestCase.findMany({
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

    const totalRecentRuns = recentTestRunTestCases.length
    const failedRecentRuns = recentTestRunTestCases.filter(
      trtc => trtc.result === TestRunTestCaseResult.FAILED,
    ).length

    // Calculate failure rate
    const failureRate = totalRecentRuns > 0 ? failedRecentRuns / totalRecentRuns : 0

    // Determine if flaky (failure rate > 5% but < 100%)
    const isFlaky = failureRate > FLAKY_THRESHOLD && failureRate < 1.0

    // Calculate consecutive failures by examining the actual sequence of results
    // Start from the most recent and count backwards
    let consecutiveFailures = 0
    for (const trtc of recentTestRunTestCases) {
      if (trtc.result === TestRunTestCaseResult.FAILED) {
        consecutiveFailures++
      } else if (trtc.result === TestRunTestCaseResult.PASSED) {
        // Once we hit a pass, stop counting consecutive failures
        break
      }
      // UNTESTED results don't break the consecutive failure count
    }

    // Determine if repeatedly failing (3+ consecutive failures)
    const isRepeatedlyFailing = consecutiveFailures >= REPEATEDLY_FAILING_THRESHOLD

    // Determine last executed, last failed, and last passed dates
    let lastExecutedAt: Date | null = null
    let lastFailedAt: Date | null = null
    let lastPassedAt: Date | null = null

    if (recentTestRunTestCases.length > 0) {
      // Most recent execution
      lastExecutedAt = recentTestRunTestCases[0].testRun.completedAt || new Date()

      // Find most recent failure
      const mostRecentFailure = recentTestRunTestCases.find(
        trtc => trtc.result === TestRunTestCaseResult.FAILED,
      )
      if (mostRecentFailure) {
        lastFailedAt = mostRecentFailure.testRun.completedAt || new Date()
      }

      // Find most recent pass
      const mostRecentPass = recentTestRunTestCases.find(
        trtc => trtc.result === TestRunTestCaseResult.PASSED,
      )
      if (mostRecentPass) {
        lastPassedAt = mostRecentPass.testRun.completedAt || new Date()
      }
    }

    // If no recent runs, check if there are any older runs to get last executed/failed/passed dates
    if (!lastExecutedAt || !lastFailedAt || !lastPassedAt) {
      const olderTestRunTestCases = await prisma.testRunTestCase.findMany({
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
        take: 1, // Only need the most recent one
      })

      if (olderTestRunTestCases.length > 0) {
        const mostRecentOlder = olderTestRunTestCases[0]
        const olderCompletedAt = mostRecentOlder.testRun.completedAt || new Date()

        if (!lastExecutedAt) {
          lastExecutedAt = olderCompletedAt
        }

        // Find most recent failure from older runs if not found in recent runs
        if (!lastFailedAt) {
          const olderFailure = olderTestRunTestCases.find(
            trtc => trtc.result === TestRunTestCaseResult.FAILED,
          )
          if (!olderFailure) {
            // Check all older runs for failures
            const allOlderFailures = await prisma.testRunTestCase.findFirst({
              where: {
                testCaseId,
                status: TestRunTestCaseStatus.COMPLETED,
                result: TestRunTestCaseResult.FAILED,
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
            if (allOlderFailures) {
              lastFailedAt = allOlderFailures.testRun.completedAt || new Date()
            }
          } else {
            lastFailedAt = olderFailure.testRun.completedAt || new Date()
          }
        }

        // Find most recent pass from older runs if not found in recent runs
        if (!lastPassedAt) {
          const olderPass = olderTestRunTestCases.find(
            trtc => trtc.result === TestRunTestCaseResult.PASSED,
          )
          if (!olderPass) {
            // Check all older runs for passes
            const allOlderPasses = await prisma.testRunTestCase.findFirst({
              where: {
                testCaseId,
                status: TestRunTestCaseStatus.COMPLETED,
                result: TestRunTestCaseResult.PASSED,
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
            if (allOlderPasses) {
              lastPassedAt = allOlderPasses.testRun.completedAt || new Date()
            }
          } else {
            lastPassedAt = olderPass.testRun.completedAt || new Date()
          }
        }
      }
    }

    // Prepare update data
    const updateData: {
      lastExecutedAt?: Date
      lastFailedAt?: Date | null
      lastPassedAt?: Date | null
      isRepeatedlyFailing: boolean
      isFlaky: boolean
      consecutiveFailures: number
      failureRate: number
      totalRecentRuns: number
      failedRecentRuns: number
    } = {
      isRepeatedlyFailing,
      isFlaky,
      consecutiveFailures,
      failureRate,
      totalRecentRuns,
      failedRecentRuns,
    }

    if (lastExecutedAt) {
      updateData.lastExecutedAt = lastExecutedAt
    }
    if (lastFailedAt !== null) {
      updateData.lastFailedAt = lastFailedAt
    }
    if (lastPassedAt !== null) {
      updateData.lastPassedAt = lastPassedAt
    }

    // Upsert the metrics
    await prisma.testCaseMetrics.upsert({
      where: { testCaseId },
      create: {
        testCaseId,
        lastExecutedAt: lastExecutedAt || undefined,
        lastFailedAt: lastFailedAt || undefined,
        lastPassedAt: lastPassedAt || undefined,
        ...updateData,
      },
      update: updateData,
    })
  } catch (error) {
    console.error(`[MetricCalculator] Error recalculating test case metrics for ${testCaseId}:`, error)
    // Don't throw - metrics are non-critical
  }
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
