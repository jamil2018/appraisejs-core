// action.ts
'use server'

import prisma from '@/config/db-config'
import { testSuiteSchema } from '@/constants/form-opts/test-suite-form-opts'
import { ActionResponse } from '@/types/form/actionHandler'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z, ZodError } from 'zod'
import { generateFeatureFile, deleteFeatureFile } from '@/lib/feature-file-generator'

const generateSafeFileName = (testSuiteName: string): string => {
  return testSuiteName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
}

/**
 * Get all test suites
 * @returns ActionResponse
 */
export async function getAllTestSuitesAction(): Promise<ActionResponse> {
  try {
    const testSuites = await prisma.testSuite.findMany({
      include: {
        module: true,
        testCases: true,
      },
    })
    return {
      status: 200,
      data: testSuites,
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}

/**
 * Create a new test suite
 * @param _prev - Previous state
 * @param value - Test suite data
 * @returns ActionResponse
 */
export async function createTestSuiteAction(
  _prev: unknown,
  value: z.infer<typeof testSuiteSchema>,
): Promise<ActionResponse> {
  try {
    testSuiteSchema.parse(value)

    // Create the test suite
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
      },
      include: {
        module: true,
      },
    })

    const sanitizedTestSuiteName = generateSafeFileName(newTestSuite.name)
    // Generate feature file for the new test suite
    try {
      await generateFeatureFile(newTestSuite.id, sanitizedTestSuiteName, newTestSuite.description || undefined)
    } catch (featureFileError) {
      console.error('Error generating feature file:', featureFileError)
      // Don't fail the test suite creation if feature file generation fails
    }

    revalidatePath('/test-suites')
    return {
      status: 200,
      message: 'Test suite created successfully',
    }
  } catch (e) {
    if (e instanceof ZodError) {
      return {
        status: 400,
        error: e.message,
      }
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        status: 500,
        error: e.message,
      }
    }
    return {
      status: 500,
      error: 'Server error occurred',
    }
  }
}

/**
 * Delete a test suite
 * @param id - Test suite id
 * @returns ActionResponse
 */
export async function deleteTestSuiteAction(id: string[]): Promise<ActionResponse> {
  try {
    // Delete corresponding feature files before deleting test suites
    for (const testSuiteId of id) {
      try {
        await deleteFeatureFile(testSuiteId)
      } catch (featureFileError) {
        console.error(`Error deleting feature file for test suite ${testSuiteId}:`, featureFileError)
        // Don't fail the test suite deletion if feature file deletion fails
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
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}

/**
 * Get a test suite by id
 * @param id - Test suite id
 * @returns ActionResponse
 */
export async function getTestSuiteByIdAction(id: string): Promise<ActionResponse> {
  try {
    const testSuite = await prisma.testSuite.findUnique({
      where: { id },
      include: { testCases: true },
    })
    return {
      status: 200,
      data: testSuite,
    }
  } catch (e) {
    console.error(e)
    throw e
  }
}

/**
 * Update a test suite
 * @param _prev - Previous state
 * @param value - Test suite data
 * @param id - Test suite id
 * @returns ActionResponse
 */
export async function updateTestSuiteAction(
  _prev: unknown,
  value: z.infer<typeof testSuiteSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    testSuiteSchema.parse(value)

    // Get the current test suite to check if name or module changed
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

    // Check if name or module changed - if so, delete old feature file
    const nameChanged = currentTestSuite.name !== value.name
    const moduleChanged = currentTestSuite.moduleId !== value.moduleId

    if (nameChanged || moduleChanged) {
      try {
        await deleteFeatureFile(currentTestSuite.id)
      } catch (featureFileError) {
        console.error('Error deleting old feature file:', featureFileError)
        // Don't fail the update if old file deletion fails
      }
    }

    // Update the test suite
    const updatedTestSuite = await prisma.testSuite.update({
      where: { id },
      data: {
        name: value.name,
        description: value.description,
        testCases: {
          set: value.testCases?.map(id => ({ id })),
        },
        module: {
          connect: {
            id: value.moduleId,
          },
        },
      },
      include: {
        module: true,
      },
    })

    // Generate new feature file with updated information
    try {
      await generateFeatureFile(updatedTestSuite.id, updatedTestSuite.name, updatedTestSuite.description || undefined)
    } catch (featureFileError) {
      console.error('Error generating updated feature file:', featureFileError)
      // Don't fail the test suite update if feature file generation fails
    }

    revalidatePath('/test-suites')
    return {
      status: 200,
      message: 'Test suite updated successfully',
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}
