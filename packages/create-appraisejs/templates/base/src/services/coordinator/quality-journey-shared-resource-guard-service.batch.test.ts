import type { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import { sharedResourceBounds, type SharedResourceKind } from '@/lib/quality-journey/shared-resource-contract'
import {
  assertSharedResourcesMutable,
  prepareSharedResourceMutationInTransaction,
  refuseUnqualifiedSharedResourceCoverageBootstrap,
  reserveSharedResourceInsert,
  type SharedResourceMutationKey,
} from './quality-journey-shared-resource-guard-service'

const targetProjectId = 'target-batch-toy'
const digest = 'a'.repeat(64)
const key = (kind: SharedResourceKind, resourceId: string): SharedResourceMutationKey => ({ kind, resourceId })
const identity = (value: SharedResourceMutationKey) => `${value.kind}\0${value.resourceId}`
const moduleKey = key('MODULE', 'module-batch-toy')
const suiteKey = key('TEST_SUITE', 'suite-batch-toy')
const caseKey = key('TEST_CASE', 'case-batch-toy')

function fixture(options: {
  existing?: readonly SharedResourceMutationKey[]
  domainKinds?: readonly SharedResourceKind[]
  unknownKinds?: readonly SharedResourceKind[]
  protectedKey?: SharedResourceMutationKey
  preparingUse?: boolean
  retainedForeignKey?: SharedResourceMutationKey
  failGuardKey?: SharedResourceMutationKey
  domainEpoch?: number
  guardEpoch?: number
} = {}) {
  const existing = options.existing ?? [moduleKey, suiteKey]
  const domains = new Set<SharedResourceKind>(options.domainKinds ?? ['MODULE', 'TEST_CASE', 'TEST_SUITE'])
  const unknown = new Set(options.unknownKinds ?? [])
  const coverage = new Map([...domains].map(kind => [kind, {
    targetProjectId, kind, protocolVersion: 1, state: unknown.has(kind) ? 'UNKNOWN' : 'COMPLETE',
    epoch: options.domainEpoch ?? 0, createdAt: new Date(0),
    completedAt: unknown.has(kind) ? null : new Date(0),
    writerClosureDigest: unknown.has(kind) ? null : digest,
    readerClosureDigest: unknown.has(kind) ? null : digest,
    sourceUniverseDigest: unknown.has(kind) ? null : digest,
    reconciliationDigest: unknown.has(kind) ? null : digest,
    proofKind: unknown.has(kind) ? null : 'JOURNEY_FREE_V1',
  }]))
  const guards = new Map(existing.map(resource => [identity(resource), {
    targetProjectId, ...resource, epoch: options.guardEpoch ?? 0, createdAt: new Date(0),
    coverageState: 'COMPLETE_V1', coverageDigest: digest, resourceState: 'LIVE', deletedAt: null as Date | null,
  }]))
  if (options.retainedForeignKey) guards.set(identity(options.retainedForeignKey), {
    targetProjectId: 'other-target-toy', ...options.retainedForeignKey, epoch: 1, createdAt: new Date(0),
    coverageState: 'COMPLETE_V1', coverageDigest: digest, resourceState: 'DELETED', deletedAt: new Date(0),
  })
  const roots = new Map(existing.map(resource => [identity(resource), {
    id: resource.resourceId, targetProjectId,
  }]))
  const trace: string[] = []
  const authored: string[] = []
  const root = (kind: SharedResourceKind) => ({ findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
    structuredClone(roots.get(identity(key(kind, where.id))) ?? null)) })
  const models = {
    targetProject: { findUnique: vi.fn(async () => ({ id: targetProjectId })) },
    qualityJourneySharedResourceCoverage: {
      findUnique: vi.fn(async ({ where }: { where: { targetProjectId_kind_protocolVersion: { kind: SharedResourceKind } } }) =>
        structuredClone(coverage.get(where.targetProjectId_kind_protocolVersion.kind) ?? null)),
      updateMany: vi.fn(async ({ where, data }: { where: { kind: SharedResourceKind; epoch: number }, data: { epoch: number } }) => {
        trace.push(`domain:${where.kind}`)
        const row = coverage.get(where.kind)
        if (!row || row.epoch !== where.epoch) return { count: 0 }
        row.epoch = data.epoch
        return { count: 1 }
      }),
    },
    qualityJourneySharedResourceGuard: {
      findUnique: vi.fn(async ({ where }: { where: { targetProjectId_kind_resourceId: SharedResourceMutationKey } }) =>
        structuredClone(guards.get(identity(where.targetProjectId_kind_resourceId)) ?? null)),
      findFirst: vi.fn(async ({ where }: { where: SharedResourceMutationKey }) =>
        structuredClone(guards.get(identity(where)) ?? null)),
      updateMany: vi.fn(async ({ where, data }: {
        where: SharedResourceMutationKey & { epoch: number }
        data: { epoch: number; resourceState?: string; deletedAt?: Date }
      }) => {
        trace.push(`guard:${where.kind}:${where.resourceId}`)
        const row = guards.get(identity(where))
        if (!row || row.epoch !== where.epoch ||
          identity(where) === (options.failGuardKey && identity(options.failGuardKey))) return { count: 0 }
        row.epoch = data.epoch
        if (data.resourceState) row.resourceState = data.resourceState
        if (data.deletedAt) row.deletedAt = data.deletedAt
        return { count: 1 }
      }),
      create: vi.fn(async ({ data }: { data: {
        kind: SharedResourceKind; resourceId: string; targetProjectId: string; epoch: number
        coverageState: string; coverageDigest: string; resourceState: string
      } }) => {
        trace.push(`create:${data.kind}:${data.resourceId}`)
        guards.set(identity(data), { ...data, createdAt: new Date(0), deletedAt: null })
        return data
      }),
    },
    qualityJourneySharedResourceUse: { findFirst: vi.fn(async () => options.preparingUse ? { id: 'preparing-toy' } : null) },
    qualityJourneySharedResourceClaim: { findFirst: vi.fn(async ({ where }: {
      where: SharedResourceMutationKey & { OR?: unknown }
    }) =>
      options.protectedKey && identity(where) === identity(options.protectedKey) ? { id: 'protected-toy' } : null) },
    module: root('MODULE'), locatorGroup: root('LOCATOR_GROUP'), locator: root('LOCATOR'),
    testSuite: root('TEST_SUITE'), testCase: root('TEST_CASE'),
  }
  const tx = models as unknown as Prisma.TransactionClient
  const owningTransaction = async (body: () => Promise<void>) => {
    const oldCoverage = structuredClone([...coverage])
    const oldGuards = structuredClone([...guards])
    const oldAuthored = [...authored]
    try { await body() }
    catch (error) {
      coverage.clear(); for (const [id, row] of oldCoverage) coverage.set(id, row)
      guards.clear(); for (const [id, row] of oldGuards) guards.set(id, row)
      authored.splice(0, authored.length, ...oldAuthored)
      throw error
    }
  }
  return { tx, models, coverage, guards, trace, authored, owningTransaction }
}

describe('shared resource mutation batch preparation', () => {
  it('refuses bootstrap while the canonical closure issuer is unqualified', () => {
    expect(refuseUnqualifiedSharedResourceCoverageBootstrap()).toEqual({
      status: 'REFUSED_UNQUALIFIED_COVERAGE_ISSUER',
      reason: 'TRUSTED_CANONICAL_CLOSURE_ISSUER_UNAVAILABLE',
    })
  })

  it('orders mixed domains and guards once, tombstoning a deleted key in its sole epoch CAS', async () => {
    const f = fixture()
    await prepareSharedResourceMutationInTransaction(f.tx, targetProjectId, {
      existing: [suiteKey, moduleKey], newRoots: [caseKey], deleted: [moduleKey],
    })
    expect(f.trace).toEqual([
      'domain:MODULE', 'domain:TEST_CASE', 'domain:TEST_SUITE',
      'guard:MODULE:module-batch-toy', 'create:TEST_CASE:case-batch-toy',
      'guard:TEST_SUITE:suite-batch-toy',
    ])
    expect(f.guards.get(identity(moduleKey))).toMatchObject({ epoch: 1, resourceState: 'DELETED' })
    expect(f.guards.get(identity(moduleKey))?.deletedAt).toBeInstanceOf(Date)
    expect(f.models.qualityJourneySharedResourceGuard.updateMany).toHaveBeenCalledTimes(2)
    expect(f.models.qualityJourneySharedResourceGuard.updateMany.mock.calls[0]?.[0].data)
      .toMatchObject({ epoch: 1, resourceState: 'DELETED', deletedAt: expect.any(Date) })
  })

  it('allows only pure new roots in UNKNOWN domains and keeps UNKNOWN proof fields null', async () => {
    const f = fixture({ existing: [], unknownKinds: ['TEST_CASE'] })
    await prepareSharedResourceMutationInTransaction(f.tx, targetProjectId,
      { existing: [], newRoots: [caseKey], deleted: [] })
    expect(f.coverage.get('TEST_CASE')).toMatchObject({ state: 'UNKNOWN', epoch: 1, proofKind: null })
    expect(f.guards.get(identity(caseKey))).toMatchObject({ resourceState: 'LIVE', epoch: 0 })
    const existing = fixture({ existing: [caseKey], unknownKinds: ['TEST_CASE'] })
    await expect(prepareSharedResourceMutationInTransaction(existing.tx, targetProjectId,
      { existing: [caseKey], newRoots: [], deleted: [] })).rejects.toThrow()
    expect(existing.models.qualityJourneySharedResourceCoverage.updateMany).not.toHaveBeenCalled()
  })

  it('uses one owner deletion sample for every tombstone in the batch', async () => {
    const f = fixture()
    await prepareSharedResourceMutationInTransaction(f.tx, targetProjectId,
      { existing: [suiteKey, moduleKey], newRoots: [], deleted: [suiteKey, moduleKey] })
    const updates = f.models.qualityJourneySharedResourceGuard.updateMany.mock.calls
    expect(updates).toHaveLength(2)
    expect(updates[0]?.[0].data.deletedAt).toBeInstanceOf(Date)
    expect(updates[1]?.[0].data.deletedAt).toBe(updates[0]?.[0].data.deletedAt)
    expect(updates.map(call => call[0].data.epoch)).toEqual([1, 1])
  })

  it('keeps unrelated PREPARING Use outside a proven pure-new insertion, but refuses mixed effects', async () => {
    for (const unknownKinds of [[], ['TEST_CASE' as const]]) {
      const fresh = fixture({ existing: [], unknownKinds, preparingUse: true })
      await prepareSharedResourceMutationInTransaction(fresh.tx, targetProjectId,
        { existing: [], newRoots: [caseKey], deleted: [] })
      expect(fresh.models.qualityJourneySharedResourceUse.findFirst).not.toHaveBeenCalled()
      expect(fresh.guards.get(identity(caseKey))).toMatchObject({ resourceState: 'LIVE', epoch: 0 })
      expect(fresh.coverage.get('TEST_CASE')?.state).toBe(unknownKinds.length ? 'UNKNOWN' : 'COMPLETE')
    }

    const mixed = fixture({ existing: [moduleKey], preparingUse: true })
    await expect(prepareSharedResourceMutationInTransaction(mixed.tx, targetProjectId,
      { existing: [moduleKey], newRoots: [caseKey], deleted: [] })).rejects.toThrow()
    expect(mixed.models.qualityJourneySharedResourceUse.findFirst).toHaveBeenCalledTimes(1)
    expect(mixed.models.qualityJourneySharedResourceGuard.updateMany).not.toHaveBeenCalled()
    expect(mixed.models.qualityJourneySharedResourceGuard.create).not.toHaveBeenCalled()
  })

  it('rejects duplicates, overlap, unsupported keys and overflow before target SQL', async () => {
    const cases = [
      { existing: [moduleKey, moduleKey], newRoots: [], deleted: [] },
      { existing: [moduleKey], newRoots: [moduleKey], deleted: [] },
      { existing: [moduleKey], newRoots: [], deleted: [suiteKey] },
      { existing: [], newRoots: [key('MODULE', '\n')], deleted: [] },
      { existing: [], newRoots: Array.from({ length: sharedResourceBounds.keys + 1 }, (_, i) =>
        key('MODULE', `new-${i}`)), deleted: [] },
    ]
    for (const batch of cases) {
      const f = fixture()
      await expect(prepareSharedResourceMutationInTransaction(f.tx, targetProjectId, batch)).rejects.toThrow()
      expect(f.models.targetProject.findUnique).not.toHaveBeenCalled()
    }
  })

  it('refuses protected Claim-or-Use and target PREPARING state before any guard CAS', async () => {
    const protectedFixture = fixture({ protectedKey: moduleKey })
    await expect(prepareSharedResourceMutationInTransaction(protectedFixture.tx, targetProjectId,
      { existing: [moduleKey], newRoots: [], deleted: [] })).rejects.toThrow()
    expect(protectedFixture.models.qualityJourneySharedResourceGuard.updateMany).not.toHaveBeenCalled()
    expect(protectedFixture.models.qualityJourneySharedResourceClaim.findFirst.mock.calls[0]?.[0].where.OR)
      .toEqual([{ state: { not: 'RELEASED' } }, { use: { isNot: { state: 'RELEASED' } } }])
    const preparing = fixture({ preparingUse: true })
    await expect(prepareSharedResourceMutationInTransaction(preparing.tx, targetProjectId,
      { existing: [moduleKey], newRoots: [], deleted: [] })).rejects.toThrow()
    expect(preparing.models.qualityJourneySharedResourceGuard.findUnique).not.toHaveBeenCalled()
  })

  it('refuses a retained foreign tombstone and does not reuse its identity', async () => {
    const f = fixture({ existing: [], retainedForeignKey: caseKey })
    await expect(prepareSharedResourceMutationInTransaction(f.tx, targetProjectId,
      { existing: [], newRoots: [caseKey], deleted: [] })).rejects.toThrow()
    expect(f.models.qualityJourneySharedResourceGuard.create).not.toHaveBeenCalled()
    expect(f.models.testCase.findUnique).not.toHaveBeenCalled()
  })

  it('leaves an empty batch write-free and retains single-operation wrapper semantics', async () => {
    const f = fixture()
    await prepareSharedResourceMutationInTransaction(f.tx, targetProjectId,
      { existing: [], newRoots: [], deleted: [] })
    expect(f.models.targetProject.findUnique).not.toHaveBeenCalled()
    await assertSharedResourcesMutable(f.tx, targetProjectId, [moduleKey])
    expect(f.guards.get(identity(moduleKey))?.epoch).toBe(1)
    const newOnly = fixture({ existing: [] })
    await reserveSharedResourceInsert(newOnly.tx, targetProjectId, caseKey)
    expect(newOnly.guards.get(identity(caseKey))?.epoch).toBe(0)
  })

  it('rolls back a losing later CAS and a failing authoring body in the owning transaction simulation', async () => {
    const losing = fixture({ failGuardKey: suiteKey })
    await expect(losing.owningTransaction(async () => {
      await prepareSharedResourceMutationInTransaction(losing.tx, targetProjectId,
        { existing: [moduleKey, suiteKey], newRoots: [caseKey], deleted: [moduleKey] })
      losing.authored.push('should-not-write')
    })).rejects.toThrow()
    expect(losing.coverage.get('MODULE')?.epoch).toBe(0)
    expect(losing.guards.get(identity(moduleKey))).toMatchObject({ epoch: 0, resourceState: 'LIVE', deletedAt: null })
    expect(losing.guards.has(identity(caseKey))).toBe(false)
    expect(losing.authored).toEqual([])

    const bodyFailure = fixture()
    await expect(bodyFailure.owningTransaction(async () => {
      await prepareSharedResourceMutationInTransaction(bodyFailure.tx, targetProjectId,
        { existing: [moduleKey], newRoots: [], deleted: [moduleKey] })
      bodyFailure.authored.push('temporary')
      throw new Error('synthetic owner write failure')
    })).rejects.toThrow('synthetic owner write failure')
    expect(bodyFailure.coverage.get('MODULE')?.epoch).toBe(0)
    expect(bodyFailure.guards.get(identity(moduleKey))?.deletedAt).toBeNull()
    expect(bodyFailure.authored).toEqual([])
  })

  it('rejects exhausted domain or guard epochs before a successful mutation', async () => {
    const last = fixture({ guardEpoch: sharedResourceBounds.epoch - 1 })
    await prepareSharedResourceMutationInTransaction(last.tx, targetProjectId,
      { existing: [moduleKey], newRoots: [], deleted: [moduleKey] })
    expect(last.guards.get(identity(moduleKey))).toMatchObject({
      epoch: sharedResourceBounds.epoch, resourceState: 'DELETED',
    })
    const domain = fixture({ domainEpoch: sharedResourceBounds.epoch })
    await expect(prepareSharedResourceMutationInTransaction(domain.tx, targetProjectId,
      { existing: [moduleKey], newRoots: [], deleted: [] })).rejects.toThrow()
    expect(domain.models.qualityJourneySharedResourceGuard.updateMany).not.toHaveBeenCalled()
    const guard = fixture({ guardEpoch: sharedResourceBounds.epoch })
    await expect(prepareSharedResourceMutationInTransaction(guard.tx, targetProjectId,
      { existing: [moduleKey], newRoots: [], deleted: [moduleKey] })).rejects.toThrow()
    expect(guard.models.qualityJourneySharedResourceGuard.updateMany).not.toHaveBeenCalled()
  })
})
