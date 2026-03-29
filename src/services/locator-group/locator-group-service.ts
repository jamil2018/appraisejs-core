import prisma from '@/config/db-config'
import { locatorGroupSchema } from '@/constants/form-opts/locator-group-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { getLocatorGroupFilePath, readLocatorGroupFile } from '@/lib/locator-group-file-utils'
import { ServiceError } from '@/services/shared/errors'
import type { LocatorGroup } from '@prisma/client'
import { Prisma } from '@prisma/client'
import type { z } from 'zod'

const locatorGroupInclude = {
  module: {
    select: { name: true },
  },
} as const

export type LocatorGroupWithModule = Prisma.LocatorGroupGetPayload<{ include: typeof locatorGroupInclude }>

async function checkUniqueName(name: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.locatorGroup.findFirst({
    where: {
      name,
      ...(excludeId && { id: { not: excludeId } }),
    },
  })
  return !!existing
}

export async function listLocatorGroups(): Promise<LocatorGroupWithModule[]> {
  return prisma.locatorGroup.findMany({
    include: locatorGroupInclude,
  })
}

export async function getLocatorGroupByIdOrThrow(id: string): Promise<LocatorGroupWithModule> {
  const locatorGroup = await prisma.locatorGroup.findUnique({
    where: { id },
    include: locatorGroupInclude,
  })
  if (!locatorGroup) {
    throw new ServiceError('Locator group not found', 'NOT_FOUND', 404)
  }
  return locatorGroup
}

export async function createLocatorGroup(value: z.infer<typeof locatorGroupSchema>): Promise<LocatorGroup> {
  const nameExists = await checkUniqueName(value.name)
  if (nameExists) {
    throw new ServiceError(
      'A locator group with this name already exists. Please choose a different name.',
      'VALIDATION',
      400,
    )
  }

  try {
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
    return locatorGroup
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ServiceError(
        'A locator group with this name already exists. Please choose a different name.',
        'VALIDATION',
        400,
      )
    }
    throw error
  }
}

export async function updateLocatorGroup(
  id: string | undefined,
  value: z.infer<typeof locatorGroupSchema>,
): Promise<LocatorGroupWithModule> {
  if (!id) {
    throw new ServiceError('Locator group id is required', 'VALIDATION', 400)
  }

  const currentLocatorGroup = await prisma.locatorGroup.findUnique({
    where: { id },
    include: { module: true },
  })

  if (!currentLocatorGroup) {
    throw new ServiceError('Locator group not found', 'NOT_FOUND', 404)
  }

  if (currentLocatorGroup.name !== value.name) {
    const nameExists = await checkUniqueName(value.name, id)
    if (nameExists) {
      throw new ServiceError(
        'A locator group with this name already exists. Please choose a different name.',
        'VALIDATION',
        400,
      )
    }
  }

  const previousFilePath = await getLocatorGroupFilePath(id)
  const locatorConnections = value.locators?.map(locator => ({ id: locator })) ?? []

  try {
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
      await automationProjectionService.moveLocatorGroup(id, previousFilePath ?? undefined)
    } else if (nameChanged) {
      await automationProjectionService.renameLocatorGroup(id, value.name, currentLocatorGroup.name)
    } else {
      await automationProjectionService.syncLocatorGroup(id)
    }

    if (routeChanged || nameChanged) {
      await automationProjectionService.syncLocatorMap(
        currentLocatorGroup.route,
        value.route ?? '/',
        currentLocatorGroup.name,
        value.name,
      )
    }

    return updatedLocatorGroup
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ServiceError(
        'A locator group with this name already exists. Please choose a different name.',
        'VALIDATION',
        400,
      )
    }
    throw error
  }
}

export async function deleteLocatorGroups(ids: string[]): Promise<string[]> {
  const locatorGroupsToDelete = await prisma.locatorGroup.findMany({
    where: { id: { in: ids } },
    select: { name: true },
  })

  await automationProjectionService.deleteLocatorMapEntries(locatorGroupsToDelete.map(group => group.name))
  await Promise.all(ids.map(id => automationProjectionService.deleteLocatorGroup(id)))

  await prisma.locatorGroup.deleteMany({
    where: { id: { in: ids } },
  })
  return ids
}

export async function readLocatorGroupFileContent(
  locatorGroupId: string,
): Promise<{ filePath: string; content: Record<string, string> }> {
  const fileData = await readLocatorGroupFile(locatorGroupId)
  if (!fileData) {
    throw new ServiceError('Locator group not found or file path could not be determined', 'NOT_FOUND', 404)
  }
  return fileData
}

export async function checkLocatorGroupNameUnique(name: string, excludeId?: string): Promise<boolean> {
  return !(await checkUniqueName(name, excludeId))
}

export async function regenerateAllLocatorGroupFiles(): Promise<{ total: number; success: number; errors: number }> {
  const locatorGroups = await prisma.locatorGroup.findMany({
    select: { id: true },
  })

  const results = await Promise.allSettled(
    locatorGroups.map(locatorGroup => automationProjectionService.syncLocatorGroup(locatorGroup.id)),
  )

  const successCount = results.filter(result => result.status === 'fulfilled' && result.value).length
  const errorCount = results.length - successCount

  return {
    total: locatorGroups.length,
    success: successCount,
    errors: errorCount,
  }
}
