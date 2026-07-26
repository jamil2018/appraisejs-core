import prisma from '@/config/db-config'
import { updateDashboardMetrics } from '@/lib/metrics/metric-calculator'
import { TestRunStatus, TestRunTestCaseResult } from '@prisma/client'

/** Stacked bar segments are raw counts; `total` matches passed+failed+cancelled+unknown. */
export type TestSuiteExecutionData = Array<{
  feature: string
  passed: number
  failed: number
  cancelled: number
  unknown: number
  total: number
}>

export type EntityMetrics = {
  testCasesCount: number
  testSuitesCount: number
  stepDefinitionsCount: number
  runningTestRunsCount: number
}

export async function getDashboardMetrics(targetProjectId: string) {
  await updateDashboardMetrics(targetProjectId)
  return prisma.dashboardMetrics.findFirst({ where: { targetProjectId } })
}

export async function getEntityMetrics(targetProjectId: string): Promise<EntityMetrics> {
  const testCases = await prisma.testCase.count({ where: { targetProjectId } })
  const testSuites = await prisma.testSuite.count({ where: { targetProjectId } })
  const stepDefinitions = await prisma.stepDefinition.count({ where: { status: 'ready' } })
  const runningTestRuns = await prisma.testRun.count({
    where: {
      targetProjectId,
      status: {
        in: [TestRunStatus.RUNNING, TestRunStatus.QUEUED, TestRunStatus.CANCELLING],
      },
    },
  })

  return {
    testCasesCount: testCases,
    testSuitesCount: testSuites,
    stepDefinitionsCount: stepDefinitions,
    runningTestRunsCount: runningTestRuns,
  }
}

export async function getRunningTestRunsCount(targetProjectId: string): Promise<number> {
  return prisma.testRun.count({
    where: {
      targetProjectId,
      status: {
        in: [TestRunStatus.RUNNING, TestRunStatus.QUEUED, TestRunStatus.CANCELLING],
      },
    },
  })
}

export async function getTestSuiteExecutionData(targetProjectId: string): Promise<TestSuiteExecutionData> {
  const testRuns = await prisma.testRun.findMany({
    where: {
      targetProjectId,
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
    return []
  }

  const testRunIds = testRuns.map(tr => tr.id)

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

  for (const report of reports) {
    for (const reportTestCase of report.testCases) {
      const testCase = reportTestCase.testRunTestCase.testCase
      const result = reportTestCase.testRunTestCase.result

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

  const result: TestSuiteExecutionData = []

  for (const [, data] of suiteDataMap.entries()) {
    const total = data.total
    if (total === 0) continue

    result.push({
      feature: data.name,
      passed: data.passed,
      failed: data.failed,
      cancelled: data.cancelled,
      unknown: data.unknown,
      total,
    })
  }

  result.sort((a, b) => a.feature.localeCompare(b.feature))

  return result
}
