import { createHash } from 'node:crypto'

export const E2_ENVELOPE_VERSION = 'M06_E2_FINITE_V1' as const
export const E2_ENVELOPE_DIGEST_DOMAIN = 'M06_E2_ENVELOPE_V1' as const
const E2_PAYLOAD_RECEIVE_TIMEOUT_MS = 5000 as const
export const e2Limits = Object.freeze({
  operations: 32,
  outboundBytes: 8_388_608,
  outboundFrames: 512,
  nativeStarts: 1,
  setupAttempts: 4,
  providerRequests: 5,
  mcpCalls: 16,
  recoveryControls: 0,
  privateDataBytes: 16_384,
  providerDataChunks: 16,
  mcpDataChunks: 4,
  providerControlBytes: 16_384,
})

export type E2GrantKind = 'NATIVE_START' | 'SETUP' | 'PROVIDER_REQUEST' | 'MCP_CALL'
export type E2SetupStage = 'DNS' | 'TCP' | 'TLS' | 'UPGRADE'

export type E2FiniteEnvelope = Readonly<{
  version: typeof E2_ENVELOPE_VERSION
  runId: string
  intentId: string
  operationId: string
  rangeId: string
  parentOperationId: string | null
  sourceTupleDigest: string
  sequence: number
  kind: E2GrantKind
  setupStage: E2SetupStage | null
  payloadDigest: string | null
  payloadByteLength: number | null
  payloadReceiveTimeoutMs: number | null
  maxBytes: number
  maxFrames: number
  maxControlFrames: number
  maxDescendants: number
}>

export type E2ActorTotals = Readonly<{
  operationsReserved: number
  bytesReserved: number
  framesReserved: number
  nativeStartsReserved: number
  setupReserved: number
  providerRequestsReserved: number
  mcpCallsReserved: number
  recoveryControlsReserved: number
}>

class E2ContractError extends Error {
  constructor(readonly reason: string) {
    super(`E2 finite contract refused: ${reason}`)
    this.name = 'E2ContractError'
  }
}
const fail = (reason: string): never => {
  throw new E2ContractError(reason)
}

const idPattern = /^[A-Za-z0-9_.:/-]{1,128}$/
const digestPattern = /^[a-f0-9]{64}$/
export const isE2Id = (value: unknown): value is string => typeof value === 'string' && idPattern.test(value)
export const isE2Digest = (value: unknown): value is string => typeof value === 'string' && digestPattern.test(value)
export const isE2Uint = (value: unknown, max = 2_147_483_647): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0 && value <= max

/** Sorted ASCII-key JSON; rejecting unsupported values also makes raw duplicate keys noncanonical on decode. */
export function canonicalE2Json(value: unknown, depth = 0): string {
  if (depth > 16) return fail('json_depth')
  if (value === null || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!isE2Uint(value, Number.MAX_SAFE_INTEGER)) return fail('json_integer')
    return String(value)
  }
  if (typeof value === 'string') {
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))
      return fail('json_surrogate')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(item => canonicalE2Json(item, depth + 1)).join(',')}]`
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    return fail('json_value')
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map(key => {
      if (!/^[\x20-\x7e]+$/.test(key)) return fail('json_key')
      return `${JSON.stringify(key)}:${canonicalE2Json(record[key], depth + 1)}`
    })
    .join(',')}}`
}

export function e2Sha256(value: string | Uint8Array, domain = ''): string {
  return createHash('sha256').update(domain).update(value).digest('hex')
}
export const e2PayloadDigest = (value: Uint8Array): string => e2Sha256(value)

const envelopeFields = [
  'version', 'runId', 'intentId', 'operationId', 'rangeId', 'parentOperationId',
  'sourceTupleDigest', 'sequence', 'kind', 'setupStage', 'payloadDigest',
  'payloadByteLength', 'payloadReceiveTimeoutMs', 'maxBytes', 'maxFrames',
  'maxControlFrames', 'maxDescendants',
] as const
const exactFields = (value: unknown, fields: readonly string[]): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
    return false
  const keys = Object.keys(value)
  return keys.length === fields.length && keys.every(key => fields.includes(key))
}
const setupStages: readonly E2SetupStage[] = ['DNS', 'TCP', 'TLS', 'UPGRADE']

export function parseE2FiniteEnvelope(input: unknown): E2FiniteEnvelope {
  if (!exactFields(input, envelopeFields)) return fail('envelope_fields')
  const value = input as Record<(typeof envelopeFields)[number], unknown>
  if (value.version !== E2_ENVELOPE_VERSION) return fail('envelope_version')
  for (const field of ['runId', 'intentId', 'operationId', 'rangeId'] as const)
    if (!isE2Id(value[field])) return fail(`envelope_${field}`)
  if (value.rangeId !== value.operationId) return fail('range_identity')
  if (!isE2Digest(value.sourceTupleDigest)) return fail('source_tuple_digest')
  if (!isE2Uint(value.sequence, 31)) return fail('grant_sequence')
  if (!['NATIVE_START', 'SETUP', 'PROVIDER_REQUEST', 'MCP_CALL'].includes(String(value.kind)))
    return fail('grant_kind')
  if (value.parentOperationId !== null && !isE2Id(value.parentOperationId)) return fail('parent_operation_id')
  for (const field of ['maxBytes', 'maxFrames', 'maxControlFrames', 'maxDescendants'] as const)
    if (!isE2Uint(value[field])) return fail(`envelope_${field}`)
  const kind = value.kind as E2GrantKind
  const stage = value.setupStage
  const bytes = value.maxBytes as number
  const frames = value.maxFrames as number
  const controls = value.maxControlFrames as number
  const descendants = value.maxDescendants as number
  if (kind === 'NATIVE_START') {
    if (value.sequence !== 0 || value.parentOperationId !== null || stage !== null || bytes !== 0 || frames !== 0 ||
      controls !== 0 || descendants !== 1) return fail('native_start_bounds')
  } else {
    if (value.sequence === 0 || value.parentOperationId === null || descendants !== 0) return fail('nonstart_lineage')
    if (kind === 'SETUP') {
      if (!setupStages.includes(stage as E2SetupStage) || controls !== 0) return fail('setup_stage')
      if (stage === 'DNS' || stage === 'TCP') {
        if (bytes !== 0 || frames !== 0) return fail('setup_no_outbound')
      } else if (bytes > 65_536 || frames > 8) return fail('setup_bounds')
    } else {
      if (stage !== null) return fail('payload_kind_stage')
      if (kind === 'PROVIDER_REQUEST') {
        if (bytes > 262_144 || frames > 32 || controls > 8 || controls > frames) return fail('provider_bounds')
      } else if (bytes > 65_536 || frames > 16 || controls !== 0) return fail('mcp_bounds')
    }
  }
  const payloadKind = kind === 'PROVIDER_REQUEST' || kind === 'MCP_CALL'
  if (payloadKind) {
    if (!isE2Digest(value.payloadDigest) || !isE2Uint(value.payloadByteLength, bytes) ||
      value.payloadReceiveTimeoutMs !== E2_PAYLOAD_RECEIVE_TIMEOUT_MS) return fail('payload_commitment')
  } else if (value.payloadDigest !== null || value.payloadByteLength !== null ||
    value.payloadReceiveTimeoutMs !== null) return fail('unexpected_payload_commitment')
  return value as E2FiniteEnvelope
}

/** SHA-256 of UTF-8 `M06_E2_ENVELOPE_V1\n` followed by sorted ASCII-key canonical JSON.
 * The immutable validated envelope contains no envelopeDigest field. Rust and the issuer must use identical bytes.
 * This digest is an identity check, never a dispatch capability.
 */
export function e2EnvelopeDigest(input: unknown): string {
  return e2Sha256(canonicalE2Json(parseE2FiniteEnvelope(input)), `${E2_ENVELOPE_DIGEST_DOMAIN}\n`)
}

const totalFields = [
  'operationsReserved', 'bytesReserved', 'framesReserved', 'nativeStartsReserved',
  'setupReserved', 'providerRequestsReserved', 'mcpCallsReserved', 'recoveryControlsReserved',
] as const

function parseE2ActorTotals(input: unknown): E2ActorTotals {
  if (!exactFields(input, totalFields)) return fail('actor_total_fields')
  const value = input as Record<(typeof totalFields)[number], unknown>
  const limits = [32, 8_388_608, 512, 1, 4, 5, 16, 0] as const
  totalFields.forEach((field, index) => {
    if (!isE2Uint(value[field], limits[index])) fail(`actor_${field}`)
  })
  return value as E2ActorTotals
}

export function prechargeE2Actor(input: unknown, envelopeInput: unknown, usedSetupStages: readonly E2SetupStage[] = []): E2ActorTotals {
  const totals = parseE2ActorTotals(input)
  const envelope = parseE2FiniteEnvelope(envelopeInput)
  if (envelope.kind === 'SETUP') {
    if (usedSetupStages.length !== totals.setupReserved || new Set(usedSetupStages).size !== usedSetupStages.length ||
      usedSetupStages.some(stage => !setupStages.includes(stage))) return fail('setup_history')
    if (usedSetupStages.includes(envelope.setupStage as E2SetupStage)) return fail('setup_stage_reused')
  }
  const next = {
    operationsReserved: totals.operationsReserved + 1,
    bytesReserved: totals.bytesReserved + envelope.maxBytes,
    framesReserved: totals.framesReserved + envelope.maxFrames,
    nativeStartsReserved: totals.nativeStartsReserved + Number(envelope.kind === 'NATIVE_START'),
    setupReserved: totals.setupReserved + Number(envelope.kind === 'SETUP'),
    providerRequestsReserved: totals.providerRequestsReserved + Number(envelope.kind === 'PROVIDER_REQUEST'),
    mcpCallsReserved: totals.mcpCallsReserved + Number(envelope.kind === 'MCP_CALL'),
    recoveryControlsReserved: totals.recoveryControlsReserved,
  }
  return parseE2ActorTotals(next)
}
