'use server'

import { testRunSchema } from '@/constants/form-opts/test-run-form-opts'
import { ActionResponse } from '@/types/form/actionHandler'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import {
  cancelTestRunService,
  checkTraceViewerStatusService,
  createTestRunFromValidatedValue,
  deleteTestRunsByIds,
  getTestRunLogsService,
  getTestRunByIdOrThrow,
  isTestRunNameTaken,
  listTestRuns,
  listTestSuiteTestCases,
  spawnTraceViewerService,
} from '@/services/test-run/test-run-service'
import { RuntimeCapsuleTestRunService } from '@/services/test-run/runtime-capsule-test-run-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import { requireActiveProjectForMutation } from '@/lib/active-project'

export async function getAllTestRunsAction(
  filter?: string,
  page?: { cursor?: string; limit?: number },
): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const testRuns = page ? await listTestRuns(project.id, filter, page) : await listTestRuns(project.id, filter)
    return {
      status: 200,
      success: true,
      data: testRuns,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getTestRunByIdAction(id: string, targetProjectId?: string): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation(targetProjectId)
    const testRun = await getTestRunByIdOrThrow(id, project.id)
    return {
      status: 200,
      success: true,
      data: testRun,
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function deleteTestRunAction(id: string[]): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    await deleteTestRunsByIds(id, project.id)

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
    const project = await requireActiveProjectForMutation()
    const testSuiteTestCases = await listTestSuiteTestCases(project.id)
    return {
      status: 200,
      success: true,
      data: testSuiteTestCases,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getTestRunLogsAction(testRunId: string, targetProjectId?: string): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation(targetProjectId)
    await getTestRunByIdOrThrow(testRunId, project.id)
    const logs = await getTestRunLogsService(testRunId, project.id)

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

    const project = await requireActiveProjectForMutation()
    const result = await createTestRunFromValidatedValue(value, project.id)
    await new RuntimeCapsuleTestRunService().startIndependentAuthored({ testRunDbId: result.id })

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
    return unknownErrorToActionResponse(error)
  }
}

export async function checkTraceViewerStatusAction(testRunId: string, testCaseId: string): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    await getTestRunByIdOrThrow(testRunId, project.id)
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
    const project = await requireActiveProjectForMutation()
    await getTestRunByIdOrThrow(testRunId, project.id)
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
    const project = await requireActiveProjectForMutation()
    await getTestRunByIdOrThrow(testRunId, project.id)
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

export async function checkTestRunNameUniqueAction(name: string, excludeId?: string): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const nameExists = await isTestRunNameTaken(name, project.id, excludeId)
    return {
      status: 200,
      success: true,
      data: { isUnique: !nameExists },
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}
