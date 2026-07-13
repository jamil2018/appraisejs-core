'use server'

import { environmentSchema } from '@/constants/form-opts/environment-form-opts'
import {
  createEnvironment,
  deleteEnvironments,
  getEnvironmentByIdOrThrow,
  listEnvironments,
  updateEnvironment,
} from '@/services/environment/environment-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireActiveProjectForMutation } from '@/lib/active-project'

export async function getAllEnvironmentsAction(): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const environments = await listEnvironments(project.id)
    return {
      status: 200,
      success: true,
      data: environments,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function deleteEnvironmentAction(ids: string[]): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    await deleteEnvironments(ids, project.id)
    revalidatePath('/environments')
    return {
      status: 200,
      success: true,
      message: 'Environments deleted successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function createEnvironmentAction(
  _prev: unknown,
  value: z.infer<typeof environmentSchema>,
): Promise<ActionResponse> {
  try {
    environmentSchema.parse(value)
    const project = await requireActiveProjectForMutation()
    const newEnvironment = await createEnvironment(value, project.id)
    revalidatePath('/environments')
    return {
      status: 200,
      success: true,
      data: newEnvironment,
      message: 'Environment created successfully',
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function getEnvironmentByIdAction(id: string): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const environmentData = await getEnvironmentByIdOrThrow(id, project.id)
    return {
      status: 200,
      success: true,
      data: environmentData,
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function updateEnvironmentAction(
  _prev: unknown,
  value: z.infer<typeof environmentSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    environmentSchema.parse(value)
    const project = await requireActiveProjectForMutation()
    const updatedEnvironment = await updateEnvironment(id, value, project.id)
    revalidatePath('/environments')
    return {
      status: 200,
      success: true,
      data: updatedEnvironment,
      message: 'Environment updated successfully',
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}
