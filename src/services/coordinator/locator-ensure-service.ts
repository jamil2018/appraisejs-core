import { createHash } from 'node:crypto'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { ServiceError } from '@/services/shared/errors'

type LocatorEnsureClient = {
  qualityPlan: {
    findFirst(args: unknown): Promise<{
      id: string
      targetProjectId: string
      targetProject: { id: string; fingerprint: string }
    } | null>
  }
  module: {
    findFirst(args: unknown): Promise<{ id: string; name: string; targetProjectId: string | null } | null>
    create(args: unknown): Promise<{ id: string; name: string; targetProjectId: string | null }>
  }
  locatorGroup: {
    findFirst(args: unknown): Promise<{
      id: string
      name: string
      route: string
      moduleId: string
      targetProjectId: string | null
      module: { id: string; name: string; targetProjectId: string | null }
    } | null>
    create(args: unknown): Promise<{
      id: string
      name: string
      route: string
      moduleId: string
      targetProjectId: string | null
      module: { id: string; name: string; targetProjectId: string | null }
    }>
  }
  locator: {
    findMany(args: unknown): Promise<
      Array<{
        id: string
        name: string
        value: string
        locatorGroupId: string | null
        targetProjectId: string | null
      }>
    >
    create(args: unknown): Promise<{
      id: string
      name: string
      value: string
      locatorGroupId: string | null
      targetProjectId: string | null
    }>
  }
  $transaction<T>(operation: (transaction: LocatorEnsureClient) => Promise<T>): Promise<T>
}

type ExistingModule = { mode: 'existing'; id: string }
type EnsuredModule = { mode: 'ensure'; name: string }
type ExistingGroup = { mode: 'existing'; id: string }
type EnsuredGroup = { mode: 'ensure'; name: string; route: string; module: ExistingModule | EnsuredModule }

export type LocatorEnsureInput = {
  qualityPlanId: string
  allowCreate?: boolean
  group: ExistingGroup | EnsuredGroup
  locator: { name: string; selector: string }
}

export type LocatorEnsureTargetIdentity = { id: string; fingerprint: string }

type ResourceOutcome = 'created' | 'reused'
type TargetModule = { id: string; name: string; targetProjectId: string | null }
type TargetGroup = {
  id: string
  name: string
  route: string
  moduleId: string
  targetProjectId: string | null
  module: TargetModule
}
type TargetLocator = {
  id: string
  name: string
  value: string
  locatorGroupId: string | null
  targetProjectId: string | null
}

const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`

/**
 * Stable UUID-shaped IDs make new target-owned rows converge on a primary-key
 * conflict under concurrent replay even though legacy Module and Locator rows
 * predate natural unique constraints.
 */
function deterministicId(kind: string, value: unknown) {
  const digest = createHash('sha256').update(canonicalContractJson({ kind, value })).digest('hex')
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`
}

function requireCreate(allowCreate: boolean, resource: string): never {
  throw new ServiceError(`${resource} is missing and allowCreate is false.`, 'NOT_FOUND', undefined, { resource })
}

function conflict(resource: string, details: Record<string, unknown>): never {
  throw new ServiceError(`${resource} conflicts with the requested locator contract.`, 'CONFLICT', undefined, details)
}

function targetWhere(id: string, targetProjectId: string) {
  return { id, targetProjectId }
}

function requireTargetModule(
  moduleRef: { id: string; name: string; targetProjectId: string | null },
  targetProjectId: string,
) {
  if (moduleRef.targetProjectId !== targetProjectId)
    throw new ServiceError('Locator group not found for the Quality Plan target.', 'NOT_FOUND')
  return moduleRef
}

async function readPlanOrThrow(client: LocatorEnsureClient, qualityPlanId: string) {
  const plan = await client.qualityPlan.findFirst({
    where: { id: qualityPlanId },
    include: { targetProject: { select: { id: true, fingerprint: true } } },
  })
  if (!plan) throw new ServiceError('Quality Plan not found.', 'NOT_FOUND')
  return plan
}

function locatorContentHash(locator: {
  id: string
  name: string
  value: string
  locatorGroupId: string | null
  targetProjectId: string | null
}) {
  return hash({
    id: locator.id,
    name: locator.name,
    selector: locator.value,
    locatorGroupId: locator.locatorGroupId,
    targetProjectId: locator.targetProjectId,
  })
}

async function ensureOnce(
  input: LocatorEnsureInput,
  expectedTarget: LocatorEnsureTargetIdentity,
  client: LocatorEnsureClient,
) {
  const plan = await readPlanOrThrow(client, input.qualityPlanId)
  assertPlanTarget(plan, expectedTarget)
  const targetProjectId = plan.targetProjectId
  const allowCreate = input.allowCreate === true
  const groupResolution = await resolveGroup(client, input.group, targetProjectId, allowCreate)
  const locatorResolution = await resolveLocator(
    client,
    input.locator,
    groupResolution.group,
    targetProjectId,
    allowCreate,
  )
  const persisted = await persistLocatorClosure(client, groupResolution, locatorResolution, targetProjectId)
  const outcome: ResourceOutcome = [
    persisted.module.outcome,
    persisted.group.outcome,
    persisted.locator.outcome,
  ].includes('created')
    ? 'created'
    : 'reused'
  return {
    qualityPlanId: plan.id,
    targetProjectId,
    targetFingerprint: plan.targetProject.fingerprint,
    outcome,
    resources: {
      module: persisted.module,
      locatorGroup: persisted.group,
      locator: { ...persisted.locator, contentHash: locatorContentHash(persisted.locator) },
    },
    selectorVerification: 'pending_runtime' as const,
    nextRecommendedAction: 'Use locator_search to bind this target-owned locator into the validation design.',
  }
}

function assertPlanTarget(
  plan: Awaited<ReturnType<typeof readPlanOrThrow>>,
  expectedTarget: LocatorEnsureTargetIdentity,
) {
  if (
    plan.targetProjectId !== expectedTarget.id ||
    plan.targetProject.id !== expectedTarget.id ||
    plan.targetProject.fingerprint !== expectedTarget.fingerprint
  )
    throw new ServiceError('Quality Plan not found for the requested target.', 'NOT_FOUND')
}

async function resolveRequestedModule(
  client: LocatorEnsureClient,
  module: ExistingModule | EnsuredModule,
  targetProjectId: string,
  allowCreate: boolean,
) {
  const existing =
    module.mode === 'existing'
      ? await client.module.findFirst({ where: targetWhere(module.id, targetProjectId) })
      : await client.module.findFirst({ where: { name: module.name, targetProjectId }, orderBy: { id: 'asc' } })
  if (existing) return { module: existing as TargetModule, needsCreate: false }
  if (!allowCreate) requireCreate(allowCreate, 'Module')
  if (module.mode === 'existing') throw new ServiceError('Module not found for the Quality Plan target.', 'NOT_FOUND')
  return {
    module: {
      id: deterministicId('target-module', { targetProjectId, name: module.name }),
      name: module.name,
      targetProjectId,
    },
    needsCreate: true,
  }
}

function assertExistingGroupContract(group: TargetGroup, requested: EnsuredGroup, module: TargetModule) {
  if (group.route !== requested.route)
    conflict('Locator group route', { expected: requested.route, actual: group.route })
  if (group.moduleId === module.id) return { module, moduleNeedsCreate: false }
  if (requested.module.mode === 'ensure' && group.module.name === requested.module.name)
    return { module: group.module, moduleNeedsCreate: false }
  return conflict('Locator group module', { expectedModuleId: module.id, actualModuleId: group.moduleId })
}

async function resolveGroup(
  client: LocatorEnsureClient,
  requested: ExistingGroup | EnsuredGroup,
  targetProjectId: string,
  allowCreate: boolean,
) {
  if (requested.mode === 'existing') {
    const group = (await client.locatorGroup.findFirst({
      where: targetWhere(requested.id, targetProjectId),
      include: { module: true },
    })) as TargetGroup | null
    if (!group) throw new ServiceError('Locator group not found for the Quality Plan target.', 'NOT_FOUND')
    return {
      group,
      module: requireTargetModule(group.module, targetProjectId),
      moduleNeedsCreate: false,
      groupNeedsCreate: false,
    }
  }
  const moduleResolution = await resolveRequestedModule(client, requested.module, targetProjectId, allowCreate)
  const existing = (await client.locatorGroup.findFirst({
    where: { targetProjectId, name: requested.name },
    include: { module: true },
  })) as TargetGroup | null
  if (existing) {
    requireTargetModule(existing.module, targetProjectId)
    const contract = assertExistingGroupContract(existing, requested, moduleResolution.module)
    return {
      group: existing,
      module: contract.module,
      moduleNeedsCreate: contract.moduleNeedsCreate,
      groupNeedsCreate: false,
    }
  }
  if (!allowCreate) requireCreate(allowCreate, 'Locator group')
  return {
    group: {
      id: deterministicId('target-locator-group', { targetProjectId, name: requested.name }),
      name: requested.name,
      route: requested.route,
      moduleId: moduleResolution.module.id,
      targetProjectId,
      module: moduleResolution.module,
    },
    module: moduleResolution.module,
    moduleNeedsCreate: moduleResolution.needsCreate,
    groupNeedsCreate: true,
  }
}

async function resolveLocator(
  client: LocatorEnsureClient,
  requested: LocatorEnsureInput['locator'],
  group: TargetGroup,
  targetProjectId: string,
  allowCreate: boolean,
) {
  const matches = (await client.locator.findMany({
    where: { locatorGroupId: group.id, targetProjectId, name: requested.name },
    orderBy: { id: 'asc' },
  })) as TargetLocator[]
  const conflictMatch = matches.find(locator => locator.value !== requested.selector)
  if (conflictMatch)
    conflict('Locator selector', {
      locatorId: conflictMatch.id,
      expected: requested.selector,
      actual: conflictMatch.value,
    })
  if (matches[0]) return { locator: matches[0], needsCreate: false }
  if (!allowCreate) requireCreate(allowCreate, 'Locator')
  return {
    locator: {
      id: deterministicId('target-locator', { targetProjectId, locatorGroupId: group.id, name: requested.name }),
      name: requested.name,
      value: requested.selector,
      locatorGroupId: group.id,
      targetProjectId,
    },
    needsCreate: true,
  }
}

async function persistLocatorClosure(
  client: LocatorEnsureClient,
  groupResolution: Awaited<ReturnType<typeof resolveGroup>>,
  locatorResolution: Awaited<ReturnType<typeof resolveLocator>>,
  targetProjectId: string,
) {
  let locatorModule = groupResolution.module
  let group = groupResolution.group
  let locator = locatorResolution.locator
  const moduleOutcome: ResourceOutcome = groupResolution.moduleNeedsCreate ? 'created' : 'reused'
  const groupOutcome: ResourceOutcome = groupResolution.groupNeedsCreate ? 'created' : 'reused'
  const locatorOutcome: ResourceOutcome = locatorResolution.needsCreate ? 'created' : 'reused'
  if (groupResolution.moduleNeedsCreate)
    locatorModule = (await client.module.create({
      data: { id: locatorModule.id, name: locatorModule.name, targetProjectId },
    })) as TargetModule
  if (groupResolution.groupNeedsCreate)
    group = (await client.locatorGroup.create({
      data: { id: group.id, name: group.name, route: group.route, moduleId: locatorModule.id, targetProjectId },
      include: { module: true },
    })) as TargetGroup
  if (locatorResolution.needsCreate)
    locator = (await client.locator.create({
      data: { id: locator.id, name: locator.name, value: locator.value, locatorGroupId: group.id, targetProjectId },
    })) as TargetLocator
  return {
    module: { id: locatorModule.id, outcome: moduleOutcome },
    group: { id: group.id, outcome: groupOutcome },
    locator: { ...locator, outcome: locatorOutcome },
  }
}

function isUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002')
}

/** A local-only, Quality Plan scoped locator authoring mutation. */
export async function ensureTargetLocator(
  input: LocatorEnsureInput,
  expectedTarget: LocatorEnsureTargetIdentity,
  client = prisma as unknown as LocatorEnsureClient,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await client.$transaction(transaction => ensureOnce(input, expectedTarget, transaction))
    } catch (error) {
      if (attempt === 0 && isUniqueConflict(error)) continue
      throw error
    }
  }
  throw new ServiceError('Locator ensure did not complete.', 'INTERNAL')
}
