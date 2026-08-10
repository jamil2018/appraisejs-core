import prisma from '@/config/db-config'
import {
  parseCucumberReport,
  parseCucumberReportText,
  getStepStatusEnum,
  getStepKeywordEnum,
  type ParsedReport,
} from '@/lib/test-run/report-parser'
import type { Prisma, PrismaClient } from '@prisma/client'
import { existsSync } from 'fs'
import { updateTestSuiteMetrics } from '@/lib/metrics/metric-calculator'
import { resolveStoredPath, toProjectRelativePath } from '@/lib/automation/automation-path-roots'
import { findMatchingTestRunTestCase } from '@/lib/test-run/matching'
import { RECENT_PERIOD_DAYS } from '@/services/shared/constants'
import { ServiceError } from '@/services/shared/errors'
import type { ReportDetailWithRelations, ReportWithRelations } from '@/types/report'
import {
  createTestRunArtifactAccess,
  createTestRunArtifactContext,
  readTestRunArtifactText,
} from '@/services/test-run/test-run-artifact-context'

export type StoreReportOutcome =
  | { success: true; reportId: string }
  | { success: false; reason: 'file_not_found' | 'test_run_not_found' | 'storage_failed'; message: string }

type ReportStorageTestRun = Prisma.TestRunGetPayload<{
  include: {
    targetProject: true
    runtimeCapsule: true
    testCases: {
      include: {
        testCase: {
          include: {
            tags: true
          }
        }
        testSuite: {
          include: {
            tags: true
          }
        }
      }
    }
  }
}>

type ParsedReportFeature = ParsedReport['features'][number]
type ParsedReportScenario = ParsedReportFeature['scenarios'][number]

type ExecutedTestCaseSets = {
  suiteIds: Set<string>
  legacyTestCaseIds: Set<string>
}

export async function listReports(targetProjectId: string): Promise<ReportWithRelations[]> {
  const reports = await prisma.report.findMany({
    where: { testRun: { targetProjectId } },
    include: {
      testRun: {
        include: {
          environment: true,
          tags: true,
        },
      },
      testCases: {
        include: {
          testRunTestCase: {
            include: {
              testCase: {
                include: {
                  tags: true,
                },
              },
              testSuite: true,
            },
          },
          reportScenario: {
            include: {
              reportFeature: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  return reports as ReportWithRelations[]
}

export async function getReportByIdOrThrow(
  reportId: string,
  targetProjectId: string,
): Promise<ReportDetailWithRelations> {
  const report = await prisma.report.findFirst({
    where: { id: reportId, testRun: { targetProjectId } },
    include: {
      testRun: {
        include: {
          environment: true,
          tags: true,
        },
      },
      features: {
        include: {
          tags: true,
          scenarios: {
            include: {
              tags: true,
              steps: {
                orderBy: {
                  order: 'asc',
                },
              },
              hooks: true,
            },
          },
        },
      },
      testCases: {
        include: {
          testRunTestCase: {
            include: {
              testCase: {
                include: {
                  tags: true,
                },
              },
              testSuite: true,
            },
          },
          reportScenario: {
            include: {
              reportFeature: true,
              tags: true,
              steps: {
                orderBy: {
                  order: 'asc',
                },
              },
              hooks: true,
            },
          },
        },
      },
    },
  })

  if (!report) {
    throw new ServiceError('Report not found', 'NOT_FOUND', 404)
  }

  return report as ReportDetailWithRelations
}

async function getReportStorageTestRun(testRunId: string, client: PrismaClient = prisma) {
  return client.testRun.findUnique({
    where: { runId: testRunId },
    include: {
      targetProject: true,
      runtimeCapsule: true,
      testCases: {
        include: {
          testCase: {
            include: {
              tags: true,
            },
          },
          testSuite: {
            include: {
              tags: true,
            },
          },
        },
      },
    },
  })
}

async function createReportShell(testRun: ReportStorageTestRun, reportPath: string, client: PrismaClient = prisma) {
  return client.report.create({
    data: {
      name: `Test Run Report - ${testRun.name}`,
      description: `Report for test run: ${testRun.name}`,
      reportPath: toProjectRelativePath(reportPath, testRun.targetProject?.canonicalPath),
      testRunId: testRun.id,
    },
  })
}

async function createReportFeature(reportId: string, feature: ParsedReportFeature, client: PrismaClient = prisma) {
  const reportFeature = await client.reportFeature.create({
    data: {
      reportId,
      name: feature.name,
      description: feature.description,
      uri: feature.uri,
      line: feature.line,
      keyword: feature.keyword,
    },
  })

  for (const tag of feature.tags) {
    await client.reportFeatureTag.create({
      data: {
        reportFeatureId: reportFeature.id,
        tagName: tag.name,
        line: tag.line,
      },
    })
  }

  return reportFeature
}

async function createReportScenario(
  reportFeatureId: string,
  scenario: ParsedReportScenario,
  client: PrismaClient = prisma,
) {
  const reportScenario = await client.reportScenario.create({
    data: {
      reportFeatureId,
      name: scenario.name,
      description: scenario.description,
      line: scenario.line,
      keyword: scenario.keyword,
      type: scenario.type,
      cucumberId: scenario.cucumberId,
    },
  })

  for (const tag of scenario.tags) {
    await client.reportScenarioTag.create({
      data: {
        reportScenarioId: reportScenario.id,
        tagName: tag.name,
        line: tag.line,
      },
    })
  }

  return reportScenario
}

async function createReportScenarioExecutionRows(
  reportScenarioId: string,
  scenario: ParsedReportScenario,
  projectRoot?: string,
  client: PrismaClient = prisma,
) {
  for (const step of scenario.steps) {
    await client.reportStep.create({
      data: {
        reportScenarioId,
        keyword: getStepKeywordEnum(step.keyword),
        line: step.line,
        name: step.name,
        matchLocation: step.matchLocation,
        status: getStepStatusEnum(step.status),
        duration: String(step.duration),
        errorMessage: step.errorMessage,
        errorTrace: step.errorTrace,
        screenshotPath: step.screenshotPath ? toProjectRelativePath(step.screenshotPath, projectRoot) : null,
        hidden: step.hidden,
        order: step.order,
      },
    })
  }

  for (const hook of scenario.hooks) {
    await client.reportHook.create({
      data: {
        reportScenarioId,
        keyword: getStepKeywordEnum(hook.keyword),
        status: getStepStatusEnum(hook.status),
        duration: String(hook.duration),
        errorMessage: hook.errorMessage,
        errorTrace: hook.errorTrace,
        hidden: hook.hidden,
      },
    })
  }
}

function getScenarioDuration(scenario: ParsedReportScenario) {
  return (
    scenario.steps.reduce((total, step) => total + step.duration, 0) +
    scenario.hooks.reduce((total, hook) => total + hook.duration, 0)
  )
}

async function linkReportScenarioToTestCase(
  reportId: string,
  reportScenarioId: string,
  scenario: ParsedReportScenario,
  testRun: ReportStorageTestRun,
  executedTestCases: ExecutedTestCaseSets,
  client: PrismaClient = prisma,
) {
  const matchedTestCase = findMatchingTestRunTestCase(testRun.testCases, {
    scenarioName: scenario.name,
    scenarioTags: scenario.tags.map(tag => tag.name),
  })

  if (!matchedTestCase) {
    return
  }

  if (matchedTestCase.testSuiteId) {
    executedTestCases.suiteIds.add(matchedTestCase.testSuiteId)
  } else {
    executedTestCases.legacyTestCaseIds.add(matchedTestCase.testCaseId)
  }

  await client.reportTestCase.create({
    data: {
      reportId,
      testCaseId: matchedTestCase.testCaseId,
      testRunTestCaseId: matchedTestCase.id,
      reportScenarioId,
      duration: String(getScenarioDuration(scenario)),
    },
  })
}

async function createParsedReportGraph(
  reportId: string,
  parsedReport: ParsedReport,
  testRun: ReportStorageTestRun,
  client: PrismaClient = prisma,
) {
  const executedTestCases: ExecutedTestCaseSets = {
    suiteIds: new Set<string>(),
    legacyTestCaseIds: new Set<string>(),
  }

  for (const feature of parsedReport.features) {
    const reportFeature = await createReportFeature(reportId, feature, client)

    for (const scenario of feature.scenarios) {
      const reportScenario = await createReportScenario(reportFeature.id, scenario, client)
      await createReportScenarioExecutionRows(reportScenario.id, scenario, testRun.targetProject?.canonicalPath, client)
      await linkReportScenarioToTestCase(reportId, reportScenario.id, scenario, testRun, executedTestCases, client)
    }
  }

  return executedTestCases
}

async function getLegacySuiteIds(testCaseIds: Set<string>, client: PrismaClient = prisma) {
  if (testCaseIds.size === 0) {
    return []
  }

  const legacyTestCases = await client.testCase.findMany({
    where: {
      id: {
        in: Array.from(testCaseIds),
      },
    },
    include: {
      TestSuite: true,
    },
  })

  return legacyTestCases.flatMap(testCase => testCase.TestSuite.map(testSuite => testSuite.id))
}

async function updateExecutedSuiteMetrics(
  testRun: ReportStorageTestRun,
  executedTestCases: ExecutedTestCaseSets,
  client: PrismaClient = prisma,
) {
  if (executedTestCases.suiteIds.size === 0 && executedTestCases.legacyTestCaseIds.size === 0) {
    return
  }

  try {
    await updateExecutedSuiteMetricsOwned(testRun, executedTestCases, client)
  } catch (error) {
    console.error(
      `[ReportService] Error updating test suite metrics after storing report: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

async function updateExecutedSuiteMetricsOwned(
  testRun: ReportStorageTestRun,
  executedTestCases: ExecutedTestCaseSets,
  client: PrismaClient,
) {
  const executedAt = testRun.completedAt || testRun.startedAt || new Date()
  const allSuiteIds = new Set(executedTestCases.suiteIds)
  const legacySuiteIds = await getLegacySuiteIds(executedTestCases.legacyTestCaseIds, client)

  legacySuiteIds.forEach(suiteId => allSuiteIds.add(suiteId))

  if (client === prisma) for (const suiteId of allSuiteIds) await updateTestSuiteMetrics(suiteId, executedAt)

  if (allSuiteIds.size > 0)
    console.log(`[ReportService] Updated test suite metrics for ${allSuiteIds.size} executed suite(s)`)
}

/**
 * Persists a cucumber.json report and linked graph into the database.
 */
export async function storeReportFromFileService(
  testRunId: string,
  reportPath: string,
  client: PrismaClient = prisma,
  appraiseRoot?: string,
): Promise<StoreReportOutcome> {
  try {
    const testRun = await getReportStorageTestRun(testRunId, client)

    if (!testRun) {
      return {
        success: false,
        reason: 'test_run_not_found',
        message: `Test run not found for runId: ${testRunId}`,
      }
    }

    const managedReportText = testRun.runtimeCapsule
      ? await readTestRunArtifactText(createTestRunArtifactAccess(createTestRunArtifactContext(appraiseRoot), client), {
          runId: testRunId,
          kind: 'report',
        })
      : null
    const resolvedReportPath = resolveStoredPath(reportPath, testRun.targetProject?.canonicalPath)

    if (!testRun.runtimeCapsule && !existsSync(resolvedReportPath)) {
      console.warn(`[ReportService] Report file not found at ${reportPath} for testRunId: ${testRunId}`)
      return {
        success: false,
        reason: 'file_not_found',
        message: `Report file not found at ${reportPath}`,
      }
    }

    const parsedReport = managedReportText
      ? parseCucumberReportText(managedReportText)
      : await parseCucumberReport(resolvedReportPath)
    const report = await createReportShell(testRun, reportPath, client)
    const executedTestCases = await createParsedReportGraph(report.id, parsedReport, testRun, client)
    await updateExecutedSuiteMetrics(testRun, executedTestCases, client)

    return { success: true, reportId: report.id }
  } catch (error) {
    console.error(`[ReportService] Error storing report from file ${reportPath}:`, error)
    return {
      success: false,
      reason: 'storage_failed',
      message: `Failed to store report: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

export async function getAllTestCaseMetricsForFilter(filter: string, targetProjectId: string) {
  let testCaseMetrics = await prisma.testCaseMetrics.findMany({
    where: { testCase: { targetProjectId } },
    include: {
      testCase: {
        include: {
          tags: true,
        },
      },
    },
  })
  if (filter === 'repeatedlyFailing') {
    testCaseMetrics = testCaseMetrics.filter(tc => tc.isRepeatedlyFailing)
  } else if (filter === 'flaky') {
    testCaseMetrics = testCaseMetrics.filter(tc => tc.isFlaky)
  }
  return testCaseMetrics
}

export async function getAllTestSuiteMetricsForFilter(filter: string, targetProjectId: string) {
  if (filter === 'notExecutedRecently') {
    const recentPeriodDate = new Date()
    recentPeriodDate.setDate(recentPeriodDate.getDate() - RECENT_PERIOD_DAYS)

    const testSuites = await prisma.testSuite.findMany({
      where: {
        targetProjectId,
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
                  lt: recentPeriodDate,
                },
              },
            },
          },
        ],
      },
      include: {
        tags: true,
        testCases: true,
        metrics: true,
      },
    })

    return testSuites.map(testSuite => {
      const metrics = testSuite.metrics

      return {
        id: metrics?.id ?? `unexecuted-${testSuite.id}`,
        testSuiteId: testSuite.id,
        lastExecutedAt: metrics?.lastExecutedAt ?? null,
        createdAt: metrics?.createdAt ?? testSuite.createdAt,
        updatedAt: metrics?.updatedAt ?? testSuite.updatedAt,
        testSuite,
      }
    })
  }

  const testSuiteMetrics = await prisma.testSuiteMetrics.findMany({
    where: { testSuite: { targetProjectId } },
    include: {
      testSuite: {
        include: {
          tags: true,
          testCases: true,
        },
      },
    },
  })
  return testSuiteMetrics
}
