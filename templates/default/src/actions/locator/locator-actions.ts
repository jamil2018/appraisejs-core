'use server'

import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import {
  deleteLocators,
  getLocatorByIdOrThrow,
  listLocators,
  syncLocatorsFromFiles,
} from '@/services/locator/locator-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'

export async function getAllLocatorsAction(): Promise<ActionResponse> {
  try {
    const locators = await listLocators()
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
    const locator = await deleteLocators(ids)

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
    const locator = await getLocatorByIdOrThrow(id)
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

export async function syncLocatorsFromFilesAction(): Promise<ActionResponse> {
  try {
    const result = await syncLocatorsFromFiles()

    revalidatePath('/locators')

    return {
      status: 200,
      success: true,
      data: {
        locatorsCreated: result.locatorsCreated,
        locatorsMergedToFile: result.locatorsMergedToFile,
        conflicts: result.conflicts,
        errors: result.errors,
      },
      message: `Created ${result.locatorsCreated} locators, merged ${result.locatorsMergedToFile} into files, ${result.conflicts} conflicts detected`,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}
