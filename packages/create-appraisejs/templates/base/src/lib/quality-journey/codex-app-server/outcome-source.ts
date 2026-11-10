import { randomBytes, randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import {
  assertProviderSendPermitOwned,
  inspectProviderSendPermitTransport,
  inspectProviderSenderExcluded,
  type ProviderSendIdentity,
  type ProviderSendPermit,
  type ProviderSenderExcluded,
  type ProviderSenderExclusionRecord,
} from '../provider-intent-contract'
import {
  assertProviderSourceDatabaseClient,
  assertProviderSourceTransactionSettingsForClient,
  acquireProviderSourceDatabaseHold,
  providerSourceDatabaseClient,
  providerSourceDatabaseFor,
  providerSourceDatabaseIsOwned,
  readProviderSourceCommittedSnapshot,
  resolveProviderSourceDatabaseHold,
  type ProviderSourceDatabaseHold,
  type ProviderSourceTransaction,
  type ProviderSourceRequestScope,
  type ProviderSourceCommittedSnapshot,
  type ProviderSourceDatabase,
} from '../provider-source-database'
import {
  assertCommittedProviderSourceReplay,
  assertStoredProviderReconciliationReceipt,
  assertProviderReceiptCanonicalIdentity,
  providerReconciliationRequestHash,
  validateProviderReconciliationRecord,
  type ProviderPhysicalOutcomeRecord,
  type ProviderPhysicalOutcomeSource,
  type ProviderReconciliationContext,
  type ProviderReconciliationReceipt,
} from '../provider-reconciliation-contract'
import {
  inspectRpcTransportOwner,
  inspectRpcTransportSeal,
  type RpcTransportOwner,
  type RpcTransportSeal,
} from './rpc-transport'
import { SyntheticOutcomeCustodian } from './outcome-custodian'
import { encodeOutcomeEnvelope, verifyOutcomeEnvelope, type OutcomeEnvelopeBody } from './outcome-source-envelope'
import {
  assertOutcomeIdentity,
  canonicalOutcomeJson,
  captureOutcomeRequestPin,
  outcomeRequestPinMatches,
  type OutcomeRequestPin,
  outcomeDigest,
  outcomeSourceBounds,
  outcomeSafeInteger,
  OutcomeSourceUnknownError,
  type OutcomeActivationRoute,
} from './outcome-source-contract'
import {
  OutcomeSourceSqliteJournal,
  sqliteOutcomeSourceProtocolDigest,
  type SourceLedgerState,
  type SourceLedgerRecord,
} from './outcome-source-sqlite-journal'

export type SyntheticOutcomeCustodianOptions = Readonly<{
  identity: ProviderSendIdentity & { providerNamespace: string; configurationDigest: string }
  database: ProviderSourceDatabase
  key?: Uint8Array
}>
const sqliteProtocol = Object.freeze({
  protocolDigest: sqliteOutcomeSourceProtocolDigest,
  qualificationDigest: outcomeDigest('SYNTHETIC_REPOSITORY_SOLE_PRISMA:UNQUALIFIED_NATIVE:16c'),
})
export type SourceCommittedReplay = Readonly<{
  conflicted: false
  replayed: true
  quarantined: boolean
  requestHash: string
  receipt: ProviderReconciliationReceipt
  observation: Readonly<{
    id: string
    intentId: string
    observationKey: string
    kind: string
    requestHash: string
    sendBoundaryId: string
    providerNamespace: string
    threadId: string | null
    turnId: string | null
    evidenceDigest: string
    reconciliationJson: string
    createdAt: Date
  }>
}>
export type SqliteDiscardSendOperation = Readonly<{
  reservation: SourceLedgerState
  assertTransactionSettings(tx: ProviderSourceTransaction): Promise<void>
  capture<T>(send: () => Promise<T>): { reply: Promise<T> }
  completeFulfilled(): Promise<void>
  retire(engineOperation?: Promise<unknown>): void
}>
export type SqliteOutcomeCustody = Readonly<{
  state: SourceLedgerState
  assertTransactionSettings(tx: ProviderSourceTransaction): Promise<void>
  verifyLocked(state: SourceLedgerState, records: readonly SourceLedgerRecord[]): void
  completeFulfilled(): void
  retire(engineOperation?: Promise<unknown>): void
  tryResolveCommittedReplay(): Promise<SourceCommittedReplay | undefined>
}>
function replayText(row: ProviderSourceCommittedSnapshot, key: string): string {
  const value = row[key]
  if (typeof value !== 'string') unknown('source_replay_scalar')
  return value
}
function replayNullableText(row: ProviderSourceCommittedSnapshot, key: string): string | null {
  const value = row[key]
  if (value === null) return null
  return replayText(row, key)
}
function committedState(row: ProviderSourceCommittedSnapshot): SourceLedgerState | null {
  if (row.sourceId === null) return null
  return {
    sourceId: replayText(row, 'sourceId'),
    sourceIncarnation: replayText(row, 'sourceIncarnation'),
    providerRunId: replayText(row, 'sourceRunId'),
    intentId: replayText(row, 'sourceIntentId'),
    providerNamespace: replayText(row, 'sourceNamespace'),
    identityJson: replayText(row, 'identityJson'),
    protocolDigest: replayText(row, 'protocolDigest'),
    qualificationDigest: replayText(row, 'qualificationDigest'),
    epoch: outcomeSafeInteger(row.epoch, Number.MAX_SAFE_INTEGER),
    lifecycle: replayText(row, 'lifecycle'),
    sequence: outcomeSafeInteger(row.sequence, outcomeSourceBounds.journalRecords),
    head: replayText(row, 'head'),
    byteCount: outcomeSafeInteger(row.byteCount, outcomeSourceBounds.journalBytes),
    commitFenceVersion: outcomeSafeInteger(row.commitFenceVersion, Number.MAX_SAFE_INTEGER),
    sealedHead: replayNullableText(row, 'sealedHead'),
    sealedEnvelopeDigest: replayNullableText(row, 'sealedEnvelopeDigest'),
    committedObservationId: replayNullableText(row, 'committedObservationId'),
    committedRequestHash: replayNullableText(row, 'committedRequestHash'),
    pendingBatchId: replayNullableText(row, 'pendingBatchId'),
    pendingBatchStartHead: replayNullableText(row, 'pendingBatchStartHead'),
    pendingBatchRequestDigest: replayNullableText(row, 'pendingBatchRequestDigest'),
    pendingBatchRecordAllowance:
      row.pendingBatchRecordAllowance === null
        ? null
        : outcomeSafeInteger(row.pendingBatchRecordAllowance, outcomeSourceBounds.journalRecords),
    pendingBatchByteAllowance:
      row.pendingBatchByteAllowance === null
        ? null
        : outcomeSafeInteger(row.pendingBatchByteAllowance, outcomeSourceBounds.journalBytes),
  }
}
function committedReceipt(
  row: ProviderSourceCommittedSnapshot,
  intentId: string,
  key: string,
  hash: string,
  expectedJson?: string,
): ProviderReconciliationReceipt {
  if (row.reconciledAt === null || row.requestHash !== hash) unknown('source_replay_not_committed')
  const receipt = JSON.parse(replayText(row, 'reconciliationJson')) as ProviderReconciliationReceipt
  assertStoredProviderReconciliationReceipt(receipt)
  if (providerReconciliationRequestHash(intentId, key, receipt) !== hash) unknown('source_replay_request_hash')
  if (expectedJson && canonicalOutcomeJson(receipt) !== expectedJson) unknown('source_replay_receipt')
  if (row.evidenceDigest !== outcomeDigest(canonicalOutcomeJson(receipt))) unknown('source_replay_observation_digest')
  return receipt
}
function assertCommittedTuple(row: ProviderSourceCommittedSnapshot, receipt: ProviderReconciliationReceipt): void {
  assertProviderReceiptCanonicalIdentity(receipt, {
    runId: replayText(row, 'providerRunId'),
    intentId: replayText(row, 'intentId'),
    sendBoundaryId: replayText(row, 'sendBoundaryId'),
    claimEpoch: outcomeSafeInteger(row.claimEpoch, Number.MAX_SAFE_INTEGER),
    providerNamespace: replayText(row, 'providerNamespace'),
    configurationDigest: replayText(row, 'configurationDigest'),
    runThreadId: replayNullableText(row, 'runThreadId'),
    intentThreadId: replayNullableText(row, 'intentThreadId'),
    turnId: replayNullableText(row, 'turnId'),
  })
  const exact = {
    observationBoundary: row.sendBoundaryId,
    observationNamespace: row.providerNamespace,
    kind: receipt.physical.outcome,
    observationThread: receipt.identity.threadId,
    observationTurn: receipt.identity.turnId,
  }
  if (Object.entries(exact).some(([key, value]) => row[key] !== value)) unknown('source_replay_observation_tuple')
}
function committedResult(
  row: ProviderSourceCommittedSnapshot,
  receipt: ProviderReconciliationReceipt,
): SourceCommittedReplay {
  const date = row.observationCreatedAt
  if (typeof date !== 'number' && typeof date !== 'string') unknown('source_replay_created_at')
  const createdAt = new Date(date)
  if (!Number.isFinite(createdAt.getTime())) unknown('source_replay_created_at')
  return Object.freeze({
    conflicted: false,
    replayed: true,
    quarantined: row.runStatus === 'CONFLICT',
    requestHash: replayText(row, 'requestHash'),
    receipt,
    observation: Object.freeze({
      id: replayText(row, 'observationId'),
      intentId: replayText(row, 'intentId'),
      observationKey: replayText(row, 'observationKey'),
      kind: replayText(row, 'kind'),
      requestHash: replayText(row, 'requestHash'),
      sendBoundaryId: replayText(row, 'observationBoundary'),
      providerNamespace: replayText(row, 'observationNamespace'),
      threadId: replayNullableText(row, 'observationThread'),
      turnId: replayNullableText(row, 'observationTurn'),
      evidenceDigest: replayText(row, 'evidenceDigest'),
      reconciliationJson: replayText(row, 'reconciliationJson'),
      createdAt,
    }),
  })
}
async function readCommitted(
  database: ProviderSourceDatabase,
  intentId: string,
  key: string,
  hash: string,
  expectedJson?: string,
  hold?: ProviderSourceDatabaseHold,
): Promise<SourceCommittedReplay | undefined> {
  const row = await readProviderSourceCommittedSnapshot(database, intentId, key, hold, hash)
  if (!row) return
  try {
    const receipt = committedReceipt(row, intentId, key, hash, expectedJson)
    assertCommittedTuple(row, receipt)
    assertCommittedProviderSourceReplay(
      committedState(row),
      { id: replayText(row, 'observationId'), requestHash: hash },
      receipt,
    )
    return committedResult(row, receipt)
  } catch {
    return undefined
  }
}
type OriginalReplayInput = Readonly<{
  intentId: string
  observationKey: string
  senderExcluded?: ProviderSenderExcluded
  physicalEvidence?: unknown
  replayRequestHash?: string
}>
function hasOriginalExclusionBrand(exclusion: ProviderSenderExcluded): boolean {
  try {
    inspectProviderSenderExcluded(exclusion)
    return true
  } catch {
    return false
  }
}
type OwnedProof = { encoded: string; record: ProviderPhysicalOutcomeRecord }
type Issued = { proof: object; exclusion: ProviderSenderExcluded; seal: RpcTransportSeal; owned: OwnedProof }
type Operation = {
  owner: OriginalSqliteSource
  client: PrismaClient
  kind: 'INITIALIZE' | 'SEND' | 'RECONCILE' | 'ENCODING_HOLE' | 'CLOSE' | 'RECEIPT'
  databaseHold: ProviderSourceDatabaseHold
  retired: boolean
  closed: boolean
  engineOperation?: Promise<unknown>
  lookupUsed: boolean
  pin?: Readonly<
    OutcomeRequestPin & {
      operation: Operation
      database: ProviderSourceDatabase
      client: PrismaClient
      sourceId: string
      sourceIncarnation: string
    }
  >
}
const sources = new WeakMap<ProviderPhysicalOutcomeSource, OriginalSqliteSource>()
const owners = new WeakMap<RpcTransportOwner, OriginalSqliteSource>()
const namespaces = new Set<string>()
let custodySlot: Operation | undefined
let lastTombstone: Readonly<{ sourceId: string; kind: string }> | undefined
function unknown(reason: string): never {
  throw new OutcomeSourceUnknownError(reason)
}

class OriginalSqliteSource {
  readonly sourceId = `sqlite_custodian_${randomUUID()}`
  readonly sourceIncarnation = randomUUID()
  readonly custody: SyntheticOutcomeCustodian
  readonly journal: OutcomeSourceSqliteJournal
  readonly database: ProviderSourceDatabase
  readonly source: ProviderPhysicalOutcomeSource
  readonly context: ProviderReconciliationContext
  readonly identity
  #key: Buffer
  #proofs = new WeakMap<object, OwnedProof>()
  #issued?: Issued
  #originalIssued?: Readonly<{ proof: object; exclusion: ProviderSenderExcluded }>
  #keyZeroCalls = 0
  #receiptReleaseCalls = 0
  #liveProofMapReplaceCalls = 0
  #issuedClearCalls = 0
  #queries = 0
  #disposed = false
  #disposeRequested = false
  #poison = false
  #operation?: Operation
  #receiptReserved = false
  #replayProofs = new WeakMap<
    object,
    Readonly<{ record: ProviderPhysicalOutcomeRecord; exclusion: ProviderSenderExcluded }>
  >()

  constructor(options: SyntheticOutcomeCustodianOptions) {
    if (custodySlot) unknown('source_custody_slot_unavailable')
    const identity = Object.freeze({
      runId: options.identity.runId,
      intentId: options.identity.intentId,
      sendBoundaryId: options.identity.sendBoundaryId,
      claimEpoch: options.identity.claimEpoch,
      providerNamespace: options.identity.providerNamespace,
      configurationDigest: options.identity.configurationDigest,
    })
    assertOutcomeIdentity({
      ...identity,
      transportId: 'pending',
      transportIncarnation: 'pending',
      threadId: null,
      turnId: null,
    })
    if (namespaces.has(identity.providerNamespace)) unknown('namespace_already_owned')
    namespaces.add(identity.providerNamespace)
    this.database = options.database
    this.#key = options.key === undefined ? randomBytes(32) : Buffer.from(options.key)
    if (this.#key.length !== 32) unknown('key_loss')
    const cell = { journal: undefined as OutcomeSourceSqliteJournal | undefined }
    const journal = () => cell.journal ?? unknown('source_creation_admission_closed')
    this.custody = new SyntheticOutcomeCustodian({
      append: (kind, data) => journal().append(kind, data),
      assertHealthy: () => journal().assertHealthy(),
      assertObservationAdmission: () => journal().assertObservationAdmission(),
    })
    this.identity = Object.freeze({
      ...identity,
      ...inspectRpcTransportOwner(this.custody.transport.owner),
      threadId: null,
      turnId: null,
    })
    try {
      this.journal = new OutcomeSourceSqliteJournal({
        database: this.database,
        sourceId: this.sourceId,
        sourceIncarnation: this.sourceIncarnation,
        identity: this.identity,
        ...sqliteProtocol,
      })
      cell.journal = this.journal
    } catch (error) {
      this.custody.transport.sealSender()
      throw error
    }
    this.source = Object.freeze({
      sourceId: this.sourceId,
      provenance: 'SYNTHETIC_REPOSITORY',
      ...sqliteProtocol,
      providerNamespace: identity.providerNamespace,
      configurationDigest: identity.configurationDigest,
      inspect: (proof: unknown) => this.inspect(proof),
    })
    this.context = Object.freeze({ selection: 'SYNTHETIC_REPOSITORY', source: this.source })
    sources.set(this.source, this)
    owners.set(this.custody.transport.owner, this)
  }
  async initialize(): Promise<void> {
    const operation = this.#start(providerSourceDatabaseClient(this.database), 'INITIALIZE')
    const engine = this.journal.initialize(operation.databaseHold)
    try {
      await engine
      this.#release(operation)
    } catch (error) {
      this.#retire(operation, engine)
      throw error
    }
  }
  #assertAdmission(): void {
    if (this.#disposed || this.#disposeRequested || this.#poison || this.#operation) unknown('source_admission_closed')
    if (custodySlot) unknown('source_custody_slot_unavailable')
  }
  #verifyOwnedEnvelope(owned: OwnedProof, issued: Issued): OutcomeEnvelopeBody {
    const body = verifyOutcomeEnvelope(owned.encoded, this.#key, sqliteProtocol)
    const sender = inspectProviderSenderExcluded(issued.exclusion)
    if (
      body.sourceIncarnation !== this.sourceIncarnation ||
      body.ledgerHead !== this.journal.snapshot().head ||
      body.senderEvidenceId !== sender.senderEvidenceId ||
      canonicalOutcomeJson({ ...body.record, evidenceDigest: outcomeDigest(owned.encoded) }) !==
        canonicalOutcomeJson(owned.record)
    )
      unknown('source_binding')
    return body
  }
  #assertOwnedRange(owned: OwnedProof, body: OutcomeEnvelopeBody): void {
    const range = this.custody.assertSynchronousDiscardComplete()
    if (
      canonicalOutcomeJson(range) !== canonicalOutcomeJson(body.finalWatermark) ||
      Object.entries(this.identity).some(([key, value]) => owned.record[key as keyof typeof this.identity] !== value)
    )
      unknown('source_range_binding')
  }
  #ownedProof(proof: unknown): OwnedProof {
    if (this.#disposed || this.#poison) unknown('key_loss_or_disposed')
    const owned = proof && typeof proof === 'object' ? this.#proofs.get(proof) : undefined
    if (!owned || !this.#issued) unknown('original_source_proof_required')
    const body = this.#verifyOwnedEnvelope(owned, this.#issued)
    this.#assertOwnedRange(owned, body)
    return owned
  }
  inspect(proof: unknown): ProviderPhysicalOutcomeRecord {
    this.#assertAdmission()
    if (++this.#queries > outcomeSourceBounds.queries) unknown('query_limit')
    this.journal.assertHealthy()
    if (this.#receiptReserved && !this.#issued) unknown('receipt_lost')
    return this.#ownedProof(proof).record
  }
  #senderRange(sender: ProviderSenderExclusionRecord, seal: RpcTransportSeal) {
    const range = this.custody.capture(seal),
      original = inspectRpcTransportSeal(seal)
    if (
      Object.entries(this.identity).some(([key, value]) => sender[key as keyof typeof this.identity] !== value) ||
      original.issuedRequests !== range.issuedRequests ||
      original.writtenBytes !== range.writtenBytes ||
      canonicalOutcomeJson(range) !== canonicalOutcomeJson(sender.finalWatermark)
    )
      unknown('sender_binding')
    return range
  }
  async issueNonstart(exclusion: ProviderSenderExcluded, seal: RpcTransportSeal): Promise<unknown> {
    this.#assertAdmission()
    this.journal.assertHealthy()
    if (this.#issued) {
      if (this.#issued.exclusion !== exclusion || this.#issued.seal !== seal) unknown('conflicting_evidence')
      return this.#issued.proof
    }
    const sender = inspectProviderSenderExcluded(exclusion)
    await this.close()
    const range = this.#senderRange(sender, seal)
    const record = Object.freeze({
      ...this.identity,
      sourceId: this.sourceId,
      provenance: 'SYNTHETIC_REPOSITORY' as const,
      ...sqliteProtocol,
      evidenceId: `custody_${randomUUID()}`,
      evidenceClass: 'AUTHORITATIVE_OPERATION_RANGE' as const,
      outcome: 'NONSTART' as const,
      conflictStatus: 'CLEAR' as const,
      coveredThrough: range,
    })
    const operation = this.#start(providerSourceDatabaseClient(this.database), 'RECEIPT')
    this.#receiptReserved = true
    let engine: Promise<unknown> | undefined
    try {
      engine = this.journal.reserveDiscardWindow(
        operation.databaseHold,
        outcomeDigest(canonicalOutcomeJson({ evidenceId: record.evidenceId })),
        'RECEIPT',
      )
      const ticket = (await engine) as Awaited<ReturnType<OutcomeSourceSqliteJournal['reserveDiscardWindow']>>
      this.journal.runReservedSynchronousDiscard(ticket, () =>
        this.journal.append('RECEIPT_RESERVED', {
          evidenceId: record.evidenceId,
          senderEvidenceId: sender.senderEvidenceId,
        }),
      )
      engine = this.journal.commitObservedDiscardWindow(operation.databaseHold, ticket)
      await engine
      const body: OutcomeEnvelopeBody = Object.freeze({
        version: 'M06_OUTCOME_SOURCE_V1',
        sourceIncarnation: this.sourceIncarnation,
        senderEvidenceId: sender.senderEvidenceId,
        finalWatermark: range,
        ledgerHead: this.journal.head,
        record,
      })
      const encoded = encodeOutcomeEnvelope(body, this.#key, sqliteProtocol)
      const owned = { encoded, record: Object.freeze({ ...record, evidenceDigest: outcomeDigest(encoded) }) }
      engine = this.journal.seal(operation.databaseHold, owned.record.evidenceDigest)
      await engine
      if (this.#disposeRequested || this.#poison) unknown('source_admission_closed')
      const proof = Object.freeze({})
      this.#proofs.set(proof, owned)
      this.#issued = { proof, exclusion, seal, owned }
      this.#originalIssued = Object.freeze({ proof, exclusion })
      this.#release(operation)
      return proof
    } catch (error) {
      this.#poison = true
      this.#retire(operation, engine)
      throw error
    }
  }
  #start(client: PrismaClient, kind: Operation['kind'], scope?: ProviderSourceRequestScope): Operation {
    this.#assertAdmission()
    assertProviderSourceDatabaseClient(this.database, client)
    const databaseHold = acquireProviderSourceDatabaseHold(this.database, kind, scope)
    const operation: Operation = {
      owner: this,
      client,
      kind,
      databaseHold,
      retired: false,
      closed: false,
      lookupUsed: false,
    }
    this.#operation = operation
    custodySlot = operation
    return operation
  }
  #retire(operation: Operation, engineOperation?: Promise<unknown>): void {
    if (operation.closed) return
    if (this.#operation !== operation || custodySlot !== operation) unknown('custody_operation_binding')
    operation.engineOperation ??= engineOperation
    operation.retired = true
    operation.databaseHold.retire(engineOperation)
    // Fence actual local handoff without erasing key, receipt, maps or source connection.
    this.custody.transport.sealSender()
  }
  #release(operation: Operation, committedReplay = false): void {
    if (operation.closed) return
    if (this.#operation !== operation || custodySlot !== operation) unknown('custody_operation_binding')
    if (operation.retired && !committedReplay) unknown('retired_original_requires_committed_replay')
    const tombstone = Object.freeze({ sourceId: this.sourceId, kind: operation.kind })
    // Only this private synchronous closure finalizes source state, while the real DB hold remains.
    const finalizeSource = () => {
      operation.closed = true
      lastTombstone = tombstone
      this.#operation = undefined
      custodySlot = undefined
      if (this.#disposeRequested) this.#destroy()
    }
    // Eligibility is checked before invoking the closure; cleanup pumps only after its return.
    if (operation.retired) {
      if (!resolveProviderSourceDatabaseHold(operation.databaseHold, finalizeSource)) return
    } else operation.databaseHold.complete(finalizeSource)
  }
  async beginSend(permit: ProviderSendPermit, client: PrismaClient): Promise<SqliteDiscardSendOperation> {
    const bound = inspectProviderSendPermitTransport(permit)
    if (
      bound.owner !== this.custody.transport.owner ||
      bound.providerNamespace !== this.identity.providerNamespace ||
      bound.configurationDigest !== this.identity.configurationDigest ||
      Object.entries(bound.identity).some(([key, value]) => this.identity[key as keyof ProviderSendIdentity] !== value)
    )
      unknown('original_permit_binding')
    const operation = this.#start(client, 'SEND')
    let ticket
    let reservationOperation: Promise<unknown> | undefined
    try {
      reservationOperation = this.journal.reserveDiscardWindow(
        operation.databaseHold,
        outcomeDigest(canonicalOutcomeJson({ ...this.identity, permit: bound.identity })),
      )
      ticket = (await reservationOperation) as Awaited<ReturnType<OutcomeSourceSqliteJournal['reserveDiscardWindow']>>
    } catch (error) {
      this.#poison = true
      this.#retire(operation, reservationOperation)
      throw error
    }
    const reservation = Object.freeze({
      ...this.journal.pendingReservation(ticket),
      lifecycle: 'ACTIVE',
      commitFenceVersion: 0,
      sealedHead: null,
      sealedEnvelopeDigest: null,
      committedObservationId: null,
      committedRequestHash: null,
    }) as SourceLedgerState
    return Object.freeze({
      reservation,
      assertTransactionSettings: (tx: ProviderSourceTransaction) =>
        assertProviderSourceTransactionSettingsForClient(client, tx, operation.databaseHold, 'SEND_CANONICAL'),
      capture: <T>(send: () => Promise<T>) =>
        this.journal.runReservedSynchronousDiscard(ticket, () => {
          if (operation.closed || operation.retired) unknown('source_admission_closed')
          const before = this.custody.snapshot().allocations
          const reply = send()
          void reply.catch(() => {})
          const range = this.custody.assertSynchronousDiscardComplete()
          if (range.issuedRequests <= before) unknown('synchronous_original_observation_required')
          return { reply }
        }),
      completeFulfilled: async () => {
        if (operation.retired || operation.closed) unknown('custody_completion_refused')
        const engine = this.journal.commitObservedDiscardWindow(operation.databaseHold, ticket)
        try {
          await engine
          this.#release(operation)
        } catch (error) {
          this.#poison = true
          this.#retire(operation, engine)
          throw error
        }
      },
      retire: (engine?: Promise<unknown>) => this.#retire(operation, engine),
    })
  }
  acquire(
    proof: unknown,
    sender: ProviderSenderExcluded,
    client: PrismaClient,
    expected: ProviderReconciliationReceipt,
    request: Readonly<{ observationKey: string; requestHash: string }>,
  ): SqliteOutcomeCustody {
    const expectedJson = canonicalOutcomeJson(expected)
    const observationKey = request.observationKey,
      suppliedHash = request.requestHash
    this.#assertAdmission()
    if (this.#queries + 2 > outcomeSourceBounds.queries) unknown('query_limit')
    const state = this.journal.sealedState()
    const owned = this.#ownedProof(proof)
    const actual = validateProviderReconciliationRecord(sender, this.source, owned.record)
    if (canonicalOutcomeJson(actual) !== expectedJson) unknown('source_candidate_binding')
    if (
      typeof observationKey !== 'string' ||
      !/^[a-zA-Z0-9_.:/-]{1,200}$/.test(observationKey) ||
      typeof suppliedHash !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(suppliedHash)
    )
      unknown('source_request_pin')
    const derivedHash = providerReconciliationRequestHash(this.identity.intentId, observationKey, actual)
    const captured = captureOutcomeRequestPin(
      this.identity.intentId,
      observationKey,
      suppliedHash,
      derivedHash,
      expectedJson,
    )
    const operation = this.#start(client, 'RECONCILE', captured)
    operation.pin = Object.freeze({
      ...captured,
      operation,
      database: this.database,
      client,
      sourceId: this.sourceId,
      sourceIncarnation: this.sourceIncarnation,
    })
    let checks = 0
    return Object.freeze({
      state,
      assertTransactionSettings: (tx: ProviderSourceTransaction) =>
        assertProviderSourceTransactionSettingsForClient(client, tx, operation.databaseHold, 'RECONCILE_CANONICAL'),
      verifyLocked: (locked: SourceLedgerState, records: readonly SourceLedgerRecord[]) => {
        if (operation.closed || operation.retired || ++checks > 2) unknown('held_validation_limit')
        try {
          this.journal.verifyLocked(locked, records)
          const held = validateProviderReconciliationRecord(sender, this.source, this.#ownedProof(proof).record)
          if (canonicalOutcomeJson(held) !== expectedJson) unknown('source_candidate_binding')
        } catch (error) {
          this.#poison = true
          throw error
        }
      },
      completeFulfilled: () => this.#release(operation),
      retire: (engine?: Promise<unknown>) => this.#retire(operation, engine),
      tryResolveCommittedReplay: () => this.resolve(operation, undefined, undefined, false),
    })
  }
  async resolve(
    operation: Operation,
    key: string | undefined,
    hash: string | undefined,
    separatelyRequested: boolean,
  ): Promise<SourceCommittedReplay | undefined> {
    const pin = this.#retiredReconciliationPin(operation)
    if (!pin) return
    if (separatelyRequested && (key !== pin.observationKey || hash !== pin.requestHash)) return
    if (operation.lookupUsed && !separatelyRequested) return
    operation.lookupUsed = true
    const result = await this.#readCommitted(
      pin.receiptJson,
      pin.observationKey,
      pin.requestHash,
      operation.databaseHold,
    )
    if (result) this.#releaseCommittedReconciliation(operation, result)
    return result
  }
  #retiredReconciliationPin(operation: Operation) {
    const pin = operation.pin
    if (!operation.retired || operation.closed || operation.kind !== 'RECONCILE' || !pin) return
    return pin
  }
  #currentReconciliationPin(operation: Operation) {
    const pin = this.#retiredReconciliationPin(operation)
    if (!pin) return
    if (
      this.#operation !== operation ||
      custodySlot !== operation ||
      pin.operation !== operation ||
      pin.database !== this.database ||
      pin.client !== operation.client ||
      pin.sourceId !== this.sourceId ||
      pin.sourceIncarnation !== this.sourceIncarnation
    )
      return
    return pin
  }
  #releaseCommittedReconciliation(operation: Operation, result: SourceCommittedReplay): void {
    const pin = this.#currentReconciliationPin(operation)
    if (!pin) return
    const receiptJson = canonicalOutcomeJson(result.receipt)
    if (
      !outcomeRequestPinMatches(pin, {
        intentId: result.observation.intentId,
        observationKey: result.observation.observationKey,
        requestHash: result.requestHash,
        receiptJson,
      })
    )
      return
    if (providerReconciliationRequestHash(pin.intentId, pin.observationKey, result.receipt) !== pin.requestHash) return
    this.#release(operation, true)
  }
  async #readCommitted(
    expectedJson: string,
    key: string,
    hash: string,
    hold?: ProviderSourceDatabaseHold,
  ): Promise<SourceCommittedReplay | undefined> {
    return readCommitted(this.database, this.identity.intentId, key, hash, expectedJson, hold)
  }
  #originalReplayReceipt(input: OriginalReplayInput): ProviderReconciliationReceipt | undefined {
    if (
      !input.senderExcluded ||
      !input.physicalEvidence ||
      typeof input.physicalEvidence !== 'object' ||
      input.intentId !== this.identity.intentId
    )
      return
    const original =
      this.#issued?.proof === input.physicalEvidence
        ? { record: this.#issued.owned.record, exclusion: this.#issued.exclusion }
        : this.#replayProofs.get(input.physicalEvidence)
    if (!original || original.exclusion !== input.senderExcluded) return
    return validateProviderReconciliationRecord(input.senderExcluded, this.source, original.record)
  }
  #originalReplayRequest(input: OriginalReplayInput, client: PrismaClient) {
    if (providerSourceDatabaseFor(client) !== this.database) unknown('source_database_binding')
    const receipt = this.#originalReplayReceipt(input)
    if (!receipt) return
    const hash = providerReconciliationRequestHash(input.intentId, input.observationKey, receipt)
    if (input.replayRequestHash && input.replayRequestHash !== hash) return
    return { receipt, hash }
  }
  #originalReplayResolution(input: OriginalReplayInput, hash: string) {
    const current = this.#operation
    const pin = current?.pin
    const eligible =
      current?.retired &&
      current.kind === 'RECONCILE' &&
      pin?.observationKey === input.observationKey &&
      pin.requestHash === hash
    return { current, eligible }
  }
  async originalReplay(input: OriginalReplayInput, client: PrismaClient): Promise<SourceCommittedReplay | undefined> {
    const replay = this.#originalReplayRequest(input, client)
    if (!replay) return
    const resolution = this.#originalReplayResolution(input, replay.hash)
    const result = await this.#readCommitted(
      canonicalOutcomeJson(replay.receipt),
      input.observationKey,
      replay.hash,
      resolution.eligible ? resolution.current!.databaseHold : undefined,
    )
    if (result && this.#operation?.client === client) this.#releaseCommittedReconciliation(this.#operation, result)
    return result
  }
  close(): Promise<void> {
    // The fence is synchronous even when preparation/persistence completes asynchronously.
    this.custody.transport.sealSender()
    if (this.#operation) {
      if (this.#operation.kind === 'SEND') {
        try {
          this.journal.assertObservationAdmission()
        } catch {
          return Promise.resolve()
        }
        this.custody.close()
      }
      return Promise.resolve()
    }
    if (this.#disposed || this.custody.snapshot().state === 'CLOSED') return Promise.resolve()
    return this.#localWindow('CLOSE', () => this.custody.close())
  }
  async observeEncodingHole(): Promise<void> {
    await this.#localWindow('ENCODING_HOLE', () => {
      const circular: { self?: unknown } = {}
      circular.self = circular
      const reply = this.custody.transport.request('thread/start', circular)
      void reply.catch(() => {})
    })
  }
  async #localWindow(kind: 'CLOSE' | 'ENCODING_HOLE', capture: () => void): Promise<void> {
    const operation = this.#start(providerSourceDatabaseClient(this.database), kind)
    let engine: Promise<unknown> | undefined
    try {
      engine = this.journal.reserveDiscardWindow(
        operation.databaseHold,
        outcomeDigest(canonicalOutcomeJson({ ...this.identity, kind })),
        kind,
      )
      const ticket = (await engine) as Awaited<ReturnType<OutcomeSourceSqliteJournal['reserveDiscardWindow']>>
      this.journal.runReservedSynchronousDiscard(ticket, capture)
      engine = this.journal.commitObservedDiscardWindow(operation.databaseHold, ticket)
      await engine
      this.#release(operation)
    } catch (error) {
      this.#poison = true
      this.#retire(operation, engine)
      throw error
    }
  }
  reserveActivation(route: OutcomeActivationRoute): never {
    if (this.#operation) {
      if (this.#operation.kind !== 'SEND') return unknown('source_admission_closed')
      // Only an actually open original capture may record this reentrant diagnostic.
      this.journal.assertObservationAdmission()
      this.#poison = true
      return this.custody.reserveActivation(route)
    }
    this.#assertAdmission()
    return this.custody.reserveActivation(route)
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposeRequested = true
    this.custody.transport.sealSender()
    if (!this.#operation) this.#destroy()
  }
  #destroy(): void {
    if (this.#disposed || this.#operation) return
    this.#disposed = true
    this.#key.fill(0)
    this.#keyZeroCalls++
    if (this.#issued)
      this.#replayProofs.set(
        this.#issued.proof,
        Object.freeze({ record: this.#issued.owned.record, exclusion: this.#issued.exclusion }),
      )
    if (this.#issued) this.#receiptReleaseCalls++
    this.#proofs = new WeakMap()
    this.#liveProofMapReplaceCalls++
    this.#issued = undefined
    this.#issuedClearCalls++
    this.journal.dispose()
    this.custody.destroyOriginalState()
  }
  #hasOriginalTombstone(): boolean {
    const original = this.#originalIssued
    if (!original) return false
    return this.#replayProofs.get(original.proof)?.exclusion === original.exclusion
  }
  #proofDiagnostics() {
    const issued = this.#issued,
      original = this.#originalIssued
    const empty = {
      issuedProofPresent: false,
      issuedExclusionPresent: false,
      liveProofContainsIssued: false,
      issuedProofMatchesOriginal: false,
      issuedExclusionMatchesOriginal: false,
      replayTombstoneContainsOriginal: this.#hasOriginalTombstone(),
    }
    if (!issued) return empty
    return {
      ...empty,
      issuedProofPresent: true,
      issuedExclusionPresent: hasOriginalExclusionBrand(issued.exclusion),
      liveProofContainsIssued: this.#proofs.has(issued.proof),
      issuedProofMatchesOriginal: issued.proof === original?.proof,
      issuedExclusionMatchesOriginal: issued.exclusion === original?.exclusion,
    }
  }
  #diagnostics() {
    const journal = this.journal.snapshot()
    return Object.freeze({
      custody: this.custody.diagnostics(),
      source: Object.freeze({
        keyByteLength: this.#key.length,
        keyNonzeroBytes: this.#key.reduce((count, value) => count + Number(value !== 0), 0),
        keyZeroCalls: this.#keyZeroCalls,
        receiptEncodedBytes: Buffer.byteLength(this.#issued?.owned.encoded ?? ''),
        receiptReleaseCalls: this.#receiptReleaseCalls,
        liveProofMapReplaceCalls: this.#liveProofMapReplaceCalls,
        issuedClearCalls: this.#issuedClearCalls,
        journalOpen: !journal.disposed,
        journalDisposeCalls: journal.disposeCalls,
        ...this.#proofDiagnostics(),
      }),
    })
  }
  snapshot() {
    return Object.freeze({
      ...this.custody.snapshot(),
      disposed: this.#disposed,
      disposeRequested: this.#disposeRequested,
      held: !!this.#operation,
      retired: !!this.#operation?.retired,
      resources: Object.freeze({
        keyByteLength: this.#key.length,
        keyNonzeroBytes: this.#key.reduce((count, value) => count + Number(value !== 0), 0),
        receiptBytes: this.#issued?.owned.encoded.length ?? 0,
        journalOpen: !this.#disposed,
      }),
      lastResolvedSource: lastTombstone?.sourceId ?? null,
      diagnostics: this.#diagnostics(),
    })
  }
}

export async function createSyntheticOutcomeCustodian(options: SyntheticOutcomeCustodianOptions) {
  const owner = new OriginalSqliteSource(options)
  await owner.initialize()
  return Object.freeze({
    transport: owner.custody.transport,
    context: owner.context,
    reserveActivation: (route: OutcomeActivationRoute) => owner.reserveActivation(route),
    close: () => owner.close(),
    snapshot: () => owner.snapshot(),
    observeEncodingHole: () => owner.observeEncodingHole(),
    dispose: () => owner.dispose(),
    issueNonstart: (exclusion: ProviderSenderExcluded, seal: RpcTransportSeal) => owner.issueNonstart(exclusion, seal),
  })
}
export async function beginOriginalSqliteDiscardSend(
  permit: ProviderSendPermit,
  client: PrismaClient,
): Promise<SqliteDiscardSendOperation | undefined> {
  assertProviderSendPermitOwned(permit)
  let bound
  try {
    bound = inspectProviderSendPermitTransport(permit)
  } catch {
    return undefined
  } // Genuine original unbound legacy sender.
  return owners.get(bound.owner)?.beginSend(permit, client)
}
export function acquireOriginalSqliteOutcomeCustody(
  source: ProviderPhysicalOutcomeSource,
  proof: unknown,
  sender: ProviderSenderExcluded,
  client: PrismaClient,
  expected: ProviderReconciliationReceipt,
  request: Readonly<{ observationKey: string; requestHash: string }>,
): SqliteOutcomeCustody {
  const owner = sources.get(source)
  if (!owner || expected.physical.outcome !== 'NONSTART') unknown('original_sqlite_nonstart_source_required')
  return owner.acquire(proof, sender, client, expected, request)
}
export async function resolveOriginalSqliteRetirementFromReplay(
  client: PrismaClient,
  intentId: string,
  key: string,
  hash: string,
): Promise<SourceCommittedReplay | undefined> {
  const operation = custodySlot
  if (!operation || operation.client !== client || operation.owner.identity.intentId !== intentId) return
  return operation.owner.resolve(operation, key, hash, true)
}

/** Authentic original-input tombstone dispatch. Positive actual DB replay only, never fresh proof. */
export async function readOriginalSqliteCommittedReplay(
  input: Readonly<{
    intentId: string
    observationKey: string
    senderExcluded?: ProviderSenderExcluded
    physicalEvidence?: unknown
    replayRequestHash?: string
  }>,
  context: ProviderReconciliationContext,
  client: PrismaClient,
): Promise<SourceCommittedReplay | undefined> {
  const owner = context.source ? sources.get(context.source) : undefined
  if (owner) return owner.originalReplay(input, client)
  if (input.replayRequestHash && providerSourceDatabaseIsOwned(client)) {
    return readCommitted(
      providerSourceDatabaseFor(client),
      input.intentId,
      input.observationKey,
      input.replayRequestHash,
    )
  }
  return undefined
}
