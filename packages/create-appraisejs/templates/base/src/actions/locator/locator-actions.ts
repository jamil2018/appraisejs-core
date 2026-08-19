'use server'

import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { deleteLocators, getLocatorByIdOrThrow, listLocators } from '@/services/locator/locator-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import { requireActiveProjectForMutation } from '@/lib/active-project'

export async function getAllLocatorsAction(): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const locators = await listLocators(project.id)
    return {
      status: 200,
      success: true,
      data: locators,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function deleteLocatorAction(ids: string[]): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const locator = await deleteLocators(ids, project.id)

    revalidatePath('/locators')
    return {
      status: 200,
      success: true,
      data: locator,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getLocatorByIdAction(id: string): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const locator = await getLocatorByIdOrThrow(id, project.id)
    return {
      status: 200,
      success: true,
      data: locator,
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}
