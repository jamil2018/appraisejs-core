'use server'

import prisma from '@/config/db-config'
import { tagSchema } from '@/constants/form-opts/tag-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { ActionResponse } from '@/types/form/actionHandler'
import { TagType } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { unknownErrorToActionResponse } from '@/services/shared/errors'

export async function getAllTagsAction(): Promise<ActionResponse> {
  try {
    const tags = await prisma.tag.findMany({
      where: {
        type: TagType.FILTER,
      },
    })
    return {
      status: 200,
      success: true,
      data: tags,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function deleteTagAction(ids: string[]): Promise<ActionResponse> {
  try {
    await prisma.tag.deleteMany({ where: { id: { in: ids } } })
    await automationProjectionService.regenerateAllFeatures()
    revalidatePath('/tags')

    return {
      status: 200,
      success: true,
      message: 'Tag deleted successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function createTagAction(_prev: unknown, value: z.infer<typeof tagSchema>): Promise<ActionResponse> {
  try {
    tagSchema.parse(value)
    const newTag = await prisma.tag.create({
      data: value,
    })

    await automationProjectionService.regenerateAllFeatures()
    revalidatePath('/tags')

    return {
      status: 200,
      success: true,
      data: newTag,
      message: 'Tag created successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getTagByIdAction(id: string): Promise<ActionResponse> {
  try {
    const tag = await prisma.tag.findUnique({ where: { id } })
    if (!tag) {
      return {
        status: 404,
        success: false,
        error: 'Tag not found',
      }
    }
    return {
      status: 200,
      success: true,
      data: tag,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function updateTagAction(
  _prev: unknown,
  value: z.infer<typeof tagSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    tagSchema.parse(value)
    if (!id) {
      return {
        status: 400,
        success: false,
        error: 'Tag id is required',
      }
    }
    const updatedTag = await prisma.tag.update({ where: { id }, data: value })

    await automationProjectionService.regenerateAllFeatures()
    revalidatePath('/tags')

    return {
      status: 200,
      success: true,
      data: updatedTag,
      message: 'Tag updated successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}
