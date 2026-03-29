'use server'

import { locatorSchema } from '@/constants/form-opts/locator-form-opts'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  createLocator,
  deleteLocators,
  getLocatorByIdOrThrow,
  listLocators,
  listUngroupedLocators,
  syncLocatorsFromFiles,
  updateLocator,
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

export async function createLocatorAction(
  _prev: unknown,
  value: z.infer<typeof locatorSchema>,
): Promise<ActionResponse> {
  try {
    locatorSchema.parse(value)
    const newLocator = await createLocator(value)

    revalidatePath('/locators')
    return {
      status: 200,
      success: true,
      data: newLocator,
      message: 'Locator created successfully',
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function updateLocatorAction(
  _prev: unknown,
  value: z.infer<typeof locatorSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    locatorSchema.parse(value)
    const updatedLocator = await updateLocator(id, value)

    revalidatePath('/locators')
    return {
      status: 200,
      success: true,
      data: updatedLocator,
      message: 'Locator updated successfully',
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
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

export async function getUngroupedLocatorsAction(): Promise<ActionResponse> {
  try {
    const locators = await listUngroupedLocators()
    return {
      status: 200,
      success: true,
      data: locators,
    }
  } catch (error) {
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
