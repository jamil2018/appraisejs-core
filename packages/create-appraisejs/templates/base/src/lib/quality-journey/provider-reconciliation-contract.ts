import { createHash } from 'node:crypto'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { ServiceError } from '@/services/shared/errors'
import {
  inspectProviderSenderExcluded,
  type ProviderReconciliationIdentity,
  type ProviderSenderExcluded,
  type ProviderSenderExclusionRecord,
} from './provider-intent-contract'
import type { RpcDeliveryWatermark } from './codex-app-server/rpc-transport'
import {
  sqliteOutcomeSourceProtocolDigest,
  type SourceLedgerState,
} from './codex-app-server/outcome-source-sqlite-journal'

type PhysicalEvidenceProvenance = 'NATIVE_QUALIFIED' | 'SYNTHETIC_REPOSITORY'
export type ProviderPhysicalOutcomeRecord = ProviderReconciliationIdentity &
  Readonly<{
    sourceId: string
    provenance: PhysicalEvidenceProvenance
    qualificationDigest: string
    protocolDigest: string
    evidenceId: string
    evidenceDigest: string
    evidenceClass: 'AUTHORITATIVE_OPERATION_RANGE'
    outcome: 'NONSTART' | 'TERMINAL'
    conflictStatus: 'CLEAR' | 'CONFLICT'
    coveredThrough: RpcDeliveryWatermark
  }>
/** A live original source resource pin; serialized records cannot recreate it. */
type ProviderPhysicalOutcomeCustody = Readonly<{
  record: ProviderPhysicalOutcomeRecord
  inspect: () => ProviderPhysicalOutcomeRecord
  release: () => void
}>
/** Trusted source code validates its opaque evidence and authoritative operation-range coverage. */
export type ProviderPhysicalOutcomeSource = Readonly<{
  sourceId: string
  provenance: PhysicalEvidenceProvenance
  qualificationDigest: string
  protocolDigest: string
  providerNamespace: string
  configurationDigest: string
  inspect: (proof: unknown) => ProviderPhysicalOutcomeRecord
  acquire?: (proof: unknown) => ProviderPhysicalOutcomeCustody
}>
export type ProviderReconciliationContext = Readonly<{
  selection: 'NATIVE' | 'SYNTHETIC_REPOSITORY'
  source?: ProviderPhysicalOutcomeSource
}>
/** No native issuer exists. There is deliberately no environment-variable or fixture fallback. */
export const unavailableNativeProviderReconciliation: ProviderReconciliationContext = Object.freeze({
  selection: 'NATIVE',
})

export type ProviderReconciliationReceipt = Readonly<{
  version: 'PROVIDER_RECONCILIATION_V1'
  identity: ProviderReconciliationIdentity
  senderEvidenceId: string
  finalWatermark: RpcDeliveryWatermark
  physical: ProviderPhysicalOutcomeRecord
}>
/** Only emitted after provenance, identity and complete operation-range coverage validate. */
export class ProviderReconciliationConflictError extends ServiceError {
  constructor(readonly receipt: ProviderReconciliationReceipt) {
    super('Provider reconciliation requires exact qualified two-part evidence; source reports conflict.', 'CONFLICT')
  }
}
const fail = (): never => {
  throw new ServiceError('Provider reconciliation requires exact qualified two-part evidence.', 'CONFLICT')
}
const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const validDigest = (value: unknown) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value)
const identifier = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_.:/-]{1,200}$/.test(value)
const identityKeys = [
  'runId',
  'intentId',
  'sendBoundaryId',
  'claimEpoch',
  'providerNamespace',
  'configurationDigest',
  'transportId',
  'transportIncarnation',
  'threadId',
  'turnId',
] as const
const watermark = (value: RpcDeliveryWatermark) =>
  value &&
  Number.isSafeInteger(value.issuedRequests) &&
  value.issuedRequests >= 0 &&
  Number.isSafeInteger(value.writtenBytes) &&
  value.writtenBytes >= 0

function selectedPhysicalSource(context: ProviderReconciliationContext) {
  const source = context.source ?? fail()
  if (
    !['NATIVE', 'SYNTHETIC_REPOSITORY'].includes(context.selection) ||
    source.provenance !== (context.selection === 'NATIVE' ? 'NATIVE_QUALIFIED' : 'SYNTHETIC_REPOSITORY')
  )
    fail()
  return source
}

/** Project only bounded contract fields; source extras never enter durable storage. */
function readPhysicalOutcome(raw: ProviderPhysicalOutcomeRecord): ProviderPhysicalOutcomeRecord {
  if (!raw) fail()
  return {
    runId: raw.runId,
    intentId: raw.intentId,
    sendBoundaryId: raw.sendBoundaryId,
    claimEpoch: raw.claimEpoch,
    providerNamespace: raw.providerNamespace,
    configurationDigest: raw.configurationDigest,
    transportId: raw.transportId,
    transportIncarnation: raw.transportIncarnation,
    threadId: raw.threadId,
    turnId: raw.turnId,
    sourceId: raw.sourceId,
    provenance: raw.provenance,
    qualificationDigest: raw.qualificationDigest,
    protocolDigest: raw.protocolDigest,
    evidenceId: raw.evidenceId,
    evidenceDigest: raw.evidenceDigest,
    evidenceClass: raw.evidenceClass,
    outcome: raw.outcome,
    conflictStatus: raw.conflictStatus,
    coveredThrough: {
      issuedRequests: raw.coveredThrough?.issuedRequests,
      writtenBytes: raw.coveredThrough?.writtenBytes,
    },
  }
}

function assertPhysicalIdentityBounds(physical: ProviderPhysicalOutcomeRecord) {
  const identifierKeys = [
    'runId',
    'intentId',
    'sendBoundaryId',
    'providerNamespace',
    'transportId',
    'transportIncarnation',
  ] as const
  if (
    !identifierKeys.every(key => identifier(physical[key])) ||
    !Number.isSafeInteger(physical.claimEpoch) ||
    physical.claimEpoch < 1 ||
    !validDigest(physical.configurationDigest)
  )
    fail()
  if ([physical.threadId, physical.turnId].some(handle => handle !== null && !identifier(handle))) fail()
}

function assertPhysicalIdentityBinding(physical: ProviderPhysicalOutcomeRecord, sender: ProviderSenderExclusionRecord) {
  if (identityKeys.some(key => physical[key] !== sender[key]) || !identifier(sender.senderEvidenceId)) fail()
  assertPhysicalIdentityBounds(physical)
}

function assertPhysicalSourceBinding(
  source: ProviderPhysicalOutcomeSource,
  physical: ProviderPhysicalOutcomeRecord,
  sender: ProviderSenderExclusionRecord,
) {
  const provenanceKeys = ['sourceId', 'provenance', 'qualificationDigest', 'protocolDigest'] as const
  if (
    provenanceKeys.some(key => source[key] !== physical[key]) ||
    source.providerNamespace !== sender.providerNamespace ||
    source.configurationDigest !== sender.configurationDigest
  )
    fail()
  if (!identifier(source.sourceId) || !validDigest(source.qualificationDigest) || !validDigest(source.protocolDigest))
    fail()
}

function assertPhysicalOutcomeClass(physical: ProviderPhysicalOutcomeRecord) {
  if (
    !identifier(physical.evidenceId) ||
    !validDigest(physical.evidenceDigest) ||
    physical.evidenceClass !== 'AUTHORITATIVE_OPERATION_RANGE' ||
    !['NONSTART', 'TERMINAL'].includes(physical.outcome) ||
    !['CLEAR', 'CONFLICT'].includes(physical.conflictStatus)
  )
    fail()
}

function assertCompleteOperationRange(physical: ProviderPhysicalOutcomeRecord, sender: ProviderSenderExclusionRecord) {
  if (
    !watermark(physical.coveredThrough) ||
    !watermark(sender.finalWatermark) ||
    physical.coveredThrough.issuedRequests < sender.finalWatermark.issuedRequests ||
    physical.coveredThrough.writtenBytes < sender.finalWatermark.writtenBytes
  )
    fail()
}

/** This is the only consumed-sender validator, shared by injected repository and future qualified sources. */
export function validateProviderReconciliationEvidence(
  senderExcluded: ProviderSenderExcluded,
  physicalEvidence: unknown,
  context: ProviderReconciliationContext,
): ProviderReconciliationReceipt {
  const source = selectedPhysicalSource(context)
  return validateProviderReconciliationRecord(senderExcluded, source, source.inspect(physicalEvidence))
}

export function validateProviderReconciliationRecord(
  senderExcluded: ProviderSenderExcluded,
  source: ProviderPhysicalOutcomeSource,
  raw: ProviderPhysicalOutcomeRecord,
): ProviderReconciliationReceipt {
  const sender = inspectProviderSenderExcluded(senderExcluded)
  const physical = readPhysicalOutcome(raw)
  assertPhysicalIdentityBinding(physical, sender)
  assertPhysicalSourceBinding(source, physical, sender)
  assertPhysicalOutcomeClass(physical)
  assertCompleteOperationRange(physical, sender)
  const identity = Object.fromEntries(identityKeys.map(key => [key, sender[key]])) as ProviderReconciliationIdentity
  const receipt: ProviderReconciliationReceipt = Object.freeze({
    version: 'PROVIDER_RECONCILIATION_V1',
    identity: Object.freeze(identity),
    senderEvidenceId: sender.senderEvidenceId,
    finalWatermark: sender.finalWatermark,
    physical: Object.freeze({ ...physical, coveredThrough: Object.freeze(physical.coveredThrough) }),
  })
  if (physical.conflictStatus === 'CONFLICT') throw new ProviderReconciliationConflictError(receipt)
  return receipt
}
/** Shape/range validation for an already committed receipt; this grants no live source authority. */
export function assertStoredProviderReconciliationReceipt(receipt: ProviderReconciliationReceipt): void {
  if (!receipt || receipt.version !== 'PROVIDER_RECONCILIATION_V1' || !receipt.identity) fail()
  const physical = readPhysicalOutcome(receipt.physical)
  const sender = {
    ...receipt.identity,
    senderEvidenceId: receipt.senderEvidenceId,
    finalWatermark: receipt.finalWatermark,
  }
  assertPhysicalIdentityBinding(physical, sender)
  assertPhysicalOutcomeClass(physical)
  assertCompleteOperationRange(physical, sender)
  if (
    !['SYNTHETIC_REPOSITORY', 'NATIVE_QUALIFIED'].includes(physical.provenance) ||
    !identifier(physical.sourceId) ||
    !validDigest(physical.protocolDigest) ||
    !validDigest(physical.qualificationDigest)
  )
    fail()
}

export function providerReconciliationRequestHash(
  intentId: string,
  observationKey: string,
  receipt: ProviderReconciliationReceipt,
) {
  return digest({ intentId, observationKey, receipt })
}

/** Capture the selected original source and capabilities before provisional validation can yield. */
export function captureProviderReconciliationContext(
  context: ProviderReconciliationContext,
): ProviderReconciliationContext {
  const source = context.source
  if (!source) return Object.freeze({ selection: context.selection })
  // Preserve the ORIGINAL frozen source identity for the private commit-domain registry.
  // Capturing formatting fields or binding public methods cannot mint a source capability.
  return Object.freeze({ selection: context.selection, source })
}

type ProviderReceiptBoundaryIdentity = Readonly<{
  runId: string
  intentId: string
  sendBoundaryId: string | null
  claimEpoch: number
  providerNamespace: string
  configurationDigest: string
}>

/** Immutable original send binding; this alone never authorizes release or replay. */
export function assertProviderReceiptBoundaryIdentity(
  receipt: ProviderReconciliationReceipt,
  expected: ProviderReceiptBoundaryIdentity,
): void {
  const exact = {
    runId: expected.runId,
    intentId: expected.intentId,
    sendBoundaryId: expected.sendBoundaryId,
    claimEpoch: expected.claimEpoch,
    providerNamespace: expected.providerNamespace,
    configurationDigest: expected.configurationDigest,
  }
  if (Object.entries(exact).some(([key, value]) => receipt.identity[key as keyof typeof exact] !== value)) fail()
}

export function assertProviderReceiptCanonicalIdentity(
  receipt: ProviderReconciliationReceipt,
  expected: ProviderReceiptBoundaryIdentity &
    Readonly<{
      runThreadId: string | null
      intentThreadId: string | null
      turnId: string | null
    }>,
): void {
  assertProviderReceiptBoundaryIdentity(receipt, expected)
  const handles = [
    [expected.runThreadId, receipt.identity.threadId],
    [expected.intentThreadId, receipt.identity.threadId],
    [expected.turnId, receipt.identity.turnId],
  ]
  if (handles.some(([known, observed]) => known !== null && known !== observed)) fail()
}

/** Binding check only: an existing full receipt/hash/canonical replay is independently required. */
export function assertCommittedProviderSourceReplay(
  state: SourceLedgerState | null,
  observation: Readonly<{ id: string; requestHash: string }>,
  receipt: ProviderReconciliationReceipt,
): void {
  if (!state) {
    if (receipt.physical.protocolDigest === sqliteOutcomeSourceProtocolDigest) fail()
    return // Existing exact legacy committed receipt, without a new source row.
  }
  const physical = receipt.physical
  const exact = {
    sourceId: physical.sourceId,
    providerRunId: receipt.identity.runId,
    intentId: receipt.identity.intentId,
    providerNamespace: receipt.identity.providerNamespace,
    identityJson: canonicalContractJson(receipt.identity),
    protocolDigest: physical.protocolDigest,
    qualificationDigest: physical.qualificationDigest,
    lifecycle: 'COMMITTED',
    committedObservationId: observation.id,
    committedRequestHash: observation.requestHash,
    sealedEnvelopeDigest: physical.evidenceDigest,
    pendingBatchId: null,
    pendingBatchStartHead: null,
    pendingBatchRecordAllowance: null,
    pendingBatchByteAllowance: null,
    pendingBatchRequestDigest: null,
  }
  if (
    Object.entries(exact).some(([key, value]) => state[key as keyof SourceLedgerState] !== value) ||
    state.sealedHead !== state.head
  )
    fail()
}
