'use server'

import { ActionResponse } from '@/types/form/actionHandler'
import {
  getAllTestCaseMetricsForFilter,
  getAllTestSuiteMetricsForFilter,
  getReportByIdOrThrow,
  listReports,
} from '@/services/report/report-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import { requireActiveProjectForMutation } from '@/lib/active-project'

export async function getAllReportsAction(): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const reports = await listReports(project.id)

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
    const project = await requireActiveProjectForMutation()
    const report = await getReportByIdOrThrow(reportId, project.id)

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

export async function getAllTestCaseMetricsAction(filter: string): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const testCaseMetrics = await getAllTestCaseMetricsForFilter(filter, project.id)
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
    const project = await requireActiveProjectForMutation()
    const testSuiteMetrics = await getAllTestSuiteMetricsForFilter(filter, project.id)
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
