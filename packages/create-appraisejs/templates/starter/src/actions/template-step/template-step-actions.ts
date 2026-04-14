'use server'

import { templateStepSchema } from '@/constants/form-opts/template-test-step-form-opts'
import {
  createTemplateStep,
  deleteTemplateSteps,
  getTemplateStepByIdOrThrow,
  listAllTemplateStepParameters,
  listTemplateSteps,
  updateTemplateStep,
} from '@/services/template-step/template-step-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export async function getAllTemplateStepsAction(): Promise<ActionResponse> {
  try {
    const templateSteps = await listTemplateSteps()
    return {
      status: 200,
      success: true,
      data: templateSteps,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function deleteTemplateStepAction(templateStepIds: string[]): Promise<ActionResponse> {
  try {
    await deleteTemplateSteps(templateStepIds)
    revalidatePath('/template-steps')
    return {
      status: 200,
      success: true,
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
    const newTemplateStep = await createTemplateStep(value)
    revalidatePath('/template-steps')
    return {
      status: 200,
      success: true,
      message: 'Template step created successfully',
      data: newTemplateStep,
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function updateTemplateStepAction(
  _prev: unknown,
  value: z.infer<typeof templateStepSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    const updatedTemplateStep = await updateTemplateStep(id, value)
    revalidatePath('/template-steps')
    return {
      status: 200,
      success: true,
      message: 'Template step updated successfully',
      data: updatedTemplateStep,
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function getTemplateStepByIdAction(id: string): Promise<ActionResponse> {
  try {
    const templateStep = await getTemplateStepByIdOrThrow(id)
    return {
      status: 200,
      success: true,
      data: templateStep,
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function getAllTemplateStepParamsAction(): Promise<ActionResponse> {
  try {
    const templateStepParams = await listAllTemplateStepParameters()
    return {
      status: 200,
      success: true,
      data: templateStepParams,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}
