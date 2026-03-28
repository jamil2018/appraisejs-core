'use server'

import { ActionResponse } from '@/types/form/actionHandler'
import prisma from '@/config/db-config'
import {
  getAllTestCaseMetricsForFilter,
  getAllTestSuiteMetricsForFilter,
  storeReportFromFileService,
  type ReportDetailWithRelations,
  type ReportWithRelations,
} from '@/services/report/report-service'

/**
 * Stores a cucumber.json report in the database (delegates to report service).
 */
export async function storeReportFromFile(testRunId: string, reportPath: string): Promise<ActionResponse> {
  const outcome = await storeReportFromFileService(testRunId, reportPath)
  if (outcome.success) {
    return {
      status: 200,
      success: true,
      message: 'Report stored successfully',
      data: { reportId: outcome.reportId },
    }
  }
  const status = outcome.reason === 'storage_failed' ? 500 : 404
  return {
    status,
    success: false,
    error: outcome.message,
  }
}

export async function getAllReportsAction(): Promise<ActionResponse> {
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

    return {
      status: 200,
      success: true,
      data: reports as ReportWithRelations[],
    }
  } catch (error) {
    console.error('[ReportActions] Error fetching all reports:', error)
    return {
      status: 500,
      success: false,
      error: `Server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

export async function getReportByIdAction(reportId: string): Promise<ActionResponse> {
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
      return {
        status: 404,
        success: false,
        error: 'Report not found',
      }
    }

    return {
      status: 200,
      success: true,
      data: report as ReportDetailWithRelations,
    }
  } catch (error) {
    console.error(`[ReportActions] Error fetching report ${reportId}:`, error)
    return {
      status: 500,
      success: false,
      error: `Server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

export async function getReportByTestRunIdAction(testRunId: string): Promise<ActionResponse> {
  try {
    const testRun = await prisma.testRun.findUnique({
      where: { runId: testRunId },
      select: { id: true },
    })

    if (!testRun) {
      return {
        status: 404,
        success: false,
        error: 'Test run not found',
      }
    }

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
    })

    if (!report) {
      return {
        status: 404,
        success: false,
        error: 'Report not found for this test run',
      }
    }

    return {
      status: 200,
      success: true,
      data: report as ReportDetailWithRelations,
    }
  } catch (error) {
    console.error(`[ReportActions] Error fetching report for testRunId ${testRunId}:`, error)
    return {
      status: 500,
      success: false,
      error: `Server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

export async function getAllTestCaseMetricsAction(filter: string): Promise<ActionResponse> {
  try {
    const testCaseMetrics = await getAllTestCaseMetricsForFilter(filter)
    return {
      status: 200,
      success: true,
      data: testCaseMetrics,
    }
  } catch (error) {
    console.error(`[ReportActions] Error fetching all test case metrics:`, error)
    return {
      status: 500,
      success: false,
      error: `Server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

export async function getAllTestSuiteMetricsAction(filter: string): Promise<ActionResponse> {
  try {
    const testSuiteMetrics = await getAllTestSuiteMetricsForFilter(filter)
    return {
      status: 200,
      success: true,
      data: testSuiteMetrics,
    }
  } catch (error) {
    console.error(`[ReportActions] Error fetching all test suite metrics:`, error)
    return {
      status: 500,
      success: false,
      error: `Server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
