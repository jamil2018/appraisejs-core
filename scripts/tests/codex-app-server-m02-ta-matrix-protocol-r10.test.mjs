import assert from 'node:assert/strict'
import test from 'node:test'
import { TrustedMatrixAppServerPeer } from './fixtures/codex-app-server-m02-ta-matrix-r10/protocol.mjs'

const workspace = '/private/tmp/appraise-m02-ta-matrix-p1/cases/B14/workspace'
const encode = frame => Buffer.from(`${JSON.stringify(frame)}\n`)
const approval = (overrides = {}) => ({
  jsonrpc: '2.0',
  id: 17,
  method: 'item/permissions/requestApproval',
  params: {
    cwd: workspace,
    itemId: 'item-1',
    permissions: { network: { enabled: true } },
    startedAtMs: 123,
    threadId: 'thread-1',
    turnId: 'turn-1',
    ...overrides,
  },
})
const resolved = (overrides = {}) => ({
  method: 'serverRequest/resolved',
  params: { requestId: 17, threadId: 'thread-1', ...overrides },
})
const completed = (overrides = {}) => ({
  method: 'turn/completed',
  params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' }, ...overrides },
})

function harness({ permissionVerifier = () => true, terminalVerifier = () => true, replyOverride = null } = {}) {
  const pending = [{ kind: 'mcpStarts', id: 'mcp-1' }]
  const sent = []
  const events = []
  let fenced = false
  let denialCount = 0
  const journal = {
    snapshot: () => ({ pending, fenced, seq: events.length }),
    acknowledge: async id => {
      const index = pending.findIndex(entry => entry.id === id)
      if (index >= 0) pending.splice(index, 1)
      events.push(`ack:${id}`)
    },
    markUnknown: async () => {
      fenced = true
      events.push('UNKNOWN')
    },
  }
  const coordinator = {
    async perform(kind, id, effect) {
      pending.push({ kind, id })
      events.push(`reserve:${kind}:${id}`)
      const result = await effect({ kind, id })
      if (result?.acknowledged !== false) await journal.acknowledge(id)
      return result
    },
    async denyPermission({ requestId, threadId, expectedThreadId, turnId, expectedTurnId, send }) {
      assert.equal(threadId, expectedThreadId)
      assert.equal(turnId, expectedTurnId)
      denialCount++
      return coordinator.perform('permissionReplies', `permission-${requestId}`, reservation =>
        send(replyOverride ?? { id: requestId, result: { permissions: {}, scope: 'turn' } }, reservation),
      )
    },
  }
  const peer = new TrustedMatrixAppServerPeer({
    coordinator,
    journal,
    caseId: 'B14',
    threadStartParams: { cwd: workspace },
    verifyMcpStartup: () => true,
    verifyPermissionRequest: permissionVerifier,
    verifyPermissionTerminal: terminalVerifier,
    write: async bytes => {
      const frame = JSON.parse(bytes)
      sent.push(frame)
      events.push(`write:${frame.method ?? frame.id}`)
      return bytes.length
    },
  })
  return { peer, sent, events, fenced: () => fenced, denialCount: () => denialCount }
}

async function startTurn(h) {
  await h.peer.request('initialize', {}, 'B14-initialize')
  await h.peer.feed(encode({ id: 'B14-initialize', result: { userAgent: 'fixture' } }))
  assert.deepEqual(
    h.sent.map(value => value.method),
    ['initialize', 'initialized', 'thread/start'],
  )
  await h.peer.feed(encode({ id: 'B14-thread-start', result: { thread: { id: 'thread-1' } } }))
  await h.peer.request('turn/start', { threadId: 'thread-1' }, 'B14-turn-start')
  await h.peer.feed(encode({ id: 'B14-turn-start', result: { turn: { id: 'turn-1' } } }))
  assert.equal(h.peer.snapshot().phase, 'turn')
}

test('B14 requires one matched network request, empty turn denial, resolution, and normal terminal', async () => {
  let checkedRequest = 0
  let checkedTerminal = 0
  const h = harness({
    permissionVerifier: (frame, context) => {
      checkedRequest++
      assert.equal(frame.id, 17)
      assert.deepEqual(context, { threadId: 'thread-1', turnId: 'turn-1' })
      return true
    },
    terminalVerifier: (frame, context) => {
      checkedTerminal++
      assert.equal(frame.params.turn.status, 'completed')
      assert.deepEqual(context, { requestId: 17, itemId: 'item-1', threadId: 'thread-1', turnId: 'turn-1' })
      return true
    },
  })
  await startTurn(h)
  await h.peer.feed(encode(approval()))
  assert.equal(h.peer.snapshot().phase, 'turn')
  assert.equal(h.peer.snapshot().permissionReplied, true)
  assert.equal(h.peer.snapshot().permissionResolved, false)
  assert.deepEqual(h.sent.at(-1), { id: 17, result: { permissions: {}, scope: 'turn' } })
  await h.peer.feed(Buffer.concat([encode(resolved()), encode(completed())]))
  await h.peer.eof()
  assert.equal(h.peer.snapshot().phase, 'terminal')
  assert.equal(h.denialCount(), 1)
  assert.equal(checkedRequest, 1)
  assert.equal(checkedTerminal, 1)
  assert.equal(h.fenced(), false)
})

test('queued approval, resolution, and completed frames process in order after split JSONL input', async () => {
  const h = harness()
  await startTurn(h)
  const transcript = Buffer.concat([encode(approval()), encode(resolved()), encode(completed())])
  await h.peer.feed(transcript.subarray(0, 23))
  assert.equal(h.denialCount(), 0)
  await h.peer.feed(transcript.subarray(23))
  await h.peer.eof()
  assert.equal(h.peer.snapshot().phase, 'terminal')
  assert.equal(h.denialCount(), 1)
})

test('B14 cannot terminate at an early completed turn or at the denial reply', async () => {
  const early = harness()
  await startTurn(early)
  await assert.rejects(early.peer.feed(encode(completed())), /UNKNOWN/)
  assert.equal(early.fenced(), true)

  const unresolved = harness()
  await startTurn(unresolved)
  await unresolved.peer.feed(encode(approval()))
  await assert.rejects(unresolved.peer.eof(), /UNKNOWN/)
  assert.equal(unresolved.fenced(), true)

  const completedBeforeResolution = harness()
  await startTurn(completedBeforeResolution)
  await completedBeforeResolution.peer.feed(encode(approval()))
  await assert.rejects(completedBeforeResolution.peer.feed(encode(completed())), /UNKNOWN/)
  assert.equal(completedBeforeResolution.fenced(), true)

  const resolutionBeforeRequest = harness()
  await startTurn(resolutionBeforeRequest)
  await assert.rejects(resolutionBeforeRequest.peer.feed(encode(resolved())), /UNKNOWN/)
  assert.equal(resolutionBeforeRequest.denialCount(), 0)
})

test('request validates exact cwd, thread, turn, item, network profile, metadata and outer fields', async () => {
  const variants = [
    { cwd: '/foreign/workspace' },
    { threadId: 'thread-other' },
    { turnId: 'turn-other' },
    { itemId: '' },
    { permissions: {} },
    { permissions: { network: { enabled: false } } },
    { permissions: { network: { enabled: true }, fileSystem: {} } },
    { permissions: { network: { enabled: true, foreign: true } } },
    { startedAtMs: Number.MAX_SAFE_INTEGER + 1 },
    { unexpected: true },
  ]
  for (const variant of variants) {
    const h = harness()
    await startTurn(h)
    await assert.rejects(h.peer.feed(encode(approval(variant))), /UNKNOWN/)
    assert.equal(h.denialCount(), 0)
    assert.equal(h.fenced(), true)
  }
  const badOuter = harness()
  await startTurn(badOuter)
  await assert.rejects(badOuter.peer.feed(encode({ ...approval(), extra: true })), /UNKNOWN/)
})

test('foreign request, duplicate ask, and nonempty reply cannot create grants', async () => {
  const foreign = harness()
  await startTurn(foreign)
  await assert.rejects(foreign.peer.feed(encode({ ...approval(), method: 'item/permissions/other' })), /UNKNOWN/)
  assert.equal(foreign.denialCount(), 0)

  const duplicate = harness()
  await startTurn(duplicate)
  await duplicate.peer.feed(encode(approval()))
  await assert.rejects(duplicate.peer.feed(encode(approval())), /UNKNOWN/)
  assert.equal(duplicate.denialCount(), 1)

  const grant = harness({
    replyOverride: { id: 17, result: { permissions: { network: { enabled: true } }, scope: 'turn' } },
  })
  await startTurn(grant)
  await assert.rejects(grant.peer.feed(encode(approval())), /UNKNOWN/)
  assert.equal(
    grant.sent.some(frame => frame.result?.permissions?.network),
    false,
  )
})

test('only the matching resolved request and thread can pair with the empty denial', async () => {
  for (const variant of [{ requestId: 18 }, { threadId: 'foreign-thread' }, { extra: true }]) {
    const h = harness()
    await startTurn(h)
    await h.peer.feed(encode(approval()))
    await assert.rejects(h.peer.feed(encode(resolved(variant))), /UNKNOWN/)
    assert.equal(h.fenced(), true)
  }
  const duplicate = harness()
  await startTurn(duplicate)
  await duplicate.peer.feed(encode(approval()))
  await duplicate.peer.feed(encode(resolved()))
  await assert.rejects(duplicate.peer.feed(encode(resolved())), /UNKNOWN/)
})

test('B14 rejects negative verifier results and a partial EOF', async () => {
  const request = harness({ permissionVerifier: () => false })
  await startTurn(request)
  await assert.rejects(request.peer.feed(encode(approval())), /UNKNOWN/)
  assert.equal(request.denialCount(), 0)

  const terminal = harness({ terminalVerifier: () => false })
  await startTurn(terminal)
  await terminal.peer.feed(encode(approval()))
  await terminal.peer.feed(encode(resolved()))
  await assert.rejects(terminal.peer.feed(encode(completed())), /UNKNOWN/)

  const partial = harness()
  await startTurn(partial)
  await partial.peer.feed(encode(approval()).subarray(0, 12))
  await assert.rejects(partial.peer.eof(), /UNKNOWN/)
})

test('B14 requires both external verifiers at construction', () => {
  const h = harness()
  assert.ok(h.peer)
  assert.throws(
    () =>
      new TrustedMatrixAppServerPeer({
        caseId: 'B14',
        coordinator: {},
        journal: { snapshot: () => ({ pending: [] }) },
        write: () => {},
      }),
    /verifiers required/,
  )
})
