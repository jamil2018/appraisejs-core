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

// TemplateStepGroupType helper - will be available from @prisma/client after migration
type TemplateStepGroupType = 'ACTION' | 'VALIDATION'

// Type helper to safely extract type from Prisma templateStepGroup records
type TemplateStepGroupWithType = {
  id: string
  name: string
  description: string | null
  type?: TemplateStepGroupType
  createdAt: Date
  updatedAt: Date
}

function getGroupTypeFromRelation(group: unknown): TemplateStepGroupType {
  const groupWithType = group as TemplateStepGroupWithType
  const type = groupWithType.type
  if (type === 'VALIDATION' || type === 'ACTION') {
    return type
  }
  return 'ACTION' // default
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

    // Delete in order: child records first. TemplateTestCaseStepParameter and
    // TestCaseStepParameter must be removed before TemplateTestCaseStep/TestCaseStep
    // (which are cascade-deleted from TemplateStep).
    await prisma.$transaction(async tx => {
      // Delete TemplateTestCaseStepParameter records first
      await tx.templateTestCaseStepParameter.deleteMany({
        where: {
          templateTestCaseStep: {
            templateStepId: { in: templateStepIds },
          },
        },
      })

      // Delete TestCaseStepParameter records
      await tx.testCaseStepParameter.deleteMany({
        where: {
          testCaseStep: {
            templateStepId: { in: templateStepIds },
          },
        },
      })

      // Delete the template step parameters
      await tx.templateStepParameter.deleteMany({
        where: {
          templateStepId: { in: templateStepIds },
        },
      })

      // Delete the template steps (this will cascade delete TemplateTestCaseStep and TestCaseStep)
      await tx.templateStep.deleteMany({
        where: {
          id: { in: templateStepIds },
        },
      })
    })

    // Remove the deleted steps from their respective group files
    for (const step of stepsToDelete) {
      if (step.templateStepGroup) {
        try {
          const groupType = getGroupTypeFromRelation(step.templateStepGroup)
          await removeTemplateStepFromFile(step.templateStepGroup.name, step, groupType)
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
        const groupType = getGroupTypeFromRelation(newTemplateStep.templateStepGroup)
        await addTemplateStepToFile(newTemplateStep.templateStepGroup.name, newTemplateStep, groupType)
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
          const oldGroupType = getGroupTypeFromRelation(currentStep.templateStepGroup)
          await removeTemplateStepFromFile(currentStep.templateStepGroup.name, currentStep, oldGroupType)
        }
        if (updatedTemplateStep.templateStepGroup) {
          const newGroupType = getGroupTypeFromRelation(updatedTemplateStep.templateStepGroup)
          await addTemplateStepToFile(updatedTemplateStep.templateStepGroup.name, updatedTemplateStep, newGroupType)
        }
      } else {
        // If group didn't change, just update the step in the current group
        if (updatedTemplateStep.templateStepGroup) {
          const groupType = getGroupTypeFromRelation(updatedTemplateStep.templateStepGroup)
          await updateTemplateStepInFile(
            updatedTemplateStep.templateStepGroup.name,
            updatedTemplateStep,
            groupType,
            currentStep,
          )
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
