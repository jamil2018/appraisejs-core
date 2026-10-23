import { describe, expect, it } from 'vitest'
import {
  canonicalNativeJson,
  encodeNativeFrame,
  nativeBindingDigest,
  nativeDigest,
  nativeFrame,
  NativeFrameDecoder,
  nativeInitialHead,
  nativeProtocolDigest,
  parseNativeMcpJson,
  nativeSourceBounds,
  validateNativeFrame,
  type NativeSourceBinding,
} from './native-source-protocol'
const digest = nativeDigest('fixture')
const binding: NativeSourceBinding = {
  runId: 'run12',
  intentId: 'intent12',
  sendBoundaryId: 'boundary12',
  claimEpoch: 1,
  providerNamespace: 'fixture12',
  configurationDigest: digest,
  transportId: 'rpc12',
  transportIncarnation: 'rpc.inc12',
  ownerIncarnation: 'owner12',
  channelIncarnation: 'channel12',
  protocolDigest: nativeProtocolDigest,
  routeProfileDigest: digest,
  mcpProfileDigest: digest,
  nonce: 'nonce12',
  deadlineId: 'deadline12',
  parentClockEpoch: 'parent12',
  clockContractId: null,
  nativeClockEpoch: null,
}
const hello = () => nativeFrame(binding, 'HELLO', { profileDigest: digest, protocolDigest: nativeProtocolDigest })
const bytes = (body: string) => {
  const b = Buffer.from(body)
  const h = Buffer.alloc(4)
  h.writeUInt32BE(b.length)
  return Buffer.concat([h, b])
}

describe('native source canonical protocol', () => {
  it('has exact domain-separated deterministic vectors and survives every frame split', () => {
    expect(canonicalNativeJson({ z: 'quote" slash\\ newline\n', a: [null, true, 0, 9007199254740991] })).toBe(
      '{"a":[null,true,0,9007199254740991],"z":"quote\\\" slash\\\\ newline\\n"}',
    )
    expect(nativeBindingDigest(binding)).not.toBe(nativeDigest(canonicalNativeJson(binding)))
    expect(hello().previousDigest).toBe(nativeInitialHead)
    const encoded = encodeNativeFrame(hello())
    for (let split = 0; split <= encoded.length; split++) {
      const decoder = new NativeFrameDecoder()
      expect([...decoder.push(encoded.subarray(0, split)), ...decoder.push(encoded.subarray(split))]).toEqual([hello()])
      decoder.end()
    }
    const decoder = new NativeFrameDecoder()
    expect(decoder.push(Buffer.concat([encoded, encoded]))).toHaveLength(2)
  })
  it('rejects duplicate keys, unknown fields, enum changes, floats, negative zero and unsafe integers', () => {
    const text = canonicalNativeJson(hello())
    for (const bad of [
      text.replace('"version":', '"version":"M06_NATIVE_SOURCE_V12","version":'),
      text.replace('"nativeTick":0', '"nativeTick":0.0'),
      text.replace('"nativeTick":0', '"nativeTick":-0'),
      text.replace('"nativeTick":0', '"nativeTick":9007199254740992'),
      text.replace('"kind":"HELLO"', '"kind":"FAKE"'),
      text.replace('"payload":{', '"payload":{"secret":"credential",'),
    ])
      expect(() => new NativeFrameDecoder().push(bytes(bad))).toThrow()
    expect(() => validateNativeFrame({ ...hello(), extra: true })).toThrow()
    expect(() => canonicalNativeJson({ x: -1 })).toThrow()
  })
  it('rejects invalid UTF8, BOM, zero/oversize lengths, depth overflow and partial EOF without resync', () => {
    for (const raw of [
      Buffer.from([0, 0, 0, 0]),
      Buffer.from([0, 1, 0, 1]),
      Buffer.from([0, 0, 0, 1, 255]),
      bytes('\ufeff' + canonicalNativeJson(hello())),
    ])
      expect(() => new NativeFrameDecoder().push(raw)).toThrow()
    let deep: unknown = null
    for (let n = 0; n < 18; n++) deep = [deep]
    expect(() => canonicalNativeJson(deep)).toThrow('depth')
    const decoder = new NativeFrameDecoder()
    decoder.push(encodeNativeFrame(hello()).subarray(0, 11))
    expect(() => decoder.end()).toThrow('partial_eof')
    expect(() => decoder.push(encodeNativeFrame(hello()))).toThrow()
    expect(() =>
      nativeFrame(
        binding,
        'MCP_REQUEST',
        {
          messageJson: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: { x: 'x'.repeat(nativeSourceBounds.mcpBytes) },
          }),
        },
        { mcpRequestId: { type: 'number', value: 1 } },
      ),
    ).toThrow('mcp_text_size')
  })
  it('checks all strict metadata/control projections and tagged MCP request IDs', () => {
    const vectors: [Parameters<typeof nativeFrame>[1], Record<string, unknown>][] = [
      ['BOOTSTRAP', { binding }],
      ['HELLO', { profileDigest: digest, protocolDigest: nativeProtocolDigest }],
      ['BOOTSTRAP_ACK', { helperClosed: true }],
      ['RESERVATION_DURABLE', { route: 'appraise.mcp', endpointId: 'assignment', payloadDigest: digest, maxBytes: 9 }],
      ['RESERVATION_ACK', { tokenId: 'token', operationId: 'op', head: digest }],
      ['ATTEMPT_ENTERED', { route: 'ws.direct' }],
      ['WRITE_ATTEMPT', { start: 0, end: 3, rawDigest: digest }],
      ['WRITE_PROGRESS', { start: 0, end: 3, rawDigest: digest }],
      [
        'RAW_INPUT',
        {
          rawSequence: 1,
          bytes: 3,
          rawDigest: digest,
          eventName: 'UNKNOWN',
          responseId: null,
          itemId: null,
          callId: null,
          parseDisposition: 'UNKNOWN',
        },
      ],
      [
        'PARSE_DISPOSITION',
        {
          rawSequence: 1,
          rawDigest: digest,
          eventName: 'MALFORMED',
          parseDisposition: 'MALFORMED',
          responseId: null,
          itemId: null,
          callId: null,
        },
      ],
      [
        'MCP_CALL',
        { requestHash: digest, profileDigest: digest, responseId: 'response', itemId: 'item', callId: 'call' },
      ],
      ['APPRAISE_ACCEPTANCE', { joinDigest: digest, acceptanceId: 'row' }],
      ['LOCAL_CLOSE', { complete: true }],
      ['FENCE', { reason: 'deadline' }],
      ['UNKNOWN', { reason: 'abort' }],
      [
        'RANGE_SEAL',
        {
          head: digest,
          operations: 1,
          frames: 7,
          rpcIssuedRequests: 0,
          rpcWrittenBytes: 0,
          rpcObservedRequests: 0,
          rpcInputRecords: 0,
          rpcSenderSealDigest: digest,
        },
      ],
      ['MCP_REQUEST', { messageJson: JSON.stringify({ jsonrpc: '2.0', id: 'string.id', method: 'tools/list' }) }],
      ['MCP_REPLY', { messageJson: JSON.stringify({ jsonrpc: '2.0', id: 'string.id', result: {} }) }],
    ]
    for (const [kind, payload] of vectors) {
      const frame = nativeFrame(
        binding,
        kind,
        payload,
        ['MCP_REQUEST', 'MCP_REPLY'].includes(kind) ? { mcpRequestId: { type: 'string', value: 'string.id' } } : {},
      )
      expect(new NativeFrameDecoder().push(encodeNativeFrame(frame))).toEqual([frame])
      expect(() => nativeFrame(binding, kind, { ...payload, extra: 'refused' })).toThrow()
    }
    expect(() =>
      nativeFrame(
        binding,
        'HELLO',
        { profileDigest: digest, protocolDigest: nativeProtocolDigest },
        { mcpRequestId: { type: 'number', value: 1.5 } },
      ),
    ).toThrow()
  })
})

it('retains exact transient SDK JSON bytes with negative errors, fractions, exponents, Unicode and escaped controls', () => {
  const vectors = [
    '{"jsonrpc":"2.0","id":1,"error":{"code":-32602,"message":"Invalid params"}}',
    '{ "jsonrpc":"2.0", "id":"string.id", "method":"tools/call", "params":{"name":"fixture","arguments":{"x":0.25,"y":-1.5,"z":1e-7,"text":"雪\\n\\u0000"}} }',
    '{"jsonrpc":"2.0","id":1,"result":{"signed":-3.2e+12,"zero":-0,"unicode":"\\ud83d\\ude80"}}',
  ]
  for (const messageJson of vectors) {
    const message = parseNativeMcpJson(messageJson)
    const id = 'id' in message && message.id !== undefined ? message.id : 1
    const frame = nativeFrame(
      binding,
      'MCP_REPLY',
      { messageJson },
      { mcpRequestId: typeof id === 'number' ? { type: 'number', value: id } : { type: 'string', value: id } },
    )
    const decoded = new NativeFrameDecoder().push(encodeNativeFrame(frame))[0]
    expect(decoded.payload.messageJson).toBe(messageJson)
    expect(nativeDigest(decoded.payload.messageJson as string)).toBe(nativeDigest(Buffer.from(messageJson)))
  }
  expect(() =>
    nativeFrame(
      binding,
      'MCP_REQUEST',
      { message: { jsonrpc: '2.0', id: 1, method: 'ping' } },
      { mcpRequestId: { type: 'number', value: 1 } },
    ),
  ).toThrow()
  expect(() =>
    nativeFrame(binding, 'MCP_REQUEST', { messageJson: vectors[0] }, { mcpRequestId: { type: 'string', value: '1' } }),
  ).toThrow('id_mismatch')
})

it('strictly rejects ambiguous/invalid transient text and keeps independent inner/outer byte/depth limits', () => {
  const invalid = [
    '{"jsonrpc":"2.0","id":1,"id":2,"method":"ping"}',
    '{"jsonrpc":"2.0","id":1,"method":"ping","params":{"x":1,"\\u0078":2}}',
    '{"jsonrpc":"2.0","id":1,"method":"ping","params":{"x":1e400}}',
    '{"jsonrpc":"2.0","id":1,"method":"ping","params":{"x":"\\ud800"}}',
    '{"jsonrpc":"2.0","id":1,"method":"ping","params":{"x":"\\udc00"}}',
    '\ufeff{"jsonrpc":"2.0","id":1,"method":"ping"}',
    '{"jsonrpc":"2.0","id":-0,"method":"ping"}',
    '{"jsonrpc":"2.0","id":-1,"method":"ping"}',
    '{"jsonrpc":"2.0","id":1.5,"method":"ping"}',
    '{"jsonrpc":"2.0","id":9007199254740992,"method":"ping"}',
    '{"jsonrpc":"2.0","id":1,"method":"ping",}',
  ]
  for (const text of invalid) expect(() => parseNativeMcpJson(text)).toThrow()
  expect(() => parseNativeMcpJson(Buffer.from([255]))).toThrow()
  let nested: unknown = 0
  for (let n = 0; n < 17; n++) nested = [nested]
  expect(() =>
    parseNativeMcpJson(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: { nested } })),
  ).toThrow('depth')
  const escaped = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { text: '\\'.repeat(30000) } })
  expect(Buffer.byteLength(escaped)).toBeLessThan(65536)
  expect(() =>
    encodeNativeFrame(
      nativeFrame(binding, 'MCP_REPLY', { messageJson: escaped }, { mcpRequestId: { type: 'number', value: 1 } }),
    ),
  ).toThrow('frame_size')
  expect(() =>
    parseNativeMcpJson(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { text: '雪'.repeat(22000) } })),
  ).toThrow('mcp_text_size')
})

it('preserves nested JSON containers and rejects malformed object, array and string boundaries', () => {
  for (const result of [{}, { empty: [] }, { nested: [{}, [true, false, null, 'escaped"\\']] }]) {
    const message = { jsonrpc: '2.0', id: 1, result }
    expect(parseNativeMcpJson(JSON.stringify(message))).toEqual(message)
  }
  const prefix = '{"jsonrpc":"2.0","id":1,"result":'
  const invalid = [
    ['{x:1}}', 'mcp_object_key'],
    ['{"x" 1}}', 'mcp_object_colon'],
    ['{"x":1;"y":2}}', 'mcp_object_separator'],
    ['{', 'mcp_object_eof'],
    ['[1;2]}', 'mcp_array_separator'],
    ['[', 'mcp_array_eof'],
    ['"control\u001f"}', 'mcp_string_control'],
    ['"unfinished', 'mcp_string_eof'],
  ]
  for (const [body, reason] of invalid) expect(() => parseNativeMcpJson(prefix + body)).toThrow(reason)
})

it('keeps the decoder fenced after invalid frame lengths', () => {
  for (const header of [Buffer.from([0, 0, 0, 0]), Buffer.from([0, 1, 0, 1])]) {
    const decoder = new NativeFrameDecoder()
    expect(() => decoder.push(header)).toThrow('frame_size')
    expect(() => decoder.push(encodeNativeFrame(hello()))).toThrow('decoder_failed')
    expect(() => decoder.end()).toThrow('partial_eof')
  }
})

it('freezes raw custody schema and restriction-only control without accepting legacy peer shapes', () => {
  const raw = {
    rawSequence: 1,
    rawDigest: digest,
    bytes: 10,
    eventName: 'UNKNOWN',
    parseDisposition: 'PENDING',
    responseId: null,
    itemId: null,
    callId: null,
  }
  expect(nativeFrame(binding, 'RAW_INPUT', raw).payload.parseDisposition).toBe('PENDING')
  const legacy: Partial<typeof raw> = { ...raw }
  delete legacy.rawSequence
  expect(() => nativeFrame(binding, 'RAW_INPUT', legacy)).toThrow()
  expect(() => nativeFrame(binding, 'PARSE_DISPOSITION', { ...raw, bytes: undefined })).toThrow()
  const poison = nativeFrame(binding, 'ADMISSION_POISON', { reason: 'parser_fault' }, { disposition: 'UNKNOWN' })
  expect(poison.lane).toBe('CONTROL')
  expect(() =>
    nativeFrame(binding, 'ADMISSION_POISON', { reason: 'parser_fault' }, { disposition: 'UNKNOWN', lane: 'SOURCE' }),
  ).toThrow('control_lane')
  expect(nativeProtocolDigest).toBe(
    nativeDigest('M06_NATIVE_SOURCE_PROTOCOL_V12:MESSAGE_JSON_V1:RPC_CLOSURE_V1:RAW_PARSE_CUSTODY_V1'),
  )
})
