import { rpcDeliveredIdsDigest, rpcSenderSealDigest } from './native-source-protocol'
import { describe, expect, it } from 'vitest'
import { NativeRangeVerifier } from './native-range-verifier'
import { nativeDigest, nativeFrame, nativeProtocolDigest, type NativeSourceBinding } from './native-source-protocol'
const d = nativeDigest('test')
const b: NativeSourceBinding = {
  runId: 'run',
  intentId: 'intent',
  sendBoundaryId: 'boundary',
  claimEpoch: 1,
  providerNamespace: 'fixture',
  configurationDigest: d,
  transportId: 'rpc',
  transportIncarnation: 'inc',
  ownerIncarnation: 'owner',
  channelIncarnation: 'channel',
  protocolDigest: nativeProtocolDigest,
  routeProfileDigest: d,
  mcpProfileDigest: d,
  nonce: 'nonce',
  deadlineId: 'deadline',
  parentClockEpoch: 'clock',
  clockContractId: null,
  nativeClockEpoch: null,
}
const emptyManifest = {
  sealId: 'seal',
  transportId: b.transportId,
  transportIncarnation: b.transportIncarnation,
  issuedRequests: 0,
  attemptedBytes: 0,
  allocations: [],
  attempts: [],
} as const
function emptyRpc(v: NativeRangeVerifier) {
  v.captureRpcSenderManifest(emptyManifest)
  v.observe(
    nativeFrame(
      b,
      'RPC_EOF',
      {
        route: 'rpc.stdio',
        receivedBytes: 0,
        records: 0,
        observedRequests: 0,
        observedIdsDigest: rpcDeliveredIdsDigest([]),
      },
      { transportIncarnation: b.transportIncarnation },
    ),
  )
}
function fixture(verifier = new NativeRangeVerifier()) {
  let sequence = 0
  const source = { operationId: 'source', attemptId: 'source.attempt', transportIncarnation: 'source.ws' }
  const child = {
    operationId: 'mcp',
    parentOperationId: 'source',
    attemptId: 'mcp.attempt',
    transportIncarnation: 'channel',
    sourceCallId: 'call',
    mcpRequestId: { type: 'number' as const, value: 1 },
  }
  const frame = (
    kind: Parameters<typeof nativeFrame>[1],
    payload: Record<string, unknown>,
    extra: Partial<ReturnType<typeof nativeFrame>> = {},
  ) => nativeFrame(b, kind, payload, { ...source, sequence: ++sequence, ...extra })
  const observe = (
    kind: Parameters<typeof nativeFrame>[1],
    payload: Record<string, unknown>,
    extra: Partial<ReturnType<typeof nativeFrame>> = {},
  ) => {
    const value = frame(kind, payload, extra)
    verifier.observe(value)
    return value
  }
  const reserve = (extra = {}) =>
    observe('RESERVATION_DURABLE', { route: 'ws.direct', endpointId: 'endpoint', payloadDigest: d, maxBytes: 8 }, extra)
  const begin = () => {
    reserve()
    observe('ATTEMPT_ENTERED', { route: 'ws.direct' })
  }
  const raw = (fields: Record<string, unknown> = {}, extra = {}) =>
    observe(
      'RAW_INPUT',
      {
        rawSequence: sequence + 1,
        bytes: 11,
        rawDigest: d,
        eventName: 'UNKNOWN',
        parseDisposition: 'PENDING',
        responseId: null,
        itemId: null,
        callId: null,
        ...fields,
      },
      extra,
    )
  const finish = (record: ReturnType<typeof nativeFrame>, fields: Record<string, unknown> = {}, extra = {}) =>
    observe(
      'PARSE_DISPOSITION',
      {
        rawSequence: record.payload.rawSequence,
        rawDigest: record.payload.rawDigest,
        eventName: record.payload.eventName,
        parseDisposition: 'KNOWN',
        responseId: record.payload.responseId,
        itemId: record.payload.itemId,
        callId: record.payload.callId,
        ...fields,
      },
      extra,
    )
  const created = () => {
    const record = raw({ eventName: 'response.created', responseId: 'response' })
    finish(record)
    return record
  }
  const origin = () => {
    created()
    const record = raw({ eventName: 'response.output_item.done', itemId: 'item', callId: 'call' })
    finish(record, { responseId: 'response' })
    return record
  }
  const project = (record: ReturnType<typeof nativeFrame>) => {
    observe(
      'RESERVATION_DURABLE',
      { route: 'appraise.mcp', endpointId: 'assignment', payloadDigest: d, maxBytes: 65536 },
      child,
    )
    observe('ATTEMPT_ENTERED', { route: 'appraise.mcp' }, child)
    observe('RAW_INPUT', { ...record.payload, parseDisposition: 'KNOWN', responseId: 'response' }, child)
  }
  const seal = (extra = {}) => {
    emptyRpc(verifier)
    const snapshot = verifier.snapshot()
    verifier.seal(
      nativeFrame(
        b,
        'RANGE_SEAL',
        {
          head: d,
          operations: snapshot.operations,
          frames: snapshot.frames,
          rpcIssuedRequests: 0,
          rpcWrittenBytes: 0,
          rpcObservedRequests: 0,
          rpcInputRecords: 0,
          rpcSenderSealDigest: rpcSenderSealDigest(emptyManifest),
        },
        extra,
      ),
      d,
    )
  }
  return { verifier, frame, observe, begin, reserve, raw, finish, created, origin, project, source, child, seal }
}
describe('native original range verifier raw parser custody', () => {
  it('retains actual partial writes and closes a finalized original range', () => {
    const f = fixture()
    f.begin()
    f.observe('WRITE_ATTEMPT', { start: 0, end: 8, rawDigest: d })
    f.observe('WRITE_PROGRESS', { start: 0, end: 3, rawDigest: d })
    f.observe('WRITE_PROGRESS', { start: 3, end: 8, rawDigest: d })
    const raw = f.raw()
    f.finish(raw, { eventName: 'response.completed' })
    f.observe('LOCAL_CLOSE', { complete: true })
    f.seal()
    expect(f.verifier.snapshot()).toMatchObject({
      sealed: true,
      unknown: false,
      pendingParses: 0,
      writtenBytes: 8,
      rawBytes: 11,
    })
  })
  it('resolves queued raw lineage from preceding finalized parser context, never provisional owner state', () => {
    const f = fixture()
    f.begin()
    const created = f.raw({ responseId: 'response', eventName: 'response.created' })
    const callable = f.raw({ itemId: 'item', callId: 'call', eventName: 'UNKNOWN' })
    expect(f.verifier.snapshot().pendingParses).toBe(2)
    f.finish(created)
    f.finish(callable, { eventName: 'response.output_item.done', responseId: 'response' })
    f.project(callable)
    expect(f.verifier.snapshot().unknown).toBe(false)
    expect(f.verifier.snapshot().graphDigest).toContain('"eventName":"UNKNOWN"')
  })
  it('resolves a queued new response before its callable despite earlier finalized and interleaved contexts', () => {
    const f = fixture()
    f.begin()
    f.created()
    const created = f.raw({ eventName: 'response.created', responseId: 'new.response' })
    const callable = f.raw({ eventName: 'response.output_item.done', itemId: 'item', callId: 'call' })
    const other = { operationId: 'other', attemptId: 'other.attempt', transportIncarnation: 'other.ws' }
    f.reserve(other)
    f.observe('ATTEMPT_ENTERED', { route: 'ws.direct' }, other)
    const foreign = f.raw({ eventName: 'response.created', responseId: 'foreign.response' }, other)
    f.finish(foreign, {}, other)
    f.finish(created)
    f.finish(callable, { responseId: 'new.response' })
    expect(f.verifier.snapshot()).toMatchObject({ pendingParses: 0, unknown: false })
    expect(f.verifier.snapshot().graphDigest).toContain('"responseId":"new.response"')
  })
  it('rejects pump-ahead completion, prior-response conflicts and foreign operation context', () => {
    for (const mode of ['ahead', 'previous', 'foreign'] as const) {
      const f = fixture()
      f.begin()
      const created = f.raw({ responseId: 'response', eventName: 'response.created' })
      if (mode !== 'ahead') f.finish(created)
      if (mode === 'foreign') {
        f.reserve({ operationId: 'other', attemptId: 'other.attempt' })
        f.observe('ATTEMPT_ENTERED', { route: 'ws.direct' }, { operationId: 'other', attemptId: 'other.attempt' })
      }
      const extra = mode === 'foreign' ? { operationId: 'other', attemptId: 'other.attempt' } : {}
      const raw = f.raw(
        { itemId: 'item', callId: 'call', ...(mode === 'previous' ? { responseId: 'old' } : {}) },
        extra,
      )
      expect(() => f.finish(raw, { responseId: mode === 'previous' ? 'old' : 'response' }, extra)).toThrow()
      expect(f.verifier.snapshot().unknown).toBe(true)
    }
  })
  it('rejects orphan, duplicate, mismatched, unresolved and invented parser lineage', () => {
    const orphan = fixture()
    orphan.begin()
    expect(() =>
      orphan.observe(
        'PARSE_DISPOSITION',
        {
          rawSequence: 9,
          rawDigest: d,
          eventName: 'MALFORMED',
          parseDisposition: 'MALFORMED',
          responseId: null,
          itemId: null,
          callId: null,
        },
        { disposition: 'MALFORMED' },
      ),
    ).toThrow('orphan')
    for (const mode of ['duplicate', 'digest', 'explicit', 'invented', 'unresolved'] as const) {
      const f = fixture()
      f.begin()
      const raw = f.raw({ responseId: 'explicit' })
      if (mode === 'duplicate') f.finish(raw)
      expect(() =>
        mode === 'unresolved'
          ? f.observe('LOCAL_CLOSE', { complete: true })
          : f.finish(
              raw,
              mode === 'digest'
                ? { rawDigest: nativeDigest('other') }
                : mode === 'explicit'
                  ? { responseId: 'changed' }
                  : mode === 'invented'
                    ? { itemId: 'invented' }
                    : {},
            ),
      ).toThrow()
      expect(f.verifier.snapshot().unknown).toBe(true)
    }
  })
  it('never promotes an unresolved raw observation into a callable origin or a clear seal', () => {
    const f = fixture()
    f.begin()
    f.raw({ eventName: 'response.output_item.done', responseId: 'response', itemId: 'item', callId: 'call' })
    expect(f.verifier.snapshot()).toMatchObject({ unknown: false, pendingParses: 1 })
    expect(() => f.seal()).toThrow('incomplete_source_range')
    const projected = fixture()
    projected.begin()
    const raw = projected.raw({
      eventName: 'response.output_item.done',
      responseId: 'response',
      itemId: 'item',
      callId: 'call',
    })
    expect(() => projected.project(raw)).toThrow('descendant')
  })
  it('never clears final faults and blocks subsequent reservation, attempt or dispatch', () => {
    const f = fixture()
    f.begin()
    const raw = f.raw()
    f.finish(raw, { eventName: 'MALFORMED', parseDisposition: 'MALFORMED' }, { disposition: 'MALFORMED' })
    expect(f.verifier.snapshot()).toMatchObject({ unknown: true, admissionPoisoned: true })
    expect(() => f.reserve({ operationId: 'later', attemptId: 'later.attempt' })).toThrow('admission_poisoned')
    f.observe('LOCAL_CLOSE', { complete: true })
    expect(() => f.seal()).toThrow('incomplete_source_range')
  })
  it('validates every fast path and contradictory inner/outer facts before clear seal', () => {
    for (const [kind, payload] of [
      ['HELLO', { profileDigest: d, protocolDigest: nativeProtocolDigest }],
      [
        'RPC_EOF',
        {
          route: 'rpc.stdio',
          receivedBytes: 0,
          records: 0,
          observedRequests: 0,
          observedIdsDigest: rpcDeliveredIdsDigest([]),
        },
      ],
      ['MCP_REQUEST', { messageJson: '{"jsonrpc":"2.0","id":1,"method":"ping"}' }],
    ] as const) {
      const f = fixture()
      if (kind === 'RPC_EOF') f.verifier.captureRpcSenderManifest(emptyManifest)
      f.verifier.observe(
        nativeFrame(b, kind, payload, {
          disposition: 'UNKNOWN',
          transportIncarnation: b.transportIncarnation,
          ...(kind === 'MCP_REQUEST' ? { mcpRequestId: { type: 'number', value: 1 } } : {}),
        }),
      )
      expect(f.verifier.snapshot().unknown).toBe(true)
    }
    const seal = fixture()
    expect(() => seal.seal({ disposition: 'MALFORMED' })).toThrow()
    const contradiction = fixture()
    contradiction.begin()
    expect(() => contradiction.raw({ parseDisposition: 'MALFORMED' })).toThrow('contradictory')
    expect(contradiction.verifier.snapshot().unknown).toBe(true)
  })
  it('accepts only final original parent projections and binds original tagged MCP IDs through acceptance', () => {
    for (const id of [1, 2, '1'] as const) {
      const f = fixture()
      f.begin()
      const raw = f.origin()
      f.project(raw)
      const messageJson = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: 'fixture', arguments: {} },
      })
      f.observe(
        'MCP_CALL',
        {
          requestHash: nativeDigest(messageJson),
          profileDigest: d,
          responseId: 'response',
          itemId: 'item',
          callId: 'call',
        },
        f.child,
      )
      const request = f.frame(
        'MCP_REQUEST',
        { messageJson },
        {
          ...f.child,
          mcpRequestId: typeof id === 'number' ? { type: 'number', value: id } : { type: 'string', value: id },
        },
      )
      if (id !== 1) {
        expect(() => f.verifier.bindMcpRequest(request)).toThrow('commitment')
        continue
      }
      f.verifier.bindMcpRequest(request)
      f.observe('APPRAISE_ACCEPTANCE', { joinDigest: d, acceptanceId: 'row' }, f.child)
      f.observe('LOCAL_CLOSE', { complete: true }, f.child)
      f.observe('LOCAL_CLOSE', { complete: true })
      f.seal()
      expect(f.verifier.snapshot()).toMatchObject({ sealed: true, unknown: false })
    }
    const f = fixture()
    f.begin()
    const record = f.origin()
    f.observe(
      'RESERVATION_DURABLE',
      { route: 'appraise.mcp', endpointId: 'assignment', payloadDigest: d, maxBytes: 65536 },
      f.child,
    )
    f.observe('ATTEMPT_ENTERED', { route: 'appraise.mcp' }, f.child)
    expect(() =>
      f.observe(
        'RAW_INPUT',
        { ...record.payload, parseDisposition: 'KNOWN', responseId: 'response', rawSequence: 99 },
        f.child,
      ),
    ).toThrow('parent_raw')
  })
  it('reserves finalization and control frame capacity without increasing bounds', () => {
    const f = fixture()
    f.begin()
    for (let index = 0; index < 240; index++)
      f.observe('HELLO', { profileDigest: d, protocolDigest: nativeProtocolDigest })
    for (let index = 0; index < 6; index++) f.raw()
    expect(() => f.raw()).toThrow('capacity')
    expect(f.verifier.snapshot().unknown).toBe(true)
  })
})

it('requires exact independently received RPC bytes/actual IDs, distinguishes allocation holes, and rejects fake receipt substitutions', () => {
  const rawDigest = nativeDigest('actual original JSONL bytes'),
    manifest = {
      sealId: 'seal',
      transportId: b.transportId,
      transportIncarnation: b.transportIncarnation,
      issuedRequests: 2,
      attemptedBytes: 27,
      allocations: [
        { id: 1, state: 'NOT_EMITTED' as const },
        { id: 2, state: 'ATTEMPTED' as const },
      ],
      attempts: [{ requestId: 2, start: 0, end: 27, rawDigest }],
    }
  const f = (kind: Parameters<typeof nativeFrame>[1], payload: Record<string, unknown>, id: number | null = 2) =>
    nativeFrame(b, kind, payload, { transportIncarnation: b.transportIncarnation, rpcRequestId: id })
  const input = {
    route: 'rpc.stdio',
    recordOrdinal: 0,
    start: 0,
    end: 27,
    rawDigest,
    framing: 'LF',
    messageKind: 'REQUEST',
    parseDisposition: 'KNOWN',
  }
  const v = new NativeRangeVerifier()
  v.captureRpcSenderManifest(manifest)
  v.observe(f('RPC_INPUT', input))
  v.observe(f('RPC_WORK', { route: 'rpc.stdio', recordOrdinal: 0, state: 'QUEUED' }))
  v.observe(f('RPC_WORK', { route: 'rpc.stdio', recordOrdinal: 0, state: 'DISPATCHED' }))
  v.observe(f('RPC_WORK', { route: 'rpc.stdio', recordOrdinal: 0, state: 'SETTLED' }))
  v.observe(
    f(
      'RPC_EOF',
      {
        route: 'rpc.stdio',
        receivedBytes: 27,
        records: 1,
        observedRequests: 1,
        observedIdsDigest: rpcDeliveredIdsDigest([2]),
      },
      null,
    ),
  )
  v.seal(
    nativeFrame(b, 'RANGE_SEAL', {
      head: d,
      operations: 0,
      frames: 5,
      rpcIssuedRequests: 2,
      rpcWrittenBytes: 27,
      rpcObservedRequests: 1,
      rpcInputRecords: 1,
      rpcSenderSealDigest: rpcSenderSealDigest(manifest),
    }),
    d,
  )
  expect(v.snapshot()).toMatchObject({ sealed: true, rpcObservedRequests: 1 })
  for (const [changed, id] of [
    [{ ...input, start: 1 }, 2],
    [{ ...input, rawDigest: d }, 2],
    [input, 1],
    [{ ...input, framing: 'EOF_PARTIAL' }, 2],
  ] as const) {
    const invalid = new NativeRangeVerifier()
    invalid.captureRpcSenderManifest(manifest)
    expect(() => invalid.observe(f('RPC_INPUT', changed, id))).toThrow()
  }
  const echoed = new NativeRangeVerifier()
  echoed.captureRpcSenderManifest(manifest)
  expect(() =>
    echoed.observe(
      f(
        'RPC_EOF',
        {
          route: 'rpc.stdio',
          receivedBytes: 27,
          records: 1,
          observedRequests: 2,
          observedIdsDigest: rpcDeliveredIdsDigest([1, 2]),
        },
        null,
      ),
    ),
  ).toThrow()
  const queued = new NativeRangeVerifier()
  queued.captureRpcSenderManifest(manifest)
  queued.observe(f('RPC_INPUT', input))
  queued.observe(f('RPC_WORK', { route: 'rpc.stdio', recordOrdinal: 0, state: 'QUEUED' }))
  queued.observe(
    f(
      'RPC_EOF',
      {
        route: 'rpc.stdio',
        receivedBytes: 27,
        records: 1,
        observedRequests: 1,
        observedIdsDigest: rpcDeliveredIdsDigest([2]),
      },
      null,
    ),
  )
  expect(() => queued.observe(f('RPC_WORK', { route: 'rpc.stdio', recordOrdinal: 0, state: 'DISPATCHED' }))).toThrow(
    'transition',
  )
})

it('exposes detached frozen output observations without allowing snapshots to rewrite original source evidence', () => {
  const v = new NativeRangeVerifier()
  for (const phase of ['ATTEMPT', 'PROGRESS'] as const)
    v.observe(
      nativeFrame(
        b,
        'RPC_OUTPUT',
        { route: 'rpc.stdio', writeOrdinal: 0, phase, start: 0, end: 7, rawDigest: d },
        { transportIncarnation: b.transportIncarnation },
      ),
    )
  const record = v.snapshot().rpcOutputRecords[0]
  expect(Object.isFrozen(record)).toBe(true)
  expect(Reflect.set(record, 'rawDigest', nativeDigest('forged'))).toBe(false)
  expect(v.snapshot().rpcOutputRecords[0].rawDigest).toBe(d)
})

it('poisons admission for an already reserved attempt without clearing retained evidence', () => {
  const verifier = new NativeRangeVerifier()
  const f = fixture(verifier)
  f.reserve()
  const before = verifier.snapshot()
  verifier.poisonAdmission()
  expect(() => f.observe('ATTEMPT_ENTERED', { route: 'ws.direct' })).toThrow('admission_poisoned')
  expect(verifier.snapshot()).toMatchObject({
    operations: before.operations,
    graphDigest: before.graphDigest,
    admissionPoisoned: true,
    unknown: true,
    sealed: false,
  })
  expect(() => f.reserve({ operationId: 'later', attemptId: 'later.attempt' })).toThrow('admission_poisoned')
  expect(verifier.snapshot().operations).toBe(1)
})

it('rejects replay of the exact committed MCP request and preserves the original dispatched graph', () => {
  const verifier = new NativeRangeVerifier()
  const f = fixture(verifier)
  f.begin()
  f.project(f.origin())
  const messageJson = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'fixture' } })
  f.observe(
    'MCP_CALL',
    {
      requestHash: nativeDigest(messageJson),
      profileDigest: d,
      responseId: 'response',
      itemId: 'item',
      callId: 'call',
    },
    f.child,
  )
  const request = f.frame('MCP_REQUEST', { messageJson }, f.child)
  verifier.bindMcpRequest(request)
  const before = verifier.snapshot()
  expect(before).toMatchObject({ unknown: false, issuedRequests: 1, sealed: false })
  expect(() => verifier.bindMcpRequest(request)).toThrow('mcp_request_commitment_or_replay')
  expect(verifier.snapshot()).toMatchObject({ unknown: true, graphDigest: before.graphDigest, issuedRequests: 1 })
})
