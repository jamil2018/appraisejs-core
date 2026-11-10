import { TextDecoder } from 'node:util'
import {
  canonicalE2Json,
  e2Limits,
  e2EnvelopeDigest,
  e2PayloadDigest,
  isE2Digest,
  isE2Id,
  isE2Uint,
  parseE2FiniteEnvelope,
  type E2FiniteEnvelope,
  type E2GrantKind,
  type E2SetupStage,
} from '../provider-grant-contract'

export const E2_PRIVATE_VERSION = 'M06_E2_PRIVATE_V1' as const
const E2_PRIVATE_MAGIC = 'E2P1' as const
const e2PrivateBounds = Object.freeze({ parentMetadataBytes: 4096, childMetadataBytes: 2048,
  dataPayloadBytes: 16_384, prefixBytes: 12, maxFrameSequence: 0xffff_ffff })
export type E2PrivateDirection = 'PARENT_TO_CHILD' | 'CHILD_TO_PARENT'
export type E2PrivateType = 'HELLO' | 'HELLO_ACK' | 'BIND' | 'COMMAND' | 'DATA' | 'DATA_END' |
  'ACCEPTED' | 'OBSERVED' | 'REFUSED' | 'DRAIN_PROOF'
export type E2PrivateMetadata = Readonly<Record<string, unknown> & { version: typeof E2_PRIVATE_VERSION; type: E2PrivateType;
  frameSequence: number; runId: string; intentId: string; sourceTupleDigest: string;
  parentIncarnationDigest: string; prospectiveChildNonceDigest: string }>
export type E2PrivateFrame = Readonly<{ metadata: E2PrivateMetadata; payload: Buffer }>

class E2PrivateProtocolError extends Error {
  constructor(readonly reason: string) {
    super(`E2 private protocol refused: ${reason}`)
    this.name = 'E2PrivateProtocolError'
  }
}
const fail = (reason: string): never => { throw new E2PrivateProtocolError(reason) }
const common = ['version', 'type', 'sourceTupleDigest', 'parentIncarnationDigest',
  'prospectiveChildNonceDigest', 'runId', 'intentId', 'frameSequence'] as const
const receipt = ['childIncarnationDigest', 'grantSequence', 'operationId', 'rangeId',
  'evidenceDigest', 'observedBytes', 'observedFrames', 'pendingWrite'] as const
const specs = {
  HELLO: { direction: 'PARENT_TO_CHILD', extra: [] },
  HELLO_ACK: { direction: 'CHILD_TO_PARENT', extra: ['childIncarnationNonce', 'childIncarnationDigest'] },
  BIND: { direction: 'PARENT_TO_CHILD', extra: ['childIncarnationDigest', 'grantSequence', 'operationId',
    'rangeId', 'kind', 'envelopeDigest', 'commitReceiptDigest', 'oneUseNonce'] },
  COMMAND: { direction: 'PARENT_TO_CHILD', extra: ['childIncarnationDigest', 'grantSequence', 'operationId',
    'rangeId', 'kind', 'envelopeDigest', 'commitReceiptDigest', 'oneUseNonce', 'maxBytes', 'maxFrames',
    'maxControlFrames', 'maxDescendants'] },
  DATA: { direction: 'PARENT_TO_CHILD', extra: ['childIncarnationDigest', 'grantSequence', 'operationId', 'chunkIndex'] },
  DATA_END: { direction: 'PARENT_TO_CHILD', extra: ['childIncarnationDigest', 'grantSequence', 'operationId',
    'chunkCount', 'totalPayloadBytes', 'payloadDigest'] },
  ACCEPTED: { direction: 'CHILD_TO_PARENT', extra: receipt },
  OBSERVED: { direction: 'CHILD_TO_PARENT', extra: receipt },
  REFUSED: { direction: 'CHILD_TO_PARENT', extra: receipt },
  DRAIN_PROOF: { direction: 'CHILD_TO_PARENT', extra: [...receipt, 'rangeDigests', 'descendantDigests', 'senderExcluded'] },
} as const
const commandExtras = ['setupStage', 'payloadDigest', 'payloadByteLength', 'payloadReceiveTimeoutMs'] as const
const digestFields = ['sourceTupleDigest', 'parentIncarnationDigest', 'prospectiveChildNonceDigest',
  'childIncarnationDigest', 'envelopeDigest', 'commitReceiptDigest', 'payloadDigest', 'evidenceDigest'] as const
const idFields = ['runId', 'intentId', 'operationId', 'rangeId'] as const
const uintFields = ['frameSequence', 'grantSequence', 'chunkIndex', 'chunkCount', 'totalPayloadBytes',
  'payloadByteLength', 'maxBytes', 'maxFrames', 'maxControlFrames', 'maxDescendants',
  'observedBytes', 'observedFrames'] as const
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
const sameKeys = (value: Record<string, unknown>, fields: readonly string[]) => {
  const keys = Object.keys(value)
  return keys.length === fields.length && keys.every(key => fields.includes(key))
}
/** A private 128-bit nonce is encoded as 32 lowercase hex chars; digest the decoded 16 bytes, not hex text. */
export const isE2PrivateNonce = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)
export function e2PrivateNonceDigest(nonce: string): string {
  if (!isE2PrivateNonce(nonce)) return fail('private_nonce')
  return e2PayloadDigest(Buffer.from(nonce, 'hex'))
}
const isDigestArray = (value: unknown, max: number) =>
  Array.isArray(value) && value.length <= max && value.every(isE2Digest)
const timeout = 5000

export function validateE2PrivateFrame(direction: E2PrivateDirection, metadata: unknown, payload: Uint8Array = Buffer.alloc(0)):
  E2PrivateFrame {
  if (!isRecord(metadata) || typeof metadata.type !== 'string' || !(metadata.type in specs)) return fail('frame_type')
  const type = metadata.type as E2PrivateType
  const spec = specs[type]
  if (spec.direction !== direction) return fail('frame_direction')
  let fields: readonly string[] = [...common, ...spec.extra]
  if (type === 'COMMAND') {
    if (metadata.kind === 'SETUP') fields = [...fields, commandExtras[0]]
    else if (metadata.kind === 'PROVIDER_REQUEST' || metadata.kind === 'MCP_CALL')
      fields = [...fields, ...commandExtras.slice(1)]
  }
  if (!sameKeys(metadata, fields)) return fail('frame_fields')
  if (metadata.version !== E2_PRIVATE_VERSION) return fail('frame_version')
  for (const field of digestFields) if (field in metadata && !isE2Digest(metadata[field])) return fail(`frame_${field}`)
  for (const field of idFields) if (field in metadata && !isE2Id(metadata[field])) return fail(`frame_${field}`)
  for (const field of uintFields) if (field in metadata && !isE2Uint(metadata[field],
    field === 'frameSequence' ? e2PrivateBounds.maxFrameSequence : 2_147_483_647)) return fail(`frame_${field}`)
  if (type === 'HELLO_ACK' && (!isE2PrivateNonce(metadata.childIncarnationNonce) ||
    e2PrivateNonceDigest(metadata.childIncarnationNonce) !== metadata.childIncarnationDigest))
    return fail('child_nonce_digest')
  if (type === 'BIND' || type === 'COMMAND') {
    if (!isE2PrivateNonce(metadata.oneUseNonce) || metadata.rangeId !== metadata.operationId) return fail('command_identity')
    if (!isE2Uint(metadata.grantSequence, 31)) return fail('grant_sequence')
    if (type === 'BIND') {
      if (metadata.grantSequence !== 0 || metadata.kind !== 'NATIVE_START') return fail('bind_kind_sequence')
    } else {
      if (metadata.grantSequence === 0 || !['SETUP', 'PROVIDER_REQUEST', 'MCP_CALL'].includes(String(metadata.kind)))
        return fail('command_kind_sequence')
      if (metadata.kind === 'SETUP') {
        if (!['DNS', 'TCP', 'TLS', 'UPGRADE'].includes(String(metadata.setupStage))) return fail('setup_stage')
      } else {
        if (metadata.payloadReceiveTimeoutMs !== timeout ||
          !isE2Uint(metadata.payloadByteLength, metadata.kind === 'PROVIDER_REQUEST' ? 262_144 : 65_536) ||
          (metadata.payloadByteLength as number) > (metadata.maxBytes as number)) return fail('command_payload')
      }
      const kind = metadata.kind as Exclude<E2GrantKind, 'NATIVE_START'>
      const maxBytes = kind === 'PROVIDER_REQUEST' ? 262_144 : 65_536
      const maxFrames = kind === 'PROVIDER_REQUEST' ? 32 : kind === 'MCP_CALL' ? 16 : 8
      if (!isE2Uint(metadata.maxBytes, maxBytes) || !isE2Uint(metadata.maxFrames, maxFrames) ||
        !isE2Uint(metadata.maxControlFrames, kind === 'PROVIDER_REQUEST' ? 8 : 0) ||
        (metadata.maxControlFrames as number) > (metadata.maxFrames as number) || metadata.maxDescendants !== 0)
        return fail('command_budget')
      if (kind === 'SETUP' && (metadata.setupStage === 'DNS' || metadata.setupStage === 'TCP') &&
        (metadata.maxBytes !== 0 || metadata.maxFrames !== 0)) return fail('setup_budget')
    }
  }
  if (type === 'DATA' && !isE2Uint(metadata.chunkIndex, e2Limits.providerDataChunks - 1))
    return fail('chunk_index')
  if (type === 'DATA_END' && (!isE2Uint(metadata.chunkCount, e2Limits.providerDataChunks) ||
    !isE2Uint(metadata.totalPayloadBytes, 262_144))) return fail('data_end_bounds')
  if (type === 'ACCEPTED' || type === 'OBSERVED' || type === 'REFUSED' || type === 'DRAIN_PROOF') {
    if (!isE2Uint(metadata.grantSequence, 31) || metadata.rangeId !== metadata.operationId ||
      typeof metadata.pendingWrite !== 'boolean') return fail('receipt_identity')
    if (type === 'DRAIN_PROOF' && (!isDigestArray(metadata.rangeDigests, e2Limits.operations) ||
      !isDigestArray(metadata.descendantDigests, e2Limits.nativeStarts) ||
      typeof metadata.senderExcluded !== 'boolean')) return fail('drain_fields')
  }
  if (type === 'DATA' ? payload.length < 1 || payload.length > e2PrivateBounds.dataPayloadBytes : payload.length !== 0)
    return fail('frame_payload_length')
  const metadataBytes = Buffer.byteLength(canonicalE2Json(metadata))
  const cap = direction === 'PARENT_TO_CHILD' ? e2PrivateBounds.parentMetadataBytes : e2PrivateBounds.childMetadataBytes
  if (metadataBytes === 0 || metadataBytes > cap) return fail('metadata_size')
  return { metadata: metadata as E2PrivateMetadata, payload: Buffer.from(payload) }
}

/** Confirms a wire BIND/COMMAND repeats the exact immutable grant, without creating authority. */
export function assertE2PrivateCommandMatchesGrant(metadata: unknown, envelopeInput: unknown,
  commitReceiptDigest: string): E2PrivateMetadata {
  const envelope: E2FiniteEnvelope = parseE2FiniteEnvelope(envelopeInput)
  const frame = validateE2PrivateFrame('PARENT_TO_CHILD', metadata)
  const wire = frame.metadata
  if ((wire.type !== 'BIND' && wire.type !== 'COMMAND') ||
    (wire.type === 'BIND') !== (envelope.kind === 'NATIVE_START') ||
    !isE2Digest(commitReceiptDigest) || wire.commitReceiptDigest !== commitReceiptDigest ||
    wire.envelopeDigest !== e2EnvelopeDigest(envelope) || wire.sourceTupleDigest !== envelope.sourceTupleDigest ||
    wire.runId !== envelope.runId || wire.intentId !== envelope.intentId ||
    wire.operationId !== envelope.operationId || wire.rangeId !== envelope.rangeId ||
    wire.grantSequence !== envelope.sequence || wire.kind !== envelope.kind) return fail('command_grant_join')
  if (wire.type === 'COMMAND' && (wire.maxBytes !== envelope.maxBytes || wire.maxFrames !== envelope.maxFrames ||
    wire.maxControlFrames !== envelope.maxControlFrames || wire.maxDescendants !== envelope.maxDescendants ||
    wire.setupStage !== undefined && wire.setupStage !== envelope.setupStage ||
    wire.payloadDigest !== undefined && wire.payloadDigest !== envelope.payloadDigest ||
    wire.payloadByteLength !== undefined && wire.payloadByteLength !== envelope.payloadByteLength ||
    wire.payloadReceiveTimeoutMs !== undefined && wire.payloadReceiveTimeoutMs !== envelope.payloadReceiveTimeoutMs))
    return fail('command_envelope_mismatch')
  return wire
}

export function encodeE2PrivateFrame(direction: E2PrivateDirection, metadata: unknown,
  payload: Uint8Array = Buffer.alloc(0)): Buffer {
  const frame = validateE2PrivateFrame(direction, metadata, payload)
  const body = Buffer.from(canonicalE2Json(frame.metadata), 'utf8')
  const prefix = Buffer.allocUnsafe(e2PrivateBounds.prefixBytes)
  prefix.write(E2_PRIVATE_MAGIC, 0, 'ascii')
  prefix.writeUInt32BE(body.length, 4)
  prefix.writeUInt32BE(frame.payload.length, 8)
  return Buffer.concat([prefix, body, frame.payload])
}

function readHeader(raw: Uint8Array, direction: E2PrivateDirection): number {
  if (raw.length < e2PrivateBounds.prefixBytes) return fail('truncated_prefix')
  const view = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
  if (view.toString('ascii', 0, 4) !== E2_PRIVATE_MAGIC) return fail('frame_magic')
  const metadataLength = view.readUInt32BE(4)
  const payloadLength = view.readUInt32BE(8)
  const cap = direction === 'PARENT_TO_CHILD' ? e2PrivateBounds.parentMetadataBytes : e2PrivateBounds.childMetadataBytes
  if (metadataLength === 0 || metadataLength > cap || payloadLength > e2PrivateBounds.dataPayloadBytes)
    return fail('declared_length')
  return e2PrivateBounds.prefixBytes + metadataLength + payloadLength
}

export function decodeE2PrivateFrame(direction: E2PrivateDirection, raw: Uint8Array): E2PrivateFrame {
  const total = readHeader(raw, direction)
  if (raw.length !== total) return fail(raw.length < total ? 'truncated_frame' : 'trailing_frame_bytes')
  const view = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
  const metadataLength = view.readUInt32BE(4)
  const payloadLength = view.readUInt32BE(8)
  const bytes = view.subarray(12, 12 + metadataLength)
  let decoded: string
  try { decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }
  catch { return fail('metadata_utf8') }
  let metadata: unknown
  try { metadata = JSON.parse(decoded) } catch { return fail('metadata_json') }
  if (canonicalE2Json(metadata) !== decoded) return fail('metadata_noncanonical')
  if (!isRecord(metadata)) return fail('metadata_object')
  if (Object.hasOwn(metadata, 'payloadLength')) return fail('metadata_payload_length')
  return validateE2PrivateFrame(direction, metadata, view.subarray(total - payloadLength))
}

/** Parses exact frame boundaries without copying an untrusted declared-size body before header bounds pass. */
export class E2PrivateFrameDecoder {
  #pending = Buffer.alloc(0)
  #expected = 0
  #nextSequence: number
  #ended = false
  constructor(readonly direction: E2PrivateDirection, startSequence = 0) {
    if (!isE2Uint(startSequence, e2PrivateBounds.maxFrameSequence)) fail('initial_sequence')
    this.#nextSequence = startSequence
  }
  push(chunk: Uint8Array): E2PrivateFrame[] {
    if (this.#ended) return fail('decoder_ended')
    const frames: E2PrivateFrame[] = []
    let offset = 0
    try {
      while (offset < chunk.length) {
        const target = this.#expected || 12
        const take = Math.min(target - this.#pending.length, chunk.length - offset)
        this.#pending = Buffer.concat([this.#pending, chunk.subarray(offset, offset + take)])
        offset += take
        if (this.#pending.length === 12 && this.#expected === 0) this.#expected = readHeader(this.#pending, this.direction)
        if (this.#expected && this.#pending.length === this.#expected) {
          const frame = decodeE2PrivateFrame(this.direction, this.#pending)
          if (frame.metadata.frameSequence !== this.#nextSequence) return fail('frame_sequence')
          this.#nextSequence++
          frames.push(frame)
          this.#pending = Buffer.alloc(0)
          this.#expected = 0
        }
      }
    } catch (error) {
      this.#ended = true
      throw error
    }
    return frames
  }
  end(): void {
    this.#ended = true
    if (this.#pending.length) fail('partial_eof')
  }
}

/** Verifies only the initial two-pipe transcript. It owns no FD, command or effect authority. */
export class E2StartupOrder {
  #step = 0
  #identity: Pick<E2PrivateMetadata, 'sourceTupleDigest' | 'parentIncarnationDigest' |
    'prospectiveChildNonceDigest' | 'runId' | 'intentId'> | null = null
  #childDigest: unknown = null
  #startOperationId: unknown = null
  observe(direction: E2PrivateDirection, metadata: unknown): void {
    const frame = validateE2PrivateFrame(direction, metadata)
    const wire = frame.metadata
    const expected: readonly [E2PrivateDirection, E2PrivateType, number, number?][] = [
      ['PARENT_TO_CHILD', 'HELLO', 0], ['CHILD_TO_PARENT', 'HELLO_ACK', 0],
      ['PARENT_TO_CHILD', 'BIND', 1, 0], ['CHILD_TO_PARENT', 'ACCEPTED', 1, 0],
      ['PARENT_TO_CHILD', 'COMMAND', 2, 1],
    ]
    const slot = expected[this.#step]
    if (!slot || direction !== slot[0] || wire.type !== slot[1] || wire.frameSequence !== slot[2] ||
      (slot[3] !== undefined && wire.grantSequence !== slot[3])) return fail('startup_order')
    if (this.#identity) {
      for (const field of ['sourceTupleDigest', 'parentIncarnationDigest',
        'prospectiveChildNonceDigest', 'runId', 'intentId'] as const)
        if (wire[field] !== this.#identity[field]) return fail('startup_identity')
    } else this.#identity = wire
    if (this.#step === 1) this.#childDigest = wire.childIncarnationDigest
    if (this.#step >= 2 && wire.childIncarnationDigest !== this.#childDigest) return fail('startup_child')
    if (this.#step === 2) this.#startOperationId = wire.operationId
    if (this.#step === 3 && (wire.operationId !== this.#startOperationId || wire.rangeId !== this.#startOperationId))
      return fail('startup_acceptance')
    if (this.#step === 4 && wire.kind !== 'SETUP') return fail('startup_setup')
    this.#step++
  }
  get complete(): boolean { return this.#step === 5 }
}

/** A receipt bounds its observation to an already committed range; it does not prove physical finality. */
export function assertE2PrivateReceiptMatchesGrant(metadata: unknown, envelopeInput: unknown): E2PrivateMetadata {
  const envelope = parseE2FiniteEnvelope(envelopeInput)
  const wire = validateE2PrivateFrame('CHILD_TO_PARENT', metadata).metadata
  if (!['ACCEPTED', 'OBSERVED', 'REFUSED', 'DRAIN_PROOF'].includes(wire.type) ||
    wire.sourceTupleDigest !== envelope.sourceTupleDigest || wire.runId !== envelope.runId ||
    wire.intentId !== envelope.intentId || wire.operationId !== envelope.operationId ||
    wire.rangeId !== envelope.rangeId || wire.grantSequence !== envelope.sequence ||
    (wire.observedBytes as number) > envelope.maxBytes || (wire.observedFrames as number) > envelope.maxFrames)
    return fail('receipt_grant_join')
  return wire
}

/** Pure assembly: caller supplies a monotonic millisecond clock and must invoke expire at the deadline. */
export class E2PayloadAssembly {
  readonly #command: E2PrivateMetadata
  readonly #startedAtMs: number
  #chunks: Buffer[] = []
  #length = 0
  #done = false
  #failed = false
  constructor(command: unknown, startedAtMs: number) {
    this.#command = validateE2PrivateFrame('PARENT_TO_CHILD', command).metadata
    if (this.#command.type !== 'COMMAND' ||
      (this.#command.kind !== 'PROVIDER_REQUEST' && this.#command.kind !== 'MCP_CALL')) fail('assembly_command')
    if (!Number.isSafeInteger(startedAtMs) || startedAtMs < 0) fail('assembly_clock')
    this.#startedAtMs = startedAtMs
  }
  expire(nowMs: number): void {
    if (this.#done || this.#failed) return fail('assembly_closed')
    if (!Number.isSafeInteger(nowMs) || nowMs < this.#startedAtMs || nowMs - this.#startedAtMs >= timeout) {
      this.#failed = true
      return fail('assembly_timeout')
    }
  }
  consume(frameInput: E2PrivateFrame, nowMs: number): Buffer | null {
    this.expire(nowMs)
    const frame = validateE2PrivateFrame('PARENT_TO_CHILD', frameInput.metadata, frameInput.payload)
    const metadata = frame.metadata
    if (metadata.type !== 'DATA' && metadata.type !== 'DATA_END') return this.#refuse('assembly_frame_type')
    if (metadata.operationId !== this.#command.operationId || metadata.grantSequence !== this.#command.grantSequence ||
      metadata.childIncarnationDigest !== this.#command.childIncarnationDigest ||
      metadata.sourceTupleDigest !== this.#command.sourceTupleDigest ||
      metadata.parentIncarnationDigest !== this.#command.parentIncarnationDigest ||
      metadata.prospectiveChildNonceDigest !== this.#command.prospectiveChildNonceDigest ||
      metadata.runId !== this.#command.runId || metadata.intentId !== this.#command.intentId)
      return this.#refuse('assembly_identity')
    const expected = this.#command.payloadByteLength as number
    const limit = this.#command.kind === 'PROVIDER_REQUEST' ? e2Limits.providerDataChunks : e2Limits.mcpDataChunks
    if (metadata.type === 'DATA') {
      if (metadata.chunkIndex !== this.#chunks.length || this.#chunks.length >= limit ||
        (this.#chunks.length + 1) * e2Limits.privateDataBytes <= expected &&
        frame.payload.length !== e2Limits.privateDataBytes ||
        this.#length + frame.payload.length > expected) return this.#refuse('assembly_chunk')
      this.#chunks.push(frame.payload)
      this.#length += frame.payload.length
      return null
    }
    if (metadata.chunkCount !== Math.ceil(expected / e2Limits.privateDataBytes) ||
      metadata.chunkCount !== this.#chunks.length || metadata.totalPayloadBytes !== expected ||
      this.#length !== expected || metadata.payloadDigest !== this.#command.payloadDigest)
      return this.#refuse('assembly_end')
    const bytes = Buffer.concat(this.#chunks, this.#length)
    if (e2PayloadDigest(bytes) !== metadata.payloadDigest) return this.#refuse('assembly_digest')
    this.#done = true
    return bytes
  }
  #refuse(reason: string): never { this.#failed = true; return fail(reason) }
}
