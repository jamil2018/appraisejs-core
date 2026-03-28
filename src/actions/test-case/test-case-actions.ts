'use server'

import prisma from '@/config/db-config'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { testCaseSchema } from '@/constants/form-opts/test-case-form-opts'
import { z } from 'zod'
import { TagType } from '@prisma/client'
import {
  createTestCaseFromInput,
  deleteTestCasesByIds,
  updateTestCaseFromInput,
} from '@/services/test-case/test-case-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'

export async function getAllTestCasesAction(): Promise<ActionResponse> {
  try {
    const testCases = await prisma.testCase.findMany({
      include: {
        steps: {
          include: {
            parameters: true,
          },
        },
        TestSuite: true,
        tags: true,
      },
    })
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
    await deleteTestCasesByIds(ids)

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
    const newTestCase = await createTestCaseFromInput(value)

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
    const testCase = await prisma.testCase.findUnique({
      where: { id },
      include: {
        steps: {
          include: {
            parameters: true,
          },
        },
        TestSuite: {
          select: {
            id: true,
          },
        },
        tags: {
          select: {
            id: true,
          },
          where: {
            type: TagType.FILTER,
          },
        },
      },
    })

    if (!testCase) {
      return {
        status: 404,
        success: false,
        error: 'Test case not found',
      }
    }

    return {
      status: 200,
      success: true,
      data: {
        ...testCase,
        testSuiteIds: testCase.TestSuite.map(suite => suite.id),
        tagIds: testCase.tags.map(tag => tag.id) || [],
      },
    }
  } catch (error) {
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
    const testCase = await updateTestCaseFromInput(value, id)

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
