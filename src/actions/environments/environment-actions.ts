'use server'

import { environmentSchema } from '@/constants/form-opts/environment-form-opts'
import {
  checkEnvironmentNameUnique,
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

export async function getAllEnvironmentsAction(): Promise<ActionResponse> {
  try {
    const environments = await listEnvironments()
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
    await deleteEnvironments(ids)
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
    const newEnvironment = await createEnvironment(value)
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
    const environmentData = await getEnvironmentByIdOrThrow(id)
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
    const updatedEnvironment = await updateEnvironment(id, value)
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

export async function checkEnvironmentNameUniqueAction(name: string, excludeId?: string): Promise<ActionResponse> {
  try {
    const isUnique = await checkEnvironmentNameUnique(name, excludeId)
    return {
      status: 200,
      success: true,
      data: { isUnique },
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}
