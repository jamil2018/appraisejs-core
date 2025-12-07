'use server'

import prisma from '@/config/db-config'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { testCaseSchema } from '@/constants/form-opts/test-case-form-opts'
import { z } from 'zod'
import { generateFeatureFile } from '@/lib/feature-file-generator'

import { StepParameterType, TagType } from '@prisma/client'
import { generateUniqueTestCaseIdentifier } from '@/lib/test-case-utils'

/**
 * Get all test cases
 * @returns ActionResponse
 */
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
      data: testCases,
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}

/**
 * Delete a test case
 * @param id - Test case id
 * @returns ActionResponse
 */
export async function deleteTestCaseAction(id: string[]): Promise<ActionResponse> {
  try {
    // Get the test suites that will be affected before deletion
    const affectedTestSuites = await prisma.testSuite.findMany({
      where: {
        testCases: {
          some: {
            id: {
              in: id,
            },
          },
        },
      },
      include: {
        module: true,
      },
    })

    const testCaseIdentifierTags = await prisma.tag.findMany({
      where: {
        type: TagType.IDENTIFIER,
        testCases: {
          some: {
            id: {
              in: id,
            },
          },
        },
      },
      select: {
        id: true,
      },
    })

    await prisma.$transaction(async tx => {
      // Delete all test run test cases associated with the test cases
      // Note: This has RESTRICT constraint in the database, so must be deleted first
      await tx.testRunTestCase.deleteMany({
        where: {
          testCaseId: {
            in: id,
          },
        },
      })

      // Delete all reviews associated with the test cases
      await tx.review.deleteMany({
        where: {
          testCaseId: {
            in: id,
          },
        },
      })

      // Delete all linked Jira tickets associated with the test cases
      await tx.linkedJiraTicket.deleteMany({
        where: {
          testCaseId: {
            in: id,
          },
        },
      })

      // Delete all step parameters associated with the test case steps
      await tx.testCaseStepParameter.deleteMany({
        where: {
          testCaseStep: {
            testCaseId: {
              in: id,
            },
          },
        },
      })

      // Delete all test case steps
      await tx.testCaseStep.deleteMany({
        where: {
          testCaseId: {
            in: id,
          },
        },
      })

      // Delete all test case identifier tags associated with the test cases
      await tx.tag.deleteMany({
        where: {
          id: { in: testCaseIdentifierTags.map(tag => tag.id) },
        },
      })

      // Delete the test cases
      await tx.testCase.deleteMany({
        where: { id: { in: id } },
      })
    })

    // Regenerate feature files for affected test suites
    for (const testSuite of affectedTestSuites) {
      try {
        await generateFeatureFile(testSuite.id, testSuite.name, testSuite.description || undefined)
      } catch (featureFileError) {
        console.error(`Error regenerating feature file for test suite ${testSuite.name}:`, featureFileError)
        // Don't fail the deletion if feature file regeneration fails
      }
    }

    revalidatePath('/test-cases')
    return {
      status: 200,
      message: 'Test case(s) deleted successfully',
    }
  } catch (e) {
    console.error('Error deleting test case(s):', e)
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}

/**
 * Create a test case
 * @param testCase - Test case
 * @returns ActionResponse
 */
export async function createTestCaseAction(value: z.infer<typeof testCaseSchema>): Promise<ActionResponse> {
  try {
    testCaseSchema.parse(value)
    const uniqueTestCaseIdentifier = generateUniqueTestCaseIdentifier()
    const testCaseIdentifierTag = await prisma.tag.create({
      data: {
        name: uniqueTestCaseIdentifier,
        type: TagType.IDENTIFIER,
        tagExpression: `@${uniqueTestCaseIdentifier}`,
      },
    })
    const baseData = {
      title: value.title,
      description: value.description ?? '',
      TestSuite: {
        connect: value.testSuiteIds.map(id => ({ id })),
      },
      steps: {
        create: value.steps.map(step => ({
          gherkinStep: step.gherkinStep,
          label: step.label,
          icon: step.icon,
          parameters: {
            create: step.parameters.map(param => ({
              name: param.name,
              value: param.value,
              type: param.type as StepParameterType,
              order: param.order,
            })),
          },
          templateStepId: step.templateStepId,
          order: step.order,
        })),
      },
    }

    // Only include tags if there are tagIds provided
    const data =
      value.tagIds && value.tagIds.length > 0
        ? {
            ...baseData,
            tags: {
              connect: [{ id: testCaseIdentifierTag.id }, ...value.tagIds.map(id => ({ id }))],
            },
          }
        : {
            ...baseData,
            tags: {
              connect: [{ id: testCaseIdentifierTag.id }],
            },
          }

    const newTestCase = await prisma.testCase.create({
      data,
      include: {
        TestSuite: {
          include: {
            module: true,
          },
        },
      },
    })

    // Regenerate feature files for all related test suites
    for (const testSuite of newTestCase.TestSuite) {
      try {
        await generateFeatureFile(testSuite.id, testSuite.name, testSuite.description || undefined)
      } catch (featureFileError) {
        console.error(`Error regenerating feature file for test suite ${testSuite.name}:`, featureFileError)
        // Don't fail the creation if feature file regeneration fails
      }
    }

    revalidatePath('/test-cases')
    return {
      status: 200,
      message: 'Test case created successfully',
      data: newTestCase,
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}

/**
 * Get a test case by id
 * @param id - Test case id
 * @returns ActionResponse
 */
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
    return {
      status: 200,
      data: {
        ...testCase,
        testSuiteIds: testCase?.TestSuite.map(suite => suite.id),
        tagIds: testCase?.tags.map(tag => tag.id) || [],
      },
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}

export async function updateTestCaseAction(
  value: z.infer<typeof testCaseSchema>,
  id?: string,
): Promise<ActionResponse> {
  if (!id) {
    throw new Error("updateTestCaseAction: 'id' parameter is required for updating a test case.")
  }
  try {
    // Get the test suites that will be affected before updating
    const affectedTestSuites = await prisma.testSuite.findMany({
      where: {
        testCases: {
          some: {
            id: id,
          },
        },
      },
      include: {
        module: true,
      },
    })

    // 1. Find all step IDs for the test case
    const steps = await prisma.testCaseStep.findMany({
      where: { testCaseId: id },
      select: { id: true },
    })
    const stepIds = steps.map(step => step.id)

    // 2. Delete all parameters for those steps
    if (stepIds.length > 0) {
      await prisma.testCaseStepParameter.deleteMany({
        where: { testCaseStepId: { in: stepIds } },
      })
    }

    // 3. Delete all steps for the test case
    await prisma.testCaseStep.deleteMany({
      where: { testCaseId: id },
    })

    // 4. Get existing IDENTIFIER tags to preserve them
    const existingTestCase = await prisma.testCase.findUnique({
      where: { id },
      include: {
        tags: {
          where: {
            type: TagType.IDENTIFIER,
          },
          select: {
            id: true,
          },
        },
      },
    })

    // 5. Combine IDENTIFIER tags with FILTER tags from the form
    const identifierTagIds = existingTestCase?.tags.map(tag => tag.id) || []
    const filterTagIds = value.tagIds || []
    const allTagIds = [...identifierTagIds, ...filterTagIds]

    // 6. Then, update the test case with new steps
    const testCase = await prisma.testCase.update({
      where: { id },
      data: {
        title: value.title,
        description: value.description ?? '',
        tags: {
          set: allTagIds.map(id => ({ id })),
        },
        steps: {
          create: value.steps.map(step => ({
            gherkinStep: step.gherkinStep,
            label: step.label ?? '',
            icon: step.icon ?? '',
            parameters: {
              create: step.parameters.map(param => ({
                name: param.name,
                value: param.value,
                type: param.type as StepParameterType,
                order: param.order,
              })),
            },
            templateStepId: step.templateStepId,
            order: step.order,
          })),
        },
      },
      include: {
        steps: true,
      },
    })

    // Regenerate feature files for all affected test suites
    for (const testSuite of affectedTestSuites) {
      try {
        await generateFeatureFile(testSuite.id, testSuite.name, testSuite.description || undefined)
      } catch (featureFileError) {
        console.error(`Error regenerating feature file for test suite ${testSuite.name}:`, featureFileError)
        // Don't fail the update if feature file regeneration fails
      }
    }

    return {
      status: 200,
      message: 'Test case updated successfully',
      data: testCase,
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}
