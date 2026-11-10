import type { Prisma } from '@prisma/client'

import { isSharedResourceId, sharedResourceBounds } from '@/lib/quality-journey/shared-resource-contract'
import { ServiceError } from '@/services/shared/errors'
import type { SharedResourceMutationKey } from './quality-journey-shared-resource-guard-service'

export type SharedModuleMutationEffects = Readonly<{
  existing: readonly SharedResourceMutationKey[]
  moduleIds: readonly string[]
  locatorGroupIds: readonly string[]
  locatorIds: readonly string[]
  testSuiteIds: readonly string[]
  testCaseIds: readonly string[]
}>

type ModuleRow = { id: string; targetProjectId: string; parentId: string | null }

type SharedModuleMutationEffectsRefusalReason =
  | 'REQUEST_SCOPE_OR_BOUNDS'
  | 'TARGET_MISSING'
  | 'ROWS_UNBOUNDED'
  | 'KEYS_UNBOUNDED'
  | 'ROW_ID_OR_DUPLICATE'
  | 'RESOURCE_MISSING_OR_FOREIGN'
  | 'RELATION_ENDPOINT'
  | 'MODULE_ANCESTRY_CYCLE'
  | 'TEMPLATE_LOCATOR_DEPENDENCY_UNSUPPORTED'
  | 'LOCATOR_CONFLICT_DEPENDENCY_UNSUPPORTED'

const refuse: (reason: SharedModuleMutationEffectsRefusalReason) => never = reason => {
  throw new ServiceError('Module mutation requires exact bounded shared-resource effects.', 'CONFLICT', 409, {
    protocol: 'M06_SHARED_MODULE_MUTATION_EFFECTS_V1',
    reason,
  })
}
const compare = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0)
const moduleSelect = { id: true, targetProjectId: true, parentId: true } as const
const rootSelect = { id: true, targetProjectId: true } as const
const rowLimit = 65_536

/**
 * Read-only pre-mutation metadata, including archived descendants and incoming
 * endpoints. Only the owning transaction may subsequently prepare its whole
 * mutation batch. This result supplies no authority, claim, CAS or deletion proof.
 * In particular physical deletion still needs separate historical-link checks.
 */
export async function collectSharedModuleMutationEffectsInTransaction(
  tx: Prisma.TransactionClient,
  targetProjectId: string,
  moduleIds: readonly string[],
): Promise<SharedModuleMutationEffects> {
  if (!isSharedResourceId(targetProjectId) || !Array.isArray(moduleIds) ||
    moduleIds.length > sharedResourceBounds.keys)
    refuse('REQUEST_SCOPE_OR_BOUNDS')
  // Snapshot before the first await; repeated legitimate reachability is inert.
  const requested = Array.from(moduleIds)
  if (!requested.every(isSharedResourceId)) refuse('REQUEST_SCOPE_OR_BOUNDS')
  const seeds = [...new Set(requested)].sort(compare)
  let examined = 0
  const take = () => rowLimit - examined + 1
  const rows = <T extends { id: string }>(found: T[]): T[] => {
    if (found.length > rowLimit - examined) refuse('ROWS_UNBOUNDED')
    examined += found.length
    const seen = new Set<string>()
    for (const row of found) {
      if (!isSharedResourceId(row.id) || seen.has(row.id)) refuse('ROW_ID_OR_DUPLICATE')
      seen.add(row.id)
    }
    return found
  }
  const scope = (row: { id: string; targetProjectId: string }) => {
    if (!isSharedResourceId(row.targetProjectId) || row.targetProjectId !== targetProjectId)
      refuse('RESOURCE_MISSING_OR_FOREIGN')
  }
  const exact = (requested: readonly string[], found: readonly { id: string }[]) => {
    const expected = new Set(requested)
    if (found.length !== expected.size || found.some(row => !expected.has(row.id)))
      refuse('RESOURCE_MISSING_OR_FOREIGN')
  }
  const keys = new Map<string, SharedResourceMutationKey>()
  const add = (kind: SharedResourceMutationKey['kind'], resourceId: string) => {
    const key = `${kind}\n${resourceId}`
    if (keys.has(key)) return
    if (keys.size >= sharedResourceBounds.keys) refuse('KEYS_UNBOUNDED')
    keys.set(key, Object.freeze({ kind, resourceId }))
  }
  const target = await tx.targetProject.findUnique({ where: { id: targetProjectId }, select: { id: true } })
  if (!target || target.id !== targetProjectId) refuse('TARGET_MISSING')
  rows([target])

  const modules = new Map<string, ModuleRow>()
  const descendants = new Set<string>()
  const rememberModules = (found: ModuleRow[]) => {
    for (const row of found) {
      scope(row)
      if (row.parentId !== null && !isSharedResourceId(row.parentId)) refuse('RELATION_ENDPOINT')
      const previous = modules.get(row.id)
      if (previous && previous.parentId !== row.parentId) refuse('RELATION_ENDPOINT')
      modules.set(row.id, row)
    }
  }
  if (seeds.length) {
    const found = rows(await tx.module.findMany({
      where: { id: { in: seeds } }, select: moduleSelect, orderBy: { id: 'asc' }, take: take(),
    }))
    exact(seeds, found)
    rememberModules(found)
  }
  // Resolve each old ancestor without adding read-only parents to mutation keys.
  for (const seed of seeds) {
    const chain = new Set<string>()
    let current: string | null = seed
    while (current !== null) {
      if (chain.has(current)) refuse('MODULE_ANCESTRY_CYCLE')
      chain.add(current)
      let row: ModuleRow | undefined = modules.get(current)
      if (!row) {
        const found = rows(await tx.module.findMany({
          where: { id: current }, select: moduleSelect, orderBy: { id: 'asc' }, take: take(),
        }))
        exact([current], found)
        rememberModules(found)
        row = modules.get(current)
      }
      if (!row) return refuse('RESOURCE_MISSING_OR_FOREIGN')
      current = row.parentId
    }
  }
  let frontier = seeds
  while (frontier.length) {
    for (const id of frontier) {
      descendants.add(id)
      add('MODULE', id)
    }
    const parents = new Set(frontier)
    const children = rows(await tx.module.findMany({
      where: { parentId: { in: frontier } }, select: moduleSelect, orderBy: { id: 'asc' }, take: take(),
    }))
    for (const child of children) {
      if (child.parentId === null || !parents.has(child.parentId)) refuse('RELATION_ENDPOINT')
    }
    rememberModules(children)
    frontier = children.map(row => row.id).filter(id => !descendants.has(id)).sort(compare)
  }
  // Every descendant must have an acyclic, fully resolved path to a seed/root.
  for (const id of descendants) {
    const chain = new Set<string>()
    let current: string | null = id
    while (current !== null) {
      if (chain.has(current)) refuse('MODULE_ANCESTRY_CYCLE')
      chain.add(current)
      const row = modules.get(current)
      if (!row) return refuse('RELATION_ENDPOINT')
      current = row.parentId
    }
  }
  const affectedModules = [...descendants].sort(compare)
  const groups = affectedModules.length ? rows(await tx.locatorGroup.findMany({
    where: { moduleId: { in: affectedModules } }, select: { ...rootSelect, moduleId: true },
    orderBy: { id: 'asc' }, take: take(),
  })) : []
  for (const row of groups) {
    scope(row)
    if (!descendants.has(row.moduleId)) refuse('RELATION_ENDPOINT')
    add('LOCATOR_GROUP', row.id)
  }
  const groupIds = groups.map(row => row.id).sort(compare)
  const groupSet = new Set(groupIds)
  const locators = groupIds.length ? rows(await tx.locator.findMany({
    where: { locatorGroupId: { in: groupIds } }, select: { ...rootSelect, locatorGroupId: true },
    orderBy: { id: 'asc' }, take: take(),
  })) : []
  for (const row of locators) {
    scope(row)
    if (row.locatorGroupId === null || !groupSet.has(row.locatorGroupId)) refuse('RELATION_ENDPOINT')
    add('LOCATOR', row.id)
  }
  const locatorIds = locators.map(row => row.id).sort(compare)
  const locatorSet = new Set(locatorIds)
  const suites = affectedModules.length ? rows(await tx.testSuite.findMany({
    where: { moduleId: { in: affectedModules } }, select: { ...rootSelect, moduleId: true },
    orderBy: { id: 'asc' }, take: take(),
  })) : []
  for (const row of suites) {
    scope(row)
    if (!descendants.has(row.moduleId)) refuse('RELATION_ENDPOINT')
    add('TEST_SUITE', row.id)
  }
  const suiteIds = suites.map(row => row.id).sort(compare)
  const cases = new Set<string>()
  if (suiteIds.length) {
    const connected = rows(await tx.testCase.findMany({
      where: { TestSuite: { some: { id: { in: suiteIds } } } }, select: rootSelect,
      orderBy: { id: 'asc' }, take: take(),
    }))
    for (const row of connected) {
      scope(row)
      cases.add(row.id)
      add('TEST_CASE', row.id)
    }
  }
  if (locatorIds.length) {
    // Enumerate the incoming edge itself before resolving either parent. A
    // target predicate on the Case would conceal corrupt foreign endpoints.
    const parameters = rows(await tx.testCaseStepParameter.findMany({
      where: { locatorId: { in: locatorIds } }, select: { id: true, testCaseStepId: true, locatorId: true },
      orderBy: { id: 'asc' }, take: take(),
    }))
    for (const row of parameters) {
      if (row.locatorId === null || !locatorSet.has(row.locatorId) || !isSharedResourceId(row.testCaseStepId))
        refuse('RELATION_ENDPOINT')
    }
    const stepIds = [...new Set(parameters.map(row => row.testCaseStepId))].sort(compare)
    if (stepIds.length) {
      const steps = rows(await tx.testCaseStep.findMany({
        where: { id: { in: stepIds } }, select: { id: true, testCaseId: true },
        orderBy: { id: 'asc' }, take: take(),
      }))
      exact(stepIds, steps)
      if (steps.some(row => !isSharedResourceId(row.testCaseId))) refuse('RELATION_ENDPOINT')
      const caseIds = [...new Set(steps.map(row => row.testCaseId))].sort(compare)
      const dependent = rows(await tx.testCase.findMany({
        where: { id: { in: caseIds } }, select: rootSelect, orderBy: { id: 'asc' }, take: take(),
      }))
      exact(caseIds, dependent)
      for (const row of dependent) {
        scope(row)
        cases.add(row.id)
        add('TEST_CASE', row.id)
      }
    }
    // Templates have no shared-resource guard kind. Both the FK and legacy
    // scalar reference are explicit inputs; no arbitrary invocation JSON scan.
    const templates = rows(await tx.templateTestCaseStepParameter.findMany({
      where: { OR: [{ defaultLocatorId: { in: locatorIds } }, { locatorId: { in: locatorIds } }] },
      select: { id: true }, orderBy: { id: 'asc' }, take: take(),
    }))
    if (templates.length) refuse('TEMPLATE_LOCATOR_DEPENDENCY_UNSUPPORTED')
    // Conflict rows cascade with Locator deletion; the optional counterpart is
    // scalar metadata. Neither has an accepted mutable-root projection.
    const conflicts = rows(await tx.conflictResolution.findMany({
      where: { OR: [{ entityId: { in: locatorIds } }, { conflictingEntityId: { in: locatorIds } }] },
      select: { id: true }, orderBy: { id: 'asc' }, take: take(),
    }))
    if (conflicts.length) refuse('LOCATOR_CONFLICT_DEPENDENCY_UNSUPPORTED')
  }
  const existing = [...keys.values()].sort((left, right) =>
    compare(left.kind, right.kind) || compare(left.resourceId, right.resourceId))
  return Object.freeze({
    existing: Object.freeze(existing), moduleIds: Object.freeze(affectedModules),
    locatorGroupIds: Object.freeze(groupIds), locatorIds: Object.freeze(locatorIds),
    testSuiteIds: Object.freeze(suiteIds), testCaseIds: Object.freeze([...cases].sort(compare)),
  })
}
