import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { ServiceError } from '@/services/shared/errors'
import {
  assertCoordinatorMutationSession,
  type CoordinatorSessionCredentials,
} from '@/services/coordinator/quality-journey-coordinator-session'

import { sharedResourceDigest } from '@/lib/quality-journey/shared-resource-contract'
import { readJourneyBusinessEnrollmentKindInTransaction, withJourneyBusinessWriteJoinInTransaction } from './quality-journey-business-write-join'
import { type E2BusinessScope } from './quality-journey-e2-retirement-service'
import { prepareSharedResourceMutationInTransaction, type SharedResourceMutationKey } from './quality-journey-shared-resource-guard-service'
import { resolveSharedResourceDescriptors } from './quality-journey-shared-resource-descriptor-service'
import {
  createLocatorEnsureReceiptAndAcquireUseInBusinessGroupInTransaction,
  sharedLocatorEnsureReceiptId,
  sharedLocatorEnsureSourceDigest,
  validateActiveSharedResourceUseInTransaction,
} from './quality-journey-shared-resource-use-service'

type LocatorEnsureClient = Prisma.TransactionClient

type ExistingModule = { mode: 'existing'; id: string }
type EnsuredModule = { mode: 'ensure'; name: string }
type ExistingGroup = { mode: 'existing'; id: string }
type EnsuredGroup = { mode: 'ensure'; name: string; route: string; module: ExistingModule | EnsuredModule }

export type LocatorEnsureInput = {
  journeyId: string
  coordinatorSessionId?: string
  coordinatorPrincipalId?: string
  coordinatorHandoffId?: string
  coordinatorGeneration?: number
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
    throw new ServiceError('Locator group not found for the Quality Journey target.', 'NOT_FOUND')
  return moduleRef
}

async function readJourneyOrThrow(client: LocatorEnsureClient, journeyId: string) {
  const journey = await client.qualityJourney.findFirst({
    where: { id: journeyId },
    include: { targetProject: { select: { id: true, fingerprint: true } } },
  })
  if (!journey) throw new ServiceError('Quality Journey not found.', 'NOT_FOUND')
  return journey
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

function ensureUseConflict(reason: string): never {
  throw new ServiceError('Locator ensure requires its exact retained resource Use.', 'CONFLICT', 409,
    { protocol: 'M06_SHARED_USE_V1', reason })
}

function assertE2EnsureModels(tx: Prisma.TransactionClient) {
  // A typed custom client is not proof of complete runtime capabilities. There
  // is no model-absence fallback to legacy admission or partial descriptors.
  const methods = [tx.targetProject?.findUnique, tx.module?.findUnique, tx.module?.create,
    tx.locatorGroup?.findUnique, tx.locatorGroup?.create, tx.locator?.findUnique, tx.locator?.create,
    tx.qualityJourney?.updateMany, tx.qualityJourneyCoordinatorSession?.findUnique,
    tx.qualityJourneyE2Retirement?.findMany, tx.qualityJourneyE2CampaignPolicy?.findUnique,
    tx.qualityJourneySharedResourceCoverage?.findUnique, tx.qualityJourneySharedResourceCoverage?.updateMany,
    tx.qualityJourneySharedResourceGuard?.findUnique, tx.qualityJourneySharedResourceGuard?.updateMany,
    tx.qualityJourneySharedResourceGuard?.create, tx.qualityJourneySharedResourceGuard?.findFirst,
    tx.qualityJourneySharedResourceClaim?.findFirst, tx.qualityJourneyLocatorEnsureReceipt?.findUnique,
    tx.qualityJourneyLocatorEnsureReceipt?.create, tx.qualityJourneySharedResourceUse?.findFirst,
    tx.qualityJourneySharedResourceUse?.findMany, tx.qualityJourneySharedResourceUse?.findUnique,
    tx.qualityJourneySharedResourceUse?.create, tx.qualityJourneySharedResourceUse?.updateMany,
    tx.qualityJourneySharedResourceClaim?.findMany, tx.qualityJourneySharedResourceClaim?.create]
  if (methods.some(method => typeof method !== 'function')) ensureUseConflict('ENSURE_FULL_MODEL_REQUIRED')
}

function ensureScope(input: LocatorEnsureInput, targetProjectId: string): E2BusinessScope {
  if (!input.coordinatorSessionId || !input.coordinatorGeneration)
    throw new ServiceError('E2 locator ensure requires the original current coordinator binding.', 'UNAUTHORIZED')
  return { journeyId: input.journeyId, targetProjectId, coordinatorSessionId: input.coordinatorSessionId,
    generation: input.coordinatorGeneration,
    credentials: { journeyId: input.journeyId, targetProjectId, coordinatorSessionId: input.coordinatorSessionId,
      coordinatorGeneration: input.coordinatorGeneration, coordinatorPrincipalId: input.coordinatorPrincipalId,
      coordinatorHandoffId: input.coordinatorHandoffId } }
}

/** Request V1 hashes the owned semantic request, with allowCreate normalized to
 * its existing boolean meaning. Authentication provenance is independently bound
 * by the receipt's Journey/target/session/generation identity. No raw bytes persist.
 */
function ensureRequestHash(input: LocatorEnsureInput, targetProjectId: string) {
  return sharedResourceDigest('M06_LOCATOR_ENSURE_REQUEST_V1', { journeyId: input.journeyId, targetProjectId,
    allowCreate: input.allowCreate === true, group: input.group, locator: input.locator })
}

function ensureResponse(
  journey: Awaited<ReturnType<typeof readJourneyOrThrow>>,
  persisted: Awaited<ReturnType<typeof persistLocatorClosure>>,
) {
  const outcome: ResourceOutcome = [persisted.module.outcome, persisted.group.outcome, persisted.locator.outcome]
    .includes('created') ? 'created' : 'reused'
  return { journeyId: journey.id, targetProjectId: journey.targetProjectId,
    targetFingerprint: journey.targetProject.fingerprint, outcome,
    resources: { module: persisted.module, locatorGroup: persisted.group,
      locator: { ...persisted.locator, contentHash: locatorContentHash(persisted.locator) } },
    selectorVerification: 'pending_runtime' as const,
    nextRecommendedAction: 'Use locator_search to bind this target-owned locator into the Quality Journey.' }
}

async function ensureOnce(
  input: LocatorEnsureInput,
  client: LocatorEnsureClient,
  journey: Awaited<ReturnType<typeof readJourneyOrThrow>>,
  e2Scope: E2BusinessScope | null,
) {
  const targetProjectId = journey.targetProjectId
  const allowCreate = input.allowCreate === true
  const requestHash = e2Scope ? ensureRequestHash(input, targetProjectId) : null
  const receiptId = e2Scope && requestHash ? sharedLocatorEnsureReceiptId({ ...e2Scope, requestHash }) : null
  const retained = receiptId ? await client.qualityJourneyLocatorEnsureReceipt.findUnique({ where: { id: receiptId } }) : null
  const retainedUse = receiptId ? await client.qualityJourneySharedResourceUse.findFirst({
    where: { sourceKind: 'ENSURE', sourceOwnerId: receiptId }, select: { id: true },
  }) : null
  if (!retained && retainedUse) ensureUseConflict('ENSURE_ORPHAN_USE')
  const groupResolution = await resolveGroup(client, input.group, targetProjectId, allowCreate)
  const locatorResolution = await resolveLocator(client, input.locator, groupResolution.group, targetProjectId, allowCreate)
  const newRoots: SharedResourceMutationKey[] = [
    ...(groupResolution.moduleNeedsCreate ? [{ kind: 'MODULE' as const, resourceId: groupResolution.module.id }] : []),
    ...(groupResolution.groupNeedsCreate ? [{ kind: 'LOCATOR_GROUP' as const, resourceId: groupResolution.group.id }] : []),
    ...(locatorResolution.needsCreate ? [{ kind: 'LOCATOR' as const, resourceId: locatorResolution.locator.id }] : []),
  ]
  const descriptorFor = () => resolveSharedResourceDescriptors(client, targetProjectId, [
    { kind: 'MODULE', resourceId: groupResolution.module.id },
    { kind: 'LOCATOR_GROUP', resourceId: groupResolution.group.id },
    { kind: 'LOCATOR', resourceId: locatorResolution.locator.id },
  ])
  // Result V1 binds complete live semantic dependencies and stable identities.
  // Per-invocation created/reused outcomes and response-only hashes are excluded.
  const resultHashFor = (dependencyDigest: string) => sharedResourceDigest('M06_LOCATOR_ENSURE_RESULT_V1', {
    moduleId: groupResolution.module.id, locatorGroupId: groupResolution.group.id,
    locatorId: locatorResolution.locator.id, dependencyDigest,
  })
  if (retained && e2Scope) {
    if (newRoots.length || retained.journeyId !== e2Scope.journeyId || retained.targetProjectId !== targetProjectId ||
      retained.coordinatorSessionId !== e2Scope.coordinatorSessionId || retained.generation !== e2Scope.generation ||
      retained.requestHash !== requestHash || retained.moduleId !== groupResolution.module.id ||
      retained.locatorGroupId !== groupResolution.group.id || retained.locatorId !== locatorResolution.locator.id)
      ensureUseConflict('ENSURE_RETAINED_RESULT_MISMATCH')
    const descriptor = await descriptorFor()
    if (retained.resultHash !== resultHashFor(descriptor.dependencyDigest)) ensureUseConflict('ENSURE_RETAINED_RESULT_MISMATCH')
    await validateActiveSharedResourceUseInTransaction(client, { scope: e2Scope,
      source: { sourceKind: 'ENSURE', sourceOwnerId: retained.id,
        expectedSourceDigest: sharedLocatorEnsureSourceDigest(retained) }, expectedDependencyDigest: descriptor.dependencyDigest })
    // All flags are false here; this response projection performs no root write.
    return ensureResponse(journey, await persistLocatorClosure(client, groupResolution, locatorResolution, targetProjectId))
  }
  if (!e2Scope && !newRoots.length)
    return ensureResponse(journey, await persistLocatorClosure(client, groupResolution, locatorResolution, targetProjectId))
  const credentials = { journeyId: input.journeyId, targetProjectId,
    coordinatorSessionId: input.coordinatorSessionId, coordinatorGeneration: input.coordinatorGeneration,
    coordinatorPrincipalId: input.coordinatorPrincipalId, coordinatorHandoffId: input.coordinatorHandoffId }
  return withJourneyBusinessWriteJoinInTransaction(client, { journeyId: journey.id, targetProjectId }, credentials,
    async beforeWrite => {
      await beforeWrite(client, { journeyId: journey.id, targetProjectId })
      if (newRoots.length) await prepareSharedResourceMutationInTransaction(client, targetProjectId,
        { existing: [], newRoots, deleted: [] })
      const persisted = await persistLocatorClosure(client, groupResolution, locatorResolution, targetProjectId)
      if (e2Scope && requestHash) {
        const descriptor = await descriptorFor()
        await createLocatorEnsureReceiptAndAcquireUseInBusinessGroupInTransaction(client, { scope: e2Scope,
          requestHash, resultHash: resultHashFor(descriptor.dependencyDigest), moduleId: persisted.module.id,
          locatorGroupId: persisted.group.id, locatorId: persisted.locator.id, createdAt: new Date(),
          expectedDependencyDigest: descriptor.dependencyDigest }, beforeWrite)
      }
      return ensureResponse(journey, persisted)
    })
}

function assertJourneyTarget(
  journey: Awaited<ReturnType<typeof readJourneyOrThrow>>,
  expectedTarget: LocatorEnsureTargetIdentity,
) {
  if (
    journey.targetProjectId !== expectedTarget.id ||
    journey.targetProject.id !== expectedTarget.id ||
    journey.targetProject.fingerprint !== expectedTarget.fingerprint
  )
    throw new ServiceError('Quality Journey not found for the requested target.', 'NOT_FOUND')
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
  if (module.mode === 'existing')
    throw new ServiceError('Module not found for the Quality Journey target.', 'NOT_FOUND')
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
    if (!group) throw new ServiceError('Locator group not found for the Quality Journey target.', 'NOT_FOUND')
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

/** A local-only, Quality Journey scoped locator authoring mutation. */
export async function ensureTargetLocator(
  input: LocatorEnsureInput,
  expectedTarget: LocatorEnsureTargetIdentity,
  client = prisma,
) {
  const request: LocatorEnsureInput = { journeyId: input.journeyId,
    coordinatorSessionId: input.coordinatorSessionId, coordinatorPrincipalId: input.coordinatorPrincipalId,
    coordinatorHandoffId: input.coordinatorHandoffId, coordinatorGeneration: input.coordinatorGeneration,
    allowCreate: input.allowCreate,
    group: input.group.mode === 'existing' ? { mode: 'existing', id: input.group.id } : {
      mode: 'ensure', name: input.group.name, route: input.group.route,
      module: input.group.module.mode === 'existing' ? { mode: 'existing', id: input.group.module.id } :
        { mode: 'ensure', name: input.group.module.name } },
    locator: { name: input.locator.name, selector: input.locator.selector } }
  const target = { id: expectedTarget.id, fingerprint: expectedTarget.fingerprint }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let positivelyLegacy = false
    try {
      return await client.$transaction(async transaction => {
        const journey = await readJourneyOrThrow(transaction, request.journeyId)
        assertJourneyTarget(journey, target)
        await assertCoordinatorMutationSession({ journeyId: request.journeyId, targetProjectId: target.id,
          coordinatorSessionId: request.coordinatorSessionId, coordinatorPrincipalId: request.coordinatorPrincipalId,
          coordinatorHandoffId: request.coordinatorHandoffId, coordinatorGeneration: request.coordinatorGeneration,
        } satisfies CoordinatorSessionCredentials, { journeyId: journey.id, targetProjectId: journey.targetProjectId }, transaction)
        const enrollment = await readJourneyBusinessEnrollmentKindInTransaction(transaction, {
          journeyId: journey.id, targetProjectId: journey.targetProjectId })
        positivelyLegacy = enrollment === 'LEGACY'
        if (!positivelyLegacy) assertE2EnsureModels(transaction)
        return ensureOnce(request, transaction, journey, positivelyLegacy ? null : ensureScope(request, target.id))
      })
    } catch (error) {
      if (attempt === 0 && positivelyLegacy && isUniqueConflict(error)) continue
      throw error
    }
  }
  throw new ServiceError('Locator ensure did not complete.', 'INTERNAL')
}
