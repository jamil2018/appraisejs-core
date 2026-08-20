import prisma from '@/config/db-config'
import { z } from 'zod'
import { ServiceError } from '@/services/shared/errors'
import { normalizeRoute } from '@/lib/locator-picker/suggestions'
import { locatorPickerSessionManager } from '@/lib/locator-picker/session-manager'
import { validatePickedLocatorObservation } from '@/lib/locator-picker/selector-observation'
import type { SavePickedLocatorRequest } from '@/types/locator-picker'

export async function listLocators(targetProjectId: string) {
  return prisma.locator.findMany({
    where: { targetProjectId },
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
}

export async function deleteLocators(ids: string[], targetProjectId: string) {
  const result = await prisma.locator.deleteMany({
    where: { id: { in: ids }, targetProjectId },
  })

  return result
}

export async function getLocatorByIdOrThrow(id: string, targetProjectId: string) {
  const locator = await prisma.locator.findFirst({
    where: { id, targetProjectId },
    include: {
      locatorGroup: {
        select: {
          name: true,
        },
      },
    },
  })

  if (!locator) {
    throw new ServiceError('Locator not found', 'NOT_FOUND', 404)
  }

  return locator
}

export async function detectAndCreateConflicts(
  locatorId: string,
  locatorName: string,
  locatorValue: string,
  locatorGroupId: string,
): Promise<number> {
  let conflictCount = 0

  const existingLocators = await prisma.locator.findMany({
    where: {
      locatorGroupId,
      id: { not: locatorId },
    },
  })

  for (const existingLocator of existingLocators) {
    if (existingLocator.name === locatorName) {
      const existingConflict = await prisma.conflictResolution.findFirst({
        where: {
          entityType: 'LOCATOR',
          entityId: locatorId,
          conflictType: 'DUPLICATE_NAME',
          conflictingEntityId: existingLocator.id,
          resolved: false,
        },
      })

      if (!existingConflict) {
        await prisma.conflictResolution.create({
          data: {
            entityType: 'LOCATOR',
            entityId: locatorId,
            conflictType: 'DUPLICATE_NAME',
            conflictingEntityId: existingLocator.id,
            resolved: false,
          },
        })
        await prisma.conflictResolution.create({
          data: {
            entityType: 'LOCATOR',
            entityId: existingLocator.id,
            conflictType: 'DUPLICATE_NAME',
            conflictingEntityId: locatorId,
            resolved: false,
          },
        })
        conflictCount++
      }
    } else if (existingLocator.value === locatorValue && existingLocator.name !== locatorName) {
      const existingConflict = await prisma.conflictResolution.findFirst({
        where: {
          entityType: 'LOCATOR',
          entityId: locatorId,
          conflictType: 'DUPLICATE_VALUE',
          conflictingEntityId: existingLocator.id,
          resolved: false,
        },
      })

      if (!existingConflict) {
        await prisma.conflictResolution.create({
          data: {
            entityType: 'LOCATOR',
            entityId: locatorId,
            conflictType: 'DUPLICATE_VALUE',
            conflictingEntityId: existingLocator.id,
            resolved: false,
          },
        })
        await prisma.conflictResolution.create({
          data: {
            entityType: 'LOCATOR',
            entityId: existingLocator.id,
            conflictType: 'DUPLICATE_VALUE',
            conflictingEntityId: locatorId,
            resolved: false,
          },
        })
        conflictCount++
      }
    }
  }

  return conflictCount
}

const savePickedLocatorSchema = z.object({
  locatorId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  locatorName: z.string().min(1, { message: 'Locator name is required.' }),
  selector: z.string().min(1, { message: 'Selector is required.' }),
  resolutionMode: z.enum(['existing', 'create']),
  existingLocatorGroupId: z.string().optional(),
  newLocatorGroupName: z.string().optional(),
  route: z.string().optional(),
  moduleId: z.string().optional(),
})

export type SavePickedLocatorOutcome =
  | {
      kind: 'success'
      locatorId: string
      locatorName: string
      locatorGroupId: string
      locatorGroupName: string
      selector: string
      route: string
      moduleId: string
      message: string
      wasUpdate: boolean
    }
  | { kind: 'error'; status: number; message: string }

export async function savePickedLocatorFromRequest(
  request: SavePickedLocatorRequest,
  targetProjectId: string,
): Promise<SavePickedLocatorOutcome> {
  const value = savePickedLocatorSchema.parse(request)
  const session = value.sessionId ? await locatorPickerSessionManager.getSession(value.sessionId) : null

  const fail = async (status: number, error: string): Promise<SavePickedLocatorOutcome> => {
    await locatorPickerSessionManager.markReadyAfterSave(value.sessionId)
    return { kind: 'error', status, message: error }
  }

  await locatorPickerSessionManager.markSaving(value.sessionId)

  let locatorGroupId = value.existingLocatorGroupId
  let locatorGroupName = ''
  let route = normalizeRoute(value.route || session?.currentPathname)
  let moduleId = value.moduleId ?? ''
  const locatorName = value.locatorName.trim()
  const selector = value.selector.trim()

  if (session?.pickedLocator) {
    const observationError = validatePickedLocatorObservation(session.pickedLocator, selector)
    if (observationError) return fail(400, observationError)
  }
  const currentLocator = value.locatorId
    ? await prisma.locator.findFirst({
        where: { id: value.locatorId, targetProjectId },
        select: { locatorGroupId: true },
      })
    : null

  if (value.locatorId && !currentLocator) {
    return fail(404, 'The locator you are editing no longer exists.')
  }

  if (value.resolutionMode === 'existing') {
    if (!locatorGroupId) {
      return fail(400, 'Choose an existing locator group before saving.')
    }

    const locatorGroup = await prisma.locatorGroup.findFirst({
      where: { id: locatorGroupId, targetProjectId },
    })

    if (!locatorGroup) {
      return fail(404, 'The selected locator group no longer exists.')
    }

    locatorGroupName = locatorGroup.name
    route = locatorGroup.route
    moduleId = locatorGroup.moduleId
  } else {
    if (!value.newLocatorGroupName || value.newLocatorGroupName.trim() === '') {
      return fail(400, 'Locator group name is required when creating a new group.')
    }

    if (!value.moduleId) {
      return fail(400, 'Choose a module for the new locator group.')
    }

    const selectedModule = await prisma.module.findFirst({ where: { id: value.moduleId, targetProjectId } })
    if (!selectedModule) {
      return fail(404, 'The selected module no longer exists in the active project.')
    }

    const duplicateGroup = await prisma.locatorGroup.findFirst({
      where: {
        name: value.newLocatorGroupName.trim(),
        targetProjectId,
      },
    })

    if (duplicateGroup) {
      return fail(400, 'A locator group with this name already exists. Choose a different name.')
    }

    const newLocatorGroup = await prisma.locatorGroup.create({
      data: {
        name: value.newLocatorGroupName.trim(),
        route,
        moduleId: value.moduleId,
        targetProjectId,
      },
    })

    locatorGroupId = newLocatorGroup.id
    locatorGroupName = newLocatorGroup.name
    moduleId = newLocatorGroup.moduleId
  }

  if (!locatorGroupId) {
    return fail(500, 'Failed to resolve the locator group for saving.')
  }

  const existingLocator = await prisma.locator.findFirst({
    where: {
      locatorGroupId,
      name: locatorName,
      targetProjectId,
      ...(value.locatorId
        ? {
            id: {
              not: value.locatorId,
            },
          }
        : {}),
    },
  })

  if (existingLocator) {
    return fail(400, `A locator named "${locatorName}" already exists in ${locatorGroupName}.`)
  }

  const locator = value.locatorId
    ? await prisma.locator.update({
        where: { id: value.locatorId },
        data: {
          name: locatorName,
          value: selector,
          locatorGroupId,
          targetProjectId,
        },
      })
    : await prisma.locator.create({
        data: {
          name: locatorName,
          value: selector,
          locatorGroupId,
          targetProjectId,
        },
      })

  await locatorPickerSessionManager.markReadyAfterSave(value.sessionId)

  return {
    kind: 'success',
    locatorId: locator.id,
    locatorName: locator.name,
    locatorGroupId,
    locatorGroupName,
    selector: locator.value,
    route,
    moduleId,
    message: value.locatorId ? 'Locator updated successfully.' : 'Locator saved successfully.',
    wasUpdate: Boolean(value.locatorId),
  }
}
