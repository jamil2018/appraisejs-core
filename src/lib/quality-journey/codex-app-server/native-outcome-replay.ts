import { canonicalOutcomeJson, outcomeDigest, outcomeSourceBounds } from './outcome-source-contract'
import {
  assertStoredProviderReconciliationReceipt,
  assertProviderReceiptCanonicalIdentity,
  providerReconciliationRequestHash,
  type ProviderReconciliationReceipt,
} from '../provider-reconciliation-contract'
import {
  readProviderSourceCommittedSnapshot,
  type ProviderSourceDatabase,
  type ProviderSourceDatabaseHold,
} from '../provider-source-database'
import type { SourceCommittedReplay } from './outcome-source'
import { readProviderSourceLedgerRecords, type SourceLedgerRecord } from './outcome-source-sqlite-journal'
import { nativeOutcomeProtocolDigest } from './native-outcome-profile'
import type { Prisma, QualityJourneyProviderSourceState } from '@prisma/client'
export type NativeOutcomeReplay = SourceCommittedReplay

type ReplayRow = Readonly<Record<string, string | number | null>>
function exactFields(actual: Readonly<Record<string, unknown>>, expected: Readonly<Record<string, unknown>>) {
  if (Object.entries(expected).some(([key, value]) => actual[key] !== value))
    throw new Error('Native replay binding changed')
}
function committedReceipt(row: ReplayRow, expected: ProviderReconciliationReceipt, key: string, hash: string) {
  if (typeof row.reconciliationJson !== 'string' || row.reconciledAt === null)
    throw new Error('Native committed receipt required')
  exactFields(row, { requestHash: hash, observationKey: key, intentId: expected.identity.intentId })
  const receipt = JSON.parse(row.reconciliationJson) as ProviderReconciliationReceipt
  assertStoredProviderReconciliationReceipt(receipt)
  if (
    canonicalOutcomeJson(receipt) !== canonicalOutcomeJson(expected) ||
    providerReconciliationRequestHash(expected.identity.intentId, key, receipt) !== hash ||
    row.evidenceDigest !== outcomeDigest(canonicalOutcomeJson(receipt))
  )
    throw new Error('Native receipt mismatch')
  assertProviderReceiptCanonicalIdentity(receipt, {
    runId: String(row.providerRunId),
    intentId: String(row.intentId),
    sendBoundaryId: String(row.sendBoundaryId),
    claimEpoch: Number(row.claimEpoch),
    providerNamespace: String(row.providerNamespace),
    configurationDigest: String(row.configurationDigest),
    runThreadId: row.runThreadId as string | null,
    intentThreadId: row.intentThreadId as string | null,
    turnId: row.turnId as string | null,
  })
  return receipt
}
function assertNativeLedger(
  row: ReplayRow,
  records: readonly SourceLedgerRecord[],
  receipt: ProviderReconciliationReceipt,
) {
  if (records.length !== 2) throw new Error('Native two-row ledger required')
  const [created, bound] = records
  exactFields(row, {
    nativeLedgerCount: 2,
    nativeCreatedCount: 1,
    nativeBoundCount: 1,
    nativeCreatedSequence: 1,
    nativeBoundSequence: 2,
    nativeCreatedJson: created.dataJson,
    nativeCreatedHead: created.head,
    nativeCreatedPreviousHead: created.previousHead,
    nativeCreatedByteCount: created.byteCount,
    nativeBoundJson: bound.dataJson,
    nativeBoundHead: bound.head,
    nativeBoundPreviousHead: bound.previousHead,
    nativeBoundByteCount: bound.byteCount,
  })
  const binding = JSON.parse(bound.dataJson)
  if (Object.keys(binding).length !== 5) throw new Error('Exact native binding receipt required')
  exactFields(binding, {
    version: 'M13_NATIVE_IDENTITY_BOUND_V1',
    initialIdentityDigest: outcomeDigest(String(row.identityJson)),
    candidateDigest: receipt.physical.evidenceDigest,
    createdDigest: outcomeDigest(canonicalOutcomeJson(created)),
  })
  if (canonicalOutcomeJson(binding.finalIdentity) !== canonicalOutcomeJson(receipt.identity))
    throw new Error('Native final identity mismatch')
}
function assertNativeState(
  row: ReplayRow,
  records: readonly SourceLedgerRecord[],
  receipt: ProviderReconciliationReceipt,
  hash: string,
) {
  const created = JSON.parse(records[0].dataJson)
  if (Object.keys(created).length !== 9) throw new Error('Exact native CREATED binding required')
  exactFields(created, {
    sourceId: row.sourceId,
    sourceIncarnation: row.sourceIncarnation,
    providerRunId: row.sourceRunId,
    intentId: row.sourceIntentId,
    providerNamespace: row.sourceNamespace,
    identityJson: row.identityJson,
    protocolDigest: row.protocolDigest,
    qualificationDigest: row.qualificationDigest,
    epoch: 1,
  })
  exactFields(row, {
    sourceId: receipt.physical.sourceId,
    sourceIncarnation: created.sourceIncarnation,
    sourceRunId: receipt.identity.runId,
    sourceIntentId: receipt.identity.intentId,
    sourceNamespace: receipt.identity.providerNamespace,
    identityJson: canonicalOutcomeJson({
      ...receipt.identity,
      transportIncarnation: null,
      threadId: null,
      turnId: null,
    }),
    protocolDigest: receipt.physical.protocolDigest,
    qualificationDigest: receipt.physical.qualificationDigest,
    epoch: 1,
    commitFenceVersion: 1,
    lifecycle: 'COMMITTED',
    sequence: 2,
    head: records[1].head,
    byteCount: records[0].byteCount + records[1].byteCount,
    sealedHead: records[1].head,
    sealedEnvelopeDigest: receipt.physical.evidenceDigest,
    committedObservationId: row.observationId,
    committedRequestHash: hash,
    pendingBatchId: null,
    pendingBatchStartHead: null,
    pendingBatchRecordAllowance: null,
    pendingBatchByteAllowance: null,
    pendingBatchRequestDigest: null,
  })
  exactFields(row, {
    observationBoundary: receipt.identity.sendBoundaryId,
    observationNamespace: receipt.identity.providerNamespace,
    kind: 'TERMINAL',
    observationThread: receipt.identity.threadId,
    observationTurn: receipt.identity.turnId,
  })
}
/** Original clean reader only; negative or malformed lookup supplies no physical retry authority. */
export async function readNativeOutcomeCommittedReplay(
  database: ProviderSourceDatabase,
  expected: ProviderReconciliationReceipt,
  key: string,
  hash: string,
  expectedRecords: readonly SourceLedgerRecord[],
  hold?: ProviderSourceDatabaseHold,
): Promise<NativeOutcomeReplay | undefined> {
  const row = await readProviderSourceCommittedSnapshot(database, expected.identity.intentId, key, hold, hash)
  if (!row) return
  return nativeReplayResult(row, expected, key, hash, expectedRecords)
}

function nativeReceiptDialect(receipt: ProviderReconciliationReceipt): boolean {
  return (
    receipt?.physical?.provenance === 'NATIVE_QUALIFIED' &&
    receipt.physical.protocolDigest === nativeOutcomeProtocolDigest &&
    receipt.physical.sourceId.startsWith('native_outcome_') &&
    receipt.identity.threadId !== null &&
    receipt.identity.turnId !== null
  )
}
function nativeReplayResult(
  row: ReplayRow,
  expected: ProviderReconciliationReceipt,
  key: string,
  hash: string,
  expectedRecords: readonly SourceLedgerRecord[],
): NativeOutcomeReplay | undefined {
  try {
    if (!nativeReceiptDialect(expected)) return undefined
    assertNativeLedgerChain(expectedRecords)
    const receipt = committedReceipt(row, expected, key, hash)
    assertNativeLedger(row, expectedRecords, receipt)
    assertNativeState(row, expectedRecords, receipt, hash)
    const createdAt = new Date(row.observationCreatedAt as string | number)
    if (!Number.isFinite(createdAt.getTime())) return
    return Object.freeze({
      conflicted: false,
      replayed: true,
      quarantined: row.runStatus === 'CONFLICT',
      requestHash: hash,
      receipt,
      observation: Object.freeze({
        id: String(row.observationId),
        intentId: receipt.identity.intentId,
        observationKey: key,
        kind: 'TERMINAL',
        requestHash: hash,
        sendBoundaryId: receipt.identity.sendBoundaryId,
        providerNamespace: receipt.identity.providerNamespace,
        threadId: receipt.identity.threadId,
        turnId: receipt.identity.turnId,
        evidenceDigest: String(row.evidenceDigest),
        reconciliationJson: String(row.reconciliationJson),
        createdAt,
      }),
    })
  } catch {
    return undefined
  }
}
function assertNativeLedgerChain(records: readonly SourceLedgerRecord[]) {
  if (records.length !== 2) throw new Error('Native ledger must contain one creation and one binding')
  let previous = outcomeDigest('M13_NATIVE_OUTCOME_INITIAL_V1')
  records.forEach((entry, index) => {
    const body = {
      sequence: index + 1,
      previous,
      kind: index === 0 ? 'CREATED' : 'RECEIPT_RESERVED',
      data: JSON.parse(entry.dataJson),
    }
    const head = outcomeDigest(canonicalOutcomeJson(body))
    exactFields(entry, {
      sequence: index + 1,
      previousHead: previous,
      kind: body.kind,
      head,
      byteCount: Buffer.byteLength(`${canonicalOutcomeJson({ ...body, head })}\n`),
    })
    previous = head
  })
}
type StoredObservation = Prisma.QualityJourneyProviderObservationGetPayload<{
  include: { intent: { include: { run: true } } }
}>
function storedReplayRow(
  observation: StoredObservation,
  state: QualityJourneyProviderSourceState,
  records: readonly SourceLedgerRecord[],
): ReplayRow {
  if (records.length !== 2) throw new Error('Native ledger length')
  const { intent } = observation,
    { run } = intent,
    [created, bound] = records
  return {
    ...state,
    providerRunId: run.id,
    intentId: intent.id,
    providerNamespace: intent.providerNamespace,
    sourceRunId: state.providerRunId,
    sourceIntentId: state.intentId,
    sourceNamespace: state.providerNamespace,
    observationId: observation.id,
    observationKey: observation.observationKey,
    requestHash: observation.requestHash,
    kind: observation.kind,
    observationBoundary: observation.sendBoundaryId,
    observationNamespace: observation.providerNamespace,
    observationThread: observation.threadId,
    observationTurn: observation.turnId,
    evidenceDigest: observation.evidenceDigest,
    reconciliationJson: observation.reconciliationJson,
    observationCreatedAt: observation.createdAt.getTime(),
    reconciledAt: intent.reconciledAt?.getTime() ?? null,
    sendBoundaryId: intent.sendBoundaryId,
    claimEpoch: intent.claimEpoch,
    configurationDigest: run.configurationDigest,
    runThreadId: run.threadId,
    intentThreadId: intent.threadId,
    turnId: intent.turnId,
    runStatus: run.status,
    nativeLedgerCount: records.length,
    nativeCreatedCount: records.filter(entry => entry.kind === 'CREATED').length,
    nativeBoundCount: records.filter(entry => entry.kind === 'RECEIPT_RESERVED').length,
    nativeCreatedSequence: created.sequence,
    nativeCreatedJson: created.dataJson,
    nativeCreatedHead: created.head,
    nativeCreatedPreviousHead: created.previousHead,
    nativeCreatedByteCount: created.byteCount,
    nativeBoundSequence: bound.sequence,
    nativeBoundJson: bound.dataJson,
    nativeBoundHead: bound.head,
    nativeBoundPreviousHead: bound.previousHead,
    nativeBoundByteCount: bound.byteCount,
    createdAt: state.createdAt.getTime(),
  }
}
/** Read-only restart replay. Durable receipts never recreate a sender, source, proof or release capability. */
export async function readStoredNativeOutcomeCommittedReplay(
  client: import('@prisma/client').PrismaClient,
  input: Readonly<{ intentId: string; observationKey: string; replayRequestHash: string }>,
): Promise<NativeOutcomeReplay | undefined> {
  return client.$transaction(async tx => {
    const preflight = await tx.$queryRawUnsafe<
      Array<{ receiptBytes: bigint | number; identityBytes: bigint | number | null }>
    >(
      `SELECT length(CAST(o.reconciliationJson AS BLOB)) AS receiptBytes,length(CAST(s.identityJson AS BLOB)) AS identityBytes
       FROM QualityJourneyProviderObservation o LEFT JOIN QualityJourneyProviderSourceState s ON s.intentId=o.intentId
       WHERE o.intentId=? AND o.observationKey=?`,
      input.intentId,
      input.observationKey,
    )
    if (preflight.length !== 1) return undefined
    if (
      ![preflight[0].receiptBytes, preflight[0].identityBytes].every(
        value => value !== null && Number(value) > 0 && Number(value) <= outcomeSourceBounds.envelopeBytes,
      )
    )
      return undefined
    const observation = await tx.qualityJourneyProviderObservation.findUnique({
      where: { intentId_observationKey: { intentId: input.intentId, observationKey: input.observationKey } },
      include: { intent: { include: { run: true } } },
    })
    if (!observation?.reconciliationJson) return undefined
    const expected = JSON.parse(observation.reconciliationJson) as ProviderReconciliationReceipt
    if (!nativeReceiptDialect(expected)) return undefined
    const state = await tx.qualityJourneyProviderSourceState.findUnique({
      where: { sourceId: expected.physical.sourceId },
    })
    if (!state) return undefined
    const records = await readProviderSourceLedgerRecords(tx, state.sourceId)
    const row = storedReplayRow(observation, state, records)
    return nativeReplayResult(row, expected, input.observationKey, input.replayRequestHash, records)
  })
}
