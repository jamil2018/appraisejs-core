'use server'

import prisma from '@/config/db-config'
import { ActionResponse } from '@/types/form/actionHandler'
import { TestRunStatus, TestRunTestCaseResult } from '@prisma/client'

export async function getDashboardMetricsAction(): Promise<ActionResponse> {
  try {
    const dashboardMetrics = await prisma.dashboardMetrics.findFirst()
    return {
      status: 200,
      data: dashboardMetrics,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export type EntityMetrics = {
  testCasesCount: number
  testSuitesCount: number
  templateStepsCount: number
  runningTestRunsCount: number
}

export async function getEntityMetricsAction(): Promise<ActionResponse> {
  try {
    const testCases = await prisma.testCase.count()
    const testSuites = await prisma.testSuite.count()
    const templateSteps = await prisma.templateStep.count()
    const runningTestRuns = await prisma.testRun.count({
      where: {
        status: {
          in: [TestRunStatus.RUNNING, TestRunStatus.QUEUED, TestRunStatus.CANCELLING],
        },
      },
    })
    return {
      status: 200,
      data: {
        testCasesCount: testCases,
        testSuitesCount: testSuites,
        templateStepsCount: templateSteps,
        runningTestRunsCount: runningTestRuns,
      },
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

/**
 * Gets the count of ongoing test runs (RUNNING, QUEUED, or CANCELLING)
 * Used for live tracking on the dashboard
 */
export async function getRunningTestRunsCountAction(): Promise<ActionResponse> {
  try {
    const count = await prisma.testRun.count({
      where: {
        status: {
          in: [TestRunStatus.RUNNING, TestRunStatus.QUEUED, TestRunStatus.CANCELLING],
        },
      },
    })
    return {
      status: 200,
      data: count,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export type TestSuiteExecutionData = Array<{
  feature: string
  passed: number
  failed: number
  cancelled: number
  unknown: number
  total: number
}>

/**
 * Gets test suite execution data from the last 10 completed test runs
 * Returns pass/fail percentages per test suite
 */
export async function getTestSuiteExecutionDataAction(): Promise<ActionResponse> {
  try {
    // Fetch the last 10 completed test runs
    const testRuns = await prisma.testRun.findMany({
      where: {
        status: TestRunStatus.COMPLETED,
        completedAt: {
          not: null,
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
      take: 10,
      select: {
        id: true,
      },
    })

    if (testRuns.length === 0) {
      return {
        status: 200,
        data: [] as TestSuiteExecutionData,
      }
    }

    const testRunIds = testRuns.map(tr => tr.id)

    // Fetch reports for these test runs with test cases and their test suites
    const reports = await prisma.report.findMany({
      where: {
        testRunId: {
          in: testRunIds,
        },
      },
      include: {
        testCases: {
          include: {
            testRunTestCase: {
              include: {
                testCase: {
                  include: {
                    TestSuite: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    // Aggregate data by test suite
    const suiteDataMap = new Map<
      string,
      {
        name: string
        passed: number
        failed: number
        cancelled: number
        unknown: number
        total: number
      }
    >()

    // Process each report's test cases
    for (const report of reports) {
      for (const reportTestCase of report.testCases) {
        const testCase = reportTestCase.testRunTestCase.testCase
        const result = reportTestCase.testRunTestCase.result

        // A test case can belong to multiple test suites
        for (const testSuite of testCase.TestSuite) {
          const suiteId = testSuite.id
          const suiteName = testSuite.name

          if (!suiteDataMap.has(suiteId)) {
            suiteDataMap.set(suiteId, {
              name: suiteName,
              passed: 0,
              failed: 0,
              cancelled: 0,
              unknown: 0,
              total: 0,
            })
          }

          const suiteData = suiteDataMap.get(suiteId)!
          suiteData.total++

          switch (result) {
            case TestRunTestCaseResult.PASSED:
              suiteData.passed++
              break
            case TestRunTestCaseResult.FAILED:
              suiteData.failed++
              break
            case TestRunTestCaseResult.UNTESTED:
              suiteData.cancelled++
              break
            default:
              suiteData.unknown++
              break
          }
        }
      }
    }

    // Convert counts to percentages and format for chart
    const result: TestSuiteExecutionData = []

    for (const [_suiteId, data] of suiteDataMap.entries()) {
      const total = data.total
      if (total === 0) continue

      // Calculate percentages
      const passed = total > 0 ? Number(((data.passed / total) * 100).toFixed(2)) : 0
      const failed = total > 0 ? Number(((data.failed / total) * 100).toFixed(2)) : 0
      const cancelled = total > 0 ? Number(((data.cancelled / total) * 100).toFixed(2)) : 0
      const unknown = total > 0 ? Number(((data.unknown / total) * 100).toFixed(2)) : 0

      result.push({
        feature: data.name,
        passed,
        failed,
        cancelled,
        unknown,
        total: 100, // Always 100 for percentage-based visualization
      })
    }

    // Sort by test suite name for consistent display
    result.sort((a, b) => a.feature.localeCompare(b.feature))

    return {
      status: 200,
      data: result,
    }
  } catch (error) {
    console.error('[DashboardActions] Error fetching test suite execution data:', error)
    return {
      status: 500,
      error: `Server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}