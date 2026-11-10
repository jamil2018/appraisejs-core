import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/config/db-config', () => ({
  default: new Proxy(
    {},
    {
      get() {
        throw new Error('ROOT_DATABASE_FORBIDDEN')
      },
    },
  ),
}))
vi.mock('./quality-journey-coordinator-session', () => ({
  assertCoordinatorMutationSession: vi.fn(),
  assertCoordinatorAttemptSession: vi.fn(),
  assertCurrentCoordinatorSession: vi.fn(),
}))
vi.mock('./quality-journey-e2-retirement-service', () => ({
  assertE2BusinessAdmission: vi.fn(),
  commitE2RetirementRequest: vi.fn(),
}))
vi.mock('@/lib/operation-catalog', () => ({ defaultOperationDefinitions: [] }))
vi.mock('../../../packages/cucumber-runtime/src/step-definitions', async () => {
  const contracts = await import('../../../packages/cucumber-runtime/src/step-definitions/contracts')
  return {
    computeStepReferenceHash: contracts.computeStepReferenceHash,
    stepDefinitionSchema: contracts.stepDefinitionSchema,
    stepInvocationSchema: contracts.stepInvocationSchema,
  }
})

import { sharedResourceKinds } from '@/lib/quality-journey/shared-resource-contract'
import { ensureTargetLocator, type LocatorEnsureInput } from './locator-ensure-service'
import { assertCoordinatorMutationSession } from './quality-journey-coordinator-session'
import { assertE2BusinessAdmission } from './quality-journey-e2-retirement-service'

type Row = Record<string, unknown>
type EntityRow = Row & { id: string }
type ClaimRow = EntityRow & { useId: string }
type WhereValue = string | number | boolean | null | Date | { not: unknown } | { notIn: readonly unknown[] }
type Where = { OR?: Where[] } & Record<string, WhereValue | Where[] | undefined>
type Select = Record<string, unknown>
type FindArgs = { where: Where; select?: Select; include?: { module?: unknown } }
type CreateArgs<T extends Row> = { data: T; include?: { module?: unknown } }
type UpdateArgs<K extends string> = { where: Where & Record<K, string>; data: Row }
type IdArgs = { where: { id: string } }
type CoverageLookupArgs = {
  where: { targetProjectId_kind_protocolVersion: { targetProjectId: string; kind: string; protocolVersion: number } }
}
type GuardLookupArgs = {
  where: { targetProjectId_kind_resourceId: { targetProjectId: string; kind: string; resourceId: string } }
}
const target = { id: 'target-shared-ensure', fingerprint: `sha256:${'a'.repeat(64)}` }
const input: LocatorEnsureInput = {
  journeyId: 'journey-shared-ensure',
  coordinatorSessionId: 'session-shared-ensure',
  coordinatorGeneration: 2,
  coordinatorPrincipalId: 'principal-shared-ensure',
  allowCreate: true,
  group: { mode: 'ensure', name: 'Shared group', route: '/shared', module: { mode: 'ensure', name: 'Shared module' } },
  locator: { name: 'Shared locator', selector: '#shared' },
}
const copy = <T>(value: T): T => structuredClone(value)
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return where.OR!.some(branch => matches(row, branch))
    if (value !== null && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
      if ('not' in value) return row[key] !== value.not
      if ('notIn' in value) return !value.notIn.includes(row[key])
    }
    return value instanceof Date
      ? row[key] instanceof Date && row[key].getTime() === value.getTime()
      : row[key] === value
  })
}
function project(row: Row | null, select?: Select): Row | null {
  if (!row) return null
  const result: Row = select
    ? Object.fromEntries(
        Object.keys(select).map(key => {
          if (!Object.hasOwn(row, key)) throw new Error(`MISSING_SELECTED_FIELD:${key}`)
          return [key, copy(row[key])]
        }),
      )
    : copy(row)
  return new Proxy(result, {
    get(value, key) {
      if (key === 'then') return undefined
      if (typeof key === 'string' && !Object.hasOwn(value, key)) throw new Error(`UNSELECTED_FIELD:${key}`)
      return Reflect.get(value, key)
    },
  })
}

/** Concrete supported-model transaction double. Rows are detached projections;
 * snapshot restoration models the callback rollback signal, not a SQLite proof.
 */
function fixture(options: { legacy?: boolean; existing?: number; ancestor?: boolean } = {}) {
  let state = {
    modules: new Map<string, EntityRow>(),
    groups: new Map<string, EntityRow>(),
    locators: new Map<string, EntityRow>(),
    guards: new Map<string, Row>(),
    coverage: new Map<string, Row>(),
    receipts: new Map<string, EntityRow>(),
    uses: new Map<string, EntityRow>(),
    claims: new Map<string, ClaimRow>(),
    admissionVersion: 0,
  }
  const events: string[] = []
  let attempts = 0
  let failure: { at: string; error: Error; once?: boolean } | null = null
  let outerError: Error | null = null
  const effect = (event: string) => {
    events.push(event)
    if (failure?.at === event) {
      const error = failure.error
      if (failure.once) failure = null
      throw error
    }
  }
  const guardKey = (kind: string, resourceId: string) => `${kind}:${resourceId}`
  const guardRow = (kind: string, resourceId: string): Row => ({
    targetProjectId: target.id,
    kind,
    resourceId,
    epoch: 0,
    coverageState: 'COMPLETE_V1',
    coverageDigest: 'e'.repeat(64),
    resourceState: 'LIVE',
    deletedAt: null,
    createdAt: new Date(0),
  })
  for (const kind of sharedResourceKinds)
    state.coverage.set(kind, {
      targetProjectId: target.id,
      kind,
      protocolVersion: 1,
      state: 'COMPLETE',
      epoch: 0,
      writerClosureDigest: 'a'.repeat(64),
      readerClosureDigest: 'b'.repeat(64),
      sourceUniverseDigest: 'c'.repeat(64),
      reconciliationDigest: 'd'.repeat(64),
      proofKind: 'RECONCILED_V1',
      createdAt: new Date(0),
      completedAt: new Date(0),
    })
  const seed = (collection: Map<string, EntityRow>, kind: string, row: EntityRow) => {
    collection.set(row.id, row)
    state.guards.set(guardKey(kind, row.id), guardRow(kind, row.id))
  }
  if ((options.existing ?? 0) >= 1)
    seed(state.modules, 'MODULE', {
      id: 'module-shared-ensure',
      name: 'Shared module',
      targetProjectId: target.id,
      parentId: options.ancestor ? 'ancestor-shared-ensure' : null,
      archivedAt: null,
    })
  if (options.ancestor)
    seed(state.modules, 'MODULE', {
      id: 'ancestor-shared-ensure',
      name: 'Archived structural ancestor',
      targetProjectId: target.id,
      parentId: null,
      archivedAt: new Date(0),
    })
  if ((options.existing ?? 0) >= 2)
    seed(state.groups, 'LOCATOR_GROUP', {
      id: 'group-shared-ensure',
      name: 'Shared group',
      route: '/shared',
      moduleId: 'module-shared-ensure',
      targetProjectId: target.id,
      archivedAt: null,
    })
  if ((options.existing ?? 0) >= 3)
    seed(state.locators, 'LOCATOR', {
      id: 'locator-shared-ensure',
      name: 'Shared locator',
      value: '#shared',
      locatorGroupId: 'group-shared-ensure',
      targetProjectId: target.id,
      archivedAt: null,
      updatedAt: new Date(0),
    })
  const journey = {
    id: input.journeyId,
    targetProjectId: target.id,
    targetProject: target,
    currentCoordinatorSessionId: options.legacy ? null : input.coordinatorSessionId,
  }
  const findRoot = (kind: string, rows: Map<string, EntityRow>, args: FindArgs) => {
    if (args.select?.name) events.push(`DESCRIPTOR:${kind}`)
    const row = [...rows.values()].find(row => matches(row, args.where)) ?? null
    return project(
      row && args.include?.module
        ? { ...row, module: typeof row.moduleId === 'string' ? state.modules.get(row.moduleId) : undefined }
        : row,
      args.select,
    )
  }
  const createRoot = (kind: string, rows: Map<string, EntityRow>, args: CreateArgs<EntityRow>) => {
    effect(`ROOT_CREATE:${kind}`)
    if (rows.has(args.data.id)) throw Object.assign(new Error('unique'), { code: 'P2002' })
    const row: EntityRow = {
      archivedAt: null,
      ...(kind === 'MODULE' ? { parentId: null } : {}),
      ...(kind === 'LOCATOR' ? { updatedAt: new Date(0) } : {}),
      ...copy(args.data),
    }
    rows.set(row.id, row)
    return project(
      args.include?.module
        ? { ...row, module: typeof row.moduleId === 'string' ? state.modules.get(row.moduleId) : undefined }
        : row,
    )!
  }
  const tx = {
    qualityJourney: { findFirst: vi.fn(async () => project(journey)), updateMany: vi.fn(async () => ({ count: 1 })) },
    qualityJourneyCoordinatorSession: {
      findUnique: vi.fn(async () =>
        project({
          id: input.coordinatorSessionId,
          journeyId: input.journeyId,
          targetProjectId: target.id,
          generation: 2,
          e2EnrollmentKind: 'E2_V1',
          e2EnrollmentDigest: 'a'.repeat(64),
          e2EnrolledAt: new Date(0),
        }),
      ),
    },
    qualityJourneyE2Retirement: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    qualityJourneyE2CampaignPolicy: { findUnique: vi.fn(async () => null) },
    targetProject: {
      findUnique: vi.fn(async ({ where }: IdArgs) => (where.id === target.id ? { id: target.id } : null)),
    },
    module: {
      findFirst: vi.fn(async (args: FindArgs) => findRoot('MODULE', state.modules, args)),
      findUnique: vi.fn(async (args: FindArgs) => findRoot('MODULE', state.modules, args)),
      create: vi.fn(async (args: CreateArgs<EntityRow>) => createRoot('MODULE', state.modules, args)),
    },
    locatorGroup: {
      findFirst: vi.fn(async (args: FindArgs) => findRoot('LOCATOR_GROUP', state.groups, args)),
      findUnique: vi.fn(async (args: FindArgs) => findRoot('LOCATOR_GROUP', state.groups, args)),
      create: vi.fn(async (args: CreateArgs<EntityRow>) => createRoot('LOCATOR_GROUP', state.groups, args)),
    },
    locator: {
      findMany: vi.fn(async (args: FindArgs) =>
        [...state.locators.values()].filter(row => matches(row, args.where)).map(row => project(row)!),
      ),
      findUnique: vi.fn(async (args: FindArgs) => findRoot('LOCATOR', state.locators, args)),
      create: vi.fn(async (args: CreateArgs<EntityRow>) => createRoot('LOCATOR', state.locators, args)),
    },
    qualityJourneySharedResourceCoverage: {
      findUnique: vi.fn(async ({ where }: CoverageLookupArgs) => {
        expect(where.targetProjectId_kind_protocolVersion.targetProjectId).toBe(target.id)
        return project(state.coverage.get(where.targetProjectId_kind_protocolVersion.kind) ?? null)
      }),
      updateMany: vi.fn(async ({ where, data }: UpdateArgs<'kind'>) => {
        effect(`COVERAGE_CAS:${where.kind}`)
        const row = state.coverage.get(where.kind)
        if (!row || !matches(row, where)) return { count: 0 }
        Object.assign(row, copy(data))
        return { count: 1 }
      }),
    },
    qualityJourneySharedResourceGuard: {
      findFirst: vi.fn(async ({ where, select }: FindArgs) =>
        project([...state.guards.values()].find(row => matches(row, where)) ?? null, select),
      ),
      findUnique: vi.fn(async ({ where }: GuardLookupArgs) => {
        const key = where.targetProjectId_kind_resourceId
        expect(key.targetProjectId).toBe(target.id)
        return project(state.guards.get(guardKey(key.kind, key.resourceId)) ?? null)
      }),
      create: vi.fn(async ({ data }: CreateArgs<Row & { kind: string; resourceId: string }>) => {
        effect(`GUARD_INSERT:${data.kind}`)
        const key = guardKey(data.kind, data.resourceId)
        if (state.guards.has(key)) throw new Error('DUPLICATE_GUARD')
        const row = { ...copy(data), deletedAt: null, createdAt: new Date(0) }
        state.guards.set(key, row)
        return project(row)!
      }),
      updateMany: vi.fn(async ({ where, data }: UpdateArgs<'kind' | 'resourceId'>) => {
        effect(`GUARD_CAS:${where.kind}`)
        const row = state.guards.get(guardKey(where.kind, where.resourceId))
        if (!row || !matches(row, where)) return { count: 0 }
        Object.assign(row, copy(data))
        return { count: 1 }
      }),
    },
    qualityJourneyLocatorEnsureReceipt: {
      findUnique: vi.fn(async ({ where }: IdArgs) => project(state.receipts.get(where.id) ?? null)),
      create: vi.fn(async ({ data }: CreateArgs<EntityRow>) => {
        effect('RECEIPT_INSERT')
        state.receipts.set(data.id, copy(data))
        return project(data)!
      }),
    },
    qualityJourneySharedResourceUse: {
      findFirst: vi.fn(async ({ where, select }: FindArgs) =>
        project([...state.uses.values()].find(row => matches(row, where)) ?? null, select),
      ),
      findMany: vi.fn(async ({ where }: FindArgs) =>
        [...state.uses.values()].filter(row => matches(row, where)).map(row => project(row)!),
      ),
      findUnique: vi.fn(async ({ where }: IdArgs) => project(state.uses.get(where.id) ?? null)),
      create: vi.fn(async ({ data }: CreateArgs<EntityRow>) => {
        effect('USE_PREPARING')
        const row = {
          ...copy(data),
          createdAt: new Date(0),
          releasedAt: null,
          releaseEvidenceDigest: null,
          releaseReason: null,
        }
        state.uses.set(row.id, row)
        return project(row)!
      }),
      updateMany: vi.fn(async ({ where, data }: UpdateArgs<'id'>) => {
        effect('USE_ACTIVATION')
        const row = state.uses.get(where.id)
        if (!row || !matches(row, where)) return { count: 0 }
        Object.assign(row, copy(data))
        return { count: 1 }
      }),
    },
    qualityJourneySharedResourceClaim: {
      findFirst: vi.fn(async () =>
        [...state.claims.values()].some(row => row.state !== 'ACTIVE' || state.uses.get(row.useId)?.state !== 'ACTIVE')
          ? { id: 'inconsistent-claim' }
          : null,
      ),
      findMany: vi.fn(async ({ where }: FindArgs) =>
        [...state.claims.values()].filter(row => matches(row, where)).map(row => project(row)!),
      ),
      create: vi.fn(async ({ data }: CreateArgs<ClaimRow>) => {
        effect('CLAIM_INSERT')
        const row = {
          ...copy(data),
          createdAt: new Date(0),
          releaseEpoch: null,
          releasedAt: null,
          releaseEvidenceDigest: null,
          releaseReason: null,
        }
        state.claims.set(row.id, row)
        return project(row)!
      }),
    },
  }
  const root = new Proxy(
    {
      $transaction: async <T>(body: (tx: Prisma.TransactionClient) => Promise<T>) => {
        attempts++
        const before = copy(state)
        try {
          const result = await body(tx as never)
          if (outerError) throw outerError
          return result
        } catch (error) {
          state = before
          throw error
        }
      },
    },
    {
      get(value, key) {
        if (key !== '$transaction') throw new Error(`ROOT_ACCESS:${String(key)}`)
        return Reflect.get(value, key)
      },
    },
  )
  vi.mocked(assertE2BusinessAdmission).mockImplementation(async (actualTx, actualScope) => {
    expect(actualTx).toBe(tx)
    expect(actualScope.credentials.coordinatorPrincipalId).toBe(input.coordinatorPrincipalId)
    effect('ADMISSION')
    state.admissionVersion++
    return { kind: 'E2_V1', admissionVersion: state.admissionVersion } as never
  })
  const ensure = (request: LocatorEnsureInput = copy(input), expected = copy(target)) =>
    ensureTargetLocator(request, expected, root as never)
  return {
    tx,
    ensure,
    events,
    get state() {
      return state
    },
    get attempts() {
      return attempts
    },
    fail: (at: string, error = new Error(`FAIL:${at}`), once = false) => {
      failure = { at, error, once }
    },
    rejectOuter: (error: Error) => {
      outerError = error
    },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(assertCoordinatorMutationSession).mockResolvedValue(undefined as never)
})

describe('actual locator ENSURE shared Use owner', () => {
  it('admits once before all guard preparation and roots then commits one immutable complete ACTIVE Use', async () => {
    const f = fixture()
    const result = await f.ensure()
    const firstRoot = f.events.indexOf('ROOT_CREATE:MODULE')
    expect(f.events[0]).toBe('ADMISSION')
    expect(f.events.slice(0, firstRoot).filter(event => event.startsWith('GUARD_INSERT:'))).toEqual([
      'GUARD_INSERT:LOCATOR',
      'GUARD_INSERT:LOCATOR_GROUP',
      'GUARD_INSERT:MODULE',
    ])
    expect(f.events.indexOf('RECEIPT_INSERT')).toBeGreaterThan(f.events.indexOf('ROOT_CREATE:LOCATOR'))
    expect(f.events.indexOf('USE_PREPARING')).toBeGreaterThan(f.events.indexOf('RECEIPT_INSERT'))
    expect(f.events.at(-1)).toBe('USE_ACTIVATION')
    expect(assertE2BusinessAdmission).toHaveBeenCalledTimes(1)
    expect(f.state.receipts.size).toBe(1)
    expect(f.state.uses.size).toBe(1)
    expect(f.state.claims.size).toBe(3)
    expect([...f.state.uses.values()][0].state).toBe('ACTIVE')
    expect(result.outcome).toBe('created')
  })

  it('reserves exactly each feasible fresh root subset without mutating unchanged parent collections', async () => {
    const expected = [['LOCATOR', 'LOCATOR_GROUP', 'MODULE'], ['LOCATOR', 'LOCATOR_GROUP'], ['LOCATOR'], []]
    for (let existing = 0; existing < 4; existing++) {
      const f = fixture({ existing })
      await f.ensure()
      expect(f.events.filter(event => event.startsWith('GUARD_INSERT:')).map(event => event.slice(13))).toEqual(
        expected[existing],
      )
      const receiptIndex = f.events.indexOf('RECEIPT_INSERT')
      expect(f.events.slice(0, receiptIndex).filter(event => event.startsWith('GUARD_CAS:'))).toEqual([])
      expect(f.state.admissionVersion).toBe(1)
    }
  })

  it('claims complete archived structural ancestry while guarding only the actual new Locator before its write', async () => {
    const f = fixture({ existing: 2, ancestor: true })
    await f.ensure()
    expect(f.events.filter(event => event.startsWith('GUARD_INSERT:'))).toEqual(['GUARD_INSERT:LOCATOR'])
    expect([...f.state.claims.values()].map(row => row.resourceId)).toContain('ancestor-shared-ensure')
    expect(f.state.claims.size).toBe(4)
  })

  it('replays retained exact ACTIVE provenance with reused outcomes and no admission guard root or receipt writes', async () => {
    const f = fixture()
    const first = await f.ensure()
    const before = copy(f.state)
    f.events.length = 0
    const replay = await f.ensure()
    expect(replay.outcome).toBe('reused')
    expect(replay.resources.locator.id).toBe(first.resources.locator.id)
    expect(replay.resources.module.id).toBe(first.resources.module.id)
    expect(f.events.filter(event => !event.startsWith('DESCRIPTOR:'))).toEqual([])
    expect(f.state).toEqual(before)
    expect(assertE2BusinessAdmission).toHaveBeenCalledTimes(1)
  })

  it('refuses changed complete descriptor bytes even when the response locator selector hash is unchanged', async () => {
    const f = fixture({ existing: 2, ancestor: true })
    await f.ensure()
    f.state.modules.get('ancestor-shared-ensure')!.name = 'Changed ancestor'
    f.events.length = 0
    await expect(f.ensure()).rejects.toMatchObject({ details: { reason: 'ENSURE_RETAINED_RESULT_MISMATCH' } })
    expect(f.events.filter(event => !event.startsWith('DESCRIPTOR:'))).toEqual([])
  })

  it('refuses orphan receipts released Uses and incomplete Claims without freshening retained identity', async () => {
    for (const fault of ['orphan', 'released', 'partial']) {
      const f = fixture()
      await f.ensure()
      if (fault === 'orphan') f.state.uses.clear()
      if (fault === 'released') [...f.state.uses.values()][0].state = 'RELEASED'
      if (fault === 'partial') f.state.claims.delete([...f.state.claims.keys()][0])
      f.events.length = 0
      const before = copy(f.state)
      await expect(f.ensure()).rejects.toThrow()
      expect(f.state).toEqual(before)
      expect(f.events.filter(event => !event.startsWith('DESCRIPTOR:'))).toEqual([])
    }
  })

  it('refuses a retained Use without its immutable source receipt before any writer', async () => {
    const f = fixture()
    await f.ensure()
    f.state.receipts.clear()
    f.events.length = 0
    await expect(f.ensure()).rejects.toMatchObject({ details: { reason: 'ENSURE_ORPHAN_USE' } })
    expect(f.events).toEqual([])
  })

  it('refuses foreign immutable receipt provenance and never repairs its retained source', async () => {
    const f = fixture()
    await f.ensure()
    ;[...f.state.receipts.values()][0].targetProjectId = 'foreign-target'
    f.events.length = 0
    const before = copy(f.state)
    await expect(f.ensure()).rejects.toMatchObject({ details: { reason: 'ENSURE_RETAINED_RESULT_MISMATCH' } })
    expect(f.state).toEqual(before)
    expect(f.events).toEqual([])
  })

  it('does not mint freshness after a receipt INSERT returns mismatched immutable metadata', async () => {
    const f = fixture()
    const before = copy(f.state)
    const original = f.tx.qualityJourneyLocatorEnsureReceipt.create.getMockImplementation()!
    f.tx.qualityJourneyLocatorEnsureReceipt.create.mockImplementation(async args => {
      const row = await original(args)
      return { ...row, resultHash: 'f'.repeat(64) }
    })
    await expect(f.ensure()).rejects.toMatchObject({ details: { reason: 'ENSURE_RECEIPT_INSERT_MISMATCH' } })
    expect(f.state).toEqual(before)
    expect(f.events).not.toContain('USE_PREPARING')
    expect(f.attempts).toBe(1)
  })

  it('never remints a deleted live-root identity while any original guard remains retained', async () => {
    const f = fixture()
    await f.ensure()
    f.state.modules.clear()
    f.state.groups.clear()
    f.state.locators.clear()
    f.state.receipts.clear()
    f.state.uses.clear()
    f.state.claims.clear()
    for (const row of f.state.guards.values()) {
      row.resourceState = 'DELETED'
      row.deletedAt = new Date(0)
    }
    f.events.length = 0
    const before = copy(f.state)
    await expect(f.ensure()).rejects.toMatchObject({ details: { reason: 'RESOURCE_IDENTITY_ALREADY_RETAINED' } })
    expect(f.state).toEqual(before)
    expect(f.events.some(event => event.startsWith('ROOT_CREATE:'))).toBe(false)
  })

  it('rolls back callback state on admission guard root receipt claim and activation failures without an E2 retry', async () => {
    for (const at of [
      'ADMISSION',
      'COVERAGE_CAS:LOCATOR',
      'GUARD_INSERT:LOCATOR',
      'ROOT_CREATE:MODULE',
      'RECEIPT_INSERT',
      'CLAIM_INSERT',
      'USE_ACTIVATION',
    ]) {
      const f = fixture()
      const before = copy(f.state)
      f.fail(at)
      await expect(f.ensure()).rejects.toThrow(`FAIL:${at}`)
      expect(f.state).toEqual(before)
      expect(f.attempts).toBe(1)
    }
  })

  it('rolls back fresh roots and guard epochs when full Use coverage remains UNKNOWN', async () => {
    const f = fixture()
    for (const row of f.state.coverage.values())
      Object.assign(row, {
        state: 'UNKNOWN',
        writerClosureDigest: null,
        readerClosureDigest: null,
        sourceUniverseDigest: null,
        reconciliationDigest: null,
        proofKind: null,
        completedAt: null,
      })
    const before = copy(f.state)
    await expect(f.ensure()).rejects.toMatchObject({ details: { reason: 'DOMAIN_COVERAGE_INCOMPLETE_OR_CORRUPT' } })
    expect(f.state).toEqual(before)
    expect(f.attempts).toBe(1)
  })

  it('never automatically retries E2 uniqueness failure or returns success after outer commit rejection', async () => {
    const unique = fixture()
    unique.fail('ROOT_CREATE:MODULE', Object.assign(new Error('unique'), { code: 'P2002' }))
    await expect(unique.ensure()).rejects.toThrow('unique')
    expect(unique.attempts).toBe(1)
    const outer = fixture()
    const before = copy(outer.state)
    outer.rejectOuter(Object.assign(new Error('COMMIT_REPLY_UNKNOWN'), { code: 'P2002' }))
    await expect(outer.ensure()).rejects.toThrow('COMMIT_REPLY_UNKNOWN')
    expect(outer.state).toEqual(before)
    expect(outer.attempts).toBe(1)
  })

  it('snapshots request nested values expected target and original credentials before the transaction awaits', async () => {
    const f = fixture()
    const request = copy(input)
    const expected = copy(target)
    vi.mocked(assertCoordinatorMutationSession).mockImplementation(async () => {
      request.locator.selector = '#mutated'
      if (request.group.mode === 'ensure') request.group.name = 'Mutated group'
      request.coordinatorPrincipalId = 'mutated-principal'
      expected.id = 'foreign-target'
    })
    const result = await f.ensure(request, expected)
    expect(result.targetProjectId).toBe(target.id)
    expect(result.resources.locator.value).toBe('#shared')
    expect([...f.state.groups.values()][0].name).toBe('Shared group')
  })

  it('keeps all-reused legacy ENSURE independent of absent coverage and guard models without creating Use provenance', async () => {
    const f = fixture({ legacy: true, existing: 3 })
    f.state.coverage.clear()
    f.state.guards.clear()
    delete (f.tx as Row).qualityJourneySharedResourceCoverage
    delete (f.tx as Row).qualityJourneySharedResourceGuard
    const result = await f.ensure()
    expect(result.outcome).toBe('reused')
    expect(f.events).toEqual([])
    expect(f.state.receipts.size).toBe(0)
    expect(f.state.uses.size).toBe(0)
    expect(f.state.claims.size).toBe(0)
    expect(assertE2BusinessAdmission).not.toHaveBeenCalled()
  })

  it('retains positively legacy uniqueness retry and creates guards without minting E2 provenance', async () => {
    const f = fixture({ legacy: true })
    f.fail('ROOT_CREATE:MODULE', Object.assign(new Error('unique'), { code: 'P2002' }), true)
    const result = await f.ensure()
    expect(result.outcome).toBe('created')
    expect(f.attempts).toBe(2)
    expect(f.state.guards.size).toBe(3)
    expect(f.state.receipts.size).toBe(0)
    expect(f.state.uses.size).toBe(0)
    expect(assertE2BusinessAdmission).not.toHaveBeenCalled()
  })

  it('refuses an incomplete E2 model boundary before admission guard changes or root creation', async () => {
    const f = fixture()
    delete (f.tx as Row).qualityJourneySharedResourceClaim
    await expect(f.ensure()).rejects.toMatchObject({ details: { reason: 'ENSURE_FULL_MODEL_REQUIRED' } })
    expect(f.events).toEqual([])
    expect(f.attempts).toBe(1)
  })

  it('refuses selected foreign endpoints and exact locator selector conflicts before any writer', async () => {
    const foreign = fixture({ existing: 3 })
    foreign.state.modules.get('module-shared-ensure')!.targetProjectId = 'foreign-target'
    await expect(foreign.ensure()).rejects.toThrow()
    expect(foreign.events).toEqual([])
    const conflict = fixture({ existing: 3 })
    conflict.state.locators.get('locator-shared-ensure')!.value = '#different'
    await expect(conflict.ensure()).rejects.toMatchObject({
      message: 'Locator selector conflicts with the requested locator contract.',
    })
    expect(conflict.events).toEqual([])
  })
})
