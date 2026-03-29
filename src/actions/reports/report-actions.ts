'use server'

import { ActionResponse } from '@/types/form/actionHandler'
import {
  getAllTestCaseMetricsForFilter,
  getAllTestSuiteMetricsForFilter,
  getReportByIdOrThrow,
  getReportByTestRunIdOrThrow,
  listReports,
  storeReportFromFileService,
} from '@/services/report/report-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'

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
    const reports = await listReports()

    return {
      status: 200,
      success: true,
      data: reports,
    }
  } catch (error) {
    console.error('[ReportActions] Error fetching all reports:', error)
    return unknownErrorToActionResponse(error)
  }
}

export async function getReportByIdAction(reportId: string): Promise<ActionResponse> {
  try {
    const report = await getReportByIdOrThrow(reportId)

    return {
      status: 200,
      success: true,
      data: report,
    }
  } catch (error) {
    console.error(`[ReportActions] Error fetching report ${reportId}:`, error)
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function getReportByTestRunIdAction(testRunId: string): Promise<ActionResponse> {
  try {
    const report = await getReportByTestRunIdOrThrow(testRunId)

    return {
      status: 200,
      success: true,
      data: report,
    }
  } catch (error) {
    console.error(`[ReportActions] Error fetching report for testRunId ${testRunId}:`, error)
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
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
