// action.ts
'use server'

import prisma from '@/config/db-config'
import { testSuiteSchema } from '@/constants/form-opts/test-suite-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { ActionResponse } from '@/types/form/actionHandler'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z, ZodError } from 'zod'

export async function getAllTestSuitesAction(): Promise<ActionResponse> {
  try {
    const testSuites = await prisma.testSuite.findMany({
      include: {
        module: true,
        testCases: true,
        tags: true,
      },
    })
    return {
      status: 200,
      data: testSuites,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function createTestSuiteAction(
  _prev: unknown,
  value: z.infer<typeof testSuiteSchema>,
): Promise<ActionResponse> {
  try {
    testSuiteSchema.parse(value)

    const newTestSuite = await prisma.testSuite.create({
      data: {
        name: value.name,
        description: value.description,
        module: {
          connect: {
            id: value.moduleId,
          },
        },
        testCases: {
          connect: value.testCases?.map(id => ({ id })),
        },
        tags: {
          connect: value.tagIds?.map(id => ({ id })) || [],
        },
      },
    })

    try {
      await automationProjectionService.generateFeature(newTestSuite.id)
    } catch (error) {
      console.error('Error generating feature file:', error)
    }

    revalidatePath('/test-suites')
    return {
      status: 200,
      message: 'Test suite created successfully',
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        status: 400,
        error: error.message,
      }
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        status: 500,
        error: error.message,
      }
    }
    return {
      status: 500,
      error: 'Server error occurred',
    }
  }
}

export async function deleteTestSuiteAction(id: string[]): Promise<ActionResponse> {
  try {
    for (const testSuiteId of id) {
      try {
        await automationProjectionService.deleteFeature(testSuiteId)
      } catch (error) {
        console.error(`Error deleting feature file for test suite ${testSuiteId}:`, error)
      }
    }

    await prisma.testSuite.deleteMany({
      where: { id: { in: id } },
    })
    revalidatePath('/test-suites')
    return {
      status: 200,
      message: 'Test suite(s) deleted successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function getTestSuiteByIdAction(id: string): Promise<ActionResponse> {
  try {
    const testSuite = await prisma.testSuite.findUnique({
      where: { id },
      include: { testCases: true, tags: true },
    })
    return {
      status: 200,
      data: testSuite,
    }
  } catch (error) {
    console.error(error)
    throw error
  }
}

export async function updateTestSuiteAction(
  _prev: unknown,
  value: z.infer<typeof testSuiteSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    testSuiteSchema.parse(value)

    const currentTestSuite = await prisma.testSuite.findUnique({
      where: { id },
      include: {
        module: true,
      },
    })

    if (!currentTestSuite) {
      return {
        status: 404,
        error: 'Test suite not found',
      }
    }

    const nameChanged = currentTestSuite.name !== value.name
    const moduleChanged = currentTestSuite.moduleId !== value.moduleId

    if (nameChanged || moduleChanged) {
      try {
        await automationProjectionService.deleteFeature(currentTestSuite.id)
      } catch (error) {
        console.error('Error deleting old feature file:', error)
      }
    }

    const updatedTestSuite = await prisma.testSuite.update({
      where: { id },
      data: {
        name: value.name,
        description: value.description,
        testCases: {
          set: value.testCases?.map(testCaseId => ({ id: testCaseId })),
        },
        tags: {
          set: value.tagIds?.map(tagId => ({ id: tagId })) || [],
        },
        module: {
          connect: {
            id: value.moduleId,
          },
        },
      },
    })

    try {
      await automationProjectionService.generateFeature(updatedTestSuite.id)
    } catch (error) {
      console.error('Error generating updated feature file:', error)
    }

    revalidatePath('/test-suites')
    return {
      status: 200,
      message: 'Test suite updated successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}
