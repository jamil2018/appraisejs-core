import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ProtocolFixture } from './fixtures/codex-app-server-m01/protocol-fixture.mjs'

function fixture(options = {}) {
  const sent = []
  const client = new ProtocolFixture(frame => sent.push(frame), options)
  const reply = (id, result) => client.feed(`${JSON.stringify({ id, result })}\n`)
  const ready = async () => {
    const p = client.request('initialize', { clientInfo: { name: 'fixture', version: '1' } })
    reply(sent.at(-1).id, { userAgent: 'fixture/exact-build' })
    await p
  }
  return { client, sent, reply, ready }
}

test('initialization gates requests; fragmented JSONL and matching reply unlock handshake', async () => {
  const h = fixture()
  await assert.rejects(h.client.request('thread/start'), /initialize first/)
  const p = h.client.request('initialize')
  h.reply(999, {})
  assert.equal(h.client.initialized, false)
  const line = JSON.stringify({ id: h.sent[0].id, result: { userAgent: 'fixture/build' } })
  h.client.feed(line.slice(0, 17))
  h.client.feed(`${line.slice(17)}\n`)
  await p
  assert.equal(h.sent.at(-1).method, 'initialized')
})

test('required-MCP rejection blocks starts and never emits a turn', async () => {
  const h = fixture()
  await h.ready()
  const p = h.client.request('thread/start')
  h.client.feed(
    `${JSON.stringify({ id: h.sent.at(-1).id, error: { code: -32603, message: 'required MCP failed' } })}\n`,
  )
  await assert.rejects(p, /rpc rejected/)
  await assert.rejects(h.client.request('thread/start'), /blocked/)
  assert.equal(h.sent.filter(f => f.method === 'turn/start').length, 0)
})

test('start and resume capture responses; resume mismatch blocks without fallback', async () => {
  const h = fixture()
  await h.ready()
  const p = h.client.request('thread/start')
  h.reply(h.sent.at(-1).id, { thread: { id: 'thread-1' } })
  await p
  const q = h.client.request('thread/resume', { threadId: 'thread-1' })
  h.reply(h.sent.at(-1).id, { thread: { id: 'thread-1' } })
  await q
  assert.equal(h.client.threadId, 'thread-1')
  const r = h.client.request('thread/resume', { threadId: 'thread-1' })
  h.reply(h.sent.at(-1).id, { thread: { id: 'wrong' } })
  await assert.rejects(r, /mismatched/)
  assert.equal(h.sent.filter(f => f.method === 'thread/start').length, 1)
})

for (const method of ['thread/start', 'turn/start']) {
  test(`lost ${method} acknowledgement is unknown and cannot resend, including after late reply`, async () => {
    const h = fixture({ timeoutMs: 10, allowTurnStart: true })
    await h.ready()
    const p = h.client.request(method)
    const id = h.sent.at(-1).id
    await assert.rejects(p, /ack timeout/)
    assert.equal(h.client.unknownStart, true)
    h.reply(id, { thread: { id: 'late' }, turn: { id: 'late' } })
    await assert.rejects(h.client.request(method), /blocked/)
    assert.equal(h.sent.filter(f => f.method === method).length, 1)
  })
}

test('no-model guard refuses turn/start before writing', async () => {
  const h = fixture()
  await h.ready()
  await assert.rejects(h.client.request('turn/start'), /no-model guard/)
  assert.equal(h.sent.filter(f => f.method === 'turn/start').length, 0)
})

test('synthetic correlated events ignore foreign/duplicate events; interruption is separate from acceptance', async () => {
  const h = fixture({ allowTurnStart: true })
  await h.ready()
  const p = h.client.request('thread/start')
  h.reply(h.sent.at(-1).id, { thread: { id: 'thread-1' } })
  await p
  const q = h.client.request('turn/start', { threadId: 'thread-1' })
  h.reply(h.sent.at(-1).id, { turn: { id: 'turn-1' } })
  await q
  const notification = (threadId, turnId, status) =>
    h.client.receive({ method: 'turn/completed', params: { threadId, turn: { id: turnId, status } } })
  notification('foreign', 'turn-1', 'completed')
  notification('thread-1', 'foreign', 'completed')
  assert.equal(h.client.events.length, 0)
  const r = h.client.request('turn/interrupt', { threadId: 'thread-1', turnId: 'turn-1' })
  h.reply(h.sent.at(-1).id, {})
  await r
  notification('thread-1', 'turn-1', 'interrupted')
  notification('thread-1', 'turn-1', 'interrupted')
  assert.equal(h.client.events.length, 1)
  assert.equal(h.client.events[0].status, 'interrupted')
  assert.equal('journeySuccess' in h.client, false)
})

for (const id of [77, 'server-request']) {
  test(`unexpected server request ${id} is denied and blocks`, async () => {
    const h = fixture()
    await h.ready()
    h.client.receive({ id, method: 'item/permissions/requestApproval', params: {} })
    assert.deepEqual(h.sent.at(-1), { id, error: { code: -32601, message: 'unsupported qualification request' } })
    await assert.rejects(h.client.request('thread/start'), /blocked/)
  })
}

test('malformed framing, oversized data, and transport loss fail closed', async () => {
  for (const chunk of ['not-json\n', `${'x'.repeat(64)}\n`]) {
    const h = fixture({ maxBytes: 32 })
    const p = h.client.request('initialize')
    h.client.feed(chunk)
    await assert.rejects(p, /closed/)
  }
  const h = fixture()
  await h.ready()
  const p = h.client.request('thread/start')
  h.client.close()
  await assert.rejects(p, /closed/)
  assert.equal(h.client.unknownStart, true)
})

test('concurrent replies correlate by request ID despite reverse order and duplicates', async () => {
  const h = fixture()
  await h.ready()
  const a = h.client.request('config/read')
  const idA = h.sent.at(-1).id
  const b = h.client.request('config/read')
  const idB = h.sent.at(-1).id
  h.reply(idB, { marker: 'second' })
  h.reply(idA, { marker: 'first' })
  h.reply(idA, { marker: 'duplicate' })
  assert.deepEqual(await a, { marker: 'first' })
  assert.deepEqual(await b, { marker: 'second' })
})

for (const result of [null, {}, { thread: { id: '' } }]) {
  test(`malformed start result ${JSON.stringify(result)} preserves uncertainty and blocks resend`, async () => {
    const h = fixture()
    await h.ready()
    const p = h.client.request('thread/start')
    h.reply(h.sent.at(-1).id, result)
    await assert.rejects(p)
    assert.equal(h.client.unknownStart, true)
    await assert.rejects(h.client.request('thread/start'), /blocked/)
  })
}
