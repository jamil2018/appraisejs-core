'use server'

import prisma from '@/config/db-config'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { testCaseSchema } from '@/constants/form-opts/test-case-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { z } from 'zod'
import { StepParameterType, TagType } from '@prisma/client'
import { generateUniqueTestCaseIdentifier } from '@/lib/test-case-utils'

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
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function deleteTestCaseAction(ids: string[]): Promise<ActionResponse> {
  try {
    const affectedTestSuites = await prisma.testSuite.findMany({
      where: {
        testCases: {
          some: {
            id: {
              in: ids,
            },
          },
        },
      },
      select: { id: true },
    })

    const testCaseIdentifierTags = await prisma.tag.findMany({
      where: {
        type: TagType.IDENTIFIER,
        testCases: {
          some: {
            id: {
              in: ids,
            },
          },
        },
      },
      select: {
        id: true,
      },
    })

    await prisma.$transaction(async tx => {
      await tx.testRunTestCase.deleteMany({
        where: {
          testCaseId: {
            in: ids,
          },
        },
      })

      await tx.review.deleteMany({
        where: {
          testCaseId: {
            in: ids,
          },
        },
      })

      await tx.linkedJiraTicket.deleteMany({
        where: {
          testCaseId: {
            in: ids,
          },
        },
      })

      await tx.testCaseStepParameter.deleteMany({
        where: {
          testCaseStep: {
            testCaseId: {
              in: ids,
            },
          },
        },
      })

      await tx.testCaseStep.deleteMany({
        where: {
          testCaseId: {
            in: ids,
          },
        },
      })

      await tx.tag.deleteMany({
        where: {
          id: { in: testCaseIdentifierTags.map(tag => tag.id) },
        },
      })

      await tx.testCase.deleteMany({
        where: { id: { in: ids } },
      })
    })

    await Promise.all(affectedTestSuites.map(testSuite => automationProjectionService.generateFeature(testSuite.id)))

    revalidatePath('/test-cases')
    return {
      status: 200,
      message: 'Test case(s) deleted successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

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
          select: {
            id: true,
          },
        },
      },
    })

    await Promise.all(newTestCase.TestSuite.map(testSuite => automationProjectionService.generateFeature(testSuite.id)))

    revalidatePath('/test-cases')
    return {
      status: 200,
      message: 'Test case created successfully',
      data: newTestCase,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
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
    return {
      status: 200,
      data: {
        ...testCase,
        testSuiteIds: testCase?.TestSuite.map(suite => suite.id),
        tagIds: testCase?.tags.map(tag => tag.id) || [],
      },
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
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
    const affectedTestSuites = await prisma.testSuite.findMany({
      where: {
        testCases: {
          some: {
            id,
          },
        },
      },
      select: {
        id: true,
      },
    })

    const steps = await prisma.testCaseStep.findMany({
      where: { testCaseId: id },
      select: { id: true },
    })
    const stepIds = steps.map(step => step.id)

    if (stepIds.length > 0) {
      await prisma.testCaseStepParameter.deleteMany({
        where: { testCaseStepId: { in: stepIds } },
      })
    }

    await prisma.testCaseStep.deleteMany({
      where: { testCaseId: id },
    })

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

    const identifierTagIds = existingTestCase?.tags.map(tag => tag.id) || []
    const filterTagIds = value.tagIds || []
    const allTagIds = [...identifierTagIds, ...filterTagIds]

    const testCase = await prisma.testCase.update({
      where: { id },
      data: {
        title: value.title,
        description: value.description ?? '',
        tags: {
          set: allTagIds.map(tagId => ({ id: tagId })),
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

    await Promise.all(affectedTestSuites.map(testSuite => automationProjectionService.generateFeature(testSuite.id)))

    return {
      status: 200,
      message: 'Test case updated successfully',
      data: testCase,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}
