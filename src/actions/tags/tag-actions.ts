'use server'

import { tagSchema } from '@/constants/form-opts/tag-form-opts'
import { createTag, deleteTags, getTagByIdOrThrow, listFilterTags, updateTag } from '@/services/tag/tag-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireActiveProjectForMutation } from '@/lib/active-project'

export async function getAllTagsAction(): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation()
    const tags = await listFilterTags(project.id)
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
    const project = await requireActiveProjectForMutation()
    await deleteTags(ids, project.id)
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
    const project = await requireActiveProjectForMutation()
    const newTag = await createTag(value, project.id)
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
    const project = await requireActiveProjectForMutation()
    const tag = await getTagByIdOrThrow(id, project.id)
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
    const project = await requireActiveProjectForMutation()
    const updatedTag = await updateTag(id, value, project.id)
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
