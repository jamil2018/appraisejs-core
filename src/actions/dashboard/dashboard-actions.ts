import prisma from '@/config/db-config'
import { ActionResponse } from '@/types/form/actionHandler'

export async function getDashboardMetricsAction(): Promise<ActionResponse> {
  try {
    const dashboardMetrics = await prisma.dashboardMetrics.findFirst()
    return {
      status: 200,
      data: dashboardMetrics,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
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
        status: 'RUNNING',
      },
    })
    return {
      status: 200,
      data: {
        testCasesCount: testCases,
        testSuitesCount: testSuites,
        templateStepsCount: templateSteps,
        runningTestRunsCount: runningTestRuns,
      },
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}