'use server'

import { tagSchema } from '@/constants/form-opts/tag-form-opts'
import {
  createTag,
  deleteTags,
  getTagByIdOrThrow,
  listFilterTags,
  updateTag,
} from '@/services/tag/tag-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export async function getAllTagsAction(): Promise<ActionResponse> {
  try {
    const tags = await listFilterTags()
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
    await deleteTags(ids)
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
    const newTag = await createTag(value)
    revalidatePath('/tags')
    return {
      status: 200,
      success: true,
      data: newTag,
      message: 'Tag created successfully',
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function getTagByIdAction(id: string): Promise<ActionResponse> {
  try {
    const tag = await getTagByIdOrThrow(id)
    return {
      status: 200,
      success: true,
      data: tag,
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
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
    const updatedTag = await updateTag(id, value)
    revalidatePath('/tags')
    return {
      status: 200,
      success: true,
      data: updatedTag,
      message: 'Tag updated successfully',
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}
