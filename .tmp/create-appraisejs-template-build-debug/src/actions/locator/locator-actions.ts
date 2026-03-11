'use server'

import prisma from '@/config/db-config'
import { locatorSchema } from '@/constants/form-opts/locator-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { getAutomationLocatorsDir } from '@/lib/automation/paths'
import { getLocatorGroupFilePath } from '@/lib/locator-group-file-utils'
import { buildModuleHierarchy } from '@/lib/module-hierarchy-builder'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { promises as fs } from 'fs'
import path from 'path'
import { glob } from 'glob'

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
      data: locators,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
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
      data: locator,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
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
      data: newLocator,
      message: 'Locator created successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
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
      data: updatedLocator,
      message: 'Locator updated successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
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
    return {
      status: 200,
      data: locator,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
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
      data: locators,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

function extractModulePathFromLocatorFile(filePath: string): string {
  const locatorsDir = getAutomationLocatorsDir()
  const relativePath = path.relative(locatorsDir, filePath)
  const pathParts = relativePath.split(/[/\\]/).filter(part => part)
  const moduleParts = pathParts.slice(0, -1)
  return moduleParts.length > 0 ? `/${moduleParts.join('/')}` : '/'
}

function extractLocatorGroupName(filePath: string): string {
  return path.basename(filePath, '.json')
}

async function detectAndCreateConflicts(
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

export async function syncLocatorsFromFilesAction(): Promise<ActionResponse> {
  try {
    const pattern = 'automation/locators/**/*.json'
    const relativeFiles = await glob(pattern, {
      cwd: process.cwd(),
    })
    const files = relativeFiles.map(file => path.resolve(process.cwd(), file))

    let synced = 0
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
            synced++
          }

          totalConflicts += await detectAndCreateConflicts(locatorId, locatorName, locatorValue, locatorGroup.id)
        }

        const dbLocators = await prisma.locator.findMany({
          where: { locatorGroupId: locatorGroup.id },
          select: { name: true, value: true },
        })

        const mergedLocators: Record<string, string> = { ...locators }
        for (const dbLocator of dbLocators) {
          if (!(dbLocator.name in mergedLocators)) {
            mergedLocators[dbLocator.name] = dbLocator.value
            synced++
          }
        }

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
            const mergedLocators: Record<string, string> = { ...fileLocators }

            for (const dbLocator of locatorGroup.locators) {
              if (!(dbLocator.name in mergedLocators)) {
                mergedLocators[dbLocator.name] = dbLocator.value
              }
            }

            await fs.writeFile(filePath, JSON.stringify(mergedLocators, null, 2) + '\n', 'utf-8')
          } catch {
            await fs.mkdir(path.dirname(filePath), { recursive: true })
            const dbLocators: Record<string, string> = Object.fromEntries(
              locatorGroup.locators.map(locator => [locator.name, locator.value]),
            )
            await fs.writeFile(filePath, JSON.stringify(dbLocators, null, 2) + '\n', 'utf-8')
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

    revalidatePath('/locators')

    return {
      status: 200,
      data: {
        synced,
        conflicts: totalConflicts,
        errors,
      },
      message: `Synced ${synced} locators, ${totalConflicts} conflicts detected`,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}
