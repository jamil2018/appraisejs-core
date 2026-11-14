import { canonicalOutcomeJson, outcomeDigest } from './outcome-source-contract'
import {
  readProviderSourceLedgerRecords,
  type SourceLedgerState,
  type SourceLedgerRecord,
} from './outcome-source-sqlite-journal'
import {
  acquireProviderSourceDatabaseHold,
  providerSourceTransaction,
  type ProviderSourceDatabase,
} from '../provider-source-database'
import type { ProviderReconciliationIdentity } from '../provider-intent-contract'

/** Native-only final-ID binding. The synthetic NONSTART journal and factory are unchanged. */
export type NativeOutcomeAdmissionIdentity = Omit<
  ProviderReconciliationIdentity,
  'transportIncarnation' | 'threadId' | 'turnId'
> & { transportIncarnation: null; threadId: null; turnId: null }
export class NativeOutcomeJournal {
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
  #created?: SourceLedgerRecord
  readonly database: ProviderSourceDatabase
  #state?: SourceLedgerState
  #records?: readonly SourceLedgerRecord[]
  #bound = false
  constructor(options: {
    database: ProviderSourceDatabase
    sourceId: string
    sourceIncarnation: string
    identity: NativeOutcomeAdmissionIdentity
    protocolDigest: string
    qualificationDigest: string
  }) {
    const { database, identity, ...source } = options
    this.database = database
    this.binding = Object.freeze({
      ...source,
      providerRunId: identity.runId,
      intentId: identity.intentId,
      providerNamespace: identity.providerNamespace,
      identityJson: canonicalOutcomeJson(identity),
      epoch: 1,
    })
  }
  async initialize() {
    const hold = acquireProviderSourceDatabaseHold(this.database, 'INITIALIZE')
    const previousHead = outcomeDigest('M13_NATIVE_OUTCOME_INITIAL_V1')
    const data = { ...this.binding }
    const body = { sequence: 1, previous: previousHead, kind: 'CREATED', data }
    const head = outcomeDigest(canonicalOutcomeJson(body))
    const created = Object.freeze({
      sequence: 1,
      previousHead,
      head,
      kind: 'CREATED',
      dataJson: canonicalOutcomeJson(data),
      byteCount: Buffer.byteLength(`${canonicalOutcomeJson({ ...body, head })}\n`),
    })
    const operation = providerSourceTransaction(this.database, hold, 'INITIALIZE', async tx => {
      const b = this.binding
      await tx.qualityJourneyProviderSourceState.create({ data: { ...b, head: previousHead } })
      await tx.qualityJourneyProviderSourceLedgerRecord.create({ data: { sourceId: b.sourceId, ...created } })
      const changed = await tx.$executeRawUnsafe(
        `UPDATE "QualityJourneyProviderSourceState" SET sequence=1,head=?,byteCount=?
        WHERE sourceId=? AND sourceIncarnation=? AND sequence=0 AND head=? AND byteCount=0 AND lifecycle='ACTIVE'`,
        head,
        created.byteCount,
        b.sourceId,
        b.sourceIncarnation,
        previousHead,
      )
      if (changed !== 1) throw new Error('Native CREATED CAS refused')
    })
    try {
      await operation
      this.#created = created
      hold.complete(() => {})
    } catch (error) {
      hold.retire(operation)
      throw error
    }
  }
  async bindAndSeal(identity: ProviderReconciliationIdentity, evidenceDigest: string) {
    if (this.#bound) throw new Error('Native identity is already bound')
    this.#bound = true
    const initial = this.binding
    const expectedInitial = { ...identity, transportIncarnation: null, threadId: null, turnId: null }
    if (initial.identityJson !== canonicalOutcomeJson(expectedInitial) || !identity.threadId || !identity.turnId)
      throw new Error('Original native identity binding refused')
    const snapshot = this.#created
    if (!snapshot) throw new Error('Original native CREATED required')
    const data = {
      version: 'M13_NATIVE_IDENTITY_BOUND_V1',
      createdDigest: outcomeDigest(canonicalOutcomeJson(snapshot)),
      initialIdentityDigest: outcomeDigest(initial.identityJson),
      finalIdentity: identity,
      candidateDigest: evidenceDigest,
    }
    const body = { sequence: 2, previous: snapshot.head, kind: 'RECEIPT_RESERVED', data }
    const head = outcomeDigest(canonicalOutcomeJson(body))
    const record: SourceLedgerRecord = Object.freeze({
      sequence: 2,
      previousHead: snapshot.head,
      head,
      kind: 'RECEIPT_RESERVED',
      dataJson: canonicalOutcomeJson(data),
      byteCount: Buffer.byteLength(`${canonicalOutcomeJson({ ...body, head })}\n`),
    })
    const hold = acquireProviderSourceDatabaseHold(this.database, 'RECEIPT')
    let operation: Promise<unknown> | undefined
    try {
      operation = providerSourceTransaction(this.database, hold, 'RESERVE', async () => {})
      await operation
      operation = providerSourceTransaction(this.database, hold, 'FLUSH', async tx => {
        const rows = await readProviderSourceLedgerRecords(tx, initial.sourceId)
        if (
          rows.length !== 1 ||
          canonicalOutcomeJson({
            sequence: rows[0].sequence,
            previousHead: rows[0].previousHead,
            head: rows[0].head,
            kind: rows[0].kind,
            dataJson: rows[0].dataJson,
            byteCount: rows[0].byteCount,
          }) !== canonicalOutcomeJson(snapshot)
        )
          throw new Error('Native CREATED ledger changed')
        await tx.$executeRawUnsafe(
          `INSERT INTO "QualityJourneyProviderSourceLedgerRecord"
          (sourceId,sequence,previousHead,head,kind,dataJson,byteCount) VALUES (?,?,?,?,?,?,?)`,
          initial.sourceId,
          record.sequence,
          record.previousHead,
          record.head,
          record.kind,
          record.dataJson,
          record.byteCount,
        )
        const changed = await tx.$executeRawUnsafe(
          `UPDATE "QualityJourneyProviderSourceState"
          SET sequence=2,head=?,byteCount=byteCount+? WHERE sourceId=? AND sourceIncarnation=?
          AND identityJson=? AND lifecycle='ACTIVE' AND sequence=1 AND head=? AND byteCount=? AND epoch=1 AND commitFenceVersion=0
          AND pendingBatchId IS NULL AND sealedHead IS NULL AND sealedEnvelopeDigest IS NULL AND committedObservationId IS NULL AND committedRequestHash IS NULL`,
          head,
          record.byteCount,
          initial.sourceId,
          initial.sourceIncarnation,
          initial.identityJson,
          snapshot.head,
          snapshot.byteCount,
        )
        if (changed !== 1) throw new Error('Native original identity CAS refused')
        this.#records = Object.freeze([
          Object.freeze({
            sequence: rows[0].sequence,
            previousHead: rows[0].previousHead,
            head: rows[0].head,
            kind: rows[0].kind,
            dataJson: rows[0].dataJson,
            byteCount: rows[0].byteCount,
          }),
          record,
        ])
      })
      await operation
      operation = providerSourceTransaction(this.database, hold, 'SEAL', async tx => {
        const changed = await tx.$executeRawUnsafe(
          `UPDATE "QualityJourneyProviderSourceState"
          SET lifecycle='SEALED',sealedHead=head,sealedEnvelopeDigest=? WHERE sourceId=? AND sourceIncarnation=?
          AND identityJson=? AND lifecycle='ACTIVE' AND sequence=2 AND head=? AND byteCount=? AND commitFenceVersion=0`,
          evidenceDigest,
          initial.sourceId,
          initial.sourceIncarnation,
          initial.identityJson,
          head,
          snapshot.byteCount + record.byteCount,
        )
        if (changed !== 1) throw new Error('Native source seal refused')
      })
      await operation
      this.#state = Object.freeze({
        ...initial,
        lifecycle: 'SEALED',
        sequence: 2,
        head,
        byteCount: snapshot.byteCount + record.byteCount,
        commitFenceVersion: 0,
        sealedHead: head,
        sealedEnvelopeDigest: evidenceDigest,
        committedObservationId: null,
        committedRequestHash: null,
        pendingBatchId: null,
        pendingBatchStartHead: null,
        pendingBatchRecordAllowance: null,
        pendingBatchByteAllowance: null,
        pendingBatchRequestDigest: null,
      })
      hold.complete(() => {})
    } catch (error) {
      hold.retire(operation)
      throw error
    }
    return this.state()
  }
  state(): SourceLedgerState {
    if (!this.#state) throw new Error('Original native sealed state required')
    return this.#state
  }
  records(): readonly SourceLedgerRecord[] {
    if (!this.#records) throw new Error('Original native bound ledger required')
    return this.#records
  }
  verifyLocked(state: SourceLedgerState, records: readonly SourceLedgerRecord[]) {
    if (
      canonicalOutcomeJson(state) !== canonicalOutcomeJson({ ...this.state(), commitFenceVersion: 1 }) ||
      canonicalOutcomeJson(records) !== canonicalOutcomeJson(this.#records)
    )
      throw new Error('Native source ledger changed')
  }
}
