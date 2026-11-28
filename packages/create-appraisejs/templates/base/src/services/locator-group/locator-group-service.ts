import prisma from '@/config/db-config'
import { randomUUID } from 'node:crypto'
import { locatorGroupSchema } from '@/constants/form-opts/locator-group-form-opts'
import { isSharedResourceId, sharedResourceBounds } from '@/lib/quality-journey/shared-resource-contract'
import {
  prepareSharedResourceMutationInTransaction,
  type SharedResourceMutationKey,
} from '@/services/coordinator/quality-journey-shared-resource-guard-service'
import { ServiceError } from '@/services/shared/errors'
import type { LocatorGroup } from '@prisma/client'
import { Prisma } from '@prisma/client'
import type { z } from 'zod'

const locatorGroupInclude = {
  module: {
    select: { name: true },
  },
} as const

export type LocatorGroupWithModule = Prisma.LocatorGroupGetPayload<{ include: typeof locatorGroupInclude }>

type Tx = Prisma.TransactionClient
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const groupSelect = {
  id: true,
  targetProjectId: true,
  moduleId: true,
  archivedAt: true,
  collaborationManaged: true,
  name: true,
} as const
const locatorSelect = { id: true, targetProjectId: true, locatorGroupId: true, archivedAt: true } as const
type GroupRow = Prisma.LocatorGroupGetPayload<{ select: typeof groupSelect }>
type LocatorRow = Prisma.LocatorGetPayload<{ select: typeof locatorSelect }>
const refuse: (reason: string) => never = reason => {
  throw new ServiceError('Locator group mutation requires exact bounded shared-resource effects.', 'CONFLICT', 409, {
    protocol: 'M06_SHARED_LOCATOR_GROUP_MUTATION_EFFECTS_V1',
    reason,
  })
}
const relationships: () => never = () => {
  throw new ServiceError('Locator group relationships must belong to the active project', 'VALIDATION', 400)
}
const duplicateName = () =>
  new ServiceError('A locator group with this name already exists. Please choose a different name.', 'VALIDATION', 400)

function snapshot(value: z.infer<typeof locatorGroupSchema>) {
  if (
    value.locators !== undefined &&
    (!Array.isArray(value.locators) ||
      value.locators.length > sharedResourceBounds.keys ||
      !value.locators.every(isSharedResourceId) ||
      new Set(value.locators).size !== value.locators.length)
  )
    relationships()
  return Object.freeze({
    ...value,
    locators: value.locators === undefined ? undefined : Object.freeze([...value.locators]),
  })
}

async function validateModule(tx: Tx, moduleId: string, targetProjectId: string) {
  if (!isSharedResourceId(moduleId) || !isSharedResourceId(targetProjectId)) relationships()
  const selectedModule = await tx.module.findFirst({
    where: { id: moduleId, targetProjectId, archivedAt: null },
    select: { id: true, targetProjectId: true, archivedAt: true },
  })
  if (
    !selectedModule ||
    selectedModule.id !== moduleId ||
    selectedModule.targetProjectId !== targetProjectId ||
    selectedModule.archivedAt !== null
  )
    relationships()
}

async function exactGroups(tx: Tx, ids: readonly string[], targetProjectId: string): Promise<GroupRow[]> {
  if (!ids.length) return []
  const groups = await tx.locatorGroup.findMany({
    where: { id: { in: [...ids] } },
    select: groupSelect,
    orderBy: { id: 'asc' },
    take: ids.length + 1,
  })
  const expected = new Set(ids),
    seen = new Set<string>()
  if (groups.length !== expected.size) refuse('GROUP_SCOPE')
  for (const row of groups) {
    if (
      !expected.has(row.id) ||
      seen.has(row.id) ||
      row.targetProjectId !== targetProjectId ||
      !isSharedResourceId(row.moduleId)
    )
      refuse('GROUP_SCOPE')
    seen.add(row.id)
  }
  return groups
}

/** Private read-only closure for these three owners; no issuer or transferable proof. */
async function collectEffects(
  tx: Tx,
  targetProjectId: string,
  groups: readonly GroupRow[],
  incoming: readonly string[],
) {
  const keys = new Map<string, SharedResourceMutationKey>()
  const add = (kind: SharedResourceMutationKey['kind'], resourceId: string) => {
    const identity = `${kind}\n${resourceId}`
    if (!isSharedResourceId(resourceId)) refuse('RELATION_ENDPOINT')
    if (keys.has(identity)) return
    if (keys.size >= sharedResourceBounds.keys) refuse('KEYS_UNBOUNDED')
    keys.set(identity, { kind, resourceId })
  }
  let examined = 0
  const take = () => 65_536 - examined + 1
  const rows = <T extends { id: string }>(found: T[]) => {
    if (found.length > 65_536 - examined) refuse('ROWS_UNBOUNDED')
    examined += found.length
    const seen = new Set<string>()
    for (const row of found) {
      if (!isSharedResourceId(row.id) || seen.has(row.id)) refuse('ROW_ID_OR_DUPLICATE')
      seen.add(row.id)
    }
    return found
  }
  const exact = (ids: readonly string[], found: readonly { id: string }[]) => {
    const expected = new Set(ids)
    if (found.length !== expected.size || found.some(row => !expected.has(row.id))) refuse('RELATION_ENDPOINT')
  }
  const groupMap = new Map(groups.map(row => [row.id, row]))
  for (const row of rows([...groups])) {
    if (row.targetProjectId !== targetProjectId || !isSharedResourceId(row.moduleId)) refuse('GROUP_SCOPE')
    add('LOCATOR_GROUP', row.id)
  }
  const locators = new Map<string, LocatorRow>()
  const remember = (found: LocatorRow[]) => {
    for (const row of found) {
      if (
        row.targetProjectId !== targetProjectId ||
        (row.locatorGroupId !== null && !isSharedResourceId(row.locatorGroupId))
      )
        refuse('LOCATOR_SCOPE')
      const previous = locators.get(row.id)
      if (previous && previous.locatorGroupId !== row.locatorGroupId) refuse('RELATION_ENDPOINT')
      locators.set(row.id, row)
      add('LOCATOR', row.id)
    }
  }
  if (groups.length) {
    const current = rows(
      await tx.locator.findMany({
        where: { locatorGroupId: { in: [...groupMap.keys()].sort(compare) } },
        select: locatorSelect,
        orderBy: { id: 'asc' },
        take: take(),
      }),
    )
    if (current.some(row => row.locatorGroupId === null || !groupMap.has(row.locatorGroupId)))
      refuse('RELATION_ENDPOINT')
    remember(current)
  }
  if (incoming.length) {
    const selected = rows(
      await tx.locator.findMany({
        where: { id: { in: [...incoming] } },
        select: locatorSelect,
        orderBy: { id: 'asc' },
        take: take(),
      }),
    )
    const expected = new Set(incoming)
    if (selected.length !== expected.size || selected.some(row => !expected.has(row.id))) relationships()
    if (selected.some(row => row.targetProjectId !== targetProjectId || row.archivedAt !== null)) relationships()
    remember(selected)
  }
  const priorIds = [
    ...new Set([...locators.values()].flatMap(row => (row.locatorGroupId === null ? [] : [row.locatorGroupId]))),
  ]
    .filter(id => !groupMap.has(id))
    .sort(compare)
  for (const row of rows(await exactGroups(tx, priorIds, targetProjectId))) {
    groupMap.set(row.id, row)
  }
  // Module endpoints are relationship reads, never mutation keys. Existing
  // archived parents remain legitimate endpoints; supplied parents were active-validated.
  const moduleIds = [...new Set([...groupMap.values()].map(row => row.moduleId))].sort(compare)
  if (moduleIds.length) {
    const modules = rows(
      await tx.module.findMany({
        where: { id: { in: moduleIds } },
        select: { id: true, targetProjectId: true },
        orderBy: { id: 'asc' },
        take: take(),
      }),
    )
    exact(moduleIds, modules)
    if (modules.some(row => row.targetProjectId !== targetProjectId)) refuse('RELATION_ENDPOINT')
  }
  const locatorIds = [...locators.keys()].sort(compare)
  if (locatorIds.length) {
    const parameters = rows(
      await tx.testCaseStepParameter.findMany({
        where: { locatorId: { in: locatorIds } },
        select: { id: true, testCaseStepId: true, locatorId: true },
        orderBy: { id: 'asc' },
        take: take(),
      }),
    )
    const locatorSet = new Set(locatorIds)
    if (
      parameters.some(
        row => row.locatorId === null || !locatorSet.has(row.locatorId) || !isSharedResourceId(row.testCaseStepId),
      )
    )
      refuse('RELATION_ENDPOINT')
    const stepIds = [...new Set(parameters.map(row => row.testCaseStepId))].sort(compare)
    if (stepIds.length) {
      const steps = rows(
        await tx.testCaseStep.findMany({
          where: { id: { in: stepIds } },
          select: { id: true, testCaseId: true },
          orderBy: { id: 'asc' },
          take: take(),
        }),
      )
      exact(stepIds, steps)
      if (steps.some(row => !isSharedResourceId(row.testCaseId))) refuse('RELATION_ENDPOINT')
      const caseIds = [...new Set(steps.map(row => row.testCaseId))].sort(compare)
      const cases = rows(
        await tx.testCase.findMany({
          where: { id: { in: caseIds } },
          select: { id: true, targetProjectId: true },
          orderBy: { id: 'asc' },
          take: take(),
        }),
      )
      exact(caseIds, cases)
      for (const row of cases) {
        if (row.targetProjectId !== targetProjectId) refuse('RELATION_ENDPOINT')
        add('TEST_CASE', row.id)
      }
    }
    if (
      rows(
        await tx.templateTestCaseStepParameter.findMany({
          where: { OR: [{ defaultLocatorId: { in: locatorIds } }, { locatorId: { in: locatorIds } }] },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: take(),
        }),
      ).length
    )
      refuse('TEMPLATE_LOCATOR_DEPENDENCY_UNSUPPORTED')
    if (
      rows(
        await tx.conflictResolution.findMany({
          where: { OR: [{ entityId: { in: locatorIds } }, { conflictingEntityId: { in: locatorIds } }] },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: take(),
        }),
      ).length
    )
      refuse('LOCATOR_CONFLICT_DEPENDENCY_UNSUPPORTED')
  }
  return {
    existing: [...keys.values()].sort((a, b) => compare(a.kind, b.kind) || compare(a.resourceId, b.resourceId)),
    locatorIds,
  }
}

async function checkUniqueName(
  client: Pick<Tx, 'locatorGroup'>,
  name: string,
  targetProjectId: string,
  excludeId?: string,
): Promise<boolean> {
  const existing = await client.locatorGroup.findFirst({
    where: {
      name,
      targetProjectId,
      ...(excludeId && { id: { not: excludeId } }),
    },
  })
  return !!existing
}

export async function listLocatorGroups(targetProjectId: string): Promise<LocatorGroupWithModule[]> {
  return prisma.locatorGroup.findMany({
    where: { targetProjectId, archivedAt: null },
    include: locatorGroupInclude,
  })
}

export async function getLocatorGroupByIdOrThrow(id: string, targetProjectId: string): Promise<LocatorGroupWithModule> {
  const locatorGroup = await prisma.locatorGroup.findFirst({
    where: { id, targetProjectId, archivedAt: null },
    include: locatorGroupInclude,
  })
  if (!locatorGroup) {
    throw new ServiceError('Locator group not found', 'NOT_FOUND', 404)
  }
  return locatorGroup
}

export async function createLocatorGroup(
  value: z.infer<typeof locatorGroupSchema>,
  targetProjectId: string,
): Promise<LocatorGroup> {
  const requested = snapshot(value)
  const id = randomUUID()
  return prisma.$transaction(tx => createLocatorGroupPreparedInTransaction(tx, requested, targetProjectId, id))
}

export async function createLocatorGroupInTransaction(
  tx: Tx,
  value: z.infer<typeof locatorGroupSchema>,
  targetProjectId: string,
): Promise<LocatorGroup> {
  const requested = snapshot(value)
  const id = randomUUID()
  return createLocatorGroupPreparedInTransaction(tx, requested, targetProjectId, id)
}

async function createLocatorGroupPreparedInTransaction(
  tx: Tx,
  requested: ReturnType<typeof snapshot>,
  targetProjectId: string,
  id: string,
): Promise<LocatorGroup> {
  await validateModule(tx, requested.moduleId, targetProjectId)
  if (await checkUniqueName(tx, requested.name, targetProjectId)) throw duplicateName()
  const effects = await collectEffects(tx, targetProjectId, [], requested.locators ?? [])
  if (effects.existing.length + 1 > sharedResourceBounds.keys) refuse('KEYS_UNBOUNDED')
  await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
    existing: effects.existing,
    newRoots: [{ kind: 'LOCATOR_GROUP', resourceId: id }],
    deleted: [],
  })
  try {
    return await tx.locatorGroup.create({
      data: {
        id,
        name: requested.name,
        moduleId: requested.moduleId,
        route: requested.route ?? '/',
        targetProjectId,
        locators: { connect: requested.locators?.map(locator => ({ id: locator })) ?? [] },
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw duplicateName()
    throw error
  }
}

export async function updateLocatorGroup(
  id: string | undefined,
  value: z.infer<typeof locatorGroupSchema>,
  targetProjectId: string,
): Promise<LocatorGroupWithModule> {
  if (!id) {
    throw new ServiceError('Locator group id is required', 'VALIDATION', 400)
  }

  const requested = snapshot(value)
  return prisma.$transaction(tx => updateLocatorGroupPreparedInTransaction(tx, id, requested, targetProjectId))
}

type ExactGroupSnapshot = { name: string; moduleId: string; route: string; updatedAt: Date }

async function updateLocatorGroupPreparedInTransaction(
  tx: Tx,
  id: string,
  requested: ReturnType<typeof snapshot>,
  targetProjectId: string,
  exact?: ExactGroupSnapshot,
): Promise<LocatorGroupWithModule> {
  const scoped = { id, targetProjectId, archivedAt: null, ...exact }
  const current = await tx.locatorGroup.findFirst({
    where: scoped,
    select: groupSelect,
  })
  if (!current || current.id !== id || current.targetProjectId !== targetProjectId || current.archivedAt !== null) {
    if (exact) throw new ServiceError('The locator group changed. Review it again before renaming.', 'CONFLICT', 409)
    throw new ServiceError('Locator group not found', 'NOT_FOUND', 404)
  }
  if (current.name !== requested.name && (await checkUniqueName(tx, requested.name, targetProjectId, id)))
    throw duplicateName()
  await validateModule(tx, requested.moduleId, targetProjectId)
  const effects = await collectEffects(tx, targetProjectId, [current], requested.locators ?? [])
  await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
    existing: effects.existing,
    newRoots: [],
    deleted: [],
  })
  try {
    return await tx.locatorGroup.update({
      where: exact ? scoped : { id },
      data: {
        name: requested.name,
        moduleId: requested.moduleId,
        route: requested.route,
        ...(exact ? { updatedAt: new Date(Math.max(Date.now(), exact.updatedAt.getTime() + 1)) } : {}),
        ...(requested.locators !== undefined && {
          locators: {
            set: requested.locators.map(locator => ({ id: locator })),
          },
        }),
      },
      include: locatorGroupInclude,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw duplicateName()
    if (exact && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
      throw new ServiceError('The locator group changed. Review it again before renaming.', 'CONFLICT', 409)
    throw error
  }
}

/** Rename one exact group without changing its route, module, or locator membership. */
export async function renameExactLocatorGroupInTransaction(
  tx: Tx,
  input: { targetProjectId: string; currentName: string; moduleName: string; route: string; nextName: string },
): Promise<{ id: string; name: string }> {
  const { targetProjectId, currentName, moduleName, route, nextName } = input
  if (!isSharedResourceId(targetProjectId) || currentName === nextName) relationships()
  const groups = await tx.locatorGroup.findMany({
    where: { targetProjectId, name: currentName, archivedAt: null },
    select: { ...groupSelect, route: true, updatedAt: true },
    take: 2,
  })
  if (groups.length !== 1) refuse('GROUP_NAME_AMBIGUOUS_OR_MISSING')
  const selected = groups[0]!
  if (
    !isSharedResourceId(selected.id) ||
    selected.targetProjectId !== targetProjectId ||
    selected.archivedAt !== null ||
    selected.route !== route
  )
    refuse('GROUP_DISPLAYED_SCOPE_CHANGED')
  const selectedModule = await tx.module.findFirst({
    where: { id: selected.moduleId, targetProjectId, archivedAt: null },
    select: { id: true, name: true, targetProjectId: true, archivedAt: true },
  })
  if (
    !selectedModule ||
    selectedModule.id !== selected.moduleId ||
    selectedModule.targetProjectId !== targetProjectId ||
    selectedModule.archivedAt !== null ||
    selectedModule.name !== moduleName
  )
    refuse('GROUP_MODULE_DISPLAYED_SCOPE_CHANGED')
  const renamed = await updateLocatorGroupPreparedInTransaction(
    tx,
    selected.id,
    snapshot(locatorGroupSchema.parse({ name: nextName, moduleId: selected.moduleId, route })),
    targetProjectId,
    { name: currentName, moduleId: selected.moduleId, route, updatedAt: selected.updatedAt },
  )
  return { id: renamed.id, name: renamed.name }
}

export async function deleteLocatorGroups(ids: string[], targetProjectId: string): Promise<string[]> {
  if (!Array.isArray(ids) || ids.length > sharedResourceBounds.keys || !ids.every(isSharedResourceId))
    refuse('REQUEST_SCOPE_OR_BOUNDS')
  const requested = [...ids]
  const unique = [...new Set(requested)].sort(compare)
  if (!unique.length) return requested
  if (!isSharedResourceId(targetProjectId)) refuse('REQUEST_SCOPE_OR_BOUNDS')
  await prisma.$transaction(async tx => {
    const groups = await exactGroups(tx, unique, targetProjectId)
    if (groups.some(row => row.collaborationManaged)) {
      throw new ServiceError('Collaboration-managed locator groups must be archived, not deleted.', 'CONFLICT', 409)
    }
    const active = groups.filter(row => row.archivedAt === null)
    if (!active.length) return
    const effects = await collectEffects(tx, targetProjectId, active, [])
    await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
      existing: effects.existing,
      newRoots: [],
      deleted: [
        ...active.map(row => ({ kind: 'LOCATOR_GROUP' as const, resourceId: row.id })),
        ...effects.locatorIds.map(resourceId => ({ kind: 'LOCATOR' as const, resourceId })),
      ],
    })
    const deleted = await tx.locatorGroup.deleteMany({
      where: {
        id: { in: active.map(row => row.id).sort(compare) },
        targetProjectId,
        archivedAt: null,
        collaborationManaged: false,
      },
    })
    if (deleted.count !== active.length) refuse('DELETE_COUNT_MISMATCH')
  })
  return requested
}

export async function checkLocatorGroupNameUnique(
  name: string,
  targetProjectId: string,
  excludeId?: string,
): Promise<boolean> {
  return !(await checkUniqueName(prisma, name, targetProjectId, excludeId))
}
