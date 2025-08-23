'use server'

import prisma from '@/config/db-config'
import { templateStepSchema } from '@/constants/form-opts/template-test-step-form-opts'
import { ActionResponse } from '@/types/form/actionHandler'
import { StepParameterType, TemplateStepIcon, TemplateStepType } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  addTemplateStepToFile,
  removeTemplateStepFromFile,
  updateTemplateStepInFile,
} from '@/lib/utils/template-step-file-manager-intelligent'

export async function getAllTemplateStepsAction(): Promise<ActionResponse> {
  try {
    const templateSteps = await prisma.templateStep.findMany({
      include: {
        parameters: {
          select: {
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
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function deleteTemplateStepAction(templateStepIds: string[]): Promise<ActionResponse> {
  try {
    // Get the template steps with their group info before deletion
    const stepsToDelete = await prisma.templateStep.findMany({
      where: { id: { in: templateStepIds } },
      include: {
        templateStepGroup: true,
      },
    })

    // Delete the template step parameters first
    await prisma.templateStepParameter.deleteMany({
      where: {
        templateStepId: { in: templateStepIds },
      },
    })

    // Delete the template steps
    await prisma.templateStep.deleteMany({
      where: {
        id: { in: templateStepIds },
      },
    })

    // Remove the deleted steps from their respective group files
    for (const step of stepsToDelete) {
      if (step.templateStepGroup) {
        try {
          await removeTemplateStepFromFile(step.templateStepGroup.name, step)
        } catch (fileError) {
          console.error(`Failed to remove step from file for group "${step.templateStepGroup.name}":`, fileError)
          // Don't fail the entire operation if file update fails
        }
      }
    }

    revalidatePath('/template-steps')
    return {
      status: 200,
      message: 'Template steps deleted successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function createTemplateStepAction(
  _prev: unknown,
  value: z.infer<typeof templateStepSchema>,
): Promise<ActionResponse> {
  try {
    // First, try to create the template step
    const newTemplateStep = await prisma.templateStep.create({
      data: {
        name: value.name,
        type: value.type as TemplateStepType,
        signature: value.signature,
        description: value.description || '',
        functionDefinition: value.functionDefinition || '',
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
      include: {
        templateStepGroup: true,
      },
    })

    // If database creation succeeds, add the step to the group's file
    if (newTemplateStep.templateStepGroup) {
      try {
        await addTemplateStepToFile(newTemplateStep.templateStepGroup.name, newTemplateStep)
      } catch (fileError) {
        console.error(`Failed to add step to file after creating template step:`, fileError)
        // Don't fail the entire operation if file update fails
      }
    }

    revalidatePath('/template-steps')

    return {
      status: 200,
      message: 'Template step created successfully',
      data: newTemplateStep,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
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

    // Get the current template step to check if group changed
    const currentStep = await prisma.templateStep.findUnique({
      where: { id },
      include: {
        templateStepGroup: true,
      },
    })

    if (!currentStep) {
      return {
        status: 404,
        error: 'Template step not found',
      }
    }

    // Check if the group changed
    const groupChanged = currentStep.templateStepGroupId !== value.templateStepGroupId

    // Update the template step
    const updatedTemplateStep = await prisma.templateStep.update({
      where: { id },
      data: {
        name: value.name,
        type: value.type as TemplateStepType,
        signature: value.signature,
        description: value.description || '',
        functionDefinition: value.functionDefinition || '',
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
      include: {
        templateStepGroup: true,
      },
    })

    // Update files for affected groups
    try {
      if (groupChanged) {
        // If group changed, remove from old group and add to new group
        if (currentStep.templateStepGroup) {
          await removeTemplateStepFromFile(currentStep.templateStepGroup.name, currentStep)
        }
        if (updatedTemplateStep.templateStepGroup) {
          await addTemplateStepToFile(updatedTemplateStep.templateStepGroup.name, updatedTemplateStep)
        }
      } else {
        // If group didn't change, just update the step in the current group
        if (updatedTemplateStep.templateStepGroup) {
          await updateTemplateStepInFile(updatedTemplateStep.templateStepGroup.name, updatedTemplateStep, currentStep)
        }
      }
    } catch (fileError) {
      console.error(`Failed to update file after updating template step:`, fileError)
      // Don't fail the entire operation if file update fails
    }

    revalidatePath('/template-steps')
    return {
      status: 200,
      message: 'Template step updated successfully',
      data: updatedTemplateStep,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
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
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
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
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}
