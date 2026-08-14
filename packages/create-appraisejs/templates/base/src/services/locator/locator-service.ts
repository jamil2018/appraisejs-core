import prisma from '@/config/db-config'
import { z } from 'zod'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { extractLocatorGroupName, extractModulePathFromLocatorFile } from '@/services/locator/locator-path-utils'
import { mergeMissingLocators } from '@/services/locator/locator-sync-utils'
import { ServiceError } from '@/services/shared/errors'
import { getLocatorGroupFilePath } from '@/lib/locator-group-file-utils'
import { buildModuleHierarchy } from '@/lib/module-hierarchy-builder'
import { normalizeRoute } from '@/lib/locator-picker/suggestions'
import { locatorPickerSessionManager } from '@/lib/locator-picker/session-manager'
import { validatePickedLocatorObservation } from '@/lib/locator-picker/selector-observation'
import type { SavePickedLocatorRequest } from '@/types/locator-picker'
import { promises as fs } from 'fs'
import path from 'path'
import { glob } from 'glob'

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

async function updateLocatorGroupFile(locatorGroupId: string | null): Promise<void> {
  if (!locatorGroupId) {
    return
  }

  try {
    await automationProjectionService.syncLocatorGroup(locatorGroupId)
  } catch (error) {
    console.error('Error updating locator group file:', error)
  }
}

export async function deleteLocators(ids: string[], targetProjectId: string) {
  const locatorsToDelete = await prisma.locator.findMany({
    where: { id: { in: ids }, targetProjectId },
    select: { locatorGroupId: true },
  })

  const locatorGroupIds = [...new Set(locatorsToDelete.map(locator => locator.locatorGroupId).filter(Boolean))]
  const result = await prisma.locator.deleteMany({
    where: { id: { in: ids }, targetProjectId },
  })

  await Promise.all(locatorGroupIds.map(groupId => updateLocatorGroupFile(groupId)))

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

export type SyncLocatorsFromFilesResult = {
  /** New locator rows created in the DB from JSON file entries. */
  locatorsCreated: number
  /** DB-only locators appended into JSON files (file was missing those keys). */
  locatorsMergedToFile: number
  conflicts: number
  errors: string[]
}

export async function syncLocatorsFromFiles(): Promise<SyncLocatorsFromFilesResult> {
  const pattern = 'automation/locators/**/*.json'
  const relativeFiles = await glob(pattern, {
    cwd: process.cwd(),
  })
  const files = relativeFiles.map(file => path.resolve(process.cwd(), file))

  let locatorsCreated = 0
  let locatorsMergedToFile = 0
  let totalConflicts = 0
  const errors: string[] = []
  const affectedLocatorGroupIds = new Set<string>()

  for (const filePath of files) {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const locators = JSON.parse(content) as Record<string, string>

      const modulePath = extractModulePathFromLocatorFile(filePath)
      const moduleId = await buildModuleHierarchy(modulePath)
      const groupName = extractLocatorGroupName(filePath)

      let locatorGroup = await prisma.locatorGroup.findFirst({
        where: {
          name: groupName,
          moduleId,
        },
      })

      if (!locatorGroup) {
        locatorGroup = await prisma.locatorGroup.create({
          data: {
            name: groupName,
            route: `/${groupName}`,
            moduleId,
          },
        })
      }

      affectedLocatorGroupIds.add(locatorGroup.id)

      for (const [locatorName, locatorValue] of Object.entries(locators)) {
        const existingLocator = await prisma.locator.findFirst({
          where: {
            name: locatorName,
            locatorGroupId: locatorGroup.id,
          },
        })

        let locatorId: string

        if (existingLocator) {
          if (existingLocator.value !== locatorValue) {
            await prisma.locator.update({
              where: { id: existingLocator.id },
              data: { value: locatorValue },
            })
          }
          locatorId = existingLocator.id
        } else {
          const newLocator = await prisma.locator.create({
            data: {
              name: locatorName,
              value: locatorValue,
              locatorGroupId: locatorGroup.id,
            },
          })
          locatorId = newLocator.id
          locatorsCreated++
        }

        totalConflicts += await detectAndCreateConflicts(locatorId, locatorName, locatorValue, locatorGroup.id)
      }

      const dbLocators = await prisma.locator.findMany({
        where: { locatorGroupId: locatorGroup.id },
        select: { name: true, value: true },
      })

      const { mergedLocators, addedCount } = mergeMissingLocators(
        locators,
        Object.fromEntries(dbLocators.map(dbLocator => [dbLocator.name, dbLocator.value])),
      )
      locatorsMergedToFile += addedCount

      await fs.writeFile(filePath, JSON.stringify(mergedLocators, null, 2) + '\n', 'utf-8')
    } catch (error) {
      const errorMessage = `Error syncing locator file ${filePath}: ${error}`
      console.error(errorMessage)
      errors.push(errorMessage)
    }
  }

  try {
    const allLocatorGroups = await prisma.locatorGroup.findMany({
      include: {
        locators: {
          select: { name: true, value: true },
        },
      },
    })

    for (const locatorGroup of allLocatorGroups) {
      if (affectedLocatorGroupIds.has(locatorGroup.id)) {
        continue
      }

      try {
        const filePath = await getLocatorGroupFilePath(locatorGroup.id)
        if (!filePath) {
          continue
        }

        try {
          await fs.access(filePath)
          const fileContent = await fs.readFile(filePath, 'utf-8')
          const fileLocators = JSON.parse(fileContent) as Record<string, string>
          const { mergedLocators, addedCount } = mergeMissingLocators(
            fileLocators,
            Object.fromEntries(locatorGroup.locators.map(locator => [locator.name, locator.value])),
          )
          locatorsMergedToFile += addedCount

          await fs.writeFile(filePath, JSON.stringify(mergedLocators, null, 2) + '\n', 'utf-8')
        } catch {
          await fs.mkdir(path.dirname(filePath), { recursive: true })
          const { mergedLocators, addedCount } = mergeMissingLocators(
            {},
            Object.fromEntries(locatorGroup.locators.map(locator => [locator.name, locator.value])),
          )
          locatorsMergedToFile += addedCount
          await fs.writeFile(filePath, JSON.stringify(mergedLocators, null, 2) + '\n', 'utf-8')
        }
      } catch (error) {
        const errorMessage = `Error syncing locator group ${locatorGroup.id} to file: ${error}`
        console.error(errorMessage)
        errors.push(errorMessage)
      }
    }
  } catch (error) {
    const errorMessage = `Error syncing database locators to files: ${error}`
    console.error(errorMessage)
    errors.push(errorMessage)
  }

  return {
    locatorsCreated,
    locatorsMergedToFile,
    conflicts: totalConflicts,
    errors,
  }
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

    await automationProjectionService.createEmptyLocatorGroup(newLocatorGroup.id)
    await automationProjectionService.syncLocatorMap(newLocatorGroup.name, route)
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

  const groupsToSync = new Set<string>([locatorGroupId])
  if (currentLocator?.locatorGroupId && currentLocator.locatorGroupId !== locatorGroupId) {
    groupsToSync.add(currentLocator.locatorGroupId)
  }

  await Promise.all(Array.from(groupsToSync).map(groupId => automationProjectionService.syncLocatorGroup(groupId)))
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
