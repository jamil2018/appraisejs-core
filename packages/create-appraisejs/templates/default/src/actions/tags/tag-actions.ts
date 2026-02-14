'use server'

import prisma from '@/config/db-config'
import { tagSchema } from '@/constants/form-opts/tag-form-opts'
import { ActionResponse } from '@/types/form/actionHandler'
import { TagType } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export async function getAllTagsAction(): Promise<ActionResponse> {
  try {
    const tags = await prisma.tag.findMany({
      where: {
        type: TagType.FILTER,
      },
    })
    return {
      status: 200,
      data: tags,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function deleteTagAction(ids: string[]): Promise<ActionResponse> {
  try {
    await prisma.tag.deleteMany({ where: { id: { in: ids } } })

    revalidatePath('/tags')

    return {
      status: 200,
      message: 'Tag deleted successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function createTagAction(_prev: unknown, value: z.infer<typeof tagSchema>): Promise<ActionResponse> {
  try {
    const newTag = await prisma.tag.create({
      data: value,
    })

    revalidatePath('/tags')

    return {
      status: 200,
      data: newTag,
      message: 'Tag created successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function getTagByIdAction(id: string): Promise<ActionResponse> {
  try {
    const tag = await prisma.tag.findUnique({ where: { id } })
    return {
      status: 200,
      data: tag,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function updateTagAction(
  _prev: unknown,
  value: z.infer<typeof tagSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    const updatedTag = await prisma.tag.update({ where: { id }, data: value })

    revalidatePath('/tags')

    return {
      status: 200,
      data: updatedTag,
      message: 'Tag updated successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}
