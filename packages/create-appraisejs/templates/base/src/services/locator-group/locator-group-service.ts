import prisma from '@/config/db-config'
import { locatorGroupSchema } from '@/constants/form-opts/locator-group-form-opts'
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

async function validateLocatorGroupRelationships(value: z.infer<typeof locatorGroupSchema>, targetProjectId: string) {
  const [module, locators] = await Promise.all([
    prisma.module.findFirst({ where: { id: value.moduleId, targetProjectId, archivedAt: null }, select: { id: true } }),
    prisma.locator.findMany({
      where: { id: { in: value.locators ?? [] }, targetProjectId, archivedAt: null },
      select: { id: true },
    }),
  ])
  if (!module || locators.length !== (value.locators ?? []).length)
    throw new ServiceError('Locator group relationships must belong to the active project', 'VALIDATION', 400)
}

async function checkUniqueName(name: string, targetProjectId: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.locatorGroup.findFirst({
    where: {
      name,
      targetProjectId,
      ...(excludeId && { id: { not: excludeId } }),
    },
  })
  return !!existing
}

export async function listLocatorGroups(targetProjectId: string): Promise<LocatorGroupWithModule[]> {
  return prisma.locatorGroup.findMany({
    where: { targetProjectId, archivedAt: null },
    include: locatorGroupInclude,
  })
}

export async function getLocatorGroupByIdOrThrow(id: string, targetProjectId: string): Promise<LocatorGroupWithModule> {
  const locatorGroup = await prisma.locatorGroup.findFirst({
    where: { id, targetProjectId, archivedAt: null },
    include: locatorGroupInclude,
  })
  if (!locatorGroup) {
    throw new ServiceError('Locator group not found', 'NOT_FOUND', 404)
  }
  return locatorGroup
}

export async function createLocatorGroup(
  value: z.infer<typeof locatorGroupSchema>,
  targetProjectId: string,
): Promise<LocatorGroup> {
  await validateLocatorGroupRelationships(value, targetProjectId)
  const nameExists = await checkUniqueName(value.name, targetProjectId)
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
        targetProjectId,
        locators: {
          connect: value.locators?.map(locator => ({ id: locator })) || [],
        },
      },
    })

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
  targetProjectId: string,
): Promise<LocatorGroupWithModule> {
  if (!id) {
    throw new ServiceError('Locator group id is required', 'VALIDATION', 400)
  }

  const currentLocatorGroup = await prisma.locatorGroup.findFirst({
    where: { id, targetProjectId, archivedAt: null },
    include: { module: true },
  })

  if (!currentLocatorGroup) {
    throw new ServiceError('Locator group not found', 'NOT_FOUND', 404)
  }

  if (currentLocatorGroup.name !== value.name) {
    const nameExists = await checkUniqueName(value.name, targetProjectId, id)
    if (nameExists) {
      throw new ServiceError(
        'A locator group with this name already exists. Please choose a different name.',
        'VALIDATION',
        400,
      )
    }
  }

  await validateLocatorGroupRelationships(value, targetProjectId)
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

export async function deleteLocatorGroups(ids: string[], targetProjectId: string): Promise<string[]> {
  const managed = await prisma.locatorGroup.findFirst({
    where: { id: { in: ids }, targetProjectId, collaborationManaged: true },
    select: { id: true },
  })
  if (managed)
    throw new ServiceError('Collaboration-managed locator groups must be archived, not deleted.', 'CONFLICT', 409)
  await prisma.locatorGroup.deleteMany({
    where: { id: { in: ids }, targetProjectId, archivedAt: null, collaborationManaged: false },
  })
  return ids
}

export async function checkLocatorGroupNameUnique(
  name: string,
  targetProjectId: string,
  excludeId?: string,
): Promise<boolean> {
  return !(await checkUniqueName(name, targetProjectId, excludeId))
}
