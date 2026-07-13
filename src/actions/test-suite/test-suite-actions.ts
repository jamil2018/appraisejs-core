'use server'

import { testSuiteSchema } from '@/constants/form-opts/test-suite-form-opts'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  createTestSuiteFromInput,
  deleteTestSuitesByIds,
  getTestSuiteByIdOrThrow,
  listTestSuites,
  updateTestSuiteFromInput,
} from '@/services/test-suite/test-suite-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import { requireActiveProjectForMutation } from '@/lib/active-project'

export async function getAllTestSuitesAction(): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const testSuites = await listTestSuites(project.id)
    return {
      status: 200,
      success: true,
      data: testSuites,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function createTestSuiteAction(
  _prev: unknown,
  value: z.infer<typeof testSuiteSchema>,
): Promise<ActionResponse> {
  try {
    testSuiteSchema.parse(value)
    const project = await requireActiveProjectForMutation()
    const createdTestSuite = await createTestSuiteFromInput(value, project.id)

    revalidatePath('/test-suites')
    return {
      status: 200,
      success: true,
      data: createdTestSuite,
      message: 'Test suite created successfully',
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function deleteTestSuiteAction(id: string[]): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    await deleteTestSuitesByIds(id, project.id)

    revalidatePath('/test-suites')
    return {
      status: 200,
      success: true,
      message: 'Test suite(s) deleted successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getTestSuiteByIdAction(id: string): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const testSuite = await getTestSuiteByIdOrThrow(id, project.id)
    return {
      status: 200,
      success: true,
      data: testSuite,
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function updateTestSuiteAction(
  _prev: unknown,
  value: z.infer<typeof testSuiteSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    testSuiteSchema.parse(value)
    if (!id) {
      return {
        status: 400,
        success: false,
        error: 'Test suite id is required',
      }
    }

    const project = await requireActiveProjectForMutation()
    await updateTestSuiteFromInput(value, id, project.id)

    revalidatePath('/test-suites')
    return {
      status: 200,
      success: true,
      message: 'Test suite updated successfully',
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}
