'use server'

import { locatorGroupSchema } from '@/constants/form-opts/locator-group-form-opts'
import {
  checkLocatorGroupNameUnique,
  createLocatorGroup,
  deleteLocatorGroups,
  getLocatorGroupByIdOrThrow,
  listLocatorGroups,
  updateLocatorGroup,
} from '@/services/locator-group/locator-group-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export async function getAllLocatorGroupsAction(): Promise<ActionResponse> {
  try {
    const locatorGroups = await listLocatorGroups()
    return {
      status: 200,
      success: true,
      data: locatorGroups,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getLocatorGroupByIdAction(id: string): Promise<ActionResponse> {
  try {
    const locatorGroup = await getLocatorGroupByIdOrThrow(id)
    return {
      status: 200,
      success: true,
      data: locatorGroup,
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function createLocatorGroupAction(
  _prev: unknown,
  value: z.infer<typeof locatorGroupSchema>,
): Promise<ActionResponse> {
  try {
    const locatorGroup = await createLocatorGroup(value)
    revalidatePath('/locator-groups')
    return {
      status: 200,
      success: true,
      data: locatorGroup,
      message: 'Locator group created successfully',
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function updateLocatorGroupAction(
  _prev: unknown,
  value: z.infer<typeof locatorGroupSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    const updatedLocatorGroup = await updateLocatorGroup(id, value)
    revalidatePath('/locator-groups')
    return {
      status: 200,
      success: true,
      data: updatedLocatorGroup,
      message: 'Locator group updated successfully',
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function deleteLocatorGroupAction(ids: string[]): Promise<ActionResponse> {
  try {
    await deleteLocatorGroups(ids)
    revalidatePath('/locator-groups')
    return {
      status: 200,
      success: true,
      data: ids,
      message: `${ids.length} locator group(s) deleted successfully`,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function checkLocatorGroupNameUniqueAction(name: string, excludeId?: string): Promise<ActionResponse> {
  try {
    const isUnique = await checkLocatorGroupNameUnique(name, excludeId)
    return {
      status: 200,
      success: true,
      data: { isUnique },
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}
