'use server'

import prisma from '@/config/db-config'
import { testRunSchema } from '@/constants/form-opts/test-run-form-opts'
import { ActionResponse } from '@/types/form/actionHandler'
import { z } from 'zod'
import { TestRunStatus, TestRunResult, TestRunTestCaseStatus } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { type LogEntry } from '@/lib/test-run/log-formatter'
import { Prisma } from '@prisma/client'
import { ensureTestSuiteIdentifierTags } from '@/lib/test-suite-identifier-service'
import {
  buildTestRunsWhereClause,
  cancelTestRunService,
  checkTraceViewerStatusService,
  createTestRunFromValidatedValue,
  deleteTestRunsByIds,
  getTestRunLogsService,
  isTestRunNameTaken,
  spawnTraceViewerService,
  storeTestRunLogsService,
  updateTestRunTestCaseStatusFromScenario,
} from '@/services/test-run/test-run-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'

export async function getAllTestRunsAction(filter?: string): Promise<ActionResponse> {
  try {
    const whereClause: Prisma.TestRunWhereInput = buildTestRunsWhereClause(filter)

    const testRuns = await prisma.testRun.findMany({
      where: whereClause,
      include: {
        testCases: true,
        tags: true,
        environment: true,
      },
    })
    return {
      status: 200,
      success: true,
      data: testRuns,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getTestRunByIdAction(id: string): Promise<ActionResponse> {
  try {
    const testRun = await prisma.testRun.findUnique({
      where: { id },
      include: {
        testCases: {
          include: {
            testCase: true,
            testSuite: true,
          },
        },
        tags: true,
        environment: true,
        reports: true,
      },
    })

    if (!testRun) {
      return {
        status: 404,
        success: false,
        error: 'Test run not found',
      }
    }

    return {
      status: 200,
      success: true,
      data: testRun,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function deleteTestRunAction(id: string[]): Promise<ActionResponse> {
  try {
    await deleteTestRunsByIds(id)

    revalidatePath('/test-runs')
    revalidatePath('/')
    return {
      status: 200,
      success: true,
      message: 'Test run(s) deleted successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getAllTestSuiteTestCasesAction(): Promise<ActionResponse> {
  try {
    await ensureTestSuiteIdentifierTags()

    const testSuiteTestCases = await prisma.testSuite.findMany({
      include: {
        module: true,
        tags: true,
        testCases: {
          include: {
            steps: true,
            tags: true,
          },
        },
      },
    })
    return {
      status: 200,
      success: true,
      data: testSuiteTestCases,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function storeTestRunLogsAction(testRunId: string, logs: LogEntry[]): Promise<ActionResponse> {
  try {
    if (logs.length === 0) {
      return {
        status: 200,
        success: true,
        message: 'No logs to store',
      }
    }

    await storeTestRunLogsService(testRunId, logs)

    return {
      status: 200,
      success: true,
      message: 'Logs stored successfully',
    }
  } catch (error) {
    console.error(`[TestRunAction] Error storing logs for testRunId: ${testRunId}:`, error)
    return unknownErrorToActionResponse(error, `[TestRunAction] storeTestRunLogs`)
  }
}

export async function getTestRunLogsAction(testRunId: string): Promise<ActionResponse> {
  try {
    const logs = await getTestRunLogsService(testRunId)

    return {
      status: 200,
      success: true,
      data: logs,
    }
  } catch (error) {
    console.error(`[TestRunAction] Error retrieving logs for testRunId: ${testRunId}:`, error)
    return unknownErrorToActionResponse(error)
  }
}

export async function createTestRunAction(
  _prev: unknown,
  value: z.infer<typeof testRunSchema>,
): Promise<ActionResponse> {
  try {
    testRunSchema.parse(value)

    const result = await createTestRunFromValidatedValue(value)

    return {
      status: 200,
      success: true,
      message: 'Test run created successfully',
      data: { testRunId: result.runId, id: result.id },
    }
  } catch (error) {
    console.error('Error creating test run:', error)
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return {
        status: 400,
        success: false,
        error: 'A test run with this name already exists. Please choose a different name.',
      }
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function updateTestRunTestCaseStatusAction(
  testRunId: string,
  scenario: {
    scenarioName: string
    status: 'passed' | 'failed' | 'skipped' | 'unknown'
    tracePath?: string
    featureName?: string
    scenarioTags?: string[]
  },
): Promise<ActionResponse> {
  try {
    const result = await updateTestRunTestCaseStatusFromScenario(testRunId, scenario)

    if (result.kind === 'test_run_not_found') {
      return {
        status: 404,
        success: false,
        error: 'Test run not found',
      }
    }

    if (result.kind === 'no_match') {
      return {
        status: 200,
        success: true,
        message: result.message,
      }
    }

    return {
      status: 200,
      success: true,
      message: 'Test case status updated successfully',
    }
  } catch (error) {
    console.error(
      `[TestRunAction] Error updating test case status for testRunId: ${testRunId}, scenario: ${scenario.scenarioName}:`,
      error,
    )
    return unknownErrorToActionResponse(error)
  }
}

export async function checkTraceViewerStatusAction(testRunId: string, testCaseId: string): Promise<ActionResponse> {
  try {
    const outcome = await checkTraceViewerStatusService(testRunId, testCaseId)

    if (outcome.kind === 'test_run_not_found') {
      return {
        status: 404,
        success: false,
        error: 'Test run not found',
      }
    }

    if (outcome.kind === 'test_case_not_in_run') {
      return {
        status: 404,
        success: false,
        error: 'Test case not found in this test run',
      }
    }

    return {
      status: 200,
      success: true,
      data: {
        isRunning: outcome.isRunning,
        processName: outcome.processName,
      },
    }
  } catch (error) {
    console.error(
      `[TestRunAction] Error checking trace viewer status for testRunId: ${testRunId}, testCaseId: ${testCaseId}:`,
      error,
    )
    return unknownErrorToActionResponse(error)
  }
}

export async function spawnTraceViewerAction(testRunId: string, testCaseId: string): Promise<ActionResponse> {
  try {
    const outcome = await spawnTraceViewerService(testRunId, testCaseId)

    if (outcome.kind === 'test_run_not_found') {
      return {
        status: 404,
        success: false,
        error: 'Test run not found',
      }
    }

    if (outcome.kind === 'test_case_not_in_run') {
      return {
        status: 404,
        success: false,
        error: 'Test case not found in this test run',
      }
    }

    if (outcome.kind === 'no_trace_path') {
      return {
        status: 400,
        success: false,
        error: 'No trace path available for this test case',
      }
    }

    if (outcome.kind === 'trace_file_missing') {
      return {
        status: 404,
        success: false,
        error: `Trace file not found at path: ${outcome.path}`,
      }
    }

    return {
      status: 200,
      success: true,
      message: 'Trace viewer launched successfully',
      data: {
        processName: outcome.processName,
      },
    }
  } catch (error) {
    console.error(
      `[TestRunAction] Error spawning trace viewer for testRunId: ${testRunId}, testCaseId: ${testCaseId}:`,
      error,
    )
    return unknownErrorToActionResponse(error)
  }
}

export async function cancelTestRunAction(testRunId: string): Promise<ActionResponse> {
  try {
    const outcome = await cancelTestRunService(testRunId)

    if (outcome.kind === 'not_found') {
      return {
        status: 404,
        success: false,
        error: 'Test run not found',
      }
    }

    if (outcome.kind === 'invalid_state') {
      return {
        status: 400,
        success: false,
        error: outcome.message,
      }
    }

    if (outcome.kind === 'already_cancelling') {
      return {
        status: 200,
        success: true,
        message: 'Test run cancellation is already in progress',
      }
    }

    if (outcome.kind === 'cancelled_no_process') {
      return {
        status: 200,
        success: true,
        message: 'Test run cancelled successfully',
      }
    }

    revalidatePath('/test-runs')
    revalidatePath(`/test-runs/${testRunId}`)

    return {
      status: 200,
      success: true,
      message: 'Test run stopped successfully',
    }
  } catch (error) {
    console.error(`[TestRunAction] Error stopping test run ${testRunId}:`, error)
    return unknownErrorToActionResponse(error)
  }
}

export async function getMostRecentTestRunAction(): Promise<ActionResponse> {
  try {
    const testRun = await prisma.testRun.findFirst({
      orderBy: { completedAt: 'desc' },
      where: {
        completedAt: { not: null },
        status: TestRunStatus.COMPLETED,
      },
      include: {
        testCases: {
          include: {
            testCase: {
              include: {
                metrics: true,
              },
            },
          },
        },
        environment: true,
        tags: true,
      },
    })

    if (!testRun) {
      return {
        status: 404,
        success: false,
        error: 'No completed test run found',
      }
    }

    return {
      status: 200,
      success: true,
      data: testRun,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function checkTestRunNameUniqueAction(name: string, excludeId?: string): Promise<ActionResponse> {
  try {
    const nameExists = await isTestRunNameTaken(name, excludeId)
    return {
      status: 200,
      success: true,
      data: { isUnique: !nameExists },
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}
