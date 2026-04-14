import prisma from '@/config/db-config'
import { tagSchema } from '@/constants/form-opts/tag-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { ServiceError } from '@/services/shared/errors'
import { TagType } from '@prisma/client'
import type { Tag } from '@prisma/client'
import type { z } from 'zod'

export async function listFilterTags(): Promise<Tag[]> {
  return prisma.tag.findMany({
    where: { type: TagType.FILTER },
  })
}

export async function deleteTags(ids: string[]): Promise<void> {
  await prisma.tag.deleteMany({ where: { id: { in: ids } } })
  await automationProjectionService.regenerateAllFeatures()
}

export async function createTag(value: z.infer<typeof tagSchema>): Promise<Tag> {
  const newTag = await prisma.tag.create({ data: value })
  await automationProjectionService.regenerateAllFeatures()
  return newTag
}

export async function getTagByIdOrThrow(id: string): Promise<Tag> {
  const tag = await prisma.tag.findUnique({ where: { id } })
  if (!tag) {
    throw new ServiceError('Tag not found', 'NOT_FOUND', 404)
  }
  return tag
}

export async function updateTag(id: string | undefined, value: z.infer<typeof tagSchema>): Promise<Tag> {
  if (!id) {
    throw new ServiceError('Tag id is required', 'VALIDATION', 400)
  }
  const updatedTag = await prisma.tag.update({ where: { id }, data: value })
  await automationProjectionService.regenerateAllFeatures()
  return updatedTag
}
