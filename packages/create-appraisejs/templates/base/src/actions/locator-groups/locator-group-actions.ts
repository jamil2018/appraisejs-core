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
import { requireActiveProjectForMutation } from '@/lib/active-project'

export async function getAllLocatorGroupsAction(): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const locatorGroups = await listLocatorGroups(project.id)
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
    const project = await requireActiveProjectForMutation()
    const locatorGroup = await getLocatorGroupByIdOrThrow(id, project.id)
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
    const project = await requireActiveProjectForMutation()
    const locatorGroup = await createLocatorGroup(value, project.id)
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
    const project = await requireActiveProjectForMutation()
    const updatedLocatorGroup = await updateLocatorGroup(id, value, project.id)
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
    const project = await requireActiveProjectForMutation()
    await deleteLocatorGroups(ids, project.id)
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
    const project = await requireActiveProjectForMutation()
    const isUnique = await checkLocatorGroupNameUnique(name, project.id, excludeId)
    return {
      status: 200,
      success: true,
      data: { isUnique },
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}
