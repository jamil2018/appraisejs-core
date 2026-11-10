import type { PrismaClient } from '@prisma/client'
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  assertProviderReceiptCanonicalIdentity,
  providerReconciliationRequestHash,
  validateProviderReconciliationEvidence,
  type ProviderPhysicalOutcomeSource,
} from '@/lib/quality-journey/provider-reconciliation-contract'
import {
  trustedProviderReconciliation,
  type ProviderSenderExcluded,
  type ProviderSenderExclusionRecord,
} from '@/lib/quality-journey/provider-intent-contract'
import { reconcileConsumedQualityJourneyProviderIntent } from './quality-journey-provider-run-service'

// Only opaque admission/storage and unrelated imports are mocked. The production
// service, receipt validation, canonical checks, quarantine and finalizer execute.
const boundary = vi.hoisted(() => ({ sender: {} as unknown, custody: {} as unknown, owned: true }))
vi.mock('@/config/db-config', () => ({ default: {} }))
vi.mock('@/lib/quality-journey/provider-intent-contract', () => ({
  trustedProviderReconciliation: Symbol('inert reconciliation'),
  trustedProviderArm: Symbol('inert arm'),
  trustedProviderObservation: Symbol('inert observation'),
  providerIntentPolicy: { terminalRetentionSeconds: 86400 },
  inspectProviderSenderExcluded: () => boundary.sender,
}))
vi.mock('@/lib/quality-journey/codex-app-server/outcome-source', () => ({
  readOriginalSqliteCommittedReplay: vi.fn(async () => null),
  acquireOriginalSqliteOutcomeCustody: () => boundary.custody,
  resolveOriginalSqliteRetirementFromReplay: vi.fn(async () => undefined),
}))
vi.mock('@/lib/quality-journey/provider-source-database', () => ({
  providerSourceDatabaseIsOwned: () => boundary.owned,
}))
vi.mock('@/lib/quality-journey/codex-app-server/outcome-source-sqlite-journal', () => ({
  sqliteOutcomeSourceProtocolDigest: `sha256:${'b'.repeat(64)}`,
  readProviderSourceLedgerRecords: vi.fn(async () => []),
}))
vi.mock('@/lib/quality-journey/codex-app-server/outcome-source-contract', () => ({ outcomeSourceBounds: {} }))
vi.mock('./quality-journey-provider-recovery', () => ({}))
vi.mock('./quality-journey-coordinator-session', () => ({}))
vi.mock('./quality-journey-service', () => ({}))
vi.mock('./quality-journey-wake-service', () => ({}))
vi.mock('./quality-journey-terminal', () => ({}))

const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function fixture(options: { acknowledged?: boolean; handles?: boolean; prior?: boolean; owned?: boolean } = {}) {
  boundary.owned = options.owned ?? true
  const events: string[] = []
  const identity = {
    runId: 'run',
    intentId: 'intent',
    sendBoundaryId: 'boundary',
    claimEpoch: 1,
    providerNamespace: 'synthetic:inert',
    configurationDigest: `sha256:${'a'.repeat(64)}`,
    transportId: 'transport',
    transportIncarnation: 'incarnation',
    threadId: options.handles ? 'late-thread' : null,
    turnId: options.handles ? 'late-turn' : null,
  }
  const sender: ProviderSenderExclusionRecord = {
    ...identity,
    senderEvidenceId: 'sender-proof',
    finalWatermark: { issuedRequests: 1, writtenBytes: 10 },
  }
  boundary.sender = sender
  const physical = {
    ...identity,
    sourceId: 'source',
    provenance: 'SYNTHETIC_REPOSITORY' as const,
    qualificationDigest: `sha256:${'c'.repeat(64)}`,
    protocolDigest: `sha256:${'b'.repeat(64)}`,
    evidenceId: 'physical-proof',
    evidenceDigest: `sha256:${'d'.repeat(64)}`,
    evidenceClass: 'AUTHORITATIVE_OPERATION_RANGE' as const,
    outcome: 'NONSTART' as const,
    conflictStatus: 'CLEAR' as const,
    coveredThrough: { issuedRequests: 1, writtenBytes: 10 },
  }
  const source: ProviderPhysicalOutcomeSource = Object.freeze({ ...physical, inspect: () => physical })
  const senderExcluded = {} as ProviderSenderExcluded
  const input = { intentId: 'intent', observationKey: 'observation', senderExcluded, physicalEvidence: {} }
  const context = { selection: 'SYNTHETIC_REPOSITORY' as const, source }
  const receipt = validateProviderReconciliationEvidence(senderExcluded, input.physicalEvidence, context)
  const requestHash = providerReconciliationRequestHash(input.intentId, input.observationKey, receipt)
  const intent = {
    id: 'intent',
    sendBoundaryId: 'boundary',
    claimEpoch: 1,
    providerNamespace: identity.providerNamespace,
    threadId: 'late-thread' as string | null,
    turnId: 'late-turn' as string | null,
    acknowledgedAt: options.acknowledged === false ? null : new Date('2026-10-22T00:00:00Z'),
    reconciledAt: options.prior ? new Date('2026-10-22T00:00:01Z') : null,
    status: options.prior ? 'NONSTART_RECONCILED' : 'ACKNOWLEDGED',
    run: {
      id: 'run',
      threadId: 'late-thread' as string | null,
      configurationDigest: identity.configurationDigest,
      status: 'ACKNOWLEDGED',
    },
  }
  const prior = options.prior
    ? {
        id: 'prior',
        kind: 'NONSTART',
        requestHash,
        reconciliationJson: canonicalContractJson(receipt),
        evidenceDigest: digest(receipt),
        sendBoundaryId: identity.sendBoundaryId,
        providerNamespace: identity.providerNamespace,
        threadId: identity.threadId,
        turnId: identity.turnId,
      }
    : null
  const custody = {
    state: { sourceId: 'source' },
    assertTransactionSettings: vi.fn(async () => {
      events.push('settings')
    }),
    verifyLocked: vi.fn(() => {
      events.push('verifyLocked')
    }),
    completeFulfilled: vi.fn(() => {
      events.push('completeFulfilled')
    }),
    retire: vi.fn(() => {
      events.push('retire')
    }),
    tryResolveCommittedReplay: vi.fn(async () => null),
  }
  boundary.custody = custody
  const tx = {
    $executeRawUnsafe: vi.fn(async () => {
      events.push('fence')
      return 1
    }),
    qualityJourneyProviderSourceState: {
      findUniqueOrThrow: vi.fn(async () => custody.state),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => {
        events.push('source.update')
      }),
    },
    qualityJourneyProviderDispatchIntent: {
      findUniqueOrThrow: vi.fn(async () => intent),
      update: vi.fn(async () => {
        events.push('intent.update')
      }),
    },
    qualityJourneyProviderObservation: {
      findUnique: vi.fn(async () => prior),
      upsert: vi.fn(async () => {
        events.push('conflict.upsert')
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        events.push('observation.create')
        return data
      }),
    },
    qualityJourneyProviderRun: {
      update: vi.fn(async () => {
        events.push('run.update')
      }),
    },
    qualityJourneyProviderSlot: {
      updateMany: vi.fn(async () => {
        events.push('slot.release')
        return { count: 1 }
      }),
    },
  }
  const callbackDone = deferred<{ value?: unknown; error?: unknown }>()
  const settlement = deferred<unknown>()
  // This is the original transaction Promise, distinct from the callback Promise.
  const engineOperation = settlement.promise.then(value => {
    events.push('transaction.fulfilled')
    return value
  })
  const client = {
    qualityJourneyProviderObservation: { findUnique: vi.fn(async () => prior) },
    $transaction: vi.fn((callback: (transaction: typeof tx) => Promise<unknown>) => {
      void callback(tx).then(
        value => {
          events.push('callback.fulfilled')
          callbackDone.resolve({ value })
        },
        error => {
          events.push('callback.rejected')
          callbackDone.resolve({ error })
          settlement.reject(error)
        },
      )
      return engineOperation
    }),
  }
  const invoke = (proof = true) =>
    reconcileConsumedQualityJourneyProviderIntent(
      proof
        ? input
        : { intentId: input.intentId, observationKey: input.observationKey, replayRequestHash: requestHash },
      context,
      trustedProviderReconciliation,
      client as unknown as PrismaClient,
    )
  return {
    events,
    identity,
    sender,
    physical,
    receipt,
    requestHash,
    intent,
    prior,
    custody,
    tx,
    client,
    callbackDone,
    settlement,
    engineOperation,
    invoke,
  }
}

function assertNoRelease(f: ReturnType<typeof fixture>) {
  expect(f.tx.qualityJourneyProviderObservation.create).not.toHaveBeenCalled()
  expect(f.tx.qualityJourneyProviderDispatchIntent.update).not.toHaveBeenCalled()
  expect(f.tx.qualityJourneyProviderSlot.updateMany).not.toHaveBeenCalled()
}
async function rejectedCallback(f: ReturnType<typeof fixture>, proof = true) {
  const operation = f.invoke(proof)
  const rejection = expect(operation).rejects.toMatchObject({ code: 'CONFLICT' })
  expect((await f.callbackDone.promise).error).toBeInstanceOf(Error)
  await rejection
  assertNoRelease(f)
  expect(f.tx.qualityJourneyProviderObservation.upsert).not.toHaveBeenCalled()
  expect(f.tx.qualityJourneyProviderRun.update).not.toHaveBeenCalled()
  expect(f.tx.qualityJourneyProviderSourceState.update).not.toHaveBeenCalled()
  expect(f.custody.completeFulfilled).not.toHaveBeenCalled()
  return operation.catch(error => error)
}

beforeEach(() => {
  boundary.owned = true
})
describe('inert actual consumed reconciliation service identity ordering', () => {
  it('commits late-ACK quarantine before completing custody and surfacing public conflict', async () => {
    const f = fixture()
    const original = canonicalContractJson({ sender: f.sender, physical: f.physical, intent: f.intent })
    const operation = f.invoke()
    let callerSettled = false
    const outcome = operation.then(
      value => ({ value, error: undefined }),
      error => ({ value: undefined, error }),
    )
    void operation.then(
      () => {
        callerSettled = true
      },
      () => {
        callerSettled = true
      },
    )
    const callback = await f.callbackDone.promise
    if (callback.error) {
      await outcome
      assertNoRelease(f)
      expect(f.tx.qualityJourneyProviderObservation.upsert).not.toHaveBeenCalled()
      expect(f.custody.retire).toHaveBeenCalledExactlyOnceWith(f.engineOperation)
    }
    expect(callback.error).toBeUndefined()
    expect(callback.value).toEqual({ conflicted: true })
    expect(callerSettled).toBe(false)
    expect(f.custody.completeFulfilled).not.toHaveBeenCalled()
    expect(f.tx.qualityJourneyProviderObservation.upsert).toHaveBeenCalledTimes(1)
    expect(f.tx.qualityJourneyProviderObservation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ kind: 'RECONCILIATION_CONFLICT' }) }),
    )
    expect(f.tx.qualityJourneyProviderRun.update).toHaveBeenCalledWith({
      where: { id: 'run' },
      data: { status: 'CONFLICT' },
    })
    expect(f.tx.qualityJourneyProviderSourceState.update).toHaveBeenCalledWith({
      where: { sourceId: 'source' },
      data: { lifecycle: 'REVOKED' },
    })
    assertNoRelease(f)
    f.settlement.resolve(callback.value)
    expect((await outcome).error).toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('hub remains quarantined'),
    })
    expect(f.custody.completeFulfilled).toHaveBeenCalledTimes(1)
    expect(f.custody.retire).not.toHaveBeenCalled()
    expect(f.events).toEqual([
      'fence',
      'settings',
      'verifyLocked',
      'conflict.upsert',
      'run.update',
      'source.update',
      'callback.fulfilled',
      'transaction.fulfilled',
      'completeFulfilled',
    ])
    expect(canonicalContractJson({ sender: f.sender, physical: f.physical, intent: f.intent })).toBe(original)
  })

  it('retires the exact rejected original transaction even after the conflict callback fulfilled', async () => {
    const f = fixture()
    const engineFailure = new Error('inert commit failed')
    const operation = f.invoke()
    const outcome = operation.then(
      value => ({ value, error: undefined }),
      error => ({ value: undefined, error }),
    )
    expect((await f.callbackDone.promise).value).toEqual({ conflicted: true })
    f.settlement.reject(engineFailure)
    expect((await outcome).error).toBe(engineFailure)
    expect(f.custody.retire).toHaveBeenCalledExactlyOnceWith(f.engineOperation)
    expect(f.custody.completeFulfilled).not.toHaveBeenCalled()
    expect(f.events).not.toContain('transaction.fulfilled')
    assertNoRelease(f)
  })

  it.each(['runId', 'intentId', 'sendBoundaryId', 'claimEpoch', 'providerNamespace', 'configurationDigest'] as const)(
    'rejects foreign immutable %s before quarantine despite late ACK',
    async key => {
      const f = fixture()
      if (key === 'runId') f.intent.run.id = 'foreign'
      if (key === 'intentId') f.intent.id = 'foreign'
      if (key === 'sendBoundaryId') f.intent.sendBoundaryId = 'foreign'
      if (key === 'claimEpoch') f.intent.claimEpoch = 2
      if (key === 'providerNamespace') f.intent.providerNamespace = 'foreign'
      if (key === 'configurationDigest') f.intent.run.configurationDigest = `sha256:${'f'.repeat(64)}`
      await rejectedCallback(f)
      expect(f.tx.qualityJourneyProviderObservation.findUnique).not.toHaveBeenCalled()
      expect(f.custody.retire).toHaveBeenCalledExactlyOnceWith(f.engineOperation)
      expect(f.events[0]).toBe('fence')
    },
  )

  it('keeps full native identity strict for fresh noncontradictory success', async () => {
    await rejectedCallback(fixture({ acknowledged: false }))
  })
  it('retains matching full-identity success and one HUB release', async () => {
    const f = fixture({ acknowledged: false, handles: true })
    const operation = f.invoke()
    const callback = await f.callbackDone.promise
    expect(callback.error).toBeUndefined()
    f.settlement.resolve(callback.value)
    await expect(operation).resolves.toMatchObject({ conflicted: false, replayed: false })
    expect(f.tx.qualityJourneyProviderObservation.create).toHaveBeenCalledTimes(1)
    expect(f.tx.qualityJourneyProviderSlot.updateMany).toHaveBeenCalledTimes(1)
    expect(f.custody.completeFulfilled).toHaveBeenCalledTimes(1)
    expect(f.custody.retire).not.toHaveBeenCalled()
  })
  it('checks full candidate identity before changed-hash replay quarantine', async () => {
    const f = fixture({ prior: true, owned: false })
    f.prior!.requestHash = `sha256:${'e'.repeat(64)}`
    await rejectedCallback(f)
  })
  it('preserves matching-handle changed-hash replay quarantine', async () => {
    const f = fixture({ prior: true, owned: false, handles: true })
    f.prior!.requestHash = `sha256:${'e'.repeat(64)}`
    const operation = f.invoke()
    const outcome = operation.then(
      value => ({ value, error: undefined }),
      error => ({ value: undefined, error }),
    )
    const callback = await f.callbackDone.promise
    expect(callback.value).toEqual({ conflicted: true })
    f.settlement.resolve(callback.value)
    expect((await outcome).error).toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('hub remains quarantined'),
    })
    expect(f.tx.qualityJourneyProviderObservation.upsert).toHaveBeenCalledTimes(1)
    assertNoRelease(f)
    expect(f.custody.completeFulfilled).not.toHaveBeenCalled()
  })
  it('checks the stored receipt full identity when replay has no live candidate', async () => {
    await rejectedCallback(fixture({ prior: true, owned: false }), false)
  })
})

describe('unchanged full canonical receipt handle contract', () => {
  it.each(['runThreadId', 'intentThreadId', 'turnId'] as const)('rejects known %s mismatch', key => {
    const f = fixture({ handles: true })
    const expected = { ...f.identity, runThreadId: 'late-thread', intentThreadId: 'late-thread' }
    expect(() => assertProviderReceiptCanonicalIdentity(f.receipt, { ...expected, [key]: 'foreign' })).toThrow()
  })
  it('accepts matching handles and canonical-null handles', () => {
    const f = fixture({ handles: true })
    expect(() =>
      assertProviderReceiptCanonicalIdentity(f.receipt, {
        ...f.identity,
        runThreadId: 'late-thread',
        intentThreadId: 'late-thread',
      }),
    ).not.toThrow()
    expect(() =>
      assertProviderReceiptCanonicalIdentity(f.receipt, {
        ...f.identity,
        runThreadId: null,
        intentThreadId: null,
        turnId: null,
      }),
    ).not.toThrow()
    const nulls = fixture()
    expect(() =>
      assertProviderReceiptCanonicalIdentity(nulls.receipt, {
        ...nulls.identity,
        runThreadId: null,
        intentThreadId: null,
      }),
    ).not.toThrow()
  })
})
