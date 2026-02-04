'use server'

import { ActionResponse } from '@/types/form/actionHandler'
import prisma from '@/config/db-config'
import { parseCucumberReport, getStepStatusEnum, getStepKeywordEnum } from '@/lib/test-run/report-parser'
import { StepStatus, StepKeyword, TagType, Prisma } from '@prisma/client'
import { existsSync } from 'fs'
import { updateTestSuiteMetrics } from '@/lib/metrics/metric-calculator'

/**
 * Type for report with all relations from getAllReportsAction
 */
type ReportWithRelations = Prisma.ReportGetPayload<{
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

/**
 * Type for report with all relations from getReportByIdAction
 */
type ReportDetailWithRelations = Prisma.ReportGetPayload<{
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

/**
 * Stores a cucumber.json report in the database
 * Parses the report file and creates all related records (features, scenarios, steps, hooks, tags)
 *
 * @param testRunId - The test run ID (runId, not id)
 * @param reportPath - Path to the cucumber.json file
 * @returns ActionResponse indicating success or failure
 */
export async function storeReportFromFile(testRunId: string, reportPath: string): Promise<ActionResponse> {
  try {
    // Check if file exists
    if (!existsSync(reportPath)) {
      console.warn(`[ReportActions] Report file not found at ${reportPath} for testRunId: ${testRunId}`)
      return {
        status: 404,
        error: `Report file not found at ${reportPath}`,
      }
    }

    // Find the test run
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
          },
        },
      },
    })

    if (!testRun) {
      return {
        status: 404,
        error: `Test run not found for runId: ${testRunId}`,
      }
    }

    // Parse the report
    const parsedReport = await parseCucumberReport(reportPath)

    // Create Report record
    const report = await prisma.report.create({
      data: {
        name: `Test Run Report - ${testRun.name}`,
        description: `Report for test run: ${testRun.name}`,
        reportPath,
        testRunId: testRun.id,
      },
    })

    // Track test case IDs that were matched and executed
    const executedTestCaseIds = new Set<string>()

    // Process each feature
    for (const feature of parsedReport.features) {
      // Create ReportFeature
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

      // Create feature tags
      for (const tag of feature.tags) {
        await prisma.reportFeatureTag.create({
          data: {
            reportFeatureId: reportFeature.id,
            tagName: tag.name,
            line: tag.line,
          },
        })
      }

      // Process each scenario
      for (const scenario of feature.scenarios) {
        // Create ReportScenario
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

        // Create scenario tags
        for (const tag of scenario.tags) {
          await prisma.reportScenarioTag.create({
            data: {
              reportScenarioId: reportScenario.id,
              tagName: tag.name,
              line: tag.line,
            },
          })
        }

        // Create steps
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
              hidden: step.hidden,
              order: step.order,
            },
          })
        }

        // Create hooks
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

        // Try to match scenario to test case
        // Method 1: Extract test case title from scenario name (format: "[Title] Description")
        let matchedTestCase: (typeof testRun.testCases)[0] | undefined
        const bracketMatch = scenario.name.match(/^\[([^\]]+)\]/)
        if (bracketMatch) {
          const testCaseTitle = bracketMatch[1].trim()
          matchedTestCase = testRun.testCases.find(trtc => trtc.testCase.title === testCaseTitle)
        }

        // Method 2: Match by identifier tags if method 1 didn't work
        if (!matchedTestCase) {
          const scenarioTagNames = scenario.tags.map(tag => tag.name.toLowerCase())
          matchedTestCase = testRun.testCases.find(trtc => {
            const identifierTags = trtc.testCase.tags.filter(tag => tag.type === TagType.IDENTIFIER)
            return identifierTags.some(tag => {
              const tagExpression = tag.tagExpression.toLowerCase()
              return scenarioTagNames.some(scenarioTag => tagExpression.includes(scenarioTag))
            })
          })
        }

        // If we found a matching test case, create ReportTestCase link
        if (matchedTestCase) {
          // Track this test case as executed
          executedTestCaseIds.add(matchedTestCase.testCaseId)

          // Calculate scenario duration
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

    // Update test suite metrics for all test suites that had test cases executed
    // This serves as a backup to ensure metrics are updated even if updateTestSuitesForTestRun missed some
    if (executedTestCaseIds.size > 0) {
      try {
        const executedAt = testRun.completedAt || testRun.startedAt || new Date()

        // Get all test cases that were executed and their associated test suites
        const testCases = await prisma.testCase.findMany({
          where: {
            id: {
              in: Array.from(executedTestCaseIds),
            },
          },
          include: {
            TestSuite: true,
          },
        })

        // Extract unique test suite IDs
        const testSuiteIds = new Set<string>()
        testCases.forEach(testCase => {
          if (testCase.TestSuite) {
            testCase.TestSuite.forEach(suite => {
              testSuiteIds.add(suite.id)
            })
          }
        })

        // Update lastExecutedAt for each suite
        for (const suiteId of testSuiteIds) {
          await updateTestSuiteMetrics(suiteId, executedAt)
        }

        if (testSuiteIds.size > 0) {
          console.log(
            `[ReportActions] Updated test suite metrics for ${testSuiteIds.size} test suite(s) based on executed test cases`,
          )
        }
      } catch (error) {
        console.error(
          `[ReportActions] Error updating test suite metrics after storing report: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
        // Don't fail the report storage if metrics update fails
      }
    }

    return {
      status: 200,
      message: 'Report stored successfully',
      data: { reportId: report.id },
    }
  } catch (error) {
    console.error(`[ReportActions] Error storing report from file ${reportPath}:`, error)
    return {
      status: 500,
      error: `Failed to store report: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Gets all reports from the database
 */
export const getAllReportsAction = async (): Promise<ActionResponse> => {
  try {
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

    return {
      status: 200,
      data: reports as ReportWithRelations[],
    }
  } catch (error) {
    console.error('[ReportActions] Error fetching all reports:', error)
    return {
      status: 500,
      error: `Server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Gets a report by ID with all related data
 */
export const getReportByIdAction = async (reportId: string): Promise<ActionResponse> => {
  try {
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
      return {
        status: 404,
        error: 'Report not found',
      }
    }

    return {
      status: 200,
      data: report as ReportDetailWithRelations,
    }
  } catch (error) {
    console.error(`[ReportActions] Error fetching report ${reportId}:`, error)
    return {
      status: 500,
      error: `Server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Gets a report by test run ID
 */
export const getReportByTestRunIdAction = async (testRunId: string): Promise<ActionResponse> => {
  try {
    // Find test run by runId
    const testRun = await prisma.testRun.findUnique({
      where: { runId: testRunId },
      select: { id: true },
    })

    if (!testRun) {
      return {
        status: 404,
        error: 'Test run not found',
      }
    }

    // Find report by testRun.id
    const report = await prisma.report.findFirst({
      where: { testRunId: testRun.id },
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
    })

    if (!report) {
      return {
        status: 404,
        error: 'Report not found for this test run',
      }
    }

    return {
      status: 200,
      data: report as ReportDetailWithRelations,
    }
  } catch (error) {
    console.error(`[ReportActions] Error fetching report for testRunId ${testRunId}:`, error)
    return {
      status: 500,
      error: `Server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Gets the test case metrics for a report
 */
export const getAllTestCaseMetricsAction = async (filter: string): Promise<ActionResponse> => {
  try {
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
    return {
      status: 200,
      data: testCaseMetrics,
    }
  } catch (error) {
    console.error(`[ReportActions] Error fetching all test case metrics:`, error)
    return {
      status: 500,
      error: `Server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Gets the test suite metrics for a report
 */
export const getAllTestSuiteMetricsAction = async (filter: string): Promise<ActionResponse> => {
  try {
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
      // Calculate the date threshold for recent runs (7 days ago)
      const recentPeriodDate = new Date()
      recentPeriodDate.setDate(recentPeriodDate.getDate() - 7)

      // Filter for suites that have never been executed OR were executed more than 7 days ago
      testSuiteMetrics = testSuiteMetrics.filter(
        ts => ts.lastExecutedAt === null || ts.lastExecutedAt < recentPeriodDate,
      )
    }
    return {
      status: 200,
      data: testSuiteMetrics,
    }
  } catch (error) {
    console.error(`[ReportActions] Error fetching all test suite metrics:`, error)
    return {
      status: 500,
      error: `Server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}