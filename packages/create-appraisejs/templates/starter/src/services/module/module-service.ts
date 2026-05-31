import prisma from '@/config/db-config'
import { moduleSchema, ROOT_MODULE_UUID } from '@/constants/form-opts/module-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
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

export async function listModules(): Promise<ModuleWithParent[]> {
  return prisma.module.findMany({
    include: moduleInclude,
  })
}

export async function deleteModules(ids: string[]): Promise<void> {
  await prisma.module.deleteMany({ where: { id: { in: ids } } })
  await automationProjectionService.regenerateAllPathDependentArtifacts()
}

export async function createModule(value: z.infer<typeof moduleSchema>): Promise<Module> {
  const moduleData = {
    ...value,
    parentId: value.parentId === ROOT_MODULE_UUID ? null : value.parentId,
  }
  const newModule = await prisma.module.create({ data: moduleData })
  await automationProjectionService.regenerateAllPathDependentArtifacts()
  return newModule
}

export async function getModuleByIdOrThrow(id: string): Promise<ModuleWithParent> {
  const moduleData = await prisma.module.findUnique({
    where: { id },
    include: moduleInclude,
  })
  if (!moduleData) {
    throw new ServiceError('Module not found', 'NOT_FOUND', 404)
  }
  return moduleData
}

export async function updateModule(id: string | undefined, value: z.infer<typeof moduleSchema>): Promise<Module> {
  if (!id) {
    throw new ServiceError('Module id is required', 'VALIDATION', 400)
  }
  const moduleData = {
    ...value,
    parentId: value.parentId === ROOT_MODULE_UUID ? null : value.parentId,
  }
  const updatedModule = await prisma.module.update({
    where: { id },
    data: moduleData,
  })
  await automationProjectionService.regenerateAllPathDependentArtifacts()
  return updatedModule
}
