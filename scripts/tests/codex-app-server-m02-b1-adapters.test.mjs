import test from 'node:test'
import assert from 'node:assert/strict'
import { JsonLines, line, runtimeUnavailable } from './fixtures/codex-app-server-m02-b1/framing.mjs'
import { OfflineSupervisor } from './fixtures/codex-app-server-m02-b1/supervisor.mjs'
import { OfflineMcp, EmptyDenial } from './fixtures/codex-app-server-m02-b1/mcp.mjs'
import { OfflineResponses, ResponseStream, NativeRoutes } from './fixtures/codex-app-server-m02-b1/responses.mjs'
import { DisposableStore } from './fixtures/codex-app-server-m02-b1/storage.mjs'
import { createGatewayFixture, ScriptedResponses } from './fixtures/codex-app-server-m02/gateway-fixture.mjs'

function journal() {
  let fenced = false
  const entries = []
  return {
    entries,
    snapshot: () => ({ fenced }),
    async reserve(kind, id) {
      if (fenced || entries.some(e => e.id === id)) throw new Error('journal fenced')
      entries.push({ kind, id, status: 'reserved' })
    },
    async acknowledge(id) {
      const e = entries.find(e => e.id === id)
      if (fenced || !e || e.status !== 'reserved') throw new Error('journal mismatch')
      e.status = 'acknowledged'
    },
    async markUnknown() {
      fenced = true
    },
  }
}
function supervisor({ write, store, caseId } = {}) {
  const sent = []
  const j = store?.journal ?? journal()
  const time = [0]
  const client = new OfflineSupervisor({
    journal: j,
    clock: () => time[0],
    caseId,
    write:
      write ??
      (bytes => {
        sent.push(JSON.parse(bytes))
        return bytes.length
      }),
  })
  const reply = (id, result) => client.feed(line({ id, result }))
  const ready = async () => {
    await client.request('initialize', undefined, 'init')
    await reply('init', { userAgent: 'offline' })
  }
  const thread = async () => {
    await ready()
    await client.request('thread/start', undefined, 'thread')
    await reply('thread', { thread: { id: 't' } })
  }
  return { sent, j, client, time, reply, ready, thread }
}
function provider(j = journal()) {
  const f = createGatewayFixture('REQUIREMENT_ANALYZER')
  const manifest = { tools: f.profile.tools.map(t => ({ type: 'function', name: t.name, parameters: t.inputSchema })) }
  const adapter = new OfflineResponses({ script: f.logicalScript, manifest, maxRequests: 4, journal: j })
  const request = {
    method: 'POST',
    path: '/v1/responses',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({ ...manifest, model: 'offline-fixture', stream: true, store: false })),
  }
  return { f, manifest, adapter, request, j }
}
function streamBinding(h = provider()) {
  const expectedEvents = new ScriptedResponses(h.f.logicalScript, h.manifest, 4).next({
    manifestBody: h.manifest,
    route: 'OFFLINE_SYNTHETIC',
  })
  return new ResponseStream({ manifest: h.manifest, expectedEvents })
}
async function mcpReady(mcp) {
  await mcp.feed(line({ jsonrpc: '2.0', id: 1, method: 'initialize' }))
  await mcp.feed(line({ jsonrpc: '2.0', method: 'notifications/initialized' }))
}

test('runtime constructors refuse without any callback effect', () => {
  const h = supervisor()
  assert.throws(runtimeUnavailable, /disabled/)
  assert.throws(() => h.client.launch({ granted: true }), /disabled/)
  assert.throws(() => provider().adapter.listen({ port: 1234 }), /disabled/)
  assert.throws(
    () => new OfflineMcp({ journal: journal(), caseId: 'B01', role: 'REQUIREMENT_ANALYZER' }).launch(),
    /disabled/,
  )
  assert.equal(h.sent.length, 0)
})
test('JSONL preserves fragmented UTF8 and fences invalid, oversized and partial data', () => {
  const p = new JsonLines()
  const bytes = line({ label: 'é' })
  assert.deepEqual(p.feed(bytes.subarray(0, 11)), [])
  assert.deepEqual(p.feed(bytes.subarray(11)), [{ label: 'é' }])
  for (const data of [Buffer.from('\n'), Buffer.from('[]\n'), Buffer.from([0xff, 10])]) {
    const parser = new JsonLines()
    assert.throws(() => parser.feed(data), /malformed/)
    assert.throws(() => parser.feed(line({})), /fenced/)
  }
  assert.throws(() => new JsonLines({ maxFrameBytes: 2 }).feed(line({ x: 1 })), /oversized/)
  const partial = new JsonLines()
  partial.feed(Buffer.from('{'))
  assert.throws(() => partial.eof(), /UNKNOWN/)
})
test('JSONL total and frame-count ceilings are independent', () => {
  assert.throws(() => new JsonLines({ maxTotalBytes: 3 }).feed(line({ x: 1 })), /oversized/)
  assert.throws(() => new JsonLines({ maxFrames: 1 }).feed(Buffer.concat([line({}), line({})])), /oversized/)
})
test('supervisor reserves durably before simulated send and correlates complete handshake', async () => {
  const store = await DisposableStore.create()
  try {
    const seen = []
    const h = supervisor({
      store,
      write: bytes => {
        const frame = JSON.parse(bytes)
        if (frame.method.endsWith('/start')) assert.ok(store.journal.snapshot().pending.includes(frame.id))
        seen.push(frame)
        return bytes.length
      },
    })
    await h.thread()
    await h.client.request('turn/start', { threadId: 't' }, 'turn')
    await h.reply('turn', { turn: { id: 'u' } })
    await h.client.feed(
      line({ method: 'turn/completed', params: { threadId: 't', turn: { id: 'u', status: 'completed' } } }),
    )
    assert.deepEqual(
      seen.map(f => f.method),
      ['initialize', 'initialized', 'thread/start', 'turn/start'],
    )
    assert.equal(h.client.snapshot().phase, 'terminal')
    assert.deepEqual(store.journal.snapshot().counts, { threadStarts: 1, turnStarts: 1, providerRequests: 0 })
    await assert.rejects(h.client.request('turn/start', { threadId: 't' }, 'again'), /fenced/)
  } finally {
    await store.cleanup()
  }
})
test('no send occurs after journal durability refusal', async () => {
  const store = await DisposableStore.create({
    fault: step => {
      if (step === 'file-sync') throw new Error('cut')
    },
  })
  try {
    const h = supervisor({ store })
    await h.ready()
    await assert.rejects(h.client.request('thread/start', undefined, 'thread'), /fenced/)
    assert.equal(h.sent.filter(f => f.method === 'thread/start').length, 0)
    assert.equal(store.journal.snapshot().counts.threadStarts, 1)
  } finally {
    await store.cleanup()
  }
})
for (const fault of ['partial', 'throw'])
  test(`supervisor ${fault} write fences with reserved intent`, async () => {
    let fail = false
    const h = supervisor({
      write: bytes => {
        if (!fail) return bytes.length
        if (fault === 'throw') throw new Error('write uncertain')
        return bytes.length - 1
      },
    })
    await h.ready()
    fail = true
    await assert.rejects(h.client.request('thread/start', undefined, 'thread'), /UNKNOWN/)
    assert.equal(h.j.entries[0].status, 'reserved')
    await assert.rejects(h.client.request('thread/start', undefined, 'repeat'), /fenced/)
  })
for (const fault of ['foreign', 'duplicate', 'EOF', 'deadline', 'auth', 'malformed'])
  test(`supervisor ${fault} fences without resend`, async () => {
    const h = supervisor()
    await h.ready()
    await h.client.request('thread/start', undefined, 'thread')
    if (fault === 'foreign') await assert.rejects(h.reply('other', {}), /UNKNOWN/)
    if (fault === 'duplicate') {
      await h.reply('thread', { thread: { id: 't' } })
      await assert.rejects(h.reply('thread', {}), /UNKNOWN/)
    }
    if (fault === 'EOF') await assert.rejects(h.client.eof(), /UNKNOWN/)
    if (fault === 'deadline') {
      h.time[0] = 60000
      await assert.rejects(h.client.tick(), /UNKNOWN/)
    }
    if (fault === 'auth')
      await assert.rejects(h.client.feed(line({ id: 'auth', method: 'account/login/start' })), /UNKNOWN/)
    if (fault === 'malformed') await assert.rejects(h.client.feed(Buffer.from('not-json\n')), /UNKNOWN/)
    assert.equal(h.sent.filter(f => f.method === 'thread/start').length, 1)
    await assert.rejects(h.client.request('thread/start', undefined, 'repeat'), /fenced/)
  })
test('required MCP failure P00 consumes thread only and blocks all turns', async () => {
  const store = await DisposableStore.create({ limits: { threadStarts: 1, turnStarts: 0, providerRequests: 0 } })
  try {
    const h = supervisor({ store, caseId: 'P00' })
    await h.ready()
    await h.client.request('thread/start', undefined, 'thread')
    await assert.rejects(
      h.client.feed(line({ id: 'thread', error: { code: -32603, message: 'synthetic required MCP failed' } })),
      /UNKNOWN/,
    )
    await assert.rejects(h.client.request('turn/start', { threadId: 't' }, 'turn'), /fenced/)
    assert.equal(store.journal.snapshot().counts.turnStarts, 0)
  } finally {
    await store.cleanup()
  }
})
test('out-of-order, foreign thread and duplicate request identities emit no extra starts', async () => {
  const h = supervisor()
  await assert.rejects(h.client.request('thread/start', undefined, 'x'), /UNKNOWN/)
  assert.equal(h.sent.length, 0)
  const h2 = supervisor()
  await h2.thread()
  await assert.rejects(h2.client.request('turn/start', { threadId: 'other' }, 'turn'), /UNKNOWN/)
  assert.equal(h2.sent.filter(f => f.method === 'turn/start').length, 0)
  const h3 = supervisor()
  await h3.ready()
  await assert.rejects(h3.client.request('thread/start', undefined, 'init'), /UNKNOWN/)
})
test('concurrent supervisor requests fence while original intent remains consumed', async () => {
  let release
  const wait = new Promise(resolve => {
    release = resolve
  })
  const h = supervisor({
    write: async bytes => {
      await wait
      return bytes.length
    },
  })
  const first = h.client.request('initialize', undefined, 'init')
  await Promise.resolve()
  await Promise.resolve()
  await assert.rejects(h.client.request('initialize', undefined, 'second'), /UNKNOWN/)
  release()
  await first
  assert.equal(h.client.snapshot().fenced, true)
})
const roles = ['REQUIREMENT_ANALYZER', 'SCOUT', 'RESOURCE_EXPLORER', 'TEST_SCENARIO_DESIGNER', 'AUTOMATOR', 'TRIAGER']
for (const [i, role] of roles.entries())
  test(`${role}: MCP JSONL framing reaches canonical synthetic gateway`, async () => {
    const mcp = new OfflineMcp({ journal: journal(), caseId: `B0${i + 1}`, role })
    await mcpReady(mcp)
    const list = JSON.parse(await mcp.feed(line({ jsonrpc: '2.0', id: 2, method: 'tools/list' })))
    assert.deepEqual(list.result.tools, mcp.manifest())
    let id = 3
    for (const step of mcp.script()) {
      const reply = JSON.parse(
        await mcp.feed(
          line({
            jsonrpc: '2.0',
            id: id++,
            method: 'tools/call',
            params: { name: step.toolName, arguments: step.arguments },
          }),
        ),
      )
      assert.equal(reply.result?.isError, undefined)
    }
    assert.ok(mcp.snapshot().artifacts.length > 0)
    assert.equal(mcp.snapshot().syntheticOnly, true)
  })
test('MCP immutable binding, ordering and duplicate envelopes fail closed', async () => {
  assert.throws(() => new OfflineMcp({ journal: journal(), caseId: 'B01', role: 'TRIAGER' }), /binding/)
  const mcp = new OfflineMcp({ journal: journal(), caseId: 'B01', role: roles[0] })
  assert.throws(() => {
    mcp.binding = {}
  }, TypeError)
  await assert.rejects(mcp.feed(line({ jsonrpc: '2.0', id: 1, method: 'tools/list' })), /blocked/)
  const m2 = new OfflineMcp({ journal: journal(), caseId: 'B01', role: roles[0] })
  await mcpReady(m2)
  await assert.rejects(m2.feed(line({ jsonrpc: '2.0', id: 1, method: 'tools/list' })), /blocked/)
})
test('MCP unregistered human/broader tool rejects without artifacts or fallback', async () => {
  const mcp = new OfflineMcp({ journal: journal(), caseId: 'B07', role: roles[0] })
  await mcpReady(mcp)
  const reply = JSON.parse(
    await mcp.feed(
      line({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'quality_journey_approve', arguments: {} } }),
    ),
  )
  assert.equal(reply.error.code, -32601)
  assert.deepEqual(mcp.snapshot().artifacts, [])
  await assert.rejects(mcp.feed(line({ jsonrpc: '2.0', id: 3, method: 'tools/list' })), /fenced/)
})
test('provider streams correlated synthetic events only after durable request reservation', async () => {
  const store = await DisposableStore.create()
  try {
    const h = provider(store.journal)
    const stream = streamBinding()
    const bytes = await h.adapter.exchange(h.request)
    const events = []
    for (let i = 0; i < bytes.length; i += 11) events.push(...stream.feed(bytes.subarray(i, i + 11)))
    stream.eof()
    assert.deepEqual(
      events.map(e => e.type),
      ['response.created', 'response.output_item.done', 'response.completed'],
    )
    assert.equal(store.journal.snapshot().counts.providerRequests, 1)
    assert.equal(store.journal.snapshot().pending.length, 0)
  } finally {
    await store.cleanup()
  }
})
for (const variant of ['auth', 'redirect', 'path', 'large', 'schema', 'manifest', 'namespace'])
  test(`provider ${variant} cannot emit a response`, async () => {
    const h = provider()
    const req = structuredClone(h.request)
    req.body = Buffer.from(req.body)
    if (variant === 'auth') req.headers.Authorization = 'synthetic-not-a-secret'
    if (variant === 'redirect') req.method = 'GET'
    if (variant === 'path') req.path = 'https://outside.invalid/v1/responses'
    if (variant === 'large') req.body = Buffer.alloc(65537)
    const value = JSON.parse(h.request.body)
    if (variant === 'schema') value.extra = 'unreviewed'
    if (variant === 'manifest') value.tools[0].parameters = { changed: true }
    if (variant === 'namespace') value.tools = [{ type: 'namespace', name: 'functions', tools: value.tools }]
    if (['schema', 'manifest', 'namespace'].includes(variant)) req.body = Buffer.from(JSON.stringify(value))
    await assert.rejects(h.adapter.exchange(req), /UNKNOWN/)
    assert.equal(h.adapter.snapshot().responseBytes, 0)
    await assert.rejects(h.adapter.exchange(h.request), /fenced/)
  })
test('Responses Lite manifests are inspected and metadata drift blocks at first request', async () => {
  const h = provider()
  const manifest = {
    input: [
      {
        type: 'additional_tools',
        role: 'developer',
        tools: [{ type: 'namespace', name: 'worker', description: 'bound', tools: h.manifest.tools }],
      },
    ],
  }
  const p = new OfflineResponses({ script: h.f.logicalScript, manifest, maxRequests: 4, journal: journal() })
  manifest.input[0].tools[0].description = 'drift'
  const body = Buffer.from(JSON.stringify({ ...manifest, model: 'offline-fixture', stream: true, store: false }))
  await assert.rejects(p.exchange({ ...h.request, body }), /UNKNOWN/)
  assert.equal(p.snapshot().responseBytes, 0)
})
test('missing provider tool outcome and budget excess fence without correction requests', async () => {
  const h = provider()
  await h.adapter.exchange(h.request)
  await assert.rejects(h.adapter.exchange(h.request), /UNKNOWN/)
  const h2 = provider()
  const p = new OfflineResponses({
    script: h2.f.logicalScript,
    manifest: h2.manifest,
    maxRequests: 1,
    journal: journal(),
  })
  await p.exchange(h2.request)
  await assert.rejects(
    p.exchange({ ...h2.request, previousOutput: { callId: 'synthetic-call-1', ok: true } }),
    /UNKNOWN/,
  )
})
test('response stream rejects foreign IDs, duplicate completion, reordered events and EOF loss', async () => {
  const bytes = await provider().adapter.exchange(provider().request)
  for (const mutate of [
    data => data.replace('synthetic-response-1","status":"completed', 'foreign","status":"completed'),
    data => data + data,
    data => data.split('\n\n').slice(1).join('\n\n'),
  ]) {
    const stream = streamBinding()
    assert.throws(() => stream.feed(Buffer.from(mutate(bytes.toString()))), /UNKNOWN/)
  }
  const truncated = streamBinding()
  truncated.feed(bytes.subarray(0, bytes.length - 1))
  assert.throws(() => truncated.eof(), /UNKNOWN/)
})
test('native mapping never promotes offline descriptors or generic bridge to qualification', () => {
  const h = provider()
  const names = h.manifest.tools.map(t => t.name)
  const routes = new NativeRoutes(h.manifest, names)
  const prepared = routes.inspect(h.manifest, Object.fromEntries(names.map(n => [n, n])))
  assert.equal(prepared.wireRoute, 'UNQUALIFIED')
  assert.equal(prepared.containmentQualified, false)
  assert.throws(() => routes.authorize({ approved: true }), /disabled/)
  assert.throws(() => routes.inspect(h.manifest, {}), /incomplete/)
  const generic = { tools: [{ type: 'custom', name: 'exec' }] }
  assert.throws(() => new NativeRoutes(generic, names).inspect(generic, { exec: names[0] }), /prohibited/)
})
test('B14 correlated empty denial is one shot and never a grant', () => {
  const b = { threadId: 't', turnId: 'u', itemId: 'i' }
  const frame = {
    id: 'r',
    method: 'item/permissions/requestApproval',
    params: { ...b, secret: 'synthetic-do-not-retain' },
  }
  const guard = new EmptyDenial('B14', b)
  assert.deepEqual(guard.reply(frame), { id: 'r', result: { permissions: {}, scope: 'turn' } })
  assert.throws(() => guard.reply(frame), /fenced/)
  for (const denied of [
    new EmptyDenial('B01', b).reply(frame),
    new EmptyDenial('B14', { ...b, itemId: 'foreign' }).reply(frame),
  ]) {
    assert.equal(denied.error.code, -32601)
    assert.doesNotMatch(JSON.stringify(denied), /secret|retain/)
  }
})

test('shared UNKNOWN journal stops another adapter before simulated send', async () => {
  const store = await DisposableStore.create()
  try {
    const h = supervisor({ store })
    await h.ready()
    await store.journal.markUnknown()
    await assert.rejects(h.client.request('thread/start', undefined, 'thread'), /fenced/)
    assert.equal(h.sent.filter(f => f.method === 'thread/start').length, 0)
    const p = provider(store.journal)
    await assert.rejects(p.adapter.exchange(p.request), /UNKNOWN/)
    assert.equal(p.adapter.snapshot().responseBytes, 0)
  } finally {
    await store.cleanup()
  }
})

test('sanitized evidence drops unknown counters and refuses raw identifiers or effect attestations', async () => {
  const { evidence } = await import('./fixtures/codex-app-server-m02-b1/evidence.mjs')
  const data = {
    caseId: 'B10',
    classification: 'unreached',
    counts: { threadStarts: 1, turnStarts: 1, providerRequests: 2, secret: 'do-not-retain' },
    hashes: { canaryBefore: 'a'.repeat(64) },
    correlations: { threadId: 't' },
  }
  const record = evidence(data)
  assert.doesNotMatch(JSON.stringify(record), /secret|do-not-retain/)
  assert.equal(record.containmentQualified, false)
  assert.throws(() => evidence({ ...data, classification: 'os-effect-denied' }), /cannot attest/)
  assert.throws(() => evidence({ ...data, correlations: { rawPrompt: 'synthetic' } }), /allowlist/)
  assert.throws(() => evidence({ ...data, hashes: { credential: 'a'.repeat(64) } }), /allowlist/)
})

test('MCP rejects coerced IDs and fences the shared run on overlapping feeds', async () => {
  for (const id of [-1, true, {}, [], 1.5]) {
    const mcp = new OfflineMcp({ journal: journal(), caseId: 'B01', role: roles[0] })
    await assert.rejects(mcp.feed(line({ jsonrpc: '2.0', id, method: 'initialize' })), /blocked/)
  }
  const j = journal()
  const mcp = new OfflineMcp({ journal: j, caseId: 'B01', role: roles[0] })
  const first = mcp.feed(line({ jsonrpc: '2.0', id: 1, method: 'initialize' }))
  await assert.rejects(mcp.feed(line({ jsonrpc: '2.0', id: 2, method: 'initialize' })), /fenced/)
  await assert.rejects(first, /blocked/)
  assert.equal(j.snapshot().fenced, true)
  const h = supervisor({ store: { journal: j } })
  await assert.rejects(h.ready(), /fenced/)
  assert.equal(h.sent.length, 0)
})
test('denial case and correlation cannot be rebound through public properties', () => {
  const binding = { threadId: 't', turnId: 'u', itemId: 'i' }
  const guard = new EmptyDenial('B01', binding)
  guard.caseId = 'B14'
  guard.binding = binding
  assert.equal(guard.reply({ id: 'r', method: 'item/permissions/requestApproval', params: binding }).error.code, -32601)
  assert.throws(() => new EmptyDenial('B14', binding).reply({ id: true }), /id/)
})

test('registered MCP handler/schema rejection fences the entire shared run', async () => {
  const j = journal()
  const mcp = new OfflineMcp({ journal: j, caseId: 'B01', role: roles[0] })
  await mcpReady(mcp)
  const reply = JSON.parse(
    await mcp.feed(
      line({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: mcp.script()[0].toolName, arguments: { unexpected: true } },
      }),
    ),
  )
  assert.equal(reply.result.isError, true)
  assert.equal(mcp.snapshot().fenced, true)
  assert.equal(j.snapshot().fenced, true)
  assert.deepEqual(mcp.snapshot().artifacts, [])
  await assert.rejects(mcp.feed(line({ jsonrpc: '2.0', id: 3, method: 'tools/list' })), /fenced/)
})
test('outer Lite container metadata drift blocks before request reservation or SSE emission', async () => {
  const h = provider()
  const manifest = {
    input: [{ type: 'additional_tools', role: 'developer', description: 'expected', tools: h.manifest.tools }],
  }
  const p = new OfflineResponses({ script: h.f.logicalScript, manifest, maxRequests: 4, journal: journal() })
  manifest.input[0].description = 'changed'
  await assert.rejects(
    p.exchange({
      ...h.request,
      body: Buffer.from(JSON.stringify({ ...manifest, model: 'offline-fixture', stream: true, store: false })),
    }),
    /UNKNOWN/,
  )
  assert.equal(p.snapshot().requests, 0)
  assert.equal(p.snapshot().responseBytes, 0)
})
test('SSE stream rejects changed function identity/arguments and extra schema fields', async () => {
  const h = provider()
  const data = (await h.adapter.exchange(h.request)).toString()
  for (const changed of [
    data.replaceAll(h.f.logicalScript[0].toolName, 'functions.exec'),
    data.replaceAll('synthetic-call-1', 'synthetic-call-2'),
    data.replaceAll('"type":"response.created"', '"extra":true,"type":"response.created"'),
  ]) {
    assert.throws(() => streamBinding(h).feed(Buffer.from(changed)), /UNKNOWN/)
  }
})
test('provider overlap while acknowledgement waits fences shared journal and withholds first response', async () => {
  const j = journal()
  let release
  const gate = new Promise(resolve => {
    release = resolve
  })
  const ack = j.acknowledge.bind(j)
  j.acknowledge = async id => {
    await gate
    await ack(id)
  }
  const h = provider(j)
  const first = h.adapter.exchange(h.request)
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await assert.rejects(h.adapter.exchange(h.request), /fenced/)
  release()
  await assert.rejects(first, /UNKNOWN/)
  assert.equal(j.snapshot().fenced, true)
})

test('actual saved native names are negative evidence, never invented descriptor mappings', async () => {
  const { readFileSync } = await import('node:fs')
  const { inspectSavedNativeEvidence, requireNativeMapping } =
    await import('./fixtures/codex-app-server-m02-b1/native-evidence.mjs')
  const bytes = readFileSync(
    new URL('../../tasks/codex-app-server-journeys/m01/corrected-manifest-host-observation.json', import.meta.url),
  )
  const h = provider()
  const record = inspectSavedNativeEvidence(
    bytes,
    h.manifest.tools.map(t => t.name),
  )
  assert.equal(record.nativeMappingStatus, 'BLOCKED_MISSING_DESCRIPTORS')
  assert.equal(record.completeDescriptorsRetained, false)
  assert.equal(record.scopedMcpPresent, false)
  assert.ok(record.broaderNames.includes('functions.exec'))
  assert.ok(record.broaderNames.includes('collaboration.spawn_agent'))
  assert.throws(requireNativeMapping, /disabled/)
  assert.throws(() => inspectSavedNativeEvidence(Buffer.concat([bytes, Buffer.from('\n')]), []), /identity/)
})
