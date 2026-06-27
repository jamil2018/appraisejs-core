import prisma from '@/config/db-config'
import { templateStepGroupSchema } from '@/constants/form-opts/template-step-group-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { ServiceError } from '@/services/shared/errors'
import type { TemplateStepGroup } from '@prisma/client'
import type { z } from 'zod'

type TemplateStepGroupType = 'ACTION' | 'VALIDATION'

function getGroupType(group: Pick<TemplateStepGroup, 'type'>): TemplateStepGroupType {
  return group.type === 'VALIDATION' ? 'VALIDATION' : 'ACTION'
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

export async function listTemplateStepGroups(): Promise<TemplateStepGroup[]> {
  return prisma.templateStepGroup.findMany()
}

export async function createTemplateStepGroup(
  value: z.infer<typeof templateStepGroupSchema>,
): Promise<TemplateStepGroup> {
  const type: TemplateStepGroupType = (value.type as string) === 'VALIDATION' ? 'VALIDATION' : 'ACTION'
  const description = normalizeOptionalText(value.description)
  const createdGroup = await prisma.templateStepGroup.create({
    data: {
      name: value.name,
      description,
      type,
    } as Parameters<typeof prisma.templateStepGroup.create>[0]['data'],
  })
  await automationProjectionService.syncTemplateStepGroup(createdGroup.id)
  return createdGroup
}

export async function deleteTemplateStepGroups(ids: string[]): Promise<void> {
  await Promise.all(ids.map(id => automationProjectionService.deleteTemplateStepGroup(id)))
  await prisma.templateStepGroup.deleteMany({ where: { id: { in: ids } } })
}

export async function getTemplateStepGroupByIdOrThrow(id: string): Promise<TemplateStepGroup> {
  const templateStepGroup = await prisma.templateStepGroup.findUnique({ where: { id } })
  if (!templateStepGroup) {
    throw new ServiceError('Template step group not found', 'NOT_FOUND', 404)
  }
  return templateStepGroup
}

export async function updateTemplateStepGroup(
  id: string | undefined,
  value: z.infer<typeof templateStepGroupSchema>,
): Promise<void> {
  if (!id) {
    throw new ServiceError('Template step group ID is required', 'VALIDATION', 400)
  }

  const currentGroup = await prisma.templateStepGroup.findUnique({ where: { id } })
  if (!currentGroup) {
    throw new ServiceError('Template step group not found', 'NOT_FOUND', 404)
  }

  const newType: TemplateStepGroupType = (value.type as string) === 'VALIDATION' ? 'VALIDATION' : 'ACTION'
  const currentType = getGroupType(currentGroup)
  const description = normalizeOptionalText(value.description)

  if (currentGroup.name !== value.name || currentType !== newType) {
    await automationProjectionService.renameTemplateStepGroup(id, value.name, newType, description)
  }

  await prisma.templateStepGroup.update({
    where: { id },
    data: {
      name: value.name,
      description,
      type: newType,
    } as Parameters<typeof prisma.templateStepGroup.update>[0]['data'],
  })

  await automationProjectionService.syncTemplateStepGroup(id)
}
