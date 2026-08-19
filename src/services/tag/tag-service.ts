import prisma from '@/config/db-config'
import { tagSchema } from '@/constants/form-opts/tag-form-opts'
import { ServiceError } from '@/services/shared/errors'
import { TagType } from '@prisma/client'
import type { Tag } from '@prisma/client'
import type { z } from 'zod'

async function checkUniqueTagName(name: string, targetProjectId: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.tag.findFirst({
    where: {
      name,
      targetProjectId,
      ...(excludeId && { id: { not: excludeId } }),
    },
  })

  return !!existing
}

async function checkUniqueTagExpression(
  tagExpression: string,
  targetProjectId: string,
  excludeId?: string,
): Promise<boolean> {
  const existing = await prisma.tag.findFirst({
    where: {
      tagExpression,
      targetProjectId,
      ...(excludeId && { id: { not: excludeId } }),
    },
  })

  return !!existing
}

export async function listFilterTags(targetProjectId: string): Promise<Tag[]> {
  return prisma.tag.findMany({
    where: { type: TagType.FILTER, targetProjectId },
  })
}

export async function deleteTags(ids: string[], targetProjectId: string): Promise<void> {
  await prisma.tag.deleteMany({ where: { id: { in: ids }, targetProjectId } })
}

export async function createTag(value: z.infer<typeof tagSchema>, targetProjectId: string): Promise<Tag> {
  const tagNameExists = await checkUniqueTagName(value.name, targetProjectId)
  if (tagNameExists) {
    throw new ServiceError(
      'A tag with this name already exists. Please choose a different tag name.',
      'VALIDATION',
      400,
    )
  }

  const tagExpressionExists = await checkUniqueTagExpression(value.tagExpression, targetProjectId)
  if (tagExpressionExists) {
    throw new ServiceError(
      'A tag with this tag expression already exists. Please choose a different tag expression.',
      'VALIDATION',
      400,
    )
  }

  const newTag = await prisma.tag.create({ data: { ...value, targetProjectId } })
  return newTag
}

export async function getTagByIdOrThrow(id: string, targetProjectId: string): Promise<Tag> {
  const tag = await prisma.tag.findFirst({ where: { id, targetProjectId } })
  if (!tag) {
    throw new ServiceError('Tag not found', 'NOT_FOUND', 404)
  }
  return tag
}

export async function updateTag(
  id: string | undefined,
  value: z.infer<typeof tagSchema>,
  targetProjectId: string,
): Promise<Tag> {
  if (!id) {
    throw new ServiceError('Tag id is required', 'VALIDATION', 400)
  }

  const currentTag = await prisma.tag.findFirst({
    where: { id, targetProjectId },
    select: { name: true, tagExpression: true },
  })
  if (!currentTag) {
    throw new ServiceError('Tag not found', 'NOT_FOUND', 404)
  }

  if (currentTag.name !== value.name) {
    const tagNameExists = await checkUniqueTagName(value.name, targetProjectId, id)
    if (tagNameExists) {
      throw new ServiceError(
        'A tag with this name already exists. Please choose a different tag name.',
        'VALIDATION',
        400,
      )
    }
  }

  if (currentTag.tagExpression !== value.tagExpression) {
    const tagExpressionExists = await checkUniqueTagExpression(value.tagExpression, targetProjectId, id)
    if (tagExpressionExists) {
      throw new ServiceError(
        'A tag with this tag expression already exists. Please choose a different tag expression.',
        'VALIDATION',
        400,
      )
    }
  }

  const updatedTag = await prisma.tag.update({ where: { id }, data: value })
  return updatedTag
}
