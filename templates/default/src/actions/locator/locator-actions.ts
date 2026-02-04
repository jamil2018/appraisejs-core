'use server'

import prisma from '@/config/db-config'
import { locatorSchema } from '@/constants/form-opts/locator-form-opts'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createOrUpdateLocatorGroupFile, getLocatorGroupFilePath } from '@/lib/locator-group-file-utils'
import { promises as fs } from 'fs'
import path from 'path'
import { glob } from 'glob'
import { buildModuleHierarchy } from '@/lib/module-hierarchy-builder'
import { buildModulePath } from '@/lib/path-helpers/module-path'

// Helper function to update locator group JSON file when locators change
async function updateLocatorGroupFile(locatorGroupId: string | null): Promise<void> {
  if (!locatorGroupId) return

  try {
    await createOrUpdateLocatorGroupFile(locatorGroupId)
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
    // Get locator group IDs before deletion to update files
    const locatorsToDelete = await prisma.locator.findMany({
      where: { id: { in: ids } },
      select: { locatorGroupId: true },
    })

    const locatorGroupIds = [...new Set(locatorsToDelete.map(l => l.locatorGroupId).filter(Boolean))]

    const locator = await prisma.locator.deleteMany({
      where: { id: { in: ids } },
    })

    // Update JSON files for affected locator groups in parallel
    await Promise.all(locatorGroupIds.filter(Boolean).map(groupId => updateLocatorGroupFile(groupId)))

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

    // Update the locator group JSON file
    if (value.locatorGroupId) {
      await updateLocatorGroupFile(value.locatorGroupId)
    }

    revalidatePath('/locators')
    return {
      status: 200,
      data: newLocator,
      message: 'Locator created successfully',
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}

export async function updateLocatorAction(
  _prev: unknown,
  value: z.infer<typeof locatorSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    // Get the current locator to check if locatorGroupId changed
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

    // Update JSON files for affected locator groups
    const groupsToUpdate = new Set<string>()

    if (currentLocator?.locatorGroupId !== value.locatorGroupId) {
      // Group changed - update both old and new groups
      if (currentLocator?.locatorGroupId) {
        groupsToUpdate.add(currentLocator.locatorGroupId)
      }
      if (value.locatorGroupId) {
        groupsToUpdate.add(value.locatorGroupId)
      }
    } else if (value.locatorGroupId) {
      // Same group - just update the current group
      groupsToUpdate.add(value.locatorGroupId)
    }

    // Update all affected groups in parallel
    await Promise.all(Array.from(groupsToUpdate).map(groupId => updateLocatorGroupFile(groupId)))

    revalidatePath('/locators')
    return {
      status: 200,
      data: updatedLocator,
      message: 'Locator updated successfully',
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
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
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
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

/**
 * Extracts module path from locator file path
 */
function extractModulePathFromLocatorFile(filePath: string): string {
  const testsDir = path.join(process.cwd(), 'src', 'tests')
  const relativePath = path.relative(testsDir, filePath)
  const pathParts = relativePath.split(/[/\\]/).filter(p => p && p !== 'locators')
  const moduleParts = pathParts.slice(0, -1) // Remove filename
  return moduleParts.length > 0 ? '/' + moduleParts.join('/') : '/'
}

/**
 * Extracts locator group name from file path
 * The group name is just the filename without extension
 */
function extractLocatorGroupName(filePath: string): string {
  const fileName = path.basename(filePath, '.json')
  return fileName
}

/**
 * Detects and creates conflict resolution entries for locators
 */
async function detectAndCreateConflicts(
  locatorId: string,
  locatorName: string,
  locatorValue: string,
  locatorGroupId: string,
): Promise<number> {
  let conflictCount = 0

  // Find existing locators in the same group
  const existingLocators = await prisma.locator.findMany({
    where: {
      locatorGroupId,
      id: { not: locatorId },
    },
  })

  for (const existingLocator of existingLocators) {
    // Check for duplicate name conflict
    if (existingLocator.name === locatorName) {
      // Check if conflict already exists for this locator
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
        // Create conflict for both locators
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
    }
    // Check for duplicate value conflict (different name)
    else if (existingLocator.value === locatorValue && existingLocator.name !== locatorName) {
      // Check if conflict already exists for this locator
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
        // Create conflict for both locators
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

/**
 * Syncs locators from JSON files to database
 */
export async function syncLocatorsFromFilesAction(): Promise<ActionResponse> {
  try {
    // Use relative pattern with forward slashes for cross-platform compatibility
    // glob library requires forward slashes in patterns on all platforms
    const pattern = 'src/tests/locators/**/*.json'
    const relativeFiles = await glob(pattern, {
      cwd: process.cwd(),
    })
    // Resolve to absolute paths for file operations
    const files = relativeFiles.map(file => path.resolve(process.cwd(), file))

    let synced = 0
    let totalConflicts = 0
    const errors: string[] = []
    const affectedLocatorGroupIds = new Set<string>()

    for (const filePath of files) {
      try {
        // Read locator file
        const content = await fs.readFile(filePath, 'utf-8')
        const locators = JSON.parse(content) as Record<string, string>

        // Extract module path and group name
        const modulePath = extractModulePathFromLocatorFile(filePath)
        const moduleId = await buildModuleHierarchy(modulePath)
        const groupName = extractLocatorGroupName(filePath)

        // Find or create locator group
        let locatorGroup = await prisma.locatorGroup.findFirst({
          where: {
            name: groupName,
            moduleId: moduleId,
          },
        })

        if (!locatorGroup) {
          locatorGroup = await prisma.locatorGroup.create({
            data: {
              name: groupName,
              route: `/${groupName}`,
              moduleId: moduleId,
            },
          })
        }

        // Track this locator group as affected
        affectedLocatorGroupIds.add(locatorGroup.id)

        // Sync locators FROM FILE TO DATABASE
        for (const [locatorName, locatorValue] of Object.entries(locators)) {
          // Check if locator already exists
          const existingLocator = await prisma.locator.findFirst({
            where: {
              name: locatorName,
              locatorGroupId: locatorGroup.id,
            },
          })

          let locatorId: string

          if (existingLocator) {
            // Update existing locator value if different (file takes precedence)
            if (existingLocator.value !== locatorValue) {
              await prisma.locator.update({
                where: { id: existingLocator.id },
                data: { value: locatorValue },
              })
            }
            locatorId = existingLocator.id
          } else {
            // Create new locator from file
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

          // Detect and create conflicts
          const conflictCount = await detectAndCreateConflicts(locatorId, locatorName, locatorValue, locatorGroup.id)
          totalConflicts += conflictCount
        }

        // Sync locators FROM DATABASE TO FILE (bidirectional sync)
        // Get all locators from database for this group
        const dbLocators = await prisma.locator.findMany({
          where: { locatorGroupId: locatorGroup.id },
          select: { name: true, value: true },
        })

        // Merge: file values take precedence, but add DB locators that aren't in file
        const mergedLocators: Record<string, string> = { ...locators }
        for (const dbLocator of dbLocators) {
          // Only add if not already in file (file values take precedence)
          if (!(dbLocator.name in mergedLocators)) {
            mergedLocators[dbLocator.name] = dbLocator.value
            synced++
          }
        }

        // Write merged content back to file
        await fs.writeFile(filePath, JSON.stringify(mergedLocators, null, 2) + '\n', 'utf-8')
      } catch (error) {
        const errorMessage = `Error syncing locator file ${filePath}: ${error}`
        console.error(errorMessage)
        errors.push(errorMessage)
      }
    }

    // Handle locator groups that exist in DB but don't have files yet
    // Create files for these groups with their DB locators
    try {
      const allLocatorGroups = await prisma.locatorGroup.findMany({
        include: {
          locators: {
            select: { name: true, value: true },
          },
          module: true,
        },
      })

      for (const locatorGroup of allLocatorGroups) {
        // Skip if we already processed this group (it has a file)
        if (affectedLocatorGroupIds.has(locatorGroup.id)) {
          continue
        }

        try {
          // Get the file path for this locator group
          const relativeFilePath = await getLocatorGroupFilePath(locatorGroup.id)
          if (!relativeFilePath) {
            // If we can't determine the path, skip this group
            continue
          }

          const fullPath = path.join(process.cwd(), relativeFilePath)

          // Check if file exists
          try {
            await fs.access(fullPath)
            // File exists, merge DB locators into it
            const fileContent = await fs.readFile(fullPath, 'utf-8')
            const fileLocators = JSON.parse(fileContent) as Record<string, string>

            // Merge: file values take precedence, but add DB locators that aren't in file
            const mergedLocators: Record<string, string> = { ...fileLocators }
            for (const dbLocator of locatorGroup.locators) {
              if (!(dbLocator.name in mergedLocators)) {
                mergedLocators[dbLocator.name] = dbLocator.value
              }
            }

            await fs.writeFile(fullPath, JSON.stringify(mergedLocators, null, 2) + '\n', 'utf-8')
          } catch {
            // File doesn't exist, create it with DB locators
            await fs.mkdir(path.dirname(fullPath), { recursive: true })
            const dbLocators: Record<string, string> = Object.fromEntries(
              locatorGroup.locators.map(loc => [loc.name, loc.value]),
            )
            await fs.writeFile(fullPath, JSON.stringify(dbLocators, null, 2) + '\n', 'utf-8')
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
