'use server'

import prisma from '@/config/db-config'
import { locatorGroupSchema } from '@/constants/form-opts/locator-group-form-opts'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  createOrUpdateLocatorGroupFile,
  deleteLocatorGroupFile,
  renameLocatorGroupFile,
  moveLocatorGroupFile,
  createEmptyLocatorGroupFile,
  readLocatorGroupFile,
} from '@/lib/locator-group-file-utils'

// Common include pattern for locator groups
const locatorGroupInclude = {
  module: {
    select: { name: true },
  },
} as const

/**
 * Get all locator groups
 */
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
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

/**
 * Get a locator group by ID
 */
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
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

/**
 * Create a new locator group
 */
export async function createLocatorGroupAction(
  _prev: unknown,
  value: z.infer<typeof locatorGroupSchema>,
): Promise<ActionResponse> {
  try {
    const locatorGroup = await prisma.locatorGroup.create({
      data: {
        name: value.name,
        moduleId: value.moduleId,
        locators: {
          connect: value.locators?.map(locator => ({ id: locator })) || [],
        },
      },
    })

    // Create empty JSON file initially
    await createEmptyLocatorGroupFile(locatorGroup.id)

    revalidatePath('/locator-groups')
    return {
      status: 200,
      data: locatorGroup,
      message: 'Locator group created successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

/**
 * Update an existing locator group
 */
export async function updateLocatorGroupAction(
  _prev: unknown,
  value: z.infer<typeof locatorGroupSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    // Get current state to detect changes
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

    // Update the locator group
    const updatedLocatorGroup = await prisma.locatorGroup.update({
      where: { id },
      data: {
        name: value.name,
        moduleId: value.moduleId,
        locators: {
          set: value.locators?.map(locator => ({ id: locator })) || [],
        },
      },
      include: locatorGroupInclude,
    })

    // Handle file operations based on changes
    const nameChanged = currentLocatorGroup.name !== value.name
    const moduleChanged = currentLocatorGroup.moduleId !== value.moduleId

    if (nameChanged && moduleChanged) {
      // Both changed - move the file (this will handle both changes)
      await moveLocatorGroupFile(id!)
    } else if (nameChanged) {
      // Only name changed - rename the file
      await renameLocatorGroupFile(id!, value.name, currentLocatorGroup.name)
    } else if (moduleChanged) {
      // Only module changed - move the file
      await moveLocatorGroupFile(id!)
    } else {
      // No structural changes - just update content
      await createOrUpdateLocatorGroupFile(id!)
    }

    revalidatePath('/locator-groups')
    return {
      status: 200,
      data: updatedLocatorGroup,
      message: 'Locator group updated successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

/**
 * Delete locator groups
 */
export async function deleteLocatorGroupAction(ids: string[]): Promise<ActionResponse> {
  try {
    // Delete JSON files first
    await Promise.all(ids.map(id => deleteLocatorGroupFile(id)))

    // Delete the locator groups (locators will be deleted via cascade)
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
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

/**
 * Get the content of a specific locator group file
 */
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
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

/**
 * Regenerate all locator group files from database
 */
export async function regenerateAllLocatorGroupFilesAction(): Promise<ActionResponse> {
  try {
    const locatorGroups = await prisma.locatorGroup.findMany({
      include: {
        module: true,
        locators: {
          select: { name: true, value: true },
        },
      },
    })

    // Process all files in parallel for better performance
    const results = await Promise.allSettled(
      locatorGroups.map(locatorGroup => createOrUpdateLocatorGroupFile(locatorGroup.id)),
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
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}
