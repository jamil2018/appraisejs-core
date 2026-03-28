'use server'

import prisma from '@/config/db-config'
import { templateStepSchema } from '@/constants/form-opts/template-test-step-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { ActionResponse } from '@/types/form/actionHandler'
import { StepParameterType, TemplateStepIcon, TemplateStepType } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import prettier from 'prettier'
import { z } from 'zod'
import { unknownErrorToActionResponse } from '@/services/shared/errors'

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

async function normalizeFunctionDefinition(functionDefinition: string | null | undefined): Promise<string> {
  const source = functionDefinition?.trim()
  if (!source) {
    return ''
  }

  try {
    return (
      await prettier.format(source, {
        parser: 'typescript',
        semi: true,
        singleQuote: true,
        trailingComma: 'es5',
        printWidth: 80,
        tabWidth: 2,
      })
    ).trim()
  } catch {
    return source
  }
}

export async function getAllTemplateStepsAction(): Promise<ActionResponse> {
  try {
    const templateSteps = await prisma.templateStep.findMany({
      include: {
        parameters: {
          select: {
            id: true,
            name: true,
          },
        },
        templateStepGroup: true,
      },
    })
    return {
      status: 200,
      data: templateSteps,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function deleteTemplateStepAction(templateStepIds: string[]): Promise<ActionResponse> {
  try {
    const stepsToDelete = await prisma.templateStep.findMany({
      where: { id: { in: templateStepIds } },
      select: {
        templateStepGroupId: true,
      },
    })

    await prisma.$transaction(async tx => {
      await tx.templateTestCaseStepParameter.deleteMany({
        where: {
          templateTestCaseStep: {
            templateStepId: { in: templateStepIds },
          },
        },
      })

      await tx.testCaseStepParameter.deleteMany({
        where: {
          testCaseStep: {
            templateStepId: { in: templateStepIds },
          },
        },
      })

      await tx.templateStepParameter.deleteMany({
        where: {
          templateStepId: { in: templateStepIds },
        },
      })

      await tx.templateStep.deleteMany({
        where: {
          id: { in: templateStepIds },
        },
      })
    })

    const affectedGroupIds = [...new Set(stepsToDelete.map(step => step.templateStepGroupId))]
    await Promise.all(affectedGroupIds.map(groupId => automationProjectionService.syncTemplateStepGroup(groupId)))

    revalidatePath('/template-steps')
    return {
      status: 200,
      message: 'Template steps deleted successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function createTemplateStepAction(
  _prev: unknown,
  value: z.infer<typeof templateStepSchema>,
): Promise<ActionResponse> {
  try {
    const description = normalizeOptionalText(value.description)
    const functionDefinition = await normalizeFunctionDefinition(value.functionDefinition)

    const newTemplateStep = await prisma.templateStep.create({
      data: {
        name: value.name,
        type: value.type as TemplateStepType,
        signature: value.signature,
        description,
        functionDefinition,
        parameters: {
          create: value.params.map(param => ({
            name: param.name,
            type: param.type as StepParameterType,
            order: param.order,
          })),
        },
        icon: value.icon as TemplateStepIcon,
        templateStepGroup: {
          connect: {
            id: value.templateStepGroupId,
          },
        },
      },
    })

    await automationProjectionService.syncTemplateStepGroup(newTemplateStep.templateStepGroupId)

    revalidatePath('/template-steps')

    return {
      status: 200,
      message: 'Template step created successfully',
      data: newTemplateStep,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function updateTemplateStepAction(
  _prev: unknown,
  value: z.infer<typeof templateStepSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    if (!id) {
      return {
        status: 400,
        error: 'Template step ID is required',
      }
    }

    const currentStep = await prisma.templateStep.findUnique({
      where: { id },
      select: {
        templateStepGroupId: true,
      },
    })

    if (!currentStep) {
      return {
        status: 404,
        error: 'Template step not found',
      }
    }

    const description = normalizeOptionalText(value.description)
    const functionDefinition = await normalizeFunctionDefinition(value.functionDefinition)

    const updatedTemplateStep = await prisma.templateStep.update({
      where: { id },
      data: {
        name: value.name,
        type: value.type as TemplateStepType,
        signature: value.signature,
        description,
        functionDefinition,
        parameters: {
          deleteMany: {
            templateStepId: id,
          },
          create: value.params.map(param => ({
            name: param.name,
            type: param.type as StepParameterType,
            order: param.order,
          })),
        },
        icon: value.icon as TemplateStepIcon,
        templateStepGroup: {
          connect: {
            id: value.templateStepGroupId,
          },
        },
      },
    })

    const affectedGroupIds = new Set([currentStep.templateStepGroupId, updatedTemplateStep.templateStepGroupId])
    await Promise.all(Array.from(affectedGroupIds).map(groupId => automationProjectionService.syncTemplateStepGroup(groupId)))

    revalidatePath('/template-steps')
    return {
      status: 200,
      message: 'Template step updated successfully',
      data: updatedTemplateStep,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getTemplateStepByIdAction(id: string): Promise<ActionResponse> {
  try {
    const templateStep = await prisma.templateStep.findUnique({
      where: { id },
      include: {
        parameters: true,
        templateStepGroup: true,
      },
    })
    return {
      status: 200,
      data: templateStep,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getAllTemplateStepParamsAction(): Promise<ActionResponse> {
  try {
    const templateStepParams = await prisma.templateStepParameter.findMany({})
    return {
      status: 200,
      data: templateStepParams,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}
