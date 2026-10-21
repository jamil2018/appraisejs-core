import { createHash } from 'node:crypto'
import { TextDecoder } from 'node:util'
import { z } from 'zod'
import { JSONRPCMessageSchema, type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'

export const nativeSourceBounds = Object.freeze({
  metadataBytes: 65536,
  mcpBytes: 65536,
  depth: 16,
  operations: 64,
  frames: 256,
  nodes: 256,
  liveOperations: 16,
  journalBytes: 1048576,
  journalRecords: 1024,
  outboundBytes: 2097152,
  inspections: 8,
})
class NativeSourceError extends Error {
  constructor(readonly reason: string) {
    super(`Native source unavailable: ${reason}`)
    this.name = 'NativeSourceError'
  }
}
const fail = (reason: string): never => {
  throw new NativeSourceError(reason)
}
const nativeId = z.string().regex(/^[A-Za-z0-9_.:/-]{1,200}$/)
const nativeDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const uint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const nativeMcpIdSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('number'), value: uint }).strict(),
  z.object({ type: z.literal('string'), value: nativeId }).strict(),
])
const nativeBindingSchema = z
  .object({
    runId: nativeId,
    intentId: nativeId,
    sendBoundaryId: nativeId,
    claimEpoch: uint.min(1),
    providerNamespace: nativeId,
    configurationDigest: nativeDigestSchema,
    transportId: nativeId,
    transportIncarnation: nativeId,
    ownerIncarnation: nativeId,
    channelIncarnation: nativeId,
    protocolDigest: nativeDigestSchema,
    routeProfileDigest: nativeDigestSchema,
    mcpProfileDigest: nativeDigestSchema,
    nonce: nativeId,
    deadlineId: nativeId,
    parentClockEpoch: nativeId,
    clockContractId: z.null(),
    nativeClockEpoch: z.null(),
  })
  .strict()
export type NativeSourceBinding = Readonly<z.infer<typeof nativeBindingSchema>>
const senderManifestSchema = z
  .object({
    sealId: nativeId,
    transportId: nativeId,
    transportIncarnation: nativeId,
    issuedRequests: uint.max(64),
    attemptedBytes: uint.max(nativeSourceBounds.outboundBytes),
    allocations: z.array(z.object({ id: uint.min(1), state: z.enum(['ATTEMPTED', 'NOT_EMITTED']) }).strict()).max(64),
    attempts: z
      .array(
        z.object({ requestId: uint.min(1).nullable(), start: uint, end: uint, rawDigest: nativeDigestSchema }).strict(),
      )
      .max(256),
  })
  .strict()
const payloads = {
  RPC_SENDER_SEAL: senderManifestSchema,
  RPC_INPUT: z
    .object({
      route: z.literal('rpc.stdio'),
      recordOrdinal: uint,
      start: uint,
      end: uint,
      rawDigest: nativeDigestSchema,
      framing: z.enum(['LF', 'EOF_PARTIAL']),
      messageKind: z.enum(['REQUEST', 'INITIALIZED_NOTIFICATION', 'UNSUPPORTED', 'INVALID']),
      parseDisposition: z.enum(['KNOWN', 'UNKNOWN', 'MALFORMED']),
    })
    .strict(),
  RPC_EOF: z
    .object({
      route: z.literal('rpc.stdio'),
      receivedBytes: uint,
      records: uint,
      observedRequests: uint,
      observedIdsDigest: nativeDigestSchema,
    })
    .strict(),
  RPC_WORK: z
    .object({
      route: z.literal('rpc.stdio'),
      recordOrdinal: uint,
      state: z.enum(['QUEUED', 'DISPATCHED', 'SETTLED', 'NOT_DISPATCHED']),
    })
    .strict(),
  RPC_OUTPUT: z
    .object({
      route: z.literal('rpc.stdio'),
      writeOrdinal: uint,
      phase: z.enum(['ATTEMPT', 'PROGRESS']),
      start: uint,
      end: uint,
      rawDigest: nativeDigestSchema,
    })
    .strict(),
  BOOTSTRAP: z.object({ binding: nativeBindingSchema }).strict(),
  HELLO: z.object({ profileDigest: nativeDigestSchema, protocolDigest: nativeDigestSchema }).strict(),
  BOOTSTRAP_ACK: z.object({ helperClosed: z.literal(true) }).strict(),
  RESERVATION_DURABLE: z
    .object({
      route: nativeId,
      endpointId: nativeId,
      payloadDigest: nativeDigestSchema,
      maxBytes: uint.max(nativeSourceBounds.outboundBytes),
    })
    .strict(),
  RESERVATION_ACK: z.object({ tokenId: nativeId, operationId: nativeId, head: nativeDigestSchema }).strict(),
  ATTEMPT_ENTERED: z.object({ route: nativeId }).strict(),
  WRITE_ATTEMPT: z.object({ start: uint, end: uint, rawDigest: nativeDigestSchema }).strict(),
  WRITE_PROGRESS: z.object({ start: uint, end: uint, rawDigest: nativeDigestSchema }).strict(),
  ADMISSION_POISON: z.object({ reason: nativeId }).strict(),
  RAW_INPUT: z
    .object({
      responseId: nativeId.nullable(),
      itemId: nativeId.nullable(),
      callId: nativeId.nullable(),
      bytes: uint,
      rawSequence: uint.min(1),
      rawDigest: nativeDigestSchema,
      eventName: nativeId,
      parseDisposition: z.enum(['PENDING', 'KNOWN', 'UNKNOWN', 'MALFORMED']),
    })
    .strict(),
  PARSE_DISPOSITION: z
    .object({
      rawSequence: uint.min(1),
      rawDigest: nativeDigestSchema,
      eventName: nativeId,
      parseDisposition: z.enum(['KNOWN', 'UNKNOWN', 'MALFORMED']),
      responseId: nativeId.nullable(),
      itemId: nativeId.nullable(),
      callId: nativeId.nullable(),
    })
    .strict(),
  MCP_CALL: z
    .object({
      requestHash: nativeDigestSchema,
      profileDigest: nativeDigestSchema,
      responseId: nativeId,
      itemId: nativeId,
      callId: nativeId,
    })
    .strict(),
  APPRAISE_ACCEPTANCE: z.object({ joinDigest: nativeDigestSchema, acceptanceId: nativeId }).strict(),
  LOCAL_CLOSE: z.object({ complete: z.boolean() }).strict(),
  FENCE: z.object({ reason: nativeId }).strict(),
  UNKNOWN: z.object({ reason: nativeId }).strict(),
  RANGE_SEAL: z
    .object({
      head: nativeDigestSchema,
      operations: uint,
      frames: uint,
      rpcIssuedRequests: uint,
      rpcWrittenBytes: uint,
      rpcObservedRequests: uint,
      rpcInputRecords: uint,
      rpcSenderSealDigest: nativeDigestSchema,
    })
    .strict(),
  MCP_REQUEST: z.object({ messageJson: z.string() }).strict(),
  MCP_REPLY: z.object({ messageJson: z.string() }).strict(),
} as const
export type NativeSourceKind = keyof typeof payloads
const envelopeSchema = z
  .object({
    version: z.literal('M06_NATIVE_SOURCE_V12'),
    lane: z.enum(['SOURCE', 'CONTROL', 'MCP']),
    kind: z.enum(Object.keys(payloads) as [NativeSourceKind, ...NativeSourceKind[]]),
    ownerIncarnation: nativeId,
    channelIncarnation: nativeId,
    sequence: uint.min(1),
    previousDigest: nativeDigestSchema,
    bindingDigest: nativeDigestSchema,
    operationId: nativeId.nullable(),
    parentOperationId: nativeId.nullable(),
    attemptId: nativeId.nullable(),
    transportIncarnation: nativeId.nullable(),
    rpcRequestId: uint.nullable(),
    nativeThreadId: nativeId.nullable(),
    nativeTurnId: nativeId.nullable(),
    sourceCallId: nativeId.nullable(),
    mcpRequestId: nativeMcpIdSchema.nullable(),
    deadlineId: nativeId,
    clockContractId: nativeId.nullable(),
    nativeTick: uint,
    disposition: z.enum(['KNOWN', 'UNKNOWN', 'MALFORMED']),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict()
export type NativeSourceFrame = Readonly<z.infer<typeof envelopeSchema>>

/** No JSON.parse duplicate-key ambiguity: the accepted bytes must equal this unique encoding. */
export function canonicalNativeJson(value: unknown, depth = 0): string {
  if (depth > nativeSourceBounds.depth) return fail('depth_limit')
  if (value === null || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) return fail('noncanonical_integer')
    return String(value)
  }
  if (typeof value === 'string') {
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))
      return fail('unpaired_surrogate')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(item => canonicalNativeJson(item, depth + 1)).join(',')}]`
  if (typeof value !== 'object' || !value || Object.getPrototypeOf(value) !== Object.prototype)
    return fail('non_json_value')
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map(key => {
      if (!/^[\x20-\x7e]+$/.test(key)) return fail('non_ascii_key')
      return `${JSON.stringify(key)}:${canonicalNativeJson(record[key], depth + 1)}`
    })
    .join(',')}}`
}
export function nativeDigest(value: string | Uint8Array, domain = ''): string {
  return `sha256:${createHash('sha256').update(domain).update(value).digest('hex')}`
}
export const nativeProtocolDigest = nativeDigest(
  'M06_NATIVE_SOURCE_PROTOCOL_V12:MESSAGE_JSON_V1:RPC_CLOSURE_V1:RAW_PARSE_CUSTODY_V1',
)
export const nativeInitialHead = nativeDigest('M06_NATIVE_SOURCE_V12\0')
export const nativeBindingDigest = (binding: NativeSourceBinding) =>
  nativeDigest(canonicalNativeJson(nativeBindingSchema.parse(binding)), 'M06_NATIVE_BINDING_V12\0')
export function validateNativeFrame(value: unknown): NativeSourceFrame {
  canonicalNativeJson(value)
  const frame = envelopeSchema.parse(value)
  const payload = payloads[frame.kind].parse(frame.payload)
  if (frame.kind === 'MCP_REQUEST' || frame.kind === 'MCP_REPLY') {
    const message = parseNativeMcpJson((payload as { messageJson: string }).messageJson)
    if ('id' in message) {
      if (
        !frame.mcpRequestId ||
        frame.mcpRequestId.type !== typeof message.id ||
        frame.mcpRequestId.value !== message.id
      )
        fail('mcp_envelope_id_mismatch')
    } else if (frame.mcpRequestId !== null) fail('mcp_envelope_id_mismatch')
  }
  if ((frame.kind === 'MCP_REQUEST' || frame.kind === 'MCP_REPLY') !== (frame.lane === 'MCP')) return fail('lane_kind')
  if (
    ['BOOTSTRAP', 'BOOTSTRAP_ACK', 'RESERVATION_ACK', 'RPC_SENDER_SEAL', 'ADMISSION_POISON'].includes(frame.kind) &&
    frame.lane !== 'CONTROL'
  )
    return fail('control_lane')
  return Object.freeze({
    ...frame,
    mcpRequestId: frame.mcpRequestId ? Object.freeze({ ...frame.mcpRequestId }) : null,
    payload: Object.freeze(payload),
  })
}
export function encodeNativeFrame(frame: NativeSourceFrame): Buffer {
  const body = Buffer.from(canonicalNativeJson(validateNativeFrame(frame)))
  if (!body.length || body.length > nativeSourceBounds.metadataBytes) return fail('frame_size')
  const header = Buffer.alloc(4)
  header.writeUInt32BE(body.length)
  return Buffer.concat([header, body])
}
function readNativeFrameLength(header: Buffer): number {
  const length = header.readUInt32BE(0)
  if (!length || length > nativeSourceBounds.metadataBytes) return fail('frame_size')
  return length
}

export class NativeFrameDecoder {
  #bytes: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  #failed = false
  push(chunk: Buffer): NativeSourceFrame[] {
    if (this.#failed || !Buffer.isBuffer(chunk)) return fail('decoder_failed')
    try {
      const frames: NativeSourceFrame[] = []
      let offset = 0
      // Keep at most one bounded incomplete frame, even when a read contains many frames.
      while (offset < chunk.length) {
        const target = this.#bytes.length < 4 ? 4 : 4 + this.#bytes.readUInt32BE(0)
        const count = Math.min(target - this.#bytes.length, chunk.length - offset)
        this.#bytes = Buffer.concat([this.#bytes, chunk.subarray(offset, offset + count)])
        offset += count
        if (this.#bytes.length < 4) continue
        const length = readNativeFrameLength(this.#bytes)
        if (this.#bytes.length < length + 4) continue
        const body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(this.#bytes.subarray(4))
        const value = JSON.parse(body)
        if (canonicalNativeJson(value) !== body) return fail('noncanonical_json')
        frames.push(validateNativeFrame(value))
        this.#bytes = Buffer.alloc(0)
      }
      return frames
    } catch (error) {
      this.#failed = true
      throw error
    }
  }
  end(): void {
    if (this.#failed || this.#bytes.length) {
      this.#failed = true
      return fail('partial_eof')
    }
  }
}
export function nativeFrame(
  binding: NativeSourceBinding,
  kind: NativeSourceKind,
  payload: Record<string, unknown>,
  options: Partial<NativeSourceFrame> = {},
): NativeSourceFrame {
  return validateNativeFrame({
    version: 'M06_NATIVE_SOURCE_V12',
    lane: ['MCP_REQUEST', 'MCP_REPLY'].includes(kind)
      ? 'MCP'
      : ['BOOTSTRAP', 'BOOTSTRAP_ACK', 'RESERVATION_ACK', 'RPC_SENDER_SEAL', 'ADMISSION_POISON'].includes(kind)
        ? 'CONTROL'
        : 'SOURCE',
    kind,
    ownerIncarnation: binding.ownerIncarnation,
    channelIncarnation: binding.channelIncarnation,
    sequence: 1,
    previousDigest: nativeInitialHead,
    bindingDigest: nativeBindingDigest(binding),
    operationId: null,
    parentOperationId: null,
    attemptId: null,
    transportIncarnation: null,
    rpcRequestId: null,
    nativeThreadId: null,
    nativeTurnId: null,
    sourceCallId: null,
    mcpRequestId: null,
    deadlineId: binding.deadlineId,
    clockContractId: binding.clockContractId,
    nativeTick: 0,
    disposition: 'KNOWN',
    payload,
    ...options,
  })
}

/** Strict transient JSON parser. Inner exact text remains the commitment; metadata encoding is unchanged. */
function parseNativeJsonText(input: string | Uint8Array, maxBytes: number = nativeSourceBounds.mcpBytes): unknown {
  const text =
    typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input)
  if (!text.length || text.charCodeAt(0) === 0xfeff || Buffer.byteLength(text) > maxBytes)
    return fail('mcp_text_size_or_bom')
  let at = 0
  const space = () => {
    while (/[\x20\t\r\n]/.test(text[at] ?? '') && at < text.length) at++
  }
  const scalar = (value: string) => {
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))
      fail('mcp_unicode_scalar')
  }
  const string = (): string => {
    const start = at++
    while (at < text.length) {
      const c = text[at++]
      if (c === '"') {
        const value = JSON.parse(text.slice(start, at)) as string
        scalar(value)
        return value
      }
      if (c === '\\') {
        at++
        continue
      }
      if (c.charCodeAt(0) < 32) fail('mcp_string_control')
    }
    return fail('mcp_string_eof')
  }
  const object = (depth: number): void => {
    at++
    space()
    const keys = new Set<string>()
    if (text[at] === '}') {
      at++
      return
    }
    while (at < text.length) {
      space()
      if (text[at] !== '"') fail('mcp_object_key')
      const key = string()
      if (keys.has(key)) fail('mcp_duplicate_key')
      keys.add(key)
      space()
      if (text[at++] !== ':') fail('mcp_object_colon')
      value(depth + 1)
      space()
      const next = text[at++]
      if (next === '}') return
      if (next !== ',') fail('mcp_object_separator')
    }
    return fail('mcp_object_eof')
  }
  const array = (depth: number): void => {
    at++
    space()
    if (text[at] === ']') {
      at++
      return
    }
    while (at < text.length) {
      value(depth + 1)
      space()
      const next = text[at++]
      if (next === ']') return
      if (next !== ',') fail('mcp_array_separator')
    }
    return fail('mcp_array_eof')
  }
  const number = (): void => {
    const token = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(at))?.[0]
    if (!token || !Number.isFinite(Number(token))) return fail('mcp_nonfinite_or_invalid_number')
    at += token.length
  }
  const value = (depth: number): void => {
    if (depth > nativeSourceBounds.depth) fail('mcp_depth_limit')
    space()
    const c = text[at]
    if (c === '"') {
      string()
      return
    }
    if (c === '{') return object(depth)
    if (c === '[') return array(depth)
    for (const literal of ['true', 'false', 'null'])
      if (text.startsWith(literal, at)) {
        at += literal.length
        return
      }
    number()
  }
  scalar(text)
  value(0)
  space()
  if (at !== text.length) fail('mcp_trailing_json')
  return JSON.parse(text)
}
export function parseNativeMcpJson(input: string | Uint8Array): JSONRPCMessage {
  const parsed = JSONRPCMessageSchema.parse(parseNativeJsonText(input))
  if ('id' in parsed) {
    if (typeof parsed.id === 'number') {
      if (!Number.isSafeInteger(parsed.id) || parsed.id < 0 || Object.is(parsed.id, -0)) fail('mcp_request_id')
    } else nativeId.parse(parsed.id)
  }
  return parsed
}
