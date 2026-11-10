import type {
  Prisma,
  QualityJourneySharedResourceCoverage,
  QualityJourneySharedResourceGuard,
} from '@prisma/client'

import {
  isSharedResourceDigest,
  isSharedResourceId,
  nextSharedResourceEpoch,
  sharedResourceBounds,
  sharedResourceKinds,
  sharedResourceDigest,
  type SharedResourceKind,
} from '@/lib/quality-journey/shared-resource-contract'
import { ServiceError } from '@/services/shared/errors'

export type SharedResourceMutationKey = Readonly<{
  kind: SharedResourceKind
  resourceId: string
}>

export type SharedResourceMutationBatch = Readonly<{
  existing: readonly SharedResourceMutationKey[]
  newRoots: readonly SharedResourceMutationKey[]
  deleted: readonly SharedResourceMutationKey[]
}>

const refuse: (reason: string) => never = reason => {
  throw new ServiceError('Shared resource mutation requires exact coverage and association proof.', 'CONFLICT', 409, {
    protocol: 'M06_SHARED_RESOURCE_V1',
    reason,
  })
}

const validDate = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime())
const validEpoch = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < sharedResourceBounds.epoch

function assertTargetId(targetProjectId: string) {
  if (!isSharedResourceId(targetProjectId)) refuse('TARGET_SCOPE_INVALID')
}

function orderedMutationKeys(resources: readonly SharedResourceMutationKey[]): SharedResourceMutationKey[] {
  if (!Array.isArray(resources) || resources.length < 1 || resources.length > sharedResourceBounds.keys)
    refuse('RESOURCE_SET_BOUNDS')
  const ordered = resources.map(resource => {
    if (!resource) return refuse('RESOURCE_KEY_INVALID')
    const { kind, resourceId } = resource
    if (!sharedResourceKinds.includes(kind) || !isSharedResourceId(resourceId))
      return refuse('RESOURCE_KEY_INVALID')
    // Snapshot caller-owned metadata before the first asynchronous boundary.
    return { kind, resourceId }
  }).sort((left, right) => left.kind < right.kind ? -1 : left.kind > right.kind ? 1 :
    left.resourceId < right.resourceId ? -1 : left.resourceId > right.resourceId ? 1 : 0)
  let previous: SharedResourceMutationKey | undefined
  for (const resource of ordered) {
    if (previous && previous.kind === resource.kind && previous.resourceId === resource.resourceId)
      refuse('RESOURCE_SET_DUPLICATE')
    previous = resource
  }
  return ordered
}

function snapshotMutationBatch(batch: SharedResourceMutationBatch) {
  if (!batch || typeof batch !== 'object' || Array.isArray(batch) ||
    Object.keys(batch).length !== 3 ||
    !['existing', 'newRoots', 'deleted'].every(key => Object.hasOwn(batch, key)) ||
    !Array.isArray(batch.existing) || !Array.isArray(batch.newRoots) || !Array.isArray(batch.deleted))
    refuse('RESOURCE_BATCH_INVALID')
  const snapshot = (keys: readonly SharedResourceMutationKey[]) =>
    keys.length ? orderedMutationKeys(keys) : []
  const existing = snapshot(batch.existing)
  const newRoots = snapshot(batch.newRoots)
  const deleted = snapshot(batch.deleted)
  if (existing.length + newRoots.length > sharedResourceBounds.keys) refuse('RESOURCE_SET_BOUNDS')
  const identity = (key: SharedResourceMutationKey) => `${key.kind}\0${key.resourceId}`
  const existingIds = new Set(existing.map(identity))
  if (newRoots.some(key => existingIds.has(identity(key))) ||
    deleted.some(key => !existingIds.has(identity(key)))) refuse('RESOURCE_BATCH_OVERLAP')
  const newIds = new Set(newRoots.map(identity))
  if (newIds.size !== newRoots.length) refuse('RESOURCE_SET_DUPLICATE')
  const deletedIds = new Set(deleted.map(identity))
  const union = [...existing, ...newRoots].sort((left, right) => left.kind < right.kind ? -1 : left.kind > right.kind ? 1 :
    left.resourceId < right.resourceId ? -1 : left.resourceId > right.resourceId ? 1 : 0)
  return { existing, newRoots, deleted, existingIds, deletedIds, union }
}

function assertCompleteCoverage(
  row: QualityJourneySharedResourceCoverage | null,
  targetProjectId: string,
  kind: SharedResourceKind,
): asserts row is QualityJourneySharedResourceCoverage {
  if (!row || row.targetProjectId !== targetProjectId || row.kind !== kind || row.protocolVersion !== 1 ||
    row.state !== 'COMPLETE' || !validEpoch(row.epoch) || !validDate(row.createdAt) || !validDate(row.completedAt) ||
    !isSharedResourceDigest(row.writerClosureDigest) || !isSharedResourceDigest(row.readerClosureDigest) ||
    !isSharedResourceDigest(row.sourceUniverseDigest) || !isSharedResourceDigest(row.reconciliationDigest) ||
    !['JOURNEY_FREE_V1', 'RECONCILED_V1'].includes(row.proofKind ?? ''))
    refuse('DOMAIN_COVERAGE_INCOMPLETE_OR_CORRUPT')
}

function assertCompleteLiveGuard(
  row: QualityJourneySharedResourceGuard | null,
  targetProjectId: string,
  resource: SharedResourceMutationKey,
): asserts row is QualityJourneySharedResourceGuard {
  if (!row || row.targetProjectId !== targetProjectId || row.kind !== resource.kind ||
    row.resourceId !== resource.resourceId || !validEpoch(row.epoch) || !validDate(row.createdAt) ||
    row.coverageState !== 'COMPLETE_V1' || !isSharedResourceDigest(row.coverageDigest) ||
    row.resourceState !== 'LIVE' || row.deletedAt !== null)
    refuse('RESOURCE_COVERAGE_INCOMPLETE_OR_CORRUPT')
}

/** Resolve each supported root through its concrete canonical Prisma model. */
async function assertLiveResourceTarget(
  tx: Prisma.TransactionClient,
  targetProjectId: string,
  resource: SharedResourceMutationKey,
) {
  const query = { where: { id: resource.resourceId }, select: { id: true, targetProjectId: true } } as const
  let row: { id: string; targetProjectId: string } | null
  switch (resource.kind) {
    case 'MODULE': row = await tx.module.findUnique(query); break
    case 'LOCATOR_GROUP': row = await tx.locatorGroup.findUnique(query); break
    case 'LOCATOR': row = await tx.locator.findUnique(query); break
    case 'TEST_SUITE': row = await tx.testSuite.findUnique(query); break
    case 'TEST_CASE': row = await tx.testCase.findUnique(query); break
    default: return refuse('RESOURCE_KIND_UNSUPPORTED')
  }
  if (!row || row.id !== resource.resourceId || row.targetProjectId !== targetProjectId)
    refuse('RESOURCE_MISSING_OR_FOREIGN_TARGET')
}

/**
 * Call BEFORE inserting a genuinely new TargetProject, in the same owning Prisma
 * transaction and before any resource insert. Target failure must roll back these
 * rows. Existing targets use migration initialization, never this entry point.
 * Retained coverage/guards prohibit reuse even after the live target is deleted.
 */
export async function initializeNewTargetSharedResourceCoverage(tx: Prisma.TransactionClient, targetProjectId: string) {
  assertTargetId(targetProjectId)
  const where = { targetProjectId }
  const [target, coverage, guard, use, claim, receipt, journey, module, group, locator, suite, testCase] = await Promise.all([
    tx.targetProject.findUnique({ where: { id: targetProjectId }, select: { id: true } }),
    tx.qualityJourneySharedResourceCoverage.findFirst({ where, select: { targetProjectId: true } }),
    tx.qualityJourneySharedResourceGuard.findFirst({ where, select: { targetProjectId: true } }),
    tx.qualityJourneySharedResourceUse.findFirst({ where, select: { id: true } }),
    tx.qualityJourneySharedResourceClaim.findFirst({ where, select: { id: true } }),
    tx.qualityJourneyLocatorEnsureReceipt.findFirst({ where, select: { id: true } }),
    tx.qualityJourney.findFirst({ where, select: { id: true } }),
    tx.module.findFirst({ where, select: { id: true } }),
    tx.locatorGroup.findFirst({ where, select: { id: true } }),
    tx.locator.findFirst({ where, select: { id: true } }),
    tx.testSuite.findFirst({ where, select: { id: true } }),
    tx.testCase.findFirst({ where, select: { id: true } }),
  ])
  if (target || coverage || guard || use || claim || receipt || journey || module || group || locator || suite || testCase)
    refuse('TARGET_IDENTITY_ALREADY_PRESENT_OR_RETAINED')
  // Stable domain order also applies to target initialization. Uniqueness races
  // abort the owning transaction; this helper never retries or upserts history.
  for (const kind of [...sharedResourceKinds].sort()) {
    await tx.qualityJourneySharedResourceCoverage.create({
      data: { targetProjectId, kind, protocolVersion: 1, state: 'UNKNOWN', epoch: 0 },
    })
  }
}

function assertUnknownOrCompleteCoverage(
  row: QualityJourneySharedResourceCoverage | null,
  targetProjectId: string,
  kind: SharedResourceKind,
) {
  if (!row || row.targetProjectId !== targetProjectId || row.kind !== kind || row.protocolVersion !== 1 ||
    !validEpoch(row.epoch) || !validDate(row.createdAt)) refuse('DOMAIN_COVERAGE_INCOMPLETE_OR_CORRUPT')
  if (row.state === 'COMPLETE') assertCompleteCoverage(row, targetProjectId, kind)
  else if (row.state !== 'UNKNOWN' || row.writerClosureDigest !== null ||
    row.readerClosureDigest !== null || row.sourceUniverseDigest !== null ||
    row.reconciliationDigest !== null || row.proofKind !== null || row.completedAt !== null)
    refuse('DOMAIN_COVERAGE_INCOMPLETE_OR_CORRUPT')
}

async function assertFreshRootAbsent(tx: Prisma.TransactionClient, resource: SharedResourceMutationKey) {
  const retained = await tx.qualityJourneySharedResourceGuard.findFirst({
    where: { kind: resource.kind, resourceId: resource.resourceId }, select: { resourceId: true },
  })
  if (retained) refuse('RESOURCE_IDENTITY_ALREADY_RETAINED')
  const query = { where: { id: resource.resourceId }, select: { id: true } } as const
  const live = resource.kind === 'MODULE' ? await tx.module.findUnique(query) :
    resource.kind === 'LOCATOR_GROUP' ? await tx.locatorGroup.findUnique(query) :
    resource.kind === 'LOCATOR' ? await tx.locator.findUnique(query) :
    resource.kind === 'TEST_SUITE' ? await tx.testSuite.findUnique(query) : await tx.testCase.findUnique(query)
  if (live) refuse('RESOURCE_IDENTITY_ALREADY_LIVE')
}

/**
 * One stable, transaction-local preparation for the caller's complete finite
 * resource effects. The caller owns the exact effect closure and follows this
 * preparation with its authored writes in the same transaction. This helper
 * returns no transferable proof or coverage/source-issuer authority.
 */
export async function prepareSharedResourceMutationInTransaction(
  tx: Prisma.TransactionClient,
  targetProjectId: string,
  batch: SharedResourceMutationBatch,
): Promise<void> {
  assertTargetId(targetProjectId)
  const { existingIds, deletedIds, union } = snapshotMutationBatch(batch)
  if (!union.length) return
  const target = await tx.targetProject.findUnique({ where: { id: targetProjectId }, select: { id: true } })
  if (!target || target.id !== targetProjectId) refuse('TARGET_MISSING')

  // A domain is contended exactly once, before any guard/claim absence read.
  for (const kind of [...new Set(union.map(resource => resource.kind))].sort()) {
    const coverage = await tx.qualityJourneySharedResourceCoverage.findUnique({
      where: { targetProjectId_kind_protocolVersion: { targetProjectId, kind, protocolVersion: 1 } },
    })
    if (union.some(resource => resource.kind === kind && existingIds.has(`${kind}\0${resource.resourceId}`)))
      assertCompleteCoverage(coverage, targetProjectId, kind)
    else assertUnknownOrCompleteCoverage(coverage, targetProjectId, kind)
    const row = coverage!
    const changed = await tx.qualityJourneySharedResourceCoverage.updateMany({
      where: { targetProjectId, kind, protocolVersion: 1, state: row.state, epoch: row.epoch,
        writerClosureDigest: row.writerClosureDigest, readerClosureDigest: row.readerClosureDigest,
        sourceUniverseDigest: row.sourceUniverseDigest, reconciliationDigest: row.reconciliationDigest,
        proofKind: row.proofKind, completedAt: row.completedAt },
      data: { epoch: nextSharedResourceEpoch(row.epoch) },
    })
    if (changed.count !== 1) refuse('DOMAIN_COVERAGE_CAS_LOST')
  }

  // A genuinely fresh-only batch has no retained root whose association can
  // be hidden by an incomplete Use. Existing and mixed effects stay blocked.
  if (existingIds.size) {
    const preparingUse = await tx.qualityJourneySharedResourceUse.findFirst({
      where: { targetProjectId, state: 'PREPARING' }, select: { id: true },
    })
    if (preparingUse) refuse('TARGET_HAS_INCOMPLETE_PREPARING_USE')
  }
  const deletedAt = deletedIds.size ? new Date() : null
  if (deletedAt && !validDate(deletedAt)) refuse('DELETION_SAMPLE_INVALID')

  for (const resource of union) {
    const identity = `${resource.kind}\0${resource.resourceId}`
    if (existingIds.has(identity)) {
      const guard = await tx.qualityJourneySharedResourceGuard.findUnique({
        where: { targetProjectId_kind_resourceId: { targetProjectId, kind: resource.kind, resourceId: resource.resourceId } },
      })
      assertCompleteLiveGuard(guard, targetProjectId, resource)
      await assertLiveResourceTarget(tx, targetProjectId, resource)
      const protectedClaim = await tx.qualityJourneySharedResourceClaim.findFirst({
        where: { targetProjectId, kind: resource.kind, resourceId: resource.resourceId,
          OR: [{ state: { not: 'RELEASED' } }, { use: { isNot: { state: 'RELEASED' } } }] },
        select: { id: true },
      })
      if (protectedClaim) refuse('RESOURCE_HAS_PROTECTED_USE')
      const deleting = deletedIds.has(identity)
      const changed = await tx.qualityJourneySharedResourceGuard.updateMany({
        where: { targetProjectId, kind: resource.kind, resourceId: resource.resourceId, epoch: guard.epoch,
          coverageState: 'COMPLETE_V1', coverageDigest: guard.coverageDigest, resourceState: 'LIVE', deletedAt: null },
        data: { epoch: nextSharedResourceEpoch(guard.epoch),
          ...(deleting ? { resourceState: 'DELETED' as const, deletedAt: deletedAt! } : {}) },
      })
      if (changed.count !== 1) refuse('RESOURCE_GUARD_CAS_LOST')
    } else {
      await assertFreshRootAbsent(tx, resource)
      await tx.qualityJourneySharedResourceGuard.create({ data: {
        targetProjectId, kind: resource.kind, resourceId: resource.resourceId, epoch: 0,
        coverageState: 'COMPLETE_V1', resourceState: 'LIVE',
        coverageDigest: sharedResourceDigest('M06_SHARED_FRESH_INSERT_V1', {
          targetProjectId, kind: resource.kind, resourceId: resource.resourceId, protocolVersion: 1,
        }),
      } })
    }
  }
}

/** Exact existing-resource single-operation compatibility wrapper. */
export async function assertSharedResourcesMutable(
  tx: Prisma.TransactionClient,
  targetProjectId: string,
  resources: readonly SharedResourceMutationKey[],
): Promise<void> {
  const existing = orderedMutationKeys(resources)
  return prepareSharedResourceMutationInTransaction(tx, targetProjectId,
    { existing, newRoots: [], deleted: [] })
}

export type SharedResourceCoverageBootstrapRefusal = Readonly<{
  status: 'REFUSED_UNQUALIFIED_COVERAGE_ISSUER'
  reason: 'TRUSTED_CANONICAL_CLOSURE_ISSUER_UNAVAILABLE'
}>

/** No production issuer can currently attest the complete canonical closure. */
export function refuseUnqualifiedSharedResourceCoverageBootstrap(): SharedResourceCoverageBootstrapRefusal {
  return Object.freeze({
    status: 'REFUSED_UNQUALIFIED_COVERAGE_ISSUER',
    reason: 'TRUSTED_CANONICAL_CLOSURE_ISSUER_UNAVAILABLE',
  })
}

/**
 * Reserve a new, previously unused identity before inserting its canonical row,
 * in the SAME owning transaction. This only proves the new root is unclaimed;
 * callers must guard every existing selected collection/parent/child they alter.
 * It never upgrades domain coverage or admits a Journey/source/effect.
 */
export async function reserveSharedResourceInsert(
  tx: Prisma.TransactionClient,
  targetProjectId: string,
  resource: SharedResourceMutationKey,
): Promise<void> {
  const [newRoot] = orderedMutationKeys([resource])
  return prepareSharedResourceMutationInTransaction(tx, targetProjectId,
    { existing: [], newRoots: [newRoot], deleted: [] })
}

/**
 * Every canonical new-Journey insert contends on all five retained domains.
 * UNKNOWN is retained as UNKNOWN; this serialization step asserts no resource
 * independence, activates no Use and performs no provider enrollment.
 */
export async function contendSharedResourceDomainsForJourneyCreation(
  tx: Prisma.TransactionClient,
  targetProjectId: string,
): Promise<void> {
  assertTargetId(targetProjectId)
  const target = await tx.targetProject.findUnique({ where: { id: targetProjectId }, select: { id: true } })
  if (!target) refuse('TARGET_MISSING')
  for (const kind of [...sharedResourceKinds].sort()) {
    const coverage = await tx.qualityJourneySharedResourceCoverage.findUnique({
      where: { targetProjectId_kind_protocolVersion: { targetProjectId, kind, protocolVersion: 1 } },
    })
    if (!coverage || coverage.targetProjectId !== targetProjectId || coverage.kind !== kind ||
      coverage.protocolVersion !== 1 || !validEpoch(coverage.epoch) || !validDate(coverage.createdAt))
      refuse('DOMAIN_COVERAGE_INCOMPLETE_OR_CORRUPT')
    if (coverage.state === 'COMPLETE') assertCompleteCoverage(coverage, targetProjectId, kind)
    else if (coverage.state !== 'UNKNOWN' || coverage.writerClosureDigest !== null ||
      coverage.readerClosureDigest !== null || coverage.sourceUniverseDigest !== null ||
      coverage.reconciliationDigest !== null || coverage.proofKind !== null || coverage.completedAt !== null)
      refuse('DOMAIN_COVERAGE_INCOMPLETE_OR_CORRUPT')
    const changed = await tx.qualityJourneySharedResourceCoverage.updateMany({
      where: { targetProjectId, kind, protocolVersion: 1, state: coverage.state, epoch: coverage.epoch,
        writerClosureDigest: coverage.writerClosureDigest, readerClosureDigest: coverage.readerClosureDigest,
        sourceUniverseDigest: coverage.sourceUniverseDigest, reconciliationDigest: coverage.reconciliationDigest,
        proofKind: coverage.proofKind, completedAt: coverage.completedAt },
      data: { epoch: nextSharedResourceEpoch(coverage.epoch) },
    })
    if (changed.count !== 1) refuse('DOMAIN_COVERAGE_CAS_LOST')
  }
}
