import prisma from '@/config/db-config'
import { randomUUID } from 'node:crypto'
import { prepareSharedResourceMutationInTransaction } from '@/services/coordinator/quality-journey-shared-resource-guard-service'
import { collectSharedModuleMutationEffectsInTransaction } from '@/services/coordinator/quality-journey-shared-resource-module-mutation-effects-service'
import { isSharedResourceId, sharedResourceBounds } from '@/lib/quality-journey/shared-resource-contract'
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

const moduleOwnerSelect = {
  id: true, targetProjectId: true, parentId: true, archivedAt: true, collaborationManaged: true,
} as const
type ModuleOwnerRow = Prisma.ModuleGetPayload<{ select: typeof moduleOwnerSelect }>
const compareIds = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0
const refuseModuleScope: () => never = () => {
  throw new ServiceError('Module mutation requires exact bounded module scope.', 'CONFLICT', 409)
}
const refuseManagedModule: () => never = () => {
  throw new ServiceError('Collaboration-managed modules must be archived, not deleted.', 'CONFLICT', 409)
}

async function readExactModulesInTransaction(
  tx: Prisma.TransactionClient, ids: readonly string[], targetProjectId: string,
) {
  const found = await tx.module.findMany({
    where: { id: { in: [...ids] } }, select: moduleOwnerSelect, orderBy: { id: 'asc' }, take: ids.length + 1,
  })
  const expected = new Set(ids)
  const seen = new Set<string>()
  if (found.length !== expected.size) refuseModuleScope()
  for (const row of found) {
    if (!expected.has(row.id) || seen.has(row.id) || row.targetProjectId !== targetProjectId ||
      (row.parentId !== null && !isSharedResourceId(row.parentId))) refuseModuleScope()
    seen.add(row.id)
  }
  return found
}

async function assertUpdatedParentInTransaction(
  tx: Prisma.TransactionClient, parentId: string, targetProjectId: string, subtree: readonly string[],
) {
  const descendants = new Set(subtree)
  const seen = new Set<string>()
  let current: string | null = parentId
  while (current !== null) {
    if (!isSharedResourceId(current) || seen.has(current) || descendants.has(current) ||
      seen.size >= sharedResourceBounds.keys) refuseModuleScope()
    seen.add(current)
    const parent: ModuleOwnerRow | null = await tx.module.findFirst({
      where: { id: current }, select: moduleOwnerSelect,
    })
    if (!parent || parent.id !== current || parent.targetProjectId !== targetProjectId ||
      (current === parentId && parent.archivedAt !== null) ||
      (parent.parentId !== null && !isSharedResourceId(parent.parentId))) {
      throw new ServiceError('Parent module not found in the active project', 'VALIDATION', 400)
    }
    current = parent.parentId
  }
}

async function assertActiveParent(
  value: z.infer<typeof moduleSchema>, targetProjectId: string,
  client: Pick<Prisma.TransactionClient, 'module'> = prisma,
) {
  if (value.parentId === ROOT_MODULE_UUID) return
  const parent = await client.module.findFirst({
    where: { id: value.parentId, targetProjectId, archivedAt: null },
    select: { id: true },
  })
  if (!parent) throw new ServiceError('Parent module not found in the active project', 'VALIDATION', 400)
}

export async function listModules(targetProjectId: string): Promise<ModuleWithParent[]> {
  return prisma.module.findMany({
    where: { targetProjectId, archivedAt: null },
    include: moduleInclude,
  })
}

export async function deleteModules(ids: string[], targetProjectId: string): Promise<void> {
  if (!Array.isArray(ids) || ids.length > sharedResourceBounds.keys || !ids.every(isSharedResourceId))
    refuseModuleScope()
  const requested = Object.freeze([...new Set(ids)].sort(compareIds))
  if (!requested.length) return
  if (!isSharedResourceId(targetProjectId)) refuseModuleScope()
  await prisma.$transaction(async tx => {
    const seeds = await readExactModulesInTransaction(tx, requested, targetProjectId)
    if (seeds.some(row => row.collaborationManaged)) refuseManagedModule()
    const activeIds = seeds.filter(row => row.archivedAt === null).map(row => row.id)
    if (!activeIds.length) return
    const effects = await collectSharedModuleMutationEffectsInTransaction(tx, targetProjectId, activeIds)
    const physicalModules = await readExactModulesInTransaction(tx, effects.moduleIds, targetProjectId)
    if (physicalModules.some(row => row.collaborationManaged)) refuseManagedModule()
    if (effects.testSuiteIds.length && await tx.testRunTestCase.findFirst({
      where: { testSuiteId: { in: [...effects.testSuiteIds] } }, select: { id: true },
    })) {
      throw new ServiceError('Modules with historical test run suite associations cannot be deleted.', 'CONFLICT', 409)
    }
    const modules = new Map(physicalModules.map(row => [row.id, row]))
    const active = new Set(activeIds)
    const roots = activeIds.filter(id => {
      const seen = new Set<string>([id])
      let current = modules.get(id)?.parentId
      if (current === undefined) return refuseModuleScope()
      while (current !== null && modules.has(current)) {
        if (seen.has(current)) return refuseModuleScope()
        seen.add(current)
        if (active.has(current)) return false
        current = modules.get(current)!.parentId
      }
      return true
    }).sort(compareIds)
    // Cases survive both Suite membership and Locator deletion; guard their
    // changed descriptors without tombstoning those retained identities.
    const deleted = effects.existing.filter(key => key.kind !== 'TEST_CASE')
    await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
      existing: effects.existing, newRoots: [], deleted,
    })
    const result = await tx.module.deleteMany({
      where: { id: { in: roots }, targetProjectId, archivedAt: null, collaborationManaged: false },
    })
    if (result.count !== roots.length) refuseModuleScope()
  })
}

export async function createModule(value: z.infer<typeof moduleSchema>, targetProjectId: string): Promise<Module> {
  const requested = Object.freeze({ ...value })
  const id = randomUUID()
  const moduleData = {
    ...requested,
    id,
    targetProjectId,
    parentId: requested.parentId === ROOT_MODULE_UUID ? null : requested.parentId,
  }
  return prisma.$transaction(async tx => {
    await assertActiveParent(requested, targetProjectId, tx)
    // A parent FK read does not change its descriptor. This creates only a new
    // identity, with its retained guard in the same owning transaction.
    await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
      existing: [], newRoots: [{ kind: 'MODULE', resourceId: id }], deleted: [],
    })
    return tx.module.create({ data: moduleData })
  })
}

export async function getModuleByIdOrThrow(id: string, targetProjectId: string): Promise<ModuleWithParent> {
  const moduleData = await prisma.module.findFirst({
    where: { id, targetProjectId, archivedAt: null },
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
  const requested = Object.freeze({ ...value })
  return prisma.$transaction(async tx => {
    const existing = await tx.module.findFirst({
      where: { id, targetProjectId, archivedAt: null }, select: moduleOwnerSelect,
    })
    if (!existing || existing.id !== id || existing.targetProjectId !== targetProjectId || existing.archivedAt !== null)
      throw new ServiceError('Module not found', 'NOT_FOUND', 404)
    const effects = await collectSharedModuleMutationEffectsInTransaction(tx, targetProjectId, [id])
    const parentId = requested.parentId === ROOT_MODULE_UUID ? null : requested.parentId ?? existing.parentId
    if (requested.parentId !== undefined && parentId !== null)
      await assertUpdatedParentInTransaction(tx, parentId, targetProjectId, effects.moduleIds)
    await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
      existing: effects.existing, newRoots: [], deleted: [],
    })
    return tx.module.update({ where: { id }, data: { ...requested, parentId } })
  })
}
