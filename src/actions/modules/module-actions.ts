'use server'

import { moduleSchema } from '@/constants/form-opts/module-form-opts'
import {
  createModule,
  deleteModules,
  getModuleByIdOrThrow,
  listModules,
  updateModule,
} from '@/services/module/module-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireActiveProjectForMutation } from '@/lib/active-project'

export async function getAllModulesAction(): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const modules = await listModules(project.id)
    return {
      status: 200,
      success: true,
      data: modules,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function deleteModuleAction(ids: string[]): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    await deleteModules(ids, project.id)
    revalidatePath('/modules')
    return {
      status: 200,
      success: true,
      message: 'Modules deleted successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function createModuleAction(_prev: unknown, value: z.infer<typeof moduleSchema>): Promise<ActionResponse> {
  try {
    moduleSchema.parse(value)
    const project = await requireActiveProjectForMutation()
    const newModule = await createModule(value, project.id)
    revalidatePath('/modules')
    return {
      status: 200,
      success: true,
      data: newModule,
      message: 'Module created successfully',
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function getModuleByIdAction(id: string): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const moduleData = await getModuleByIdOrThrow(id, project.id)
    return {
      status: 200,
      success: true,
      data: moduleData,
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function updateModuleAction(
  _prev: unknown,
  value: z.infer<typeof moduleSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    moduleSchema.parse(value)
    const project = await requireActiveProjectForMutation()
    const updatedModule = await updateModule(id, value, project.id)
    revalidatePath('/modules')
    return {
      status: 200,
      success: true,
      data: updatedModule,
      message: 'Module updated successfully',
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}
