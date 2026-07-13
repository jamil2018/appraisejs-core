'use server'

import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { testCaseSchema } from '@/constants/form-opts/test-case-form-opts'
import { z } from 'zod'
import {
  createTestCaseFromInput,
  deleteTestCasesByIds,
  getTestCaseByIdOrThrow,
  listTestCases,
  updateTestCaseFromInput,
} from '@/services/test-case/test-case-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import { requireActiveProjectForMutation } from '@/lib/active-project'

export async function getAllTestCasesAction(): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const testCases = await listTestCases(project.id)
    return {
      status: 200,
      success: true,
      data: testCases,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function deleteTestCaseAction(ids: string[]): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    await deleteTestCasesByIds(ids, project.id)

    revalidatePath('/test-cases')
    return {
      status: 200,
      success: true,
      message: 'Test case(s) deleted successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function createTestCaseAction(value: z.infer<typeof testCaseSchema>): Promise<ActionResponse> {
  try {
    testCaseSchema.parse(value)
    const project = await requireActiveProjectForMutation()
    const newTestCase = await createTestCaseFromInput(value, project.id)

    revalidatePath('/test-cases')
    return {
      status: 200,
      success: true,
      message: 'Test case created successfully',
      data: newTestCase,
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function getTestCaseByIdAction(id: string): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const testCase = await getTestCaseByIdOrThrow(id, project.id)
    return {
      status: 200,
      success: true,
      data: testCase,
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function updateTestCaseAction(
  value: z.infer<typeof testCaseSchema>,
  id?: string,
): Promise<ActionResponse> {
  if (!id) {
    return {
      status: 400,
      success: false,
      error: "updateTestCaseAction: 'id' parameter is required for updating a test case.",
    }
  }
  try {
    testCaseSchema.parse(value)
    const project = await requireActiveProjectForMutation()
    const testCase = await updateTestCaseFromInput(value, id, project.id)

    revalidatePath('/test-cases')
    return {
      status: 200,
      success: true,
      message: 'Test case updated successfully',
      data: testCase,
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}
