import { createHmac, timingSafeEqual } from 'node:crypto'
import type { ProviderPhysicalOutcomeRecord } from '../provider-reconciliation-contract'
import type { RpcDeliveryWatermark } from './rpc-transport'
import {
  assertOutcomeIdentity,
  canonicalOutcomeJson,
  outcomeSourceBounds,
  outcomeSourceProtocolDigest,
  outcomeSourceQualificationDigest,
  OutcomeSourceUnknownError,
} from './outcome-source-contract'

type EnvelopeProtocol = Readonly<{ protocolDigest: string; qualificationDigest: string }>
const legacyEnvelopeProtocol: EnvelopeProtocol = Object.freeze({
  protocolDigest: outcomeSourceProtocolDigest,
  qualificationDigest: outcomeSourceQualificationDigest,
})

export type OutcomeEnvelopeBody = Readonly<{
  version: 'M06_OUTCOME_SOURCE_V1'
  sourceIncarnation: string
  senderEvidenceId: string
  finalWatermark: RpcDeliveryWatermark
  ledgerHead: string
  record: Omit<ProviderPhysicalOutcomeRecord, 'evidenceDigest'>
}>
const fail = (): never => {
  throw new OutcomeSourceUnknownError('envelope_invalid_or_key_loss')
}
function keys(value: unknown, expected: string[]): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== expected.sort().join(',')
  )
    fail()
}
function bounded(value: unknown, depth = 0): void {
  if (depth > outcomeSourceBounds.depth) fail()
  if (Array.isArray(value) && value.length > outcomeSourceBounds.frames) fail()
  if (value && typeof value === 'object') Object.values(value).forEach(child => bounded(child, depth + 1))
}
const identifier = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_.:/-]{1,200}$/.test(value)
const digest = (value: unknown) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value)
function watermark(value: unknown): asserts value is RpcDeliveryWatermark {
  keys(value, ['issuedRequests', 'writtenBytes'])
  if (
    ![value.issuedRequests, value.writtenBytes].every(n => Number.isSafeInteger(n) && (n as number) >= 0) ||
    (value.issuedRequests as number) > outcomeSourceBounds.allocations ||
    (value.writtenBytes as number) > 2 * 1024 * 1024
  )
    fail()
}
function validateBody(value: unknown, protocol: EnvelopeProtocol): asserts value is OutcomeEnvelopeBody {
  keys(value, ['version', 'sourceIncarnation', 'senderEvidenceId', 'finalWatermark', 'ledgerHead', 'record'])
  if (
    value.version !== 'M06_OUTCOME_SOURCE_V1' ||
    !identifier(value.sourceIncarnation) ||
    !identifier(value.senderEvidenceId) ||
    !digest(value.ledgerHead)
  )
    fail()
  watermark(value.finalWatermark)
  const record = value.record
  validatePhysicalRecord(record, protocol)
  if (canonicalOutcomeJson(value.finalWatermark) !== canonicalOutcomeJson(record.coveredThrough)) fail()
}
function validatePhysicalRecord(
  record: unknown,
  protocol: EnvelopeProtocol,
): asserts record is OutcomeEnvelopeBody['record'] {
  keys(record, [
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
    'sourceId',
    'provenance',
    'qualificationDigest',
    'protocolDigest',
    'evidenceId',
    'evidenceClass',
    'outcome',
    'conflictStatus',
    'coveredThrough',
  ])
  assertOutcomeIdentity(record as unknown as ProviderPhysicalOutcomeRecord)
  if (
    !identifier(record.sourceId) ||
    !identifier(record.evidenceId) ||
    !digest(record.qualificationDigest) ||
    !digest(record.protocolDigest)
  )
    fail()
  validateSourceCapability(record, protocol)
  watermark(record.coveredThrough)
}
function validateSourceCapability(record: Record<string, unknown>, protocol: EnvelopeProtocol): void {
  if (
    record.protocolDigest !== protocol.protocolDigest ||
    record.qualificationDigest !== protocol.qualificationDigest ||
    record.provenance !== 'SYNTHETIC_REPOSITORY' ||
    record.evidenceClass !== 'AUTHORITATIVE_OPERATION_RANGE' ||
    record.outcome !== 'NONSTART' ||
    record.conflictStatus !== 'CLEAR'
  )
    fail()
}
function mac(body: OutcomeEnvelopeBody, key: Uint8Array): string {
  if (!(key instanceof Uint8Array) || key.byteLength !== 32) fail()
  return createHmac('sha256', key).update('M06_OUTCOME_SOURCE_V1\0').update(canonicalOutcomeJson(body)).digest('hex')
}
/** Authentication is formatting integrity, not authority. Only the owning live source admits proofs. */
export function encodeOutcomeEnvelope(
  body: OutcomeEnvelopeBody,
  key: Uint8Array,
  protocol: EnvelopeProtocol = legacyEnvelopeProtocol,
): string {
  validateBody(body, protocol)
  const encoded = canonicalOutcomeJson({ body, mac: mac(body, key) })
  if (Buffer.byteLength(encoded) > outcomeSourceBounds.envelopeBytes) fail()
  return encoded
}
export function verifyOutcomeEnvelope(
  encoded: string,
  key: Uint8Array,
  protocol: EnvelopeProtocol = legacyEnvelopeProtocol,
): OutcomeEnvelopeBody {
  if (typeof encoded !== 'string' || Buffer.byteLength(encoded) > outcomeSourceBounds.envelopeBytes) fail()
  let parsed: unknown
  try {
    parsed = JSON.parse(encoded)
  } catch {
    return fail()
  }
  bounded(parsed)
  keys(parsed, ['body', 'mac'])
  // Canonical equality rejects duplicate fields, alternate encodings and ambiguous ordering.
  if (canonicalOutcomeJson(parsed) !== encoded) fail()
  validateBody(parsed.body, protocol)
  if (
    typeof parsed.mac !== 'string' ||
    !/^[a-f0-9]{64}$/.test(parsed.mac) ||
    !timingSafeEqual(Buffer.from(parsed.mac, 'hex'), Buffer.from(mac(parsed.body, key), 'hex'))
  )
    fail()
  return parsed.body
}
