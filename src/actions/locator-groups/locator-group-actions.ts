'use server'

import prisma from '@/config/db-config'
import { locatorGroupSchema } from '@/constants/form-opts/locator-group-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { getLocatorGroupFilePath, readLocatorGroupFile } from '@/lib/locator-group-file-utils'
import { unknownErrorToActionResponse } from '@/services/shared/errors'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Prisma } from '@prisma/client'

const locatorGroupInclude = {
  module: {
    select: { name: true },
  },
} as const

async function checkUniqueName(name: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.locatorGroup.findFirst({
    where: {
      name,
      ...(excludeId && { id: { not: excludeId } }),
    },
  })
  return !!existing
}

export async function getAllLocatorGroupsAction(): Promise<ActionResponse> {
  try {
    const locatorGroups = await prisma.locatorGroup.findMany({
      include: locatorGroupInclude,
    })

    return {
      status: 200,
      data: locatorGroups,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getLocatorGroupByIdAction(id: string): Promise<ActionResponse> {
  try {
    const locatorGroup = await prisma.locatorGroup.findUnique({
      where: { id },
      include: locatorGroupInclude,
    })

    return {
      status: 200,
      data: locatorGroup,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function createLocatorGroupAction(
  _prev: unknown,
  value: z.infer<typeof locatorGroupSchema>,
): Promise<ActionResponse> {
  try {
    const nameExists = await checkUniqueName(value.name)
    if (nameExists) {
      return {
        status: 400,
        error: 'A locator group with this name already exists. Please choose a different name.',
      }
    }

    const locatorGroup = await prisma.locatorGroup.create({
      data: {
        name: value.name,
        moduleId: value.moduleId,
        route: value.route ?? '/',
        locators: {
          connect: value.locators?.map(locator => ({ id: locator })) || [],
        },
      },
    })

    await automationProjectionService.createEmptyLocatorGroup(locatorGroup.id)
    await automationProjectionService.syncLocatorMap(value.name, value.route ?? '/')

    revalidatePath('/locator-groups')
    return {
      status: 200,
      data: locatorGroup,
      message: 'Locator group created successfully',
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return {
        status: 400,
        error: 'A locator group with this name already exists. Please choose a different name.',
      }
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
    const currentLocatorGroup = await prisma.locatorGroup.findUnique({
      where: { id },
      include: { module: true },
    })

    if (!currentLocatorGroup) {
      return {
        status: 404,
        error: 'Locator group not found',
      }
    }

    if (currentLocatorGroup.name !== value.name) {
      const nameExists = await checkUniqueName(value.name, id)
      if (nameExists) {
        return {
          status: 400,
          error: 'A locator group with this name already exists. Please choose a different name.',
        }
      }
    }

    const previousFilePath = await getLocatorGroupFilePath(id!)
    const locatorConnections = value.locators?.map(locator => ({ id: locator })) ?? []

    const updatedLocatorGroup = await prisma.locatorGroup.update({
      where: { id },
      data: {
        name: value.name,
        moduleId: value.moduleId,
        route: value.route,
        ...(value.locators !== undefined && {
          locators: {
            set: locatorConnections,
          },
        }),
      },
      include: locatorGroupInclude,
    })

    const nameChanged = currentLocatorGroup.name !== value.name
    const moduleChanged = currentLocatorGroup.moduleId !== value.moduleId
    const routeChanged = currentLocatorGroup.route !== value.route

    if (moduleChanged) {
      await automationProjectionService.moveLocatorGroup(id!, previousFilePath ?? undefined)
    } else if (nameChanged) {
      await automationProjectionService.renameLocatorGroup(id!, value.name, currentLocatorGroup.name)
    } else {
      await automationProjectionService.syncLocatorGroup(id!)
    }

    if (routeChanged || nameChanged) {
      await automationProjectionService.syncLocatorMap(
        currentLocatorGroup.route,
        value.route ?? '/',
        currentLocatorGroup.name,
        value.name,
      )
    }

    revalidatePath('/locator-groups')
    return {
      status: 200,
      data: updatedLocatorGroup,
      message: 'Locator group updated successfully',
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return {
        status: 400,
        error: 'A locator group with this name already exists. Please choose a different name.',
      }
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function deleteLocatorGroupAction(ids: string[]): Promise<ActionResponse> {
  try {
    const locatorGroupsToDelete = await prisma.locatorGroup.findMany({
      where: { id: { in: ids } },
      select: { name: true },
    })

    await automationProjectionService.deleteLocatorMapEntries(locatorGroupsToDelete.map(group => group.name))
    await Promise.all(ids.map(id => automationProjectionService.deleteLocatorGroup(id)))

    await prisma.locatorGroup.deleteMany({
      where: { id: { in: ids } },
    })

    revalidatePath('/locator-groups')
    return {
      status: 200,
      data: ids,
      message: `${ids.length} locator group(s) deleted successfully`,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getLocatorGroupFileContentAction(locatorGroupId: string): Promise<ActionResponse> {
  try {
    const fileData = await readLocatorGroupFile(locatorGroupId)

    if (!fileData) {
      return {
        status: 404,
        error: 'Locator group not found or file path could not be determined',
      }
    }

    return {
      status: 200,
      data: fileData,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function checkLocatorGroupNameUniqueAction(name: string, excludeId?: string): Promise<ActionResponse> {
  try {
    const nameExists = await checkUniqueName(name, excludeId)
    return {
      status: 200,
      data: { isUnique: !nameExists },
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function regenerateAllLocatorGroupFilesAction(): Promise<ActionResponse> {
  try {
    const locatorGroups = await prisma.locatorGroup.findMany({
      select: { id: true },
    })

    const results = await Promise.allSettled(
      locatorGroups.map(locatorGroup => automationProjectionService.syncLocatorGroup(locatorGroup.id)),
    )

    const successCount = results.filter(result => result.status === 'fulfilled' && result.value).length
    const errorCount = results.length - successCount

    return {
      status: 200,
      data: {
        total: locatorGroups.length,
        success: successCount,
        errors: errorCount,
      },
      message: `Regenerated ${successCount} files successfully. ${errorCount} errors encountered.`,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}
