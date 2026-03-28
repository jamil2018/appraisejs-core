'use server'

import prisma from '@/config/db-config'
import { locatorSchema } from '@/constants/form-opts/locator-form-opts'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { syncLocatorsFromFiles, updateLocatorGroupFile } from '@/services/locator/locator-service'
import { unknownErrorToActionResponse } from '@/services/shared/errors'

export async function getAllLocatorsAction(): Promise<ActionResponse> {
  try {
    const locators = await prisma.locator.findMany({
      include: {
        locatorGroup: {
          select: {
            name: true,
          },
        },
        conflicts: {
          where: {
            resolved: false,
          },
        },
      },
    })
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
    const locatorsToDelete = await prisma.locator.findMany({
      where: { id: { in: ids } },
      select: { locatorGroupId: true },
    })

    const locatorGroupIds = [...new Set(locatorsToDelete.map(locator => locator.locatorGroupId).filter(Boolean))]

    const locator = await prisma.locator.deleteMany({
      where: { id: { in: ids } },
    })

    await Promise.all(locatorGroupIds.map(groupId => updateLocatorGroupFile(groupId)))

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

    const newLocator = await prisma.locator.create({
      data: {
        name: value.name,
        value: value.value,
        locatorGroupId: value.locatorGroupId,
      },
      include: {
        locatorGroup: {
          select: {
            name: true,
          },
        },
      },
    })

    if (value.locatorGroupId) {
      await updateLocatorGroupFile(value.locatorGroupId)
    }

    revalidatePath('/locators')
    return {
      status: 200,
      success: true,
      data: newLocator,
      message: 'Locator created successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function updateLocatorAction(
  _prev: unknown,
  value: z.infer<typeof locatorSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    const currentLocator = await prisma.locator.findUnique({
      where: { id },
      select: { locatorGroupId: true },
    })

    const updatedLocator = await prisma.locator.update({
      where: { id },
      data: {
        name: value.name,
        value: value.value,
        locatorGroupId: value.locatorGroupId,
      },
      include: {
        locatorGroup: {
          select: {
            name: true,
          },
        },
      },
    })

    const groupsToUpdate = new Set<string>()

    if (currentLocator?.locatorGroupId !== value.locatorGroupId) {
      if (currentLocator?.locatorGroupId) {
        groupsToUpdate.add(currentLocator.locatorGroupId)
      }
      if (value.locatorGroupId) {
        groupsToUpdate.add(value.locatorGroupId)
      }
    } else if (value.locatorGroupId) {
      groupsToUpdate.add(value.locatorGroupId)
    }

    await Promise.all(Array.from(groupsToUpdate).map(groupId => updateLocatorGroupFile(groupId)))

    revalidatePath('/locators')
    return {
      status: 200,
      success: true,
      data: updatedLocator,
      message: 'Locator updated successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getLocatorByIdAction(id: string): Promise<ActionResponse> {
  try {
    const locator = await prisma.locator.findUnique({
      where: { id },
      include: {
        locatorGroup: {
          select: {
            name: true,
          },
        },
      },
    })
    if (!locator) {
      return {
        status: 404,
        success: false,
        error: 'Locator not found',
      }
    }
    return {
      status: 200,
      success: true,
      data: locator,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getUngroupedLocatorsAction(): Promise<ActionResponse> {
  try {
    const locators = await prisma.locator.findMany({
      where: {
        locatorGroupId: null,
      },
      select: {
        id: true,
        name: true,
        value: true,
      },
    })
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
