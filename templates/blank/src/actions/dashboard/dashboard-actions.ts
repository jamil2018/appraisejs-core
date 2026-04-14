'use server'

import { ActionResponse } from '@/types/form/actionHandler'
import {
  getDashboardMetrics,
  getEntityMetrics,
  getRunningTestRunsCount,
  getTestSuiteExecutionData,
} from '@/services/dashboard/dashboard-service'
import { unknownErrorToActionResponse } from '@/services/shared/errors'

export async function getDashboardMetricsAction(): Promise<ActionResponse> {
  try {
    const dashboardMetrics = await getDashboardMetrics()
    return {
      status: 200,
      success: true,
      data: dashboardMetrics,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
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
    const metrics = await getEntityMetrics()
    return {
      status: 200,
      success: true,
      data: metrics,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getRunningTestRunsCountAction(): Promise<ActionResponse> {
  try {
    const count = await getRunningTestRunsCount()
    return {
      status: 200,
      success: true,
      data: count,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getTestSuiteExecutionDataAction(): Promise<ActionResponse> {
  try {
    const data = await getTestSuiteExecutionData()
    return {
      status: 200,
      success: true,
      data,
    }
  } catch (error) {
    console.error('[DashboardActions] Error fetching test suite execution data:', error)
    return unknownErrorToActionResponse(error)
  }
}
