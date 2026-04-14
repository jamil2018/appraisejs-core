import prisma from '@/config/db-config'
import { parseCucumberReport, getStepStatusEnum, getStepKeywordEnum } from '@/lib/test-run/report-parser'
import { Prisma } from '@prisma/client'
import { existsSync } from 'fs'
import { updateTestSuiteMetrics } from '@/lib/metrics/metric-calculator'
import { resolveStoredPath, toProjectRelativePath } from '@/lib/automation/automation-path-roots'
import { findMatchingTestRunTestCase } from '@/lib/test-run/matching'
import { RECENT_PERIOD_DAYS } from '@/services/shared/constants'
import { ServiceError } from '@/services/shared/errors'

export type ReportWithRelations = Prisma.ReportGetPayload<{
  include: {
    testRun: {
      include: {
        environment: true
        tags: true
      }
    }
    testCases: {
      include: {
        testRunTestCase: {
          include: {
            testCase: {
              include: {
                tags: true
              }
            }
            testSuite: true
          }
        }
        reportScenario: {
          include: {
            reportFeature: true
          }
        }
      }
    }
  }
}>

export type ReportDetailWithRelations = Prisma.ReportGetPayload<{
  include: {
    testRun: {
      include: {
        environment: true
        tags: true
      }
    }
    features: {
      include: {
        tags: true
        scenarios: {
          include: {
            tags: true
            steps: true
            hooks: true
          }
        }
      }
    }
    testCases: {
      include: {
        testRunTestCase: {
          include: {
            testCase: {
              include: {
                tags: true
              }
            }
            testSuite: true
          }
        }
        reportScenario: {
          include: {
            reportFeature: true
          }
        }
      }
    }
  }
}>

export type StoreReportOutcome =
  | { success: true; reportId: string }
  | { success: false; reason: 'file_not_found' | 'test_run_not_found' | 'storage_failed'; message: string }

export async function listReports(): Promise<ReportWithRelations[]> {
  const reports = await prisma.report.findMany({
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

export async function getReportByIdOrThrow(reportId: string): Promise<ReportDetailWithRelations> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
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

/**
 * Persists a cucumber.json report and linked graph into the database.
 */
export async function storeReportFromFileService(testRunId: string, reportPath: string): Promise<StoreReportOutcome> {
  try {
    const resolvedReportPath = resolveStoredPath(reportPath)

    if (!existsSync(resolvedReportPath)) {
      console.warn(`[ReportService] Report file not found at ${reportPath} for testRunId: ${testRunId}`)
      return {
        success: false,
        reason: 'file_not_found',
        message: `Report file not found at ${reportPath}`,
      }
    }

    const testRun = await prisma.testRun.findUnique({
      where: { runId: testRunId },
      include: {
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

    if (!testRun) {
      return {
        success: false,
        reason: 'test_run_not_found',
        message: `Test run not found for runId: ${testRunId}`,
      }
    }

    const parsedReport = await parseCucumberReport(resolvedReportPath)

    const report = await prisma.report.create({
      data: {
        name: `Test Run Report - ${testRun.name}`,
        description: `Report for test run: ${testRun.name}`,
        reportPath: toProjectRelativePath(reportPath),
        testRunId: testRun.id,
      },
    })

    const executedSuiteIds = new Set<string>()
    const executedLegacyTestCaseIds = new Set<string>()

    for (const feature of parsedReport.features) {
      const reportFeature = await prisma.reportFeature.create({
        data: {
          reportId: report.id,
          name: feature.name,
          description: feature.description,
          uri: feature.uri,
          line: feature.line,
          keyword: feature.keyword,
        },
      })

      for (const tag of feature.tags) {
        await prisma.reportFeatureTag.create({
          data: {
            reportFeatureId: reportFeature.id,
            tagName: tag.name,
            line: tag.line,
          },
        })
      }

      for (const scenario of feature.scenarios) {
        const reportScenario = await prisma.reportScenario.create({
          data: {
            reportFeatureId: reportFeature.id,
            name: scenario.name,
            description: scenario.description,
            line: scenario.line,
            keyword: scenario.keyword,
            type: scenario.type,
            cucumberId: scenario.cucumberId,
          },
        })

        for (const tag of scenario.tags) {
          await prisma.reportScenarioTag.create({
            data: {
              reportScenarioId: reportScenario.id,
              tagName: tag.name,
              line: tag.line,
            },
          })
        }

        for (const step of scenario.steps) {
          await prisma.reportStep.create({
            data: {
              reportScenarioId: reportScenario.id,
              keyword: getStepKeywordEnum(step.keyword),
              line: step.line,
              name: step.name,
              matchLocation: step.matchLocation,
              status: getStepStatusEnum(step.status),
              duration: String(step.duration),
              errorMessage: step.errorMessage,
              errorTrace: step.errorTrace,
              screenshotPath: step.screenshotPath ? toProjectRelativePath(step.screenshotPath) : null,
              hidden: step.hidden,
              order: step.order,
            },
          })
        }

        for (const hook of scenario.hooks) {
          await prisma.reportHook.create({
            data: {
              reportScenarioId: reportScenario.id,
              keyword: getStepKeywordEnum(hook.keyword),
              status: getStepStatusEnum(hook.status),
              duration: String(hook.duration),
              errorMessage: hook.errorMessage,
              errorTrace: hook.errorTrace,
              hidden: hook.hidden,
            },
          })
        }

        const matchedTestCase = findMatchingTestRunTestCase(testRun.testCases, {
          scenarioName: scenario.name,
          scenarioTags: scenario.tags.map(tag => tag.name),
        })

        if (matchedTestCase) {
          if (matchedTestCase.testSuiteId) {
            executedSuiteIds.add(matchedTestCase.testSuiteId)
          } else {
            executedLegacyTestCaseIds.add(matchedTestCase.testCaseId)
          }

          const scenarioDuration =
            scenario.steps.reduce((total, step) => total + step.duration, 0) +
            scenario.hooks.reduce((total, hook) => total + hook.duration, 0)

          await prisma.reportTestCase.create({
            data: {
              reportId: report.id,
              testCaseId: matchedTestCase.testCaseId,
              testRunTestCaseId: matchedTestCase.id,
              reportScenarioId: reportScenario.id,
              duration: String(scenarioDuration),
            },
          })
        }
      }
    }

    if (executedSuiteIds.size > 0 || executedLegacyTestCaseIds.size > 0) {
      try {
        const executedAt = testRun.completedAt || testRun.startedAt || new Date()
        const allSuiteIds = new Set(executedSuiteIds)

        if (executedLegacyTestCaseIds.size > 0) {
          const legacyTestCases = await prisma.testCase.findMany({
            where: {
              id: {
                in: Array.from(executedLegacyTestCaseIds),
              },
            },
            include: {
              TestSuite: true,
            },
          })

          legacyTestCases.forEach(testCase => {
            testCase.TestSuite.forEach(testSuite => {
              allSuiteIds.add(testSuite.id)
            })
          })
        }

        for (const suiteId of allSuiteIds) {
          await updateTestSuiteMetrics(suiteId, executedAt)
        }

        if (allSuiteIds.size > 0) {
          console.log(`[ReportService] Updated test suite metrics for ${allSuiteIds.size} executed suite(s)`)
        }
      } catch (error) {
        console.error(
          `[ReportService] Error updating test suite metrics after storing report: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

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

export async function getAllTestCaseMetricsForFilter(filter: string) {
  let testCaseMetrics = await prisma.testCaseMetrics.findMany({
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

export async function getAllTestSuiteMetricsForFilter(filter: string) {
  let testSuiteMetrics = await prisma.testSuiteMetrics.findMany({
    include: {
      testSuite: {
        include: {
          tags: true,
          testCases: true,
        },
      },
    },
  })
  if (filter === 'notExecutedRecently') {
    const recentPeriodDate = new Date()
    recentPeriodDate.setDate(recentPeriodDate.getDate() - RECENT_PERIOD_DAYS)

    testSuiteMetrics = testSuiteMetrics.filter(
      ts => ts.lastExecutedAt === null || ts.lastExecutedAt < recentPeriodDate,
    )
  }
  return testSuiteMetrics
}
