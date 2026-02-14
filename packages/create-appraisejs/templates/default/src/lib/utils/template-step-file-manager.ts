import prisma from '@/config/db-config'
import { writeTemplateStepFile, deleteTemplateStepFile, generateFileContent } from './template-step-file-generator'
import { TemplateStepGroupType } from '@prisma/client'

// TemplateStepGroupType helper - will be available from @prisma/client after migration
type TemplateStepGroupTypeLocal = 'ACTION' | 'VALIDATION'

// Type helper to safely extract type from Prisma templateStepGroup records
type TemplateStepGroupWithType = {
  id: string
  name: string
  description: string | null
  type?: TemplateStepGroupTypeLocal
  createdAt: Date
  updatedAt: Date
}

function getGroupType(group: unknown): TemplateStepGroupTypeLocal {
  const groupWithType = group as TemplateStepGroupWithType
  const type = groupWithType.type
  if (type === 'VALIDATION' || type === 'ACTION') {
    return type
  }
  return 'ACTION' // default
}

/**
 * Regenerates the file for a specific template step group
 * This function is called whenever template steps in a group change
 */
export async function regenerateTemplateStepGroupFile(groupId: string): Promise<void> {
  try {
    // Get the template step group with all its template steps
    const group = await prisma.templateStepGroup.findUnique({
      where: { id: groupId },
      include: {
        templateSteps: {
          orderBy: {
            // Order by creation time or any other field you prefer
            createdAt: 'asc',
          },
        },
      },
    })

    if (!group) {
      throw new Error(`Template step group with ID ${groupId} not found`)
    }

    // Generate file content from template steps
    const content = generateFileContent(group.templateSteps)

    // Write the file
    const type = getGroupType(group)
    await writeTemplateStepFile(group.name, content, type)

    console.log(`File regenerated for template step group: ${group.name}`)
  } catch (error) {
    console.error(`Failed to regenerate file for template step group ${groupId}:`, error)
    throw new Error(`File regeneration failed: ${error}`)
  }
}

/**
 * Creates a placeholder file for a new template step group
 * Called when a new group is created
 * @deprecated Use createTemplateStepGroupFile from template-step-file-manager-intelligent.ts instead
 */
export async function createTemplateStepGroupFile(
  groupName: string,
  type: TemplateStepGroupType | string = 'ACTION',
): Promise<void> {
  try {
    // Create empty placeholder content with required imports
    const placeholderContent =
      '// This file is generated automatically. Add template steps to this group to generate content.'

    // Write the placeholder file
    await writeTemplateStepFile(groupName, placeholderContent, type)

    console.log(`Placeholder file created for template step group: ${groupName}`)
  } catch (error) {
    console.error(`Failed to create placeholder file for group "${groupName}":`, error)
    throw new Error(`File creation failed: ${error}`)
  }
}

/**
 * Deletes the file for a template step group
 * Called when a group is deleted
 * @deprecated Use removeTemplateStepGroupFile from template-step-file-manager-intelligent.ts instead
 */
export async function removeTemplateStepGroupFile(
  groupName: string,
  type: TemplateStepGroupType | string = 'ACTION',
): Promise<void> {
  try {
    await deleteTemplateStepFile(groupName, type)

    console.log(`File deleted for template step group: ${groupName}`)
  } catch (error) {
    console.error(`Failed to delete file for group "${groupName}":`, error)
    throw new Error(`File deletion failed: ${error}`)
  }
}

/**
 * Handles file regeneration when a template step is created, updated, or deleted
 * This function determines which groups need file regeneration
 */
export async function handleTemplateStepChange(
  templateStepId: string,
  operation: 'create' | 'update' | 'delete',
): Promise<void> {
  try {
    let groupId: string | null = null

    if (operation === 'delete') {
      // For delete operations, we need to get the group ID before deletion
      const step = await prisma.templateStep.findUnique({
        where: { id: templateStepId },
        select: { templateStepGroupId: true },
      })
      groupId = step?.templateStepGroupId || null
    } else {
      // For create/update operations, get the current group ID
      const step = await prisma.templateStep.findUnique({
        where: { id: templateStepId },
        select: { templateStepGroupId: true },
      })
      groupId = step?.templateStepGroupId || null
    }

    if (groupId) {
      // Regenerate the file for the affected group
      await regenerateTemplateStepGroupFile(groupId)
    }
  } catch (error) {
    console.error(`Failed to handle template step change for step ${templateStepId}:`, error)
    throw new Error(`File update failed: ${error}`)
  }
}

/**
 * Handles file regeneration when a template step is moved between groups
 * This is a special case that requires regenerating files for both groups
 */
export async function handleTemplateStepGroupChange(
  oldGroupId: string | null,
  newGroupId: string | null,
): Promise<void> {
  try {
    // Regenerate file for the old group (if it exists)
    if (oldGroupId) {
      await regenerateTemplateStepGroupFile(oldGroupId)
    }

    // Regenerate file for the new group (if it exists)
    if (newGroupId) {
      await regenerateTemplateStepGroupFile(newGroupId)
    }
  } catch (error) {
    console.error(`Failed to handle template step group change:`, error)
    throw new Error(`File update failed: ${error}`)
  }
}
