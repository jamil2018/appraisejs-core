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

export async function getAllTestSuitesAction(): Promise<ActionResponse> {
  try {
    const testSuites = await listTestSuites()
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
    await createTestSuiteFromInput(value)

    revalidatePath('/test-suites')
    return {
      status: 200,
      success: true,
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
    await deleteTestSuitesByIds(id)

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
    const testSuite = await getTestSuiteByIdOrThrow(id)
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

    await updateTestSuiteFromInput(value, id)

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
