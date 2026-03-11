'use server'

import prisma from '@/config/db-config'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { templateTestCaseSchema } from '@/constants/form-opts/template-test-case-form-opts'
import { StepParameterType } from '@prisma/client'
import { z } from 'zod'

/**
 * Get all template test cases
 * @returns ActionResponse
 */
export async function getAllTemplateTestCasesAction(): Promise<ActionResponse> {
  try {
    const templateTestCases = await prisma.templateTestCase.findMany({
      include: {
        steps: {
          include: {
            parameters: true,
          },
        },
      },
    })

    return {
      status: 200,
      data: templateTestCases,
    }
  } catch (e) {
    return {
      status: 500,
      message: `Server error occurred: ${e}`,
    }
  }
}

/**
 * Delete a template test case
 * @param id - Template test case id
 * @returns ActionResponse
 */
export async function deleteTemplateTestCaseAction(id: string[]): Promise<ActionResponse> {
  try {
    await prisma.$transaction(async tx => {
      // Delete all step parameters associated with the test case steps
      await tx.templateTestCaseStepParameter.deleteMany({
        where: {
          templateTestCaseStep: {
            templateTestCaseId: {
              in: id,
            },
          },
        },
      })

      // Delete all test case steps
      await tx.templateTestCaseStep.deleteMany({
        where: {
          templateTestCaseId: {
            in: id,
          },
        },
      })

      // Delete the test cases
      await tx.templateTestCase.deleteMany({
        where: { id: { in: id } },
      })
    })

    revalidatePath('/template-test-cases')
    return {
      status: 200,
      message: 'Template test case(s) deleted successfully',
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}

/**
 * Create a template test case
 * @param value - Template test case
 * @returns ActionResponse
 */
export async function createTemplateTestCaseAction(
  value: z.infer<typeof templateTestCaseSchema>,
): Promise<ActionResponse> {
  try {
    templateTestCaseSchema.parse(value)
    const newTemplateTestCase = await prisma.templateTestCase.create({
      data: {
        name: value.title,
        description: value.description ?? '',

        steps: {
          create: value.steps.map(step => ({
            gherkinStep: step.gherkinStep,
            label: step.label,
            icon: step.icon,
            parameters: {
              create: step.parameters.map(param => ({
                name: param.name,
                defaultValue: param.value,
                type: param.type as StepParameterType,
                order: param.order,
              })),
            },
            TemplateStep: {
              connect: {
                id: step.templateStepId,
              },
            },
            order: step.order,
          })),
        },
      },
    })
    revalidatePath('/template-test-cases')
    return {
      status: 200,
      message: 'Template test case created successfully',
      data: newTemplateTestCase,
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}

/**
 * Get a template test case by id
 * @param id - Template test case id
 * @returns ActionResponse
 */
export async function getTemplateTestCaseByIdAction(id: string): Promise<ActionResponse> {
  try {
    const templateTestCase = await prisma.templateTestCase.findUnique({
      where: { id },
      include: {
        steps: {
          include: {
            parameters: true,
          },
        },
      },
    })
    return {
      status: 200,
      data: templateTestCase,
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}

/**
 * Update a template test case
 * @param value - Template test case
 * @param id - Template test case id
 * @returns ActionResponse
 */
export async function updateTemplateTestCaseAction(
  value: z.infer<typeof templateTestCaseSchema>,
  id?: string,
): Promise<ActionResponse> {
  if (!id) {
    throw new Error("updateTemplateTestCaseAction: 'id' parameter is required for updating a template test case.")
  }
  try {
    // 1. Find all step IDs for the test case
    const steps = await prisma.templateTestCaseStep.findMany({
      where: { templateTestCaseId: id },
      select: { id: true },
    })
    const stepIds = steps.map(step => step.id)

    // 2. Delete all parameters for those steps
    if (stepIds.length > 0) {
      await prisma.templateTestCaseStepParameter.deleteMany({
        where: { templateTestCaseStep: { id: { in: stepIds } } },
      })
    }

    // 3. Delete all steps for the test case
    await prisma.templateTestCaseStep.deleteMany({
      where: { templateTestCaseId: id },
    })

    // 4. Then, update the test case with new steps
    const templateTestCase = await prisma.templateTestCase.update({
      where: { id },
      data: {
        name: value.title,
        description: value.description ?? '',
        steps: {
          create: value.steps.map(step => ({
            gherkinStep: step.gherkinStep,
            label: step.label ?? '',
            icon: step.icon ?? '',
            parameters: {
              create: step.parameters.map(param => ({
                name: param.name,
                defaultValue: param.value,
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
    return {
      status: 200,
      message: 'Template test case updated successfully',
      data: templateTestCase,
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}
