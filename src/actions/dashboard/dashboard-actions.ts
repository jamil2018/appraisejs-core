'use server'

import prisma from '@/config/db-config'
import { ActionResponse } from '@/types/form/actionHandler'
import { TestRunStatus } from '@prisma/client'
import { getTestSuiteExecutionData } from '@/services/dashboard/dashboard-service'
import { unknownErrorToActionResponse } from '@/services/shared/errors'

export async function getDashboardMetricsAction(): Promise<ActionResponse> {
  try {
    const dashboardMetrics = await prisma.dashboardMetrics.findFirst()
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
      success: true,
      data: {
        testCasesCount: testCases,
        testSuitesCount: testSuites,
        templateStepsCount: templateSteps,
        runningTestRunsCount: runningTestRuns,
      },
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

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
