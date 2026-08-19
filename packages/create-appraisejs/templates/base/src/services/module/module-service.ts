import prisma from '@/config/db-config'
import { moduleSchema, ROOT_MODULE_UUID } from '@/constants/form-opts/module-form-opts'
import { ServiceError } from '@/services/shared/errors'
import type { Module } from '@prisma/client'
import { Prisma } from '@prisma/client'
import type { z } from 'zod'

const moduleInclude = {
  parent: {
    select: { name: true },
  },
} as const

export type ModuleWithParent = Prisma.ModuleGetPayload<{ include: typeof moduleInclude }>

export async function listModules(targetProjectId: string): Promise<ModuleWithParent[]> {
  return prisma.module.findMany({
    where: { targetProjectId },
    include: moduleInclude,
  })
}

export async function deleteModules(ids: string[], targetProjectId: string): Promise<void> {
  await prisma.module.deleteMany({ where: { id: { in: ids }, targetProjectId } })
}

export async function createModule(value: z.infer<typeof moduleSchema>, targetProjectId: string): Promise<Module> {
  if (value.parentId !== ROOT_MODULE_UUID) {
    const parent = await prisma.module.findFirst({
      where: { id: value.parentId, targetProjectId },
      select: { id: true },
    })
    if (!parent) throw new ServiceError('Parent module not found in the active project', 'VALIDATION', 400)
  }
  const moduleData = {
    ...value,
    targetProjectId,
    parentId: value.parentId === ROOT_MODULE_UUID ? null : value.parentId,
  }
  const newModule = await prisma.module.create({ data: moduleData })
  return newModule
}

export async function getModuleByIdOrThrow(id: string, targetProjectId: string): Promise<ModuleWithParent> {
  const moduleData = await prisma.module.findFirst({
    where: { id, targetProjectId },
    include: moduleInclude,
  })
  if (!moduleData) {
    throw new ServiceError('Module not found', 'NOT_FOUND', 404)
  }
  return moduleData
}

export async function updateModule(
  id: string | undefined,
  value: z.infer<typeof moduleSchema>,
  targetProjectId: string,
): Promise<Module> {
  if (!id) {
    throw new ServiceError('Module id is required', 'VALIDATION', 400)
  }
  await getModuleByIdOrThrow(id, targetProjectId)
  if (value.parentId !== ROOT_MODULE_UUID) {
    const parent = await prisma.module.findFirst({
      where: { id: value.parentId, targetProjectId },
      select: { id: true },
    })
    if (!parent) throw new ServiceError('Parent module not found in the active project', 'VALIDATION', 400)
  }
  const moduleData = {
    ...value,
    parentId: value.parentId === ROOT_MODULE_UUID ? null : value.parentId,
  }
  const updatedModule = await prisma.module.update({
    where: { id },
    data: moduleData,
  })
  return updatedModule
}
