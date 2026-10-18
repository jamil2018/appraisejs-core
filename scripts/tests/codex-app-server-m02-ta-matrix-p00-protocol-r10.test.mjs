import assert from 'node:assert/strict'
import test from 'node:test'
import { TrustedMatrixAppServerPeer } from './fixtures/codex-app-server-m02-ta-matrix-r10/protocol-p00.mjs'

const encode = frame => Buffer.from(`${JSON.stringify(frame)}\n`)
const failed = (overrides = {}) => ({
  method: 'mcpServer/startupStatus/updated',
  params: {
    name: 'appraise_m02',
    status: 'failed',
    threadId: 'thread-1',
    error: 'local fixture MCP handshake failed',
    failureReason: null,
    ...overrides,
  },
})
const starting = (overrides = {}) => ({
  method: 'mcpServer/startupStatus/updated',
  params: { name: 'appraise_m02', status: 'starting', threadId: 'thread-1', ...overrides },
})
const rpcError = (overrides = {}) => ({
  id: 'P00-thread-start',
  error: {
    code: -32603,
    message: 'error creating thread: Fatal error: required MCP servers failed to initialize: appraise_m02',
    data: null,
    ...overrides,
  },
})

function harness({
  telemetryVerifier = () => true,
  rpcVerifier = () => true,
  caseId = 'P00',
  withMcpStart = true,
} = {}) {
  const pending = withMcpStart ? [{ kind: 'mcpStarts', id: 'mcp-1' }] : []
  const sent = []
  const acknowledged = []
  const failures = []
  let fenced = false
  let telemetryChecks = 0
  let rpcChecks = 0
  const journal = {
    snapshot: () => ({ pending, fenced, seq: sent.length }),
    acknowledge: async id => {
      acknowledged.push(id)
      const index = pending.findIndex(entry => entry.id === id)
      if (index >= 0) pending.splice(index, 1)
    },
    markUnknown: async () => {
      fenced = true
    },
  }
  const coordinator = {
    perform: async (kind, id, effect) => {
      pending.push({ kind, id })
      const result = await effect({ kind, id })
      if (result?.acknowledged !== false) await journal.acknowledge(id)
      return result
    },
    denyPermission: async ({ requestId, threadId, expectedThreadId, turnId, expectedTurnId, send }) => {
      assert.equal(threadId, expectedThreadId)
      assert.equal(turnId, expectedTurnId)
      return coordinator.perform('permissionReplies', `permission-${requestId}`, reservation =>
        send({ id: requestId, result: { permissions: {}, scope: 'turn' } }, reservation),
      )
    },
  }
  const peer = new TrustedMatrixAppServerPeer({
    caseId,
    coordinator,
    journal,
    threadStartParams: { cwd: '/private/tmp/appraise-m02-ta-matrix-p1/cases/P00/workspace' },
    verifyRequiredMcpTelemetry: (params, context) => {
      telemetryChecks++
      return telemetryVerifier(params, context)
    },
    verifyRequiredMcpFailure: (error, context) => {
      rpcChecks++
      return rpcVerifier(error, context)
    },
    verifyMcpStartup: () => true,
    verifyPermissionRequest: () => true,
    verifyPermissionTerminal: () => true,
    write: async bytes => {
      sent.push(JSON.parse(bytes))
      return bytes.length
    },
    onFailure: details => {
      failures.push(details)
    },
  })
  return {
    peer,
    sent,
    acknowledged,
    failures,
    fenced: () => fenced,
    telemetryChecks: () => telemetryChecks,
    rpcChecks: () => rpcChecks,
  }
}

async function threadPending(h) {
  await h.peer.request('initialize', {}, 'P00-initialize')
  await h.peer.feed(encode({ id: 'P00-initialize', result: { userAgent: 'fixture' } }))
  assert.deepEqual(
    h.sent.map(frame => frame.method),
    ['initialize', 'initialized', 'thread/start'],
  )
  assert.equal(h.peer.snapshot().pending, 'P00-thread-start')
}

test('P00 starting then one verified failed telemetry awaits correlated RPC error before EOF', async () => {
  const h = harness({
    telemetryVerifier: (params, context) => {
      assert.equal(params.error, 'local fixture MCP handshake failed')
      assert.deepEqual(context, { caseId: 'P00', threadStartId: 'P00-thread-start', provisionalThreadId: 'thread-1' })
      return true
    },
    rpcVerifier: (error, context) => {
      assert.equal(error.code, -32603)
      assert.ok(error.message.startsWith('error creating thread:'))
      assert.ok(error.message.includes('required MCP servers failed to initialize'))
      assert.ok(error.message.includes('appraise_m02'))
      assert.deepEqual(context, {
        caseId: 'P00',
        threadStartId: 'P00-thread-start',
        provisionalThreadId: 'thread-1',
        failedTelemetryObserved: true,
      })
      return true
    },
  })
  await threadPending(h)
  await h.peer.feed(Buffer.concat([encode(starting()), encode(failed())]))
  assert.equal(h.peer.snapshot().mcpFailureObserved, true)
  assert.equal(h.peer.snapshot().phase, 'ready')
  assert.equal(h.acknowledged.includes('mcp-1'), false)
  assert.equal(h.telemetryChecks(), 1)
  assert.equal(h.rpcChecks(), 0)
  await h.peer.feed(encode(rpcError()))
  await h.peer.eof()
  assert.equal(h.peer.snapshot().phase, 'required-mcp-failed')
  assert.deepEqual(h.acknowledged.slice(-2), ['mcp-1', 'P00-thread-start'])
  assert.equal(h.rpcChecks(), 1)
  assert.equal(h.fenced(), false)
  assert.equal(h.sent.filter(frame => frame.method === 'turn/start').length, 0)
})

test('failed telemetry alone cannot qualify P00; verified RPC error can qualify without telemetry', async () => {
  const onlyTelemetry = harness()
  await threadPending(onlyTelemetry)
  await onlyTelemetry.peer.feed(encode(failed()))
  await assert.rejects(onlyTelemetry.peer.eof(), /UNKNOWN/)
  assert.equal(onlyTelemetry.acknowledged.includes('mcp-1'), false)

  const onlyRpc = harness({
    rpcVerifier: (_error, context) => {
      assert.equal(context.failedTelemetryObserved, false)
      assert.equal(context.provisionalThreadId, null)
      return true // synthetic selected-child failure and exit receipt supplied by this port
    },
  })
  await threadPending(onlyRpc)
  await onlyRpc.peer.feed(encode(rpcError()))
  await onlyRpc.peer.eof()
  assert.equal(onlyRpc.peer.snapshot().phase, 'required-mcp-failed')
  assert.equal(onlyRpc.rpcChecks(), 1)
  assert.equal(onlyRpc.telemetryChecks(), 0)
  assert.equal(onlyRpc.fenced(), false)
})

test('failed telemetry accepts schema-optional nullable error, reason, and thread ID', async () => {
  for (const optional of [
    { error: undefined, failureReason: undefined, threadId: undefined },
    { error: null, failureReason: null, threadId: null },
    { error: '', failureReason: null, threadId: 'thread-1' },
  ]) {
    const h = harness({
      telemetryVerifier: (params, context) => {
        assert.equal(params.failureReason, optional.failureReason)
        assert.equal(context.provisionalThreadId, optional.threadId ?? null)
        return true
      },
    })
    await threadPending(h)
    await h.peer.feed(encode(failed(optional)))
    assert.equal(h.peer.snapshot().mcpFailureObserved, true)
    await h.peer.feed(encode(rpcError()))
    await h.peer.eof()
    assert.equal(h.fenced(), false)
  }
})

test('P00 rejects foreign, auth, cancelled, malformed, oversized and unverified failures', async () => {
  const variants = [
    failed({ name: 'foreign' }),
    failed({ threadId: 'foreign-thread' }),
    failed({ failureReason: 'reauthenticationRequired' }),
    failed({ status: 'cancelled' }),
    failed({ error: 'x'.repeat(4097) }),
    failed({ unexpected: true }),
  ]
  for (const value of variants) {
    const h = harness()
    await threadPending(h)
    await h.peer.feed(encode(starting()))
    await assert.rejects(h.peer.feed(encode(value)), /UNKNOWN/)
    assert.equal(h.fenced(), true)
    assert.equal(h.acknowledged.includes('mcp-1'), false)
  }
  const verifier = harness({ telemetryVerifier: () => false })
  await threadPending(verifier)
  await assert.rejects(verifier.peer.feed(encode(failed())), /UNKNOWN/)
})

test('P00 rejects duplicate or ready-after-failed status and a mismatched RPC error', async () => {
  for (const next of [
    failed(),
    { method: 'mcpServer/startupStatus/updated', params: { name: 'appraise_m02', status: 'ready' } },
  ]) {
    const h = harness()
    await threadPending(h)
    await h.peer.feed(encode(failed()))
    await assert.rejects(h.peer.feed(encode(next)), /UNKNOWN/)
  }
  for (const value of [rpcError({ code: -32602 }), rpcError({ data: { foreign: true } })]) {
    const h = harness()
    await threadPending(h)
    await h.peer.feed(encode(failed()))
    await assert.rejects(h.peer.feed(encode(value)), /UNKNOWN/)
    assert.equal(h.rpcChecks(), 0)
  }
  const falseRpc = harness({ rpcVerifier: () => false })
  await threadPending(falseRpc)
  await falseRpc.peer.feed(encode(failed()))
  await assert.rejects(falseRpc.peer.feed(encode(rpcError())), /UNKNOWN/)
})

test('P00 fences ready startup both before failure and after an RPC-only verified failure', async () => {
  const readyFirst = harness()
  await threadPending(readyFirst)
  await assert.rejects(
    readyFirst.peer.feed(
      encode({ method: 'mcpServer/startupStatus/updated', params: { name: 'appraise_m02', status: 'ready' } }),
    ),
    /UNKNOWN/,
  )
  assert.equal(readyFirst.acknowledged.includes('mcp-1'), false)
  assert.equal(readyFirst.acknowledged.includes('P00-thread-start'), false)
  assert.equal(readyFirst.rpcChecks(), 0)

  const readyAfterRpc = harness()
  await threadPending(readyAfterRpc)
  await readyAfterRpc.peer.feed(encode(rpcError()))
  const acknowledgedBeforeReady = [...readyAfterRpc.acknowledged]
  await assert.rejects(
    readyAfterRpc.peer.feed(
      encode({ method: 'mcpServer/startupStatus/updated', params: { name: 'appraise_m02', status: 'ready' } }),
    ),
    /UNKNOWN/,
  )
  assert.deepEqual(readyAfterRpc.acknowledged, acknowledgedBeforeReady)
  assert.equal(readyAfterRpc.fenced(), true)
})

test('P00 fences a successful thread/start response before acknowledging its pending starts', async () => {
  for (const observedFailure of [false, true]) {
    const h = harness()
    await threadPending(h)
    if (observedFailure) await h.peer.feed(encode(failed()))
    await assert.rejects(
      h.peer.feed(encode({ id: 'P00-thread-start', result: { thread: { id: 'thread-1' } } })),
      /UNKNOWN/,
    )
    assert.equal(h.acknowledged.includes('mcp-1'), false)
    assert.equal(h.acknowledged.includes('P00-thread-start'), false)
    assert.equal(h.peer.snapshot().phase, 'ready')
    assert.equal(h.fenced(), true)
  }
  const afterRpc = harness()
  await threadPending(afterRpc)
  await afterRpc.peer.feed(encode(rpcError()))
  const acknowledgedBeforeSuccess = [...afterRpc.acknowledged]
  await assert.rejects(
    afterRpc.peer.feed(encode({ id: 'P00-thread-start', result: { thread: { id: 'thread-1' } } })),
    /UNKNOWN/,
  )
  assert.deepEqual(afterRpc.acknowledged, acknowledgedBeforeSuccess)
  assert.equal(afterRpc.fenced(), true)
})

test('P00 requires both verifiers; failure outside pending thread/start fences', async () => {
  assert.throws(
    () =>
      new TrustedMatrixAppServerPeer({
        caseId: 'P00',
        coordinator: {},
        journal: { snapshot: () => ({ pending: [] }) },
        write: () => {},
      }),
    /verifiers required/,
  )
  const beforeStart = harness()
  await assert.rejects(beforeStart.peer.feed(encode(failed())), /UNKNOWN/)
  assert.equal(beforeStart.telemetryChecks(), 0)

  const noRequiredChildStart = harness({ withMcpStart: false })
  await threadPending(noRequiredChildStart)
  await assert.rejects(noRequiredChildStart.peer.feed(encode(failed())), /UNKNOWN/)
  assert.equal(noRequiredChildStart.telemetryChecks(), 0)

  const noChildForRpc = harness({ withMcpStart: false })
  await threadPending(noChildForRpc)
  await assert.rejects(noChildForRpc.peer.feed(encode(rpcError())), /UNKNOWN/)
  assert.equal(noChildForRpc.rpcChecks(), 0)
})

test('B14 in the copied peer still uses empty denial and normal completed terminal', async () => {
  const h = harness({ caseId: 'B14' })
  await h.peer.request('initialize', {}, 'B14-initialize')
  await h.peer.feed(encode({ id: 'B14-initialize', result: { userAgent: 'fixture' } }))
  await h.peer.feed(encode({ id: 'B14-thread-start', result: { thread: { id: 'thread-1' } } }))
  await h.peer.request('turn/start', { threadId: 'thread-1' }, 'B14-turn-start')
  await h.peer.feed(encode({ id: 'B14-turn-start', result: { turn: { id: 'turn-1' } } }))
  assert.equal(h.peer.snapshot().phase, 'turn')
  await h.peer.feed(
    encode({
      id: 17,
      method: 'item/permissions/requestApproval',
      params: {
        cwd: '/private/tmp/appraise-m02-ta-matrix-p1/cases/B14/workspace',
        itemId: 'item-1',
        permissions: { network: { enabled: true } },
        startedAtMs: 123,
        threadId: 'thread-1',
        turnId: 'turn-1',
      },
    }),
  )
  assert.deepEqual(h.sent.at(-1), { id: 17, result: { permissions: {}, scope: 'turn' } })
  await h.peer.feed(encode({ method: 'serverRequest/resolved', params: { requestId: 17, threadId: 'thread-1' } }))
  await h.peer.feed(
    encode({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } },
    }),
  )
  await h.peer.eof()
  assert.equal(h.peer.snapshot().phase, 'terminal')
})
