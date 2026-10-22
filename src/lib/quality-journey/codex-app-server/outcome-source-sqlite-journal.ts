import { randomUUID } from 'node:crypto'
import {
  providerSourceTransaction,
  type ProviderSourceDatabase,
  type ProviderSourceDatabaseHold,
  type ProviderSourcePhase,
  type ProviderSourceTransaction,
} from '../provider-source-database'
import type { ProviderReconciliationIdentity } from '../provider-intent-contract'
import {
  canonicalOutcomeJson,
  outcomeDigest,
  outcomeSafeInteger,
  outcomeSourceBounds,
  OutcomeSourceUnknownError,
} from './outcome-source-contract'

export const sqliteOutcomeSourceProtocolDigest = outcomeDigest(
  'M06_SQLITE_OUTCOME_SOURCE_V1:sole-prisma-reserved-local-discard:16c',
)
const initialHead = outcomeDigest('M06_SQLITE_CUSTODY_LEDGER_V1')
const settlementBytes = 8192
const settlementRecords = 9 // Flush plus separately reserved close/receipt windows, within existing total caps.
export type OutcomeObservationJournal = Readonly<{
  append(kind: string, data?: Readonly<Record<string, unknown>>): string
  assertHealthy(): void
  assertObservationAdmission?: () => void
}>
export type OutcomeSourceSqliteOptions = Readonly<{
  database: ProviderSourceDatabase
  sourceId: string
  sourceIncarnation: string
  identity: ProviderReconciliationIdentity
  protocolDigest: string
  qualificationDigest: string
}>
export type SourceLedgerRecord = Readonly<{
  sequence: number
  previousHead: string
  head: string
  kind: string
  dataJson: string
  byteCount: number
}>
/** Read bounded actual ledger content only after its count/UTF8 byte preflight in this tx. */
export async function readProviderSourceLedgerRecords(
  tx: ProviderSourceTransaction,
  sourceId: string,
): Promise<readonly SourceLedgerRecord[]> {
  const maximumRows = outcomeSourceBounds.journalRecords,
    maximumBytes = outcomeSourceBounds.journalBytes
  const preflight = await tx.$queryRawUnsafe<Array<{ recordCount: unknown; actualBytes: unknown }>>(
    `SELECT COUNT(*) AS recordCount,COALESCE(SUM(
      COALESCE(length(CAST(sequence AS BLOB)),0)+COALESCE(length(CAST(previousHead AS BLOB)),0)+COALESCE(length(CAST(head AS BLOB)),0)+
      COALESCE(length(CAST(kind AS BLOB)),0)+COALESCE(length(CAST(dataJson AS BLOB)),0)+COALESCE(length(CAST(byteCount AS BLOB)),0)),0) AS actualBytes
     FROM (SELECT sequence,previousHead,head,kind,dataJson,byteCount FROM "QualityJourneyProviderSourceLedgerRecord"
      WHERE sourceId=? ORDER BY sequence LIMIT ?)`,
    sourceId,
    maximumRows + 1,
  )
  if (preflight.length !== 1) unknown('source_ledger_preflight')
  const count = outcomeSafeInteger(preflight[0].recordCount, maximumRows)
  outcomeSafeInteger(preflight[0].actualBytes, maximumBytes)
  const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT sequence,previousHead,head,kind,dataJson,byteCount FROM "QualityJourneyProviderSourceLedgerRecord"
     WHERE sourceId=? ORDER BY sequence LIMIT ?`,
    sourceId,
    maximumRows + 1,
  )
  if (rows.length !== count) unknown('source_ledger_preflight_changed')
  return Object.freeze(
    rows.map(row => {
      const { previousHead, head, kind, dataJson } = row
      if ([previousHead, head, kind, dataJson].some(value => typeof value !== 'string')) unknown('source_ledger_scalar')
      return Object.freeze({
        sequence: outcomeSafeInteger(row.sequence, maximumRows),
        previousHead: previousHead as string,
        head: head as string,
        kind: kind as string,
        dataJson: dataJson as string,
        byteCount: outcomeSafeInteger(row.byteCount, maximumBytes),
      })
    }),
  )
}
export type SourceLedgerState = Readonly<{
  sourceId: string
  sourceIncarnation: string
  providerRunId: string
  intentId: string
  providerNamespace: string
  identityJson: string
  protocolDigest: string
  qualificationDigest: string
  epoch: number
  commitFenceVersion: number
  lifecycle: string
  sequence: number
  head: string
  byteCount: number
  sealedHead: string | null
  sealedEnvelopeDigest: string | null
  committedObservationId: string | null
  committedRequestHash: string | null
  pendingBatchId: string | null
  pendingBatchStartHead: string | null
  pendingBatchRecordAllowance: number | null
  pendingBatchByteAllowance: number | null
  pendingBatchRequestDigest: string | null
}>
declare const windowBrand: unique symbol
export type DiscardWindowTicket = Readonly<{ [windowBrand]: true }>
type PendingWindow = {
  ticket: DiscardWindowTicket
  batchId: string
  requestDigest: string
  startHead: string
  startSequence: number
  recordAllowance: number
  byteAllowance: number
  records: SourceLedgerRecord[]
  bytes: number
  entered: boolean
  closed: boolean
}

function unknown(reason: string): never {
  throw new OutcomeSourceUnknownError(reason)
}
function recordBytes(record: SourceLedgerRecord): string {
  return `${canonicalOutcomeJson({
    sequence: record.sequence,
    previous: record.previousHead,
    kind: record.kind,
    data: JSON.parse(record.dataJson),
    head: record.head,
  })}\n`
}
function makeRecord(sequence: number, previousHead: string, kind: string, data: Readonly<Record<string, unknown>>) {
  if (!/^[A-Z_]{1,64}$/.test(kind)) unknown('journal_kind')
  const dataJson = canonicalOutcomeJson(data)
  const body = { sequence, previous: previousHead, kind, data: JSON.parse(dataJson) }
  const record = {
    sequence,
    previousHead,
    head: outcomeDigest(canonicalOutcomeJson(body)),
    kind,
    dataJson,
    byteCount: 0,
  }
  record.byteCount = Buffer.byteLength(recordBytes(record))
  return Object.freeze(record)
}

/** Original bounded SQLite authority from creation; no reopen, import, fallback or retry API. */
export class OutcomeSourceSqliteJournal implements OutcomeObservationJournal {
  readonly database: ProviderSourceDatabase
  readonly binding: Readonly<{
    sourceId: string
    sourceIncarnation: string
    providerRunId: string
    intentId: string
    providerNamespace: string
    identityJson: string
    protocolDigest: string
    qualificationDigest: string
    epoch: number
  }>
  #records: SourceLedgerRecord[] = []
  #head = initialHead
  #bytes = 0
  #failed = false
  #disposed = false
  #disposeCalls = 0
  #sealed = false
  #sealedEnvelopeDigest?: string
  #pending?: PendingWindow
  #capturing = false

  constructor(options: OutcomeSourceSqliteOptions) {
    this.database = options.database
    this.binding = Object.freeze({
      sourceId: options.sourceId,
      sourceIncarnation: options.sourceIncarnation,
      providerRunId: options.identity.runId,
      intentId: options.identity.intentId,
      providerNamespace: options.identity.providerNamespace,
      identityJson: canonicalOutcomeJson(options.identity),
      protocolDigest: options.protocolDigest,
      qualificationDigest: options.qualificationDigest,
      epoch: 1,
    })
  }

  async initialize(hold: ProviderSourceDatabaseHold): Promise<void> {
    if (this.#records.length) unknown('source_already_initialized')
    const created = makeRecord(1, initialHead, 'CREATED', { ...this.binding })
    await this.#transaction(hold, 'INITIALIZE', async tx => {
      const b = this.binding
      await tx.$executeRawUnsafe(
        `INSERT INTO "QualityJourneyProviderSourceState"
        (sourceId,sourceIncarnation,providerRunId,intentId,providerNamespace,identityJson,protocolDigest,qualificationDigest,head)
        VALUES (?,?,?,?,?,?,?,?,?)`,
        b.sourceId,
        b.sourceIncarnation,
        b.providerRunId,
        b.intentId,
        b.providerNamespace,
        b.identityJson,
        b.protocolDigest,
        b.qualificationDigest,
        initialHead,
      )
      await this.#persistRecord(tx, created, 0, initialHead, 0)
    })
    this.#adopt([created])
  }
  async #transaction(
    hold: ProviderSourceDatabaseHold,
    phase: ProviderSourcePhase,
    action: (tx: ProviderSourceTransaction) => Promise<void>,
  ): Promise<void> {
    this.#assertLive()
    if (this.#capturing) unknown('sql_inside_capture')
    try {
      await providerSourceTransaction(this.database, hold, phase, action)
    } catch {
      this.#failed = true
      unknown('source_prisma_write_unknown')
    }
  }
  #assertLive(): void {
    if (this.#disposed || this.#failed) unknown('journal_unavailable')
  }
  #pendingFor(ticket: DiscardWindowTicket): PendingWindow {
    this.#assertLive()
    if (!this.#pending || this.#pending.ticket !== ticket) unknown('original_discard_window_required')
    return this.#pending
  }
  async #persistRecord(
    tx: ProviderSourceTransaction,
    record: SourceLedgerRecord,
    sequence: number,
    head: string,
    bytes: number,
  ): Promise<void> {
    await tx.$executeRawUnsafe(
      `INSERT INTO "QualityJourneyProviderSourceLedgerRecord"
      (sourceId,sequence,previousHead,head,kind,dataJson,byteCount) VALUES (?,?,?,?,?,?,?)`,
      this.binding.sourceId,
      record.sequence,
      record.previousHead,
      record.head,
      record.kind,
      record.dataJson,
      record.byteCount,
    )
    const changed = await tx.$executeRawUnsafe(
      `UPDATE "QualityJourneyProviderSourceState"
      SET sequence=?,head=?,byteCount=? WHERE sourceId=? AND sourceIncarnation=? AND epoch=1
      AND lifecycle='ACTIVE' AND sequence=? AND head=? AND byteCount=?`,
      record.sequence,
      record.head,
      bytes + record.byteCount,
      this.binding.sourceId,
      this.binding.sourceIncarnation,
      sequence,
      head,
      bytes,
    )
    if (changed !== 1) unknown('source_state_cas')
  }
  #adopt(records: readonly SourceLedgerRecord[]): void {
    for (const record of records) {
      this.#records.push(record)
      this.#head = record.head
      this.#bytes += record.byteCount
    }
  }
  #assertBounded(record: SourceLedgerRecord): void {
    const pending = this.#pending
    if (
      record.sequence > outcomeSourceBounds.journalRecords ||
      this.#bytes + (pending?.bytes ?? 0) + record.byteCount > outcomeSourceBounds.journalBytes
    ) {
      this.#failed = true
      unknown('journal_overflow')
    }
  }

  append(kind: string, data: Readonly<Record<string, unknown>> = {}): string {
    this.#assertLive()
    if (this.#sealed) unknown('source_sealed')
    if (!this.#pending || !this.#capturing) {
      this.#failed = true
      unknown('source_observation_admission_closed')
    }
    return this.#captureRecord(kind, data)
  }

  #captureRecord(kind: string, data: Readonly<Record<string, unknown>>): string {
    const pending = this.#pending!
    if (!this.#capturing || pending.closed) unknown('source_observation_admission_closed')
    const previous = pending.records.at(-1)
    const record = makeRecord(
      this.#records.length + pending.records.length + 1,
      previous?.head ?? this.#head,
      kind,
      data,
    )
    this.#assertBounded(record)
    if (pending.records.length >= pending.recordAllowance || pending.bytes + record.byteCount > pending.byteAllowance) {
      this.#failed = true
      unknown('discard_window_overflow')
    }
    pending.records.push(record)
    pending.bytes += record.byteCount
    return record.head
  }

  /** Durable UNKNOWN reservation precedes the canonical transaction; no permit is consumed here. */
  async reserveDiscardWindow(
    hold: ProviderSourceDatabaseHold,
    requestDigest: string,
    kind: 'SEND' | 'ENCODING_HOLE' | 'CLOSE' | 'RECEIPT' = 'SEND',
  ): Promise<DiscardWindowTicket> {
    this.assertHealthy()
    if (this.#sealed || this.#pending || !/^sha256:[a-f0-9]{64}$/.test(requestDigest)) unknown('discard_window_refused')
    const batchId = randomUUID()
    const recordAllowance = outcomeSourceBounds.journalRecords - this.#records.length - 1 - settlementRecords
    const byteAllowance = outcomeSourceBounds.journalBytes - this.#bytes - settlementBytes
    if (recordAllowance < 1 || byteAllowance < 1) unknown('discard_window_capacity')
    const reservation = makeRecord(this.#records.length + 1, this.#head, 'LOCAL_DISCARD_WINDOW_RESERVED', {
      batchId,
      requestDigest,
      operationKind: kind,
      recordAllowance,
      byteAllowance,
    })
    this.#assertBounded(reservation)
    await this.#transaction(hold, 'RESERVE', async tx => {
      await this.#assertActiveStoredState(tx)
      await this.#persistRecord(tx, reservation, this.#records.length, this.#head, this.#bytes)
      const changed = await tx.$executeRawUnsafe(
        `UPDATE "QualityJourneyProviderSourceState"
        SET pendingBatchId=?,pendingBatchStartHead=?,pendingBatchRecordAllowance=?,pendingBatchByteAllowance=?,pendingBatchRequestDigest=?
        WHERE sourceId=? AND sourceIncarnation=? AND lifecycle='ACTIVE' AND head=? AND pendingBatchId IS NULL`,
        batchId,
        reservation.head,
        recordAllowance,
        byteAllowance,
        requestDigest,
        this.binding.sourceId,
        this.binding.sourceIncarnation,
        reservation.head,
      )
      if (changed !== 1) unknown('discard_window_cas')
    })
    this.#adopt([reservation])
    const ticket = Object.freeze({}) as DiscardWindowTicket
    this.#pending = {
      ticket,
      batchId,
      requestDigest,
      startHead: reservation.head,
      startSequence: reservation.sequence,
      recordAllowance,
      byteAllowance,
      records: [],
      bytes: 0,
      entered: false,
      closed: false,
    }
    return ticket
  }

  /** Pure original synchronous data capture. Never awaits, executes deferred frames, or touches SQL. */
  runReservedSynchronousDiscard<T>(ticket: DiscardWindowTicket, send: () => T): T {
    const pending = this.#pendingFor(ticket)
    if (pending.entered || pending.closed || this.#capturing) unknown('discard_window_already_entered')
    pending.entered = true
    this.#capturing = true
    try {
      return send()
    } finally {
      this.#capturing = false
      pending.closed = true
    }
  }
  assertObservationAdmission(): void {
    this.#assertLive()
    if (this.#sealed || !this.#pending || !this.#capturing || this.#pending.closed)
      unknown('source_observation_admission_closed')
  }
  pendingReservation(ticket: DiscardWindowTicket) {
    const pending = this.#pendingFor(ticket)
    return Object.freeze({
      ...this.binding,
      pendingBatchId: pending.batchId,
      pendingBatchStartHead: pending.startHead,
      pendingBatchRecordAllowance: pending.recordAllowance,
      pendingBatchByteAllowance: pending.byteAllowance,
      pendingBatchRequestDigest: pending.requestDigest,
      sequence: pending.startSequence,
      head: pending.startHead,
      byteCount: this.#bytes,
    })
  }

  /** Only the owning service completion path may call this after its real outer send fulfilled. */
  async commitObservedDiscardWindow(hold: ProviderSourceDatabaseHold, ticket: DiscardWindowTicket): Promise<void> {
    const pending = this.#pendingFor(ticket)
    if (!pending.entered || !pending.closed || this.#capturing || pending.records.length === 0)
      unknown('discard_window_incomplete')
    const last = pending.records.at(-1)!
    const flushed = makeRecord(last.sequence + 1, last.head, 'LOCAL_DISCARD_WINDOW_FLUSHED', {
      batchId: pending.batchId,
      startHead: pending.startHead,
      observedRecords: pending.records.length,
      observedBytes: pending.bytes,
    })
    this.#assertBounded(flushed)
    await this.#transaction(hold, 'FLUSH', async tx => {
      await this.#assertActiveStoredState(tx)
      let sequence = this.#records.length,
        head = this.#head,
        bytes = this.#bytes
      for (const record of [...pending.records, flushed]) {
        await this.#persistRecord(tx, record, sequence, head, bytes)
        sequence = record.sequence
        head = record.head
        bytes += record.byteCount
      }
      const cleared = await tx.$executeRawUnsafe(
        `UPDATE "QualityJourneyProviderSourceState"
        SET pendingBatchId=NULL,pendingBatchStartHead=NULL,pendingBatchRecordAllowance=NULL,pendingBatchByteAllowance=NULL,pendingBatchRequestDigest=NULL
        WHERE sourceId=? AND sourceIncarnation=? AND lifecycle='ACTIVE' AND pendingBatchId=? AND head=?`,
        this.binding.sourceId,
        this.binding.sourceIncarnation,
        pending.batchId,
        flushed.head,
      )
      if (cleared !== 1) unknown('discard_window_clear_cas')
    })
    this.#adopt([...pending.records, flushed])
    this.#pending = undefined
  }

  #pendingColumns() {
    const pending = this.#pending
    if (!pending)
      return {
        pendingBatchId: null,
        pendingBatchStartHead: null,
        pendingBatchRecordAllowance: null,
        pendingBatchByteAllowance: null,
        pendingBatchRequestDigest: null,
      }
    return {
      pendingBatchId: pending.batchId,
      pendingBatchStartHead: pending.startHead,
      pendingBatchRecordAllowance: pending.recordAllowance,
      pendingBatchByteAllowance: pending.byteAllowance,
      pendingBatchRequestDigest: pending.requestDigest,
    }
  }
  /** Compare exact private state in SQL; no corrupt variable-size state is returned. */
  async #assertActiveStoredState(tx: ProviderSourceTransaction): Promise<void> {
    const expected = {
      ...this.binding,
      lifecycle: 'ACTIVE',
      sequence: this.#records.length,
      head: this.#head,
      byteCount: this.#bytes,
      commitFenceVersion: 0,
      sealedHead: null,
      sealedEnvelopeDigest: null,
      committedObservationId: null,
      committedRequestHash: null,
      ...this.#pendingColumns(),
    }
    const entries = Object.entries(expected)
    const rows = await tx.$queryRawUnsafe<Array<{ valid: unknown }>>(
      `SELECT 1 AS valid FROM "QualityJourneyProviderSourceState" WHERE ${entries.map(([key]) => `"${key}" IS ?`).join(' AND ')} LIMIT 2`,
      ...entries.map(([, value]) => value),
    )
    if (rows.length !== 1 || outcomeSafeInteger(rows[0].valid, 1) !== 1) unknown('source_state_binding')
    const records = await readProviderSourceLedgerRecords(tx, this.binding.sourceId)
    if (canonicalOutcomeJson(records) !== canonicalOutcomeJson(this.#records)) unknown('source_ledger_changed')
  }
  /** Exact immutable sealed metadata and complete rows read under the canonical write barrier. */
  verifyLocked(state: SourceLedgerState, records: readonly SourceLedgerRecord[]): void {
    const expected = { ...this.sealedState(), commitFenceVersion: 1 }
    if (Object.entries(expected).some(([key, value]) => state[key as keyof SourceLedgerState] !== value))
      unknown('source_state_binding')
    if (canonicalOutcomeJson(records) !== canonicalOutcomeJson(this.#records)) unknown('source_ledger_changed')
  }
  /** Local metadata only. Current database contents must be verified under the canonical barrier. */
  sealedState(): SourceLedgerState {
    this.assertHealthy()
    if (!this.#sealed || this.#pending) unknown('sealed_source_required')
    return Object.freeze({
      ...this.binding,
      lifecycle: 'SEALED',
      sequence: this.#records.length,
      head: this.#head,
      byteCount: this.#bytes,
      commitFenceVersion: 0,
      sealedHead: this.#head,
      sealedEnvelopeDigest: this.#sealedEnvelopeDigest!,
      committedObservationId: null,
      committedRequestHash: null,
      pendingBatchId: null,
      pendingBatchStartHead: null,
      pendingBatchRecordAllowance: null,
      pendingBatchByteAllowance: null,
      pendingBatchRequestDigest: null,
    })
  }
  /** Local original admission/poison check only; deliberately no database health claim. */
  assertHealthy(): void {
    this.#assertLive()
    if (this.#pending) unknown('discard_window_pending')
  }
  get head(): string {
    this.assertHealthy()
    return this.#head
  }
  get pending(): boolean {
    return this.#pending !== undefined
  }
  snapshot() {
    return Object.freeze({
      ...this.binding,
      sequence: this.#records.length,
      head: this.#head,
      byteCount: this.#bytes,
      pending: this.pending,
      capturedRecords: this.#pending?.records.length ?? 0,
      disposed: this.#disposed,
      disposeCalls: this.#disposeCalls,
    })
  }
  async seal(hold: ProviderSourceDatabaseHold, envelopeDigest: string): Promise<SourceLedgerState> {
    this.assertHealthy()
    if (this.#sealed || !/^sha256:[a-f0-9]{64}$/.test(envelopeDigest)) unknown('source_seal_refused')
    await this.#transaction(hold, 'SEAL', async tx => {
      await this.#assertActiveStoredState(tx)
      const changed = await tx.$executeRawUnsafe(
        `UPDATE "QualityJourneyProviderSourceState" SET lifecycle='SEALED',sealedHead=head,sealedEnvelopeDigest=?
        WHERE sourceId=? AND sourceIncarnation=? AND lifecycle='ACTIVE' AND sequence=? AND head=? AND byteCount=? AND pendingBatchId IS NULL`,
        envelopeDigest,
        this.binding.sourceId,
        this.binding.sourceIncarnation,
        this.#records.length,
        this.#head,
        this.#bytes,
      )
      if (changed !== 1) unknown('source_seal_cas')
    })
    this.#sealed = true
    this.#sealedEnvelopeDigest = envelopeDigest
    return this.sealedState()
  }
  /** Retention ownership must authorize this destructive call; a held owner never invokes it. */
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#disposeCalls++
    this.#failed = true
    this.#records = []
    this.#pending = undefined
  }
}
