'use server'

import prisma from '@/config/db-config'
import { testSuiteSchema } from '@/constants/form-opts/test-suite-form-opts'
import { ensureTestSuiteIdentifierTags } from '@/lib/test-suite-identifier-service'
import { ActionResponse } from '@/types/form/actionHandler'
import { TagType } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z, ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import {
  createTestSuiteFromInput,
  deleteTestSuitesByIds,
  updateTestSuiteFromInput,
} from '@/services/test-suite/test-suite-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'

export async function getAllTestSuitesAction(): Promise<ActionResponse> {
  try {
    await ensureTestSuiteIdentifierTags()

    const testSuites = await prisma.testSuite.findMany({
      include: {
        module: true,
        testCases: true,
        tags: true,
      },
    })
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
    if (error instanceof ZodError) {
      return {
        status: 400,
        success: false,
        error: error.message,
      }
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        status: 500,
        success: false,
        error: error.message,
      }
    }
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return {
      status: 500,
      success: false,
      error: 'Server error occurred',
    }
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
    await ensureTestSuiteIdentifierTags([id])

    const testSuite = await prisma.testSuite.findUnique({
      where: { id },
      include: {
        testCases: true,
        tags: {
          where: {
            type: TagType.FILTER,
          },
        },
      },
    })

    if (!testSuite) {
      return {
        status: 404,
        success: false,
        error: 'Test suite not found',
      }
    }

    return {
      status: 200,
      success: true,
      data: testSuite,
    }
  } catch (error) {
    console.error(error)
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

    await ensureTestSuiteIdentifierTags([id])
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
