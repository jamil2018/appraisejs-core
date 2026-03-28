'use server'

import prisma from '@/config/db-config'
import { templateStepGroupSchema } from '@/constants/form-opts/template-step-group-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { ActionResponse } from '@/types/form/actionHandler'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z, ZodError } from 'zod'
import { unknownErrorToActionResponse } from '@/services/shared/errors'

type TemplateStepGroupType = 'ACTION' | 'VALIDATION'

function getGroupType(group: unknown): TemplateStepGroupType {
  const type = (group as { type?: TemplateStepGroupType }).type
  return type === 'VALIDATION' ? 'VALIDATION' : 'ACTION'
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

export async function getAllTemplateStepGroupsAction(): Promise<ActionResponse> {
  try {
    const templateStepGroups = await prisma.templateStepGroup.findMany()
    return {
      status: 200,
      success: true,
      data: templateStepGroups,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function createTemplateStepGroupAction(
  _prev: unknown,
  value: z.infer<typeof templateStepGroupSchema>,
): Promise<ActionResponse> {
  try {
    templateStepGroupSchema.parse(value)

    const type: TemplateStepGroupType = (value.type as string) === 'VALIDATION' ? 'VALIDATION' : 'ACTION'
    const description = normalizeOptionalText(value.description)
    const createdGroup = await prisma.templateStepGroup.create({
      data: {
        name: value.name,
        description,
        type,
      } as Parameters<typeof prisma.templateStepGroup.create>[0]['data'],
    })

    await automationProjectionService.syncTemplateStepGroup(createdGroup.id)

    revalidatePath('/template-step-groups')
    return {
      status: 200,
      success: true,
      message: 'Template step group created successfully',
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
    return unknownErrorToActionResponse(error)
  }
}

export async function deleteTemplateStepGroupAction(ids: string[]): Promise<ActionResponse> {
  try {
    await Promise.all(ids.map(id => automationProjectionService.deleteTemplateStepGroup(id)))

    await prisma.templateStepGroup.deleteMany({
      where: { id: { in: ids } },
    })

    revalidatePath('/template-step-groups')
    return {
      status: 200,
      success: true,
      message: 'Template step group(s) deleted successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getTemplateStepGroupByIdAction(id: string): Promise<ActionResponse> {
  try {
    const templateStepGroup = await prisma.templateStepGroup.findUnique({
      where: { id },
    })
    if (!templateStepGroup) {
      return {
        status: 404,
        success: false,
        error: 'Template step group not found',
      }
    }
    return {
      status: 200,
      success: true,
      data: templateStepGroup,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function updateTemplateStepGroupAction(
  _prev: unknown,
  value: z.infer<typeof templateStepGroupSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    templateStepGroupSchema.parse(value)

    if (!id) {
      return {
        status: 400,
        success: false,
        error: 'Template step group ID is required',
      }
    }

    const currentGroup = await prisma.templateStepGroup.findUnique({
      where: { id },
    })

    if (!currentGroup) {
      return {
        status: 404,
        success: false,
        error: 'Template step group not found',
      }
    }

    const newType: TemplateStepGroupType = (value.type as string) === 'VALIDATION' ? 'VALIDATION' : 'ACTION'
    const currentType = getGroupType(currentGroup)
    const description = normalizeOptionalText(value.description)

    if (currentGroup.name !== value.name || currentType !== newType) {
      await automationProjectionService.renameTemplateStepGroup(id, value.name, newType, description)
    }

    await prisma.templateStepGroup.update({
      where: { id },
      data: {
        name: value.name,
        description,
        type: newType,
      } as Parameters<typeof prisma.templateStepGroup.update>[0]['data'],
    })

    await automationProjectionService.syncTemplateStepGroup(id)

    revalidatePath('/template-step-groups')
    return {
      status: 200,
      success: true,
      message: 'Template step group updated successfully',
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
    return unknownErrorToActionResponse(error)
  }
}
