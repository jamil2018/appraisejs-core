'use server'

import prisma from '@/config/db-config'
import { templateStepGroupSchema } from '@/constants/form-opts/template-step-group-form-opts'
import { ActionResponse } from '@/types/form/actionHandler'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z, ZodError } from 'zod'

// TemplateStepGroupType will be available after Prisma migration
type TemplateStepGroupType = 'ACTION' | 'VALIDATION'

// Type helper to safely extract type from Prisma records
type TemplateStepGroupWithType = {
  id: string
  name: string
  description: string | null
  type?: TemplateStepGroupType
  createdAt: Date
  updatedAt: Date
}

function getGroupType(group: unknown): TemplateStepGroupType {
  const groupWithType = group as TemplateStepGroupWithType
  const type = groupWithType.type
  if (type === 'VALIDATION' || type === 'ACTION') {
    return type
  }
  return 'ACTION' // default
}

import {
  createTemplateStepGroupFile,
  removeTemplateStepGroupFile,
  renameTemplateStepGroupFile,
} from '@/lib/utils/template-step-file-manager-intelligent'

/**
 * Get all template step groups
 * @returns ActionResponse
 */
export async function getAllTemplateStepGroupsAction(): Promise<ActionResponse> {
  try {
    const templateStepGroups = await prisma.templateStepGroup.findMany()
    return {
      status: 200,
      data: templateStepGroups,
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}

/**
 * Create a new template step group
 * @param _prev - Previous state
 * @param value - Template step group data
 * @returns ActionResponse
 */
export async function createTemplateStepGroupAction(
  _prev: unknown,
  value: z.infer<typeof templateStepGroupSchema>,
): Promise<ActionResponse> {
  try {
    templateStepGroupSchema.parse(value)

    const type: TemplateStepGroupType = (value.type as string) === 'VALIDATION' ? 'VALIDATION' : 'ACTION'

    // First, try to create the file - if this fails, we won't create the database record
    await createTemplateStepGroupFile(value.name, type)

    // If file creation succeeds, create the database record
    // Note: Using type assertion because Prisma client hasn't been regenerated yet
    await prisma.templateStepGroup.create({
      data: {
        name: value.name,
        description: value.description,
        type: type,
      } as Parameters<typeof prisma.templateStepGroup.create>[0]['data'],
    })

    revalidatePath('/template-step-groups')
    return {
      status: 200,
      message: 'Template step group created successfully',
    }
  } catch (e) {
    if (e instanceof ZodError) {
      return {
        status: 400,
        error: e.message,
      }
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        status: 500,
        error: e.message,
      }
    }
    return {
      status: 500,
      error: 'Server error occurred',
    }
  }
}

/**
 * Delete a template step group
 * @param id - Template step group id(s)
 * @returns ActionResponse
 */
export async function deleteTemplateStepGroupAction(id: string[]): Promise<ActionResponse> {
  try {
    // Get the group names and types before deletion for file cleanup
    const groupsToDelete = await prisma.templateStepGroup.findMany({
      where: { id: { in: id } },
    })

    // With proper cascade deletes in the schema, we can now rely on the database
    // to handle the deletion of related entities automatically
    await prisma.templateStepGroup.deleteMany({
      where: { id: { in: id } },
    })

    // Clean up the files after successful database deletion
    for (const group of groupsToDelete) {
      try {
        const groupType = getGroupType(group)
        await removeTemplateStepGroupFile(group.name, groupType)
      } catch (fileError) {
        console.error(`Failed to delete file for group "${group.name}":`, fileError)
        // Don't fail the entire operation if file deletion fails
      }
    }

    revalidatePath('/template-step-groups')
    return {
      status: 200,
      message: 'Template step group(s) deleted successfully',
    }
  } catch (e) {
    console.error('Error deleting template step group:', e)
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}

/**
 * Get a template step group by id
 * @param id - Template step group id
 * @returns ActionResponse
 */
export async function getTemplateStepGroupByIdAction(id: string): Promise<ActionResponse> {
  try {
    const templateStepGroup = await prisma.templateStepGroup.findUnique({
      where: { id },
    })
    return {
      status: 200,
      data: templateStepGroup,
    }
  } catch (e) {
    console.error(e)
    throw e
  }
}

/**
 * Update a template step group
 * @param _prev - Previous state
 * @param value - Template step group data
 * @param id - Template step group id
 * @returns ActionResponse
 */
export async function updateTemplateStepGroupAction(
  _prev: unknown,
  value: z.infer<typeof templateStepGroupSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    templateStepGroupSchema.parse(value)

    if (!id) {
      return {
        status: 400,
        error: 'Template step group ID is required',
      }
    }

    // Get the current group to check if name or type changed
    const currentGroup = await prisma.templateStepGroup.findUnique({
      where: { id },
    })

    if (!currentGroup) {
      return {
        status: 404,
        error: 'Template step group not found',
      }
    }

    const newType: TemplateStepGroupType = (value.type as string) === 'VALIDATION' ? 'VALIDATION' : 'ACTION'
    const currentType = getGroupType(currentGroup)
    const nameChanged = currentGroup.name !== value.name
    const typeChanged = currentType !== newType

    // If name or type changed, we need to handle file renaming/moving
    if (nameChanged || typeChanged) {
      // Rename/move the file to preserve all existing content
      try {
        await renameTemplateStepGroupFile(currentGroup.name, value.name, currentType, newType)
      } catch (fileError) {
        console.error(
          `Failed to rename/move file from "${currentGroup.name}" (${currentType}) to "${value.name}" (${newType}):`,
          fileError,
        )
        // Continue with the update even if file rename fails
      }
    }

    // Update the database record
    // Note: Using type assertion because Prisma client hasn't been regenerated yet
    await prisma.templateStepGroup.update({
      where: { id },
      data: {
        name: value.name,
        description: value.description,
        type: newType,
      } as Parameters<typeof prisma.templateStepGroup.update>[0]['data'],
    })

    revalidatePath('/template-step-groups')
    return {
      status: 200,
      message: 'Template step group updated successfully',
    }
  } catch (e) {
    if (e instanceof ZodError) {
      return {
        status: 400,
        error: e.message,
      }
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        status: 500,
        error: e.message,
      }
    }
    return {
      status: 500,
      error: 'Server error occurred',
    }
  }
}
