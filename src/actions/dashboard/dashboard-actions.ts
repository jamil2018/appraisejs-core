'use server'

import { ActionResponse } from '@/types/form/actionHandler'
import {
  getDashboardMetrics,
  getEntityMetrics,
  getRunningTestRunsCount,
  getTestSuiteExecutionData,
} from '@/services/dashboard/dashboard-service'
import { unknownErrorToActionResponse } from '@/services/shared/errors'
import { requireActiveProjectForMutation } from '@/lib/active-project'

export async function getDashboardMetricsAction(): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const dashboardMetrics = await getDashboardMetrics(project.id)
    return {
      status: 200,
      success: true,
      data: dashboardMetrics,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getEntityMetricsAction(): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const metrics = await getEntityMetrics(project.id)
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
    const project = await requireActiveProjectForMutation()
    const count = await getRunningTestRunsCount(project.id)
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
    const project = await requireActiveProjectForMutation()
    const data = await getTestSuiteExecutionData(project.id)
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
