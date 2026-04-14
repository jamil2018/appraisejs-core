'use server'

import { templateStepGroupSchema } from '@/constants/form-opts/template-step-group-form-opts'
import {
  createTemplateStepGroup,
  deleteTemplateStepGroups,
  getTemplateStepGroupByIdOrThrow,
  listTemplateStepGroups,
  updateTemplateStepGroup,
} from '@/services/template-step-group/template-step-group-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z, ZodError } from 'zod'
import { Prisma } from '@prisma/client'

export async function getAllTemplateStepGroupsAction(): Promise<ActionResponse> {
  try {
    const templateStepGroups = await listTemplateStepGroups()
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
    await createTemplateStepGroup(value)
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
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function deleteTemplateStepGroupAction(ids: string[]): Promise<ActionResponse> {
  try {
    await deleteTemplateStepGroups(ids)
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
    const templateStepGroup = await getTemplateStepGroupByIdOrThrow(id)
    return {
      status: 200,
      success: true,
      data: templateStepGroup,
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
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
    await updateTemplateStepGroup(id, value)
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
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}
