import { describe, expect, it, vi } from 'vitest'
import { readNativeOutcomeCommittedReplay } from './native-outcome-replay'
import { nativeOutcomeProtocolDigest } from './native-outcome-profile'
import { canonicalOutcomeJson, outcomeDigest } from './outcome-source-contract'
import {
  assertCommittedProviderSourceReplay,
  providerReconciliationRequestHash,
  type ProviderReconciliationReceipt,
} from '../provider-reconciliation-contract'
import type { ProviderSourceDatabase } from '../provider-source-database'
import type { SourceLedgerRecord } from './outcome-source-sqlite-journal'
const db = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('../provider-source-database', () => ({ readProviderSourceCommittedSnapshot: db.read }))
const d = (letter: string) => `sha256:${letter.repeat(64)}`
function fixture() {
  const identity = {
    runId: 'run',
    intentId: 'intent',
    sendBoundaryId: 'boundary',
    claimEpoch: 1,
    providerNamespace: 'native:one',
    configurationDigest: d('a'),
    transportId: 'transport',
    transportIncarnation: 'incarnation',
    threadId: 'thread',
    turnId: 'turn',
  }
  const initialIdentity = { ...identity, transportIncarnation: null, threadId: null, turnId: null }
  const binding = {
    sourceId: 'native_outcome_source',
    sourceIncarnation: 'original_incarnation',
    providerRunId: 'run',
    intentId: 'intent',
    providerNamespace: 'native:one',
    identityJson: canonicalOutcomeJson(initialIdentity),
    protocolDigest: nativeOutcomeProtocolDigest,
    qualificationDigest: d('b'),
    epoch: 1,
  }
  function makeRecord(
    sequence: number,
    previousHead: string,
    kind: string,
    data: Record<string, unknown>,
  ): SourceLedgerRecord {
    const body = { sequence, previous: previousHead, kind, data },
      head = outcomeDigest(canonicalOutcomeJson(body))
    return {
      sequence,
      previousHead,
      kind,
      head,
      dataJson: canonicalOutcomeJson(data),
      byteCount: Buffer.byteLength(`${canonicalOutcomeJson({ ...body, head })}\n`),
    }
  }
  const created = makeRecord(1, outcomeDigest('M13_NATIVE_OUTCOME_INITIAL_V1'), 'CREATED', binding)
  const bound = makeRecord(2, created.head, 'RECEIPT_RESERVED', {
    version: 'M13_NATIVE_IDENTITY_BOUND_V1',
    createdDigest: outcomeDigest(canonicalOutcomeJson(created)),
    initialIdentityDigest: outcomeDigest(binding.identityJson),
    finalIdentity: identity,
    candidateDigest: d('f'),
  })
  const physical = {
    ...identity,
    sourceId: binding.sourceId,
    provenance: 'NATIVE_QUALIFIED' as const,
    qualificationDigest: d('b'),
    protocolDigest: nativeOutcomeProtocolDigest,
    evidenceId: 'native_evidence',
    evidenceDigest: d('f'),
    evidenceClass: 'AUTHORITATIVE_OPERATION_RANGE' as const,
    outcome: 'TERMINAL' as const,
    conflictStatus: 'CLEAR' as const,
    coveredThrough: { issuedRequests: 5, writtenBytes: 400 },
  }
  const receipt: ProviderReconciliationReceipt = {
    version: 'PROVIDER_RECONCILIATION_V1',
    identity,
    senderEvidenceId: 'sender',
    finalWatermark: physical.coveredThrough,
    physical,
  }
  const hash = providerReconciliationRequestHash('intent', 'key', receipt)
  const row: Record<string, string | number | null> = {
    ...binding,
    sourceRunId: 'run',
    sourceIntentId: 'intent',
    sourceNamespace: 'native:one',
    lifecycle: 'COMMITTED',
    sequence: 2,
    head: bound.head,
    byteCount: created.byteCount + bound.byteCount,
    commitFenceVersion: 1,
    sealedHead: bound.head,
    sealedEnvelopeDigest: d('f'),
    committedObservationId: 'observation',
    committedRequestHash: hash,
    pendingBatchId: null,
    pendingBatchStartHead: null,
    pendingBatchRecordAllowance: null,
    pendingBatchByteAllowance: null,
    pendingBatchRequestDigest: null,
    observationId: 'observation',
    intentId: 'intent',
    observationKey: 'key',
    kind: 'TERMINAL',
    requestHash: hash,
    observationBoundary: 'boundary',
    observationNamespace: 'native:one',
    observationThread: 'thread',
    observationTurn: 'turn',
    evidenceDigest: outcomeDigest(canonicalOutcomeJson(receipt)),
    reconciliationJson: canonicalOutcomeJson(receipt),
    observationCreatedAt: Date.now(),
    reconciledAt: Date.now(),
    providerRunId: 'run',
    sendBoundaryId: 'boundary',
    claimEpoch: 1,
    providerNamespace: 'native:one',
    configurationDigest: d('a'),
    runThreadId: 'thread',
    intentThreadId: 'thread',
    turnId: 'turn',
    runStatus: 'TERMINAL',
    nativeLedgerCount: 2,
    nativeCreatedCount: 1,
    nativeBoundCount: 1,
    nativeCreatedSequence: 1,
    nativeCreatedJson: created.dataJson,
    nativeCreatedHead: created.head,
    nativeCreatedPreviousHead: created.previousHead,
    nativeCreatedByteCount: created.byteCount,
    nativeBoundSequence: 2,
    nativeBoundJson: bound.dataJson,
    nativeBoundHead: bound.head,
    nativeBoundPreviousHead: bound.previousHead,
    nativeBoundByteCount: bound.byteCount,
  }
  db.read.mockResolvedValue(row)
  const read = () =>
    readNativeOutcomeCommittedReplay({} as ProviderSourceDatabase, receipt, 'key', hash, [created, bound])
  return { row, receipt, read }
}
describe('native exact positive committed replay uses its separate immutable admission join', () => {
  it('returns the exact committed receipt without source inspection, new transaction or release', async () => {
    const f = fixture(),
      result = await f.read()
    expect(result).toMatchObject({ replayed: true, conflicted: false, receipt: f.receipt })
    expect(db.read).toHaveBeenLastCalledWith(
      expect.anything(),
      'intent',
      'key',
      undefined,
      expect.stringMatching(/^sha256:/),
    )
    expect(() =>
      assertCommittedProviderSourceReplay(null, { id: 'observation', requestHash: 'hash' }, f.receipt),
    ).toThrow()
    expect(() =>
      assertCommittedProviderSourceReplay({} as never, { id: 'observation', requestHash: 'hash' }, f.receipt),
    ).toThrow()
  })
  for (const field of [
    'sourceId',
    'sourceIncarnation',
    'identityJson',
    'protocolDigest',
    'qualificationDigest',
    'head',
    'sealedHead',
    'sealedEnvelopeDigest',
    'committedObservationId',
    'committedRequestHash',
    'nativeCreatedJson',
    'nativeCreatedHead',
    'nativeBoundJson',
    'nativeBoundHead',
    'nativeBoundPreviousHead',
    'observationBoundary',
    'observationNamespace',
    'observationThread',
    'observationTurn',
    'evidenceDigest',
    'requestHash',
    'lifecycle',
  ]) {
    it(`refuses changed ${field}`, async () => {
      const f = fixture()
      f.row[field] = 'changed'
      expect(await f.read()).toBeUndefined()
    })
  }
  for (const field of [
    'nativeLedgerCount',
    'nativeCreatedCount',
    'nativeBoundCount',
    'nativeBoundSequence',
    'nativeCreatedByteCount',
    'nativeBoundByteCount',
    'epoch',
    'sequence',
    'commitFenceVersion',
  ]) {
    it(`refuses changed ${field}`, async () => {
      const f = fixture()
      f.row[field] = 999
      expect(await f.read()).toBeUndefined()
    })
  }
  it('keeps a negative lookup negative and refuses unknown native protocols in generic replay', async () => {
    const f = fixture()
    db.read.mockResolvedValue(null)
    expect(await f.read()).toBeUndefined()
    const unknown = { ...f.receipt, physical: { ...f.receipt.physical, protocolDigest: d('0') } }
    expect(() =>
      assertCommittedProviderSourceReplay(null, { id: 'observation', requestHash: 'hash' }, unknown),
    ).toThrow()
  })
})
