import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { join, resolve } from 'node:path'
import test from 'node:test'
import Ajv from 'ajv'
import { POLICY, digest } from './fixtures/codex-app-server-m02-ta-runtime-r7/policy.mjs'
import {
  prepareTrustedCase,
  prepareTrustedComposition,
  TrustedCaseCoordinator,
} from './fixtures/codex-app-server-m02-ta-runtime-r7/composition.mjs'
import {
  t1InitializeParams,
  t1TurnParams,
  assertT1ObservedTuple,
  ownedCodexExitProved,
  prepareT1,
  runT1,
  R7_REPLACEMENT,
} from './fixtures/codex-app-server-m02-ta-runtime-r7/t1-runner.mjs'
import { verifyPriorAttempt, PRIOR_ROOT } from './fixtures/codex-app-server-m02-ta-runtime-r7/prior-attempt.mjs'
import { createT1ErrorAdapter } from './fixtures/codex-app-server-m02-ta-runtime-r7/t1-error-adapter.mjs'
import { T1_ROOT } from './fixtures/codex-app-server-m02-ta-runtime-r7/journal.mjs'
import { writeT1PreparationReceipt } from './fixtures/codex-app-server-m02-ta-runtime-r7/preparation-receipt.mjs'
import { TrustedAppServerPeer } from './fixtures/codex-app-server-m02-ta-runtime-r7/protocol.mjs'

const schemaRoot = resolve('.appraisejs/m02-executable-qualification-20261016-01/schemas')
const validator = new Ajv({ allErrors: true })
for (const format of ['int32', 'int64', 'uint', 'uint16', 'uint32', 'uint64'])
  validator.addFormat(format, { type: 'number', validate: Number.isSafeInteger })
function schema(name) {
  return validator.compile(JSON.parse(fs.readFileSync(join(schemaRoot, name), 'utf8')))
}
function valid(name, value) {
  const check = schema(name)
  assert.equal(check(value), true, JSON.stringify(check.errors))
}
const thread = {
  cliVersion: POLICY.executable.version,
  createdAt: 1,
  cwd: POLICY.roots.T1,
  ephemeral: false,
  id: 'thread-1',
  modelProvider: 'm02-scripted',
  preview: '',
  projectId: null,
  sessionId: 'session-1',
  source: 'appServer',
  status: { type: 'idle' },
  turns: [],
  updatedAt: 1,
}
const turn = { id: 'turn-1', items: [], status: 'inProgress' }
const errorParams = variant => ({
  threadId: 'thread-1',
  turnId: 'turn-1',
  willRetry: false,
  error: { message: 'local fixture 503', codexErrorInfo: { [variant]: { httpStatusCode: 503 } } },
})
const frame = params => Buffer.from(`${JSON.stringify({ method: 'error', params })}\n`)
const peerFrame = value => Buffer.from(`${JSON.stringify(value)}\n`)
function offlinePeer({
  partialMethod = null,
  verifyMcpStartup = () => true,
  verifyCaptureTerminal = () => false,
  onFailure = () => {},
  onWrite = () => {},
} = {}) {
  const events = []
  const sent = []
  const acknowledged = []
  const failures = []
  const pending = [{ kind: 'mcpStarts', id: 'mcp-1' }]
  let fenced = false
  const journal = {
    snapshot: () => ({ pending, fenced, seq: events.length }),
    acknowledge: async id => {
      acknowledged.push(id)
      const index = pending.findIndex(entry => entry.id === id)
      if (index >= 0) pending.splice(index, 1)
    },
    markUnknown: async () => {
      fenced = true
      events.push('unknown')
    },
  }
  const coordinator = {
    perform: async (kind, id, effect) => {
      events.push(`reserve:${kind}:${id}`)
      pending.push({ kind, id })
      const result = await effect({ kind, id })
      if (result?.acknowledged !== false) await journal.acknowledge(id)
      return result
    },
  }
  const peer = new TrustedAppServerPeer({
    coordinator,
    journal,
    caseId: 'T1',
    threadStartParams: { cwd: '/synthetic' },
    verifyMcpStartup,
    verifyCaptureTerminal,
    write: async bytes => {
      const value = JSON.parse(bytes)
      sent.push(value)
      events.push(`send:${value.method}`)
      queueMicrotask(() => onWrite(value))
      return value.method === partialMethod ? bytes.length - 1 : bytes.length
    },
    onFailure: async details => {
      assert.equal(fenced, false, 'sanitized failure precedes durable UNKNOWN')
      await onFailure(details)
      failures.push(details)
      events.push(`failure:${details.category}`)
    },
  })
  return { peer, sent, events, acknowledged, failures, fenced: () => fenced }
}

test('initialize continuation durably sends one thread/start before processing a buffered startup notification', async () => {
  const h = offlinePeer()
  await h.peer.request('initialize', t1InitializeParams(), 'T1-initialize')
  const startup = {
    method: 'mcpServer/startupStatus/updated',
    params: { name: 'appraise_m02', status: 'ready', threadId: null },
  }
  valid('v2/McpServerStatusUpdatedNotification.json', startup.params)
  await h.peer.feed(
    Buffer.concat([peerFrame({ id: 'T1-initialize', result: { userAgent: 'codex/fixture' } }), peerFrame(startup)]),
  )
  assert.equal(h.peer.snapshot().pending, 'T1-thread-start')
  assert.equal(h.sent.filter(item => item.method === 'thread/start').length, 1)
  assert.ok(h.events.indexOf('send:initialized') < h.events.indexOf('reserve:threadStarts:T1-thread-start'))
  assert.ok(h.events.indexOf('reserve:threadStarts:T1-thread-start') < h.events.indexOf('send:thread/start'))
  assert.equal(h.acknowledged.includes('mcp-1'), false, 'ready telemetry is never MCP acknowledgement')
  await h.peer.feed(peerFrame({ id: 'T1-thread-start', result: { thread: { id: 'thread-1' } } }))
  assert.equal(h.peer.snapshot().phase, 'thread')
  assert.equal(h.acknowledged.includes('mcp-1'), true, 'only verified thread response acknowledges MCP startup')
  assert.equal(h.fenced(), false)
})

test('real coordinator stays non-reentrant while initialized and thread/start reserve in one feed', async () => {
  let fenced = false
  const pending = [{ kind: 'mcpStarts', id: 'mcp-1' }]
  const effects = []
  const journal = {
    begin: async () => {},
    reserve: async (kind, id) => {
      pending.push({ kind, id })
      effects.push(`reserve:${kind}:${id}`)
    },
    acknowledge: async id => {
      const index = pending.findIndex(entry => entry.id === id)
      if (index >= 0) pending.splice(index, 1)
      effects.push(`ack:${id}`)
    },
    markUnknown: async () => {
      fenced = true
    },
    snapshot: () => ({ fenced, pending, seq: effects.length }),
  }
  const coordinator = new TrustedCaseCoordinator({ journal })
  await coordinator.begin('T1')
  const peer = new TrustedAppServerPeer({
    coordinator,
    journal,
    caseId: 'T1',
    threadStartParams: { cwd: '/synthetic' },
    write: async bytes => {
      effects.push(`send:${JSON.parse(bytes).method}`)
      return bytes.length
    },
  })
  await peer.request('initialize', t1InitializeParams(), 'T1-initialize')
  await peer.feed(
    Buffer.concat([
      peerFrame({ id: 'T1-initialize', result: { userAgent: 'fixture' } }),
      peerFrame({ method: 'mcpServer/startupStatus/updated', params: { name: 'appraise_m02', status: 'starting' } }),
    ]),
  )
  assert.equal(fenced, false)
  assert.equal(
    pending.some(entry => entry.id === 'T1-thread-start'),
    true,
  )
  assert.equal(
    pending.some(entry => entry.id === 'mcp-1'),
    true,
  )
  assert.ok(effects.indexOf('ack:T1-initialize-initialized') < effects.indexOf('reserve:threadStarts:T1-thread-start'))
})

test('one bounded provisional startup thread ID reconciles only with the actual thread response', async () => {
  async function opened() {
    const h = offlinePeer()
    await h.peer.request('initialize', t1InitializeParams(), 'T1-initialize')
    await h.peer.feed(peerFrame({ id: 'T1-initialize', result: { userAgent: 'fixture' } }))
    assert.equal(h.peer.snapshot().pending, 'T1-thread-start')
    return h
  }
  const status = (id, state = 'ready') =>
    peerFrame({
      method: 'mcpServer/startupStatus/updated',
      params: { name: 'appraise_m02', status: state, threadId: id },
    })
  for (const withStarted of [true, false]) {
    const h = await opened()
    await h.peer.feed(status('thread-1', 'starting'))
    await h.peer.feed(status('thread-1'))
    assert.equal(h.peer.snapshot().threadId, null)
    assert.equal(h.acknowledged.includes('mcp-1'), false)
    if (withStarted) await h.peer.feed(peerFrame({ method: 'thread/started', params: { thread: { id: 'thread-1' } } }))
    await h.peer.feed(peerFrame({ id: 'T1-thread-start', result: { thread: { id: 'thread-1' } } }))
    assert.equal(h.peer.snapshot().phase, 'thread')
    assert.equal(h.peer.snapshot().threadId, 'thread-1')
    assert.equal(h.fenced(), false)
  }
  for (const failure of ['second-status', 'started', 'response', 'failed', 'eof']) {
    const h = await opened()
    await h.peer.feed(status('thread-1'))
    const incoming =
      failure === 'second-status'
        ? status('thread-2')
        : failure === 'started'
          ? peerFrame({ method: 'thread/started', params: { thread: { id: 'thread-2' } } })
          : failure === 'response'
            ? peerFrame({ id: 'T1-thread-start', result: { thread: { id: 'thread-2' } } })
            : failure === 'failed'
              ? status('thread-1', 'failed')
              : null
    await assert.rejects(incoming ? h.peer.feed(incoming) : h.peer.eof(), /UNKNOWN/)
    assert.equal(h.fenced(), true)
    assert.equal(h.acknowledged.includes('mcp-1'), false)
  }
  const beforeThread = offlinePeer()
  await assert.rejects(beforeThread.peer.feed(status('thread-1')), /UNKNOWN/)
  assert.equal(beforeThread.failures[0]?.category, 'MCP_STARTUP_FOREIGN_THREAD')
  const invalidId = await opened()
  await assert.rejects(invalidId.peer.feed(status('bad id')), /UNKNOWN/)
  assert.equal(invalidId.failures[0]?.category, 'MCP_STARTUP_MALFORMED_OR_FOREIGN')
})

test('protocol failure receipt is exclusive, fsynced and sanitized before UNKNOWN; failed receipt still fences', async () => {
  const root = await fsp.realpath(
    await fsp.mkdtemp(join((await import('node:os')).tmpdir(), 'appraise-m02-r7-failure-')),
  )
  try {
    const supervisor = join(root, 'supervisor')
    await fsp.mkdir(supervisor, { mode: 0o700 })
    const journal = { parentStats: [fs.lstatSync(root), fs.lstatSync(supervisor)] }
    const writeFailure = details =>
      writeT1PreparationReceipt({
        journal,
        name: 'protocol-failure.json',
        phaseRoot: root,
        value: {
          schema: 'appraise.m02-ta-r7-protocol-failure/v1',
          status: 'UNKNOWN',
          ...details,
        },
      })
    const h = offlinePeer({ onFailure: writeFailure })
    await assert.rejects(
      h.peer.feed(peerFrame({ method: 'unreviewed/secret-path', params: { token: 'do-not-persist' } })),
      /UNKNOWN/,
    )
    const file = join(supervisor, 'protocol-failure.json')
    const bytes = await fsp.readFile(file, 'utf8')
    const saved = JSON.parse(bytes)
    assert.equal(saved.category, 'UNKNOWN_REQUEST_OR_NOTIFICATION')
    assert.deepEqual(Object.keys(saved).sort(), [
      'category',
      'frameKind',
      'hasEnvironment',
      'methodSha256',
      'pendingKind',
      'phase',
      'safeRemoteStatus',
      'schema',
      'seq',
      'status',
    ])
    assert.equal(saved.methodSha256, createHash('sha256').update('unreviewed/secret-path').digest('hex'))
    assert.equal(saved.frameKind, 'notification')
    assert.equal(saved.safeRemoteStatus, null)
    assert.equal(saved.hasEnvironment, false)
    assert.doesNotMatch(bytes, /secret-path|do-not-persist/)
    assert.equal((await fsp.lstat(file)).mode & 0o777, 0o600)
    await fsp.rm(file)
    await fsp.symlink(join(root, 'foreign-target'), file)
    const blocked = offlinePeer({ onFailure: writeFailure })
    await assert.rejects(blocked.peer.feed(peerFrame({ method: 'unknown', params: {} })), /UNKNOWN/)
    assert.equal(blocked.fenced(), true)
    assert.equal((await fsp.lstat(file)).isSymbolicLink(), true)
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})

test('bounded schema-shaped startup and presentation telemetry has no auth or readiness effect', async () => {
  const h = offlinePeer()
  for (const status of ['starting', 'ready']) {
    const params = { name: 'appraise_m02', status }
    valid('v2/McpServerStatusUpdatedNotification.json', params)
    await h.peer.feed(peerFrame({ method: 'mcpServer/startupStatus/updated', params }))
  }
  for (const [method, name, params] of [
    ['warning', 'v2/WarningNotification.json', { message: 'synthetic', threadId: null }],
    ['configWarning', 'v2/ConfigWarningNotification.json', { summary: 'synthetic', details: null, path: null }],
    ['deprecationNotice', 'v2/DeprecationNoticeNotification.json', { summary: 'synthetic', details: null }],
    ['account/updated', 'v2/AccountUpdatedNotification.json', { authMode: null, planType: null }],
  ]) {
    valid(name, params)
    await h.peer.feed(peerFrame({ method, params }))
  }
  assert.equal(h.peer.snapshot().phase, 'new')
  assert.equal(h.acknowledged.includes('mcp-1'), false)
  assert.equal(h.sent.length, 0)
  assert.equal(h.fenced(), false)
})

test('R7 inactive remote control and empty skills telemetry are schema-shaped and authority-free across startup', async () => {
  const remote = (environmentId = null) => ({
    method: 'remoteControl/status/changed',
    params: { installationId: '', serverName: '', status: 'disabled', environmentId },
  })
  const skills = { method: 'skills/changed', params: {} }
  for (const notification of [remote(), skills]) {
    valid('ServerNotification.json', notification)
    await offlinePeer().peer.feed(peerFrame(notification))
  }
  const h = offlinePeer()
  await h.peer.request('initialize', t1InitializeParams(), 'T1-initialize')
  await h.peer.feed(peerFrame(remote()))
  await h.peer.feed(
    Buffer.concat([
      peerFrame({ id: 'T1-initialize', result: { userAgent: 'fixture' } }),
      peerFrame(remote()),
      peerFrame(skills),
    ]),
  )
  assert.equal(h.peer.snapshot().pending, 'T1-thread-start')
  assert.equal(h.acknowledged.includes('mcp-1'), false)
  assert.equal(h.sent.filter(item => item.method === 'thread/start').length, 1)
  await h.peer.feed(peerFrame({ id: 'T1-thread-start', result: { thread: { id: 'thread-1' } } }))
  await h.peer.feed(peerFrame(remote()))
  await h.peer.feed(peerFrame(skills))
  assert.equal(h.peer.snapshot().phase, 'thread')
  assert.equal(h.sent.filter(item => item.method === 'turn/start').length, 0)
  assert.equal(h.fenced(), false)
})

test('R7 remote active, environment, malformed and mixed frames fence with sanitized fixed enums', async () => {
  const remote = params => ({ method: 'remoteControl/status/changed', params })
  const base = { installationId: 'never-persist-installation', serverName: 'never-persist-server', status: 'disabled' }
  const bad = [
    [remote({ ...base, status: 'connecting' }), 'REMOTE_CONTROL_NOT_DISABLED', 'connecting', false],
    [remote({ ...base, status: 'connected' }), 'REMOTE_CONTROL_NOT_DISABLED', 'connected', false],
    [remote({ ...base, status: 'errored' }), 'REMOTE_CONTROL_NOT_DISABLED', 'errored', false],
    [remote({ ...base, environmentId: 'never-persist-environment' }), 'REMOTE_CONTROL_NOT_DISABLED', 'disabled', true],
    [remote({ status: 'disabled', serverName: 'x' }), 'REMOTE_CONTROL_MALFORMED', 'disabled', false],
    [remote({ ...base, status: 'other' }), 'REMOTE_CONTROL_MALFORMED', 'OTHER', false],
    [remote({ ...base, extra: true }), 'REMOTE_CONTROL_MALFORMED', 'disabled', false],
    [{ method: 'skills/changed', params: { extra: true } }, 'SKILLS_CHANGED_MALFORMED', null, false],
    [{ id: 1, method: 'remoteControl/status/changed', params: base }, 'UNKNOWN_REQUEST_OR_NOTIFICATION', null, false],
    [{ method: 'remoteControl/status/changed', params: base, result: {} }, 'MIXED_FRAME_FIELDS', null, false],
  ]
  for (const [incoming, category, status, environment] of bad) {
    const h = offlinePeer()
    await assert.rejects(h.peer.feed(peerFrame(incoming)), /UNKNOWN/)
    assert.equal(h.failures[0].category, category)
    assert.equal(h.failures[0].safeRemoteStatus, status)
    assert.equal(h.failures[0].hasEnvironment, environment)
    assert.equal(h.fenced(), true)
    assert.equal(h.sent.length, 0)
    assert.equal(h.acknowledged.includes('mcp-1'), false)
    assert.doesNotMatch(JSON.stringify(h.failures[0]), /never-persist/)
  }
  for (const [incoming, kind] of [
    [{ id: 8, method: 'unknown/request', params: {} }, 'request'],
    [{ id: 8, result: {} }, 'response'],
    [{ result: {} }, 'invalid'],
  ]) {
    const h = offlinePeer()
    await assert.rejects(h.peer.feed(peerFrame(incoming)), /UNKNOWN/)
    assert.equal(h.failures[0].frameKind, kind)
  }
  const quota = offlinePeer()
  for (let index = 0; index < 31; index++) await quota.peer.feed(peerFrame(remote(base)))
  await quota.peer.feed(peerFrame({ method: 'skills/changed', params: {} }))
  await assert.rejects(quota.peer.feed(peerFrame(remote(base))), /UNKNOWN/)
  assert.equal(quota.failures[0].category, 'TELEMETRY_QUOTA')
})

test('R7 inventory assigns all 85 pinned ServerNotification methods one finite disposition', async () => {
  const bytes = await fsp.readFile(
    'scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r7/notification-inventory.json',
  )
  const inventory = JSON.parse(bytes)
  const source = await fsp.readFile(join(schemaRoot, 'ServerNotification.json'))
  const notifications = JSON.parse(source).oneOf.map(entry => entry.properties.method.enum[0])
  assert.equal(inventory.sourceSha256, createHash('sha256').update(source).digest('hex'))
  assert.equal(inventory.methodCount, 85)
  assert.deepEqual(
    inventory.notifications.map(entry => entry.method),
    notifications,
  )
  assert.deepEqual(inventory.dispositionCounts, {
    'strict-lifecycle': 12,
    'bounded-advisory': 7,
    'forbidden-auth': 5,
    'unsupported-fence': 61,
  })
  const accepted = new Map(inventory.notifications.map(entry => [entry.method, entry.disposition]))
  assert.equal(accepted.get('remoteControl/status/changed'), 'bounded-advisory')
  assert.equal(accepted.get('skills/changed'), 'bounded-advisory')
  assert.equal(accepted.get('account/gatewayOAuth/changed'), 'forbidden-auth')
  assert.equal(accepted.get('thread/realtime/started'), 'unsupported-fence')
  const changed = resolve('scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r7/notification-inventory.json')
  const io = new Proxy(fsp, {
    get(target, key) {
      if (key === 'readFile')
        return (path, ...args) => (path === changed ? Promise.resolve(Buffer.from('{}')) : fsp.readFile(path, ...args))
      return target[key]
    },
  })
  await assert.rejects(prepareT1({ io }), /server notification inventory drift/)
})

test('failed, foreign, malformed, auth, unknown and overflow startup frames fence with sanitized categories', async () => {
  const bad = [
    [
      { method: 'mcpServer/startupStatus/updated', params: { name: 'appraise_m02', status: 'failed' } },
      'MCP_STARTUP_FAILED',
    ],
    [
      { method: 'mcpServer/startupStatus/updated', params: { name: 'appraise_m02', status: 'cancelled' } },
      'MCP_STARTUP_FAILED',
    ],
    [
      { method: 'mcpServer/startupStatus/updated', params: { name: 'foreign', status: 'ready' } },
      'MCP_STARTUP_MALFORMED_OR_FOREIGN',
    ],
    [
      {
        method: 'mcpServer/startupStatus/updated',
        params: { name: 'appraise_m02', status: 'ready', threadId: 'foreign-thread' },
      },
      'MCP_STARTUP_FOREIGN_THREAD',
    ],
    [
      { method: 'mcpServer/startupStatus/updated', params: { name: 'appraise_m02', status: 'unexpected' } },
      'MCP_STARTUP_MALFORMED_OR_FOREIGN',
    ],
    [{ method: 'account/updated', params: { authMode: null, planType: 'plus' } }, 'UNEXPECTED_AUTH_STATE'],
    [{ method: 'account/gatewayOAuth/changed', params: {} }, 'UNKNOWN_REQUEST_OR_NOTIFICATION'],
    [{ id: 17, method: 'unreviewed/request', params: {} }, 'UNKNOWN_REQUEST_OR_NOTIFICATION'],
    [{ method: 'warning', params: { message: 'synthetic', threadId: 'foreign' } }, 'PRESENTATION_FOREIGN_THREAD'],
    [{ method: 'warning', params: { message: 'synthetic' }, result: {} }, 'MIXED_FRAME_FIELDS'],
    [{ method: 'warning', params: { message: 'synthetic' }, error: {} }, 'MIXED_FRAME_FIELDS'],
    [{ id: 17, method: 'warning', params: { message: 'synthetic' }, result: {} }, 'MIXED_FRAME_FIELDS'],
  ]
  for (const [incoming, category] of bad) {
    const h = offlinePeer()
    await assert.rejects(h.peer.feed(peerFrame(incoming)), /UNKNOWN/)
    assert.equal(h.failures[0]?.category, category)
    assert.equal(h.fenced(), true)
    assert.equal(h.sent.length, 0)
    assert.equal(h.acknowledged.includes('mcp-1'), false)
  }
  const quota = offlinePeer()
  for (let index = 0; index < 32; index++)
    await quota.peer.feed(peerFrame({ method: 'warning', params: { message: 'synthetic' } }))
  await assert.rejects(quota.peer.feed(peerFrame({ method: 'warning', params: { message: 'synthetic' } })), /UNKNOWN/)
  assert.equal(quota.failures[0]?.category, 'TELEMETRY_QUOTA')
  const byteQuota = offlinePeer()
  await assert.rejects(
    byteQuota.peer.feed(peerFrame({ method: 'warning', params: { message: 'x'.repeat(16 * 1024) } })),
    /UNKNOWN/,
  )
  assert.equal(byteQuota.failures[0]?.category, 'TELEMETRY_QUOTA')
  const partial = offlinePeer({ partialMethod: 'thread/start' })
  await partial.peer.request('initialize', t1InitializeParams(), 'T1-initialize')
  await assert.rejects(
    partial.peer.feed(peerFrame({ id: 'T1-initialize', result: { userAgent: 'fixture' } })),
    /UNKNOWN/,
  )
  assert.equal(partial.sent.filter(item => item.method === 'thread/start').length, 1)
  assert.equal(partial.fenced(), true)
  const duplicate = offlinePeer()
  await duplicate.peer.request('initialize', t1InitializeParams(), 'T1-initialize')
  await duplicate.peer.feed(peerFrame({ id: 'T1-initialize', result: { userAgent: 'fixture' } }))
  await assert.rejects(duplicate.peer.request('thread/start', { cwd: '/synthetic' }, 'T1-thread-start'), /UNKNOWN/)
  assert.equal(duplicate.sent.filter(item => item.method === 'thread/start').length, 1)
})

test('observed provider target tuple must match pinned model and effort before capture', () => {
  const request = body => ({ body: Buffer.from(JSON.stringify(body)) })
  const validTuple = { model: POLICY.model, reasoning: { effort: POLICY.reasoning }, other: 'discard' }
  assert.deepEqual(assertT1ObservedTuple(request(validTuple)), { model: POLICY.model, effort: POLICY.reasoning })
  for (const body of [
    {},
    { reasoning: { effort: POLICY.reasoning } },
    { model: 'wrong-model', reasoning: { effort: POLICY.reasoning } },
    { model: POLICY.model },
    { model: POLICY.model, reasoning: {} },
    { model: POLICY.model, reasoning: { effort: 'low' } },
    { model: POLICY.model, reasoning: { effort: null } },
  ])
    assert.throws(() => assertT1ObservedTuple(request(body)), /observed target tuple UNKNOWN/)
  assert.throws(() => assertT1ObservedTuple({ body: Buffer.from('{') }), /observed target tuple UNKNOWN/)
  assert.throws(() => assertT1ObservedTuple({ body: Buffer.from([0xff]) }), /observed target tuple UNKNOWN/)
  assert.throws(() => assertT1ObservedTuple({}), /observed target tuple UNKNOWN/)
})
async function driveAdapter(params, state = { captured: true, threadId: 'thread-1', turnId: 'turn-1' }) {
  const accepted = []
  let ambiguous = 0
  const adapter = createT1ErrorAdapter({
    afterCapture: () => state,
    onAccepted: value => accepted.push(value),
    onAmbiguous: () => ambiguous++,
  })
  let rejected = null
  adapter.stream.on('error', () => {})
  await new Promise(resolve =>
    adapter.stream.write(frame(params), error => {
      rejected = error
      resolve()
    }),
  )
  return { accepted, ambiguous, rejected }
}

test('R7 policy is a literal R6 delta for version and p4 root', async () => {
  const old = await fsp.readFile('scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r6/policy.mjs', 'utf8')
  const current = await fsp.readFile('scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r7/policy.mjs', 'utf8')
  assert.equal(
    current,
    old
      .replace('M02-TA-P3-R6-v1', 'M02-TA-P4-R7-v1')
      .replace('/private/tmp/appraise-m02-ta-descriptors-p3', '/private/tmp/appraise-m02-ta-descriptors-p4'),
  )
  assert.equal(POLICY.nativeInference, 0)
  assert.equal(POLICY.permissionGrants, 0)
  assert.equal(POLICY.retries, 0)
  assert.equal(POLICY.deadlineMs.case, 60_000)
  assert.equal(POLICY.deadlineMs.T1, 180_000)
})

test('R7 effect imports resolve locally, with no old policy, launcher, native ports or protocol fallback', async () => {
  const directory = 'scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r7'
  for (const name of ['t1-runner', 'journal', 'launcher', 'composition', 'runtime-effects', 'protocol']) {
    const source = await fsp.readFile(join(directory, `${name}.mjs`), 'utf8')
    assert.doesNotMatch(
      source,
      /\.\.\/codex-app-server-m02-ta\/(?:policy|launcher|composition|runtime-effects|protocol)\.mjs/,
    )
  }
  const native = await fsp.readFile(join(directory, 'runtime-effects.mjs'), 'utf8')
  assert.match(native, /import \{ digest, POLICY \} from '\.\/policy\.mjs'/)
  const runner = await fsp.readFile(join(directory, 't1-runner.mjs'), 'utf8')
  assert.match(runner, /import \{ createTrustedLauncher \} from '\.\/launcher\.mjs'/)
  assert.match(runner, /writeEvidence\(receiptFile\('descriptor-capture\.json'\), result\)\s+capture = result/)
})

test('runtime import closure adds no AJV or unresolved package dependency', async () => {
  const directory = 'scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r7'
  const allowedExternal = new Set([
    '../codex-app-server-m02-b1/framing.mjs',
    '../../../../packages/appraisejs/dist/mcp/trusted-worker-bridge.js',
    '../../../../packages/appraisejs/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js',
  ])
  for (const filename of await fsp.readdir(directory)) {
    if (!filename.endsWith('.mjs')) continue
    const source = await fsp.readFile(join(directory, filename), 'utf8')
    assert.doesNotMatch(source, /(?:from|import\()\s*['"]ajv(?:\/|['"])/)
    for (const match of source.matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1]
      if (specifier.startsWith('node:')) continue
      if (specifier.startsWith('./')) {
        assert.equal(fs.existsSync(join(directory, specifier)), true, `${filename}: ${specifier}`)
        continue
      }
      assert.equal(allowedExternal.has(specifier), true, `${filename}: ${specifier}`)
      assert.equal(fs.existsSync(resolve(directory, specifier)), true, `${filename}: ${specifier}`)
    }
  }
})

test('lost p1 root is absent while exact durable UNKNOWN proof and verdicts remain pinned', () => {
  assert.equal(fs.existsSync(PRIOR_ROOT), false)
  const proof = verifyPriorAttempt()
  assert.equal(proof.classification, 'LOST_RAW_ROOT_AFTER_REVIEW')
  assert.equal(proof.status, 'UNKNOWN')
  assert.equal(proof.originalUnresolvedDecisionDueAt, '2026-10-22T18:54:08.422Z')
  assert.equal(R7_REPLACEMENT.classification, 'P3_UNKNOWN_NO_RESEND')
  assert.equal(R7_REPLACEMENT.originalClassification, proof.classification)
  assert.equal(proof.r5.status, 'UNKNOWN_NO_RESEND')
  assert.equal(proof.r6.journalSha256, R7_REPLACEMENT.priorJournalSha256)
  assert.equal(
    proof.durablePins['.appraisejs/m02-prior-evidence-recovery-20261016-01/journal-from-historical-tool-output.jsonl'],
    '00784593918012207cd76763ceecb7e5ce1aae91790a7d89a3dda21fad1c30ff',
  )
  assert.equal(
    proof.durablePins['.appraisejs/m02-prior-evidence-recovery-20261016-01/provenance.json'],
    '678cc4bee0802038670ab7c731b1b844e82c69d46d03278761172f556fe929d0',
  )
  assert.equal(
    proof.durablePins['.appraisejs/m02-prior-evidence-recovery-20261016-01/review.json'],
    '053380a1e9929895904f1f0cfb001b1c7584e64980abf8e0e55d206ccc9e649b',
  )
  assert.throws(
    () =>
      verifyPriorAttempt(
        new Proxy(fs, {
          get(target, key) {
            if (key === 'lstatSync')
              return path => (path === PRIOR_ROOT ? { isDirectory: () => true } : fs.lstatSync(path))
            return target[key]
          },
        }),
      ),
    /durable proof changed/,
  )
  assert.throws(
    () =>
      verifyPriorAttempt(
        new Proxy(fs, {
          get(target, key) {
            if (key === 'readFileSync')
              return (path, ...args) =>
                String(path).endsWith('m02-t1-r4-exact-review.json')
                  ? Buffer.from('{}')
                  : fs.readFileSync(path, ...args)
            return target[key]
          },
        }),
      ),
    /durable proof changed/,
  )
})

test('R5 p2 root, current owned journal, and archived index are required before any p4 effect', () => {
  const proof = verifyPriorAttempt()
  assert.equal(proof.r5.root, '/private/tmp/appraise-m02-ta-descriptors-p2')
  assert.equal(proof.r5.pending, 'mcpStarts:T1-codex-mcp')
  const journalPath = `${proof.r5.root}/supervisor/journal/journal.jsonl`
  assert.throws(
    () =>
      verifyPriorAttempt(
        new Proxy(fs, {
          get(target, key) {
            if (key === 'lstatSync')
              return path =>
                path === proof.r5.root
                  ? { ...fs.lstatSync(path), ino: 1, isDirectory: () => true, isSymbolicLink: () => false }
                  : fs.lstatSync(path)
            return target[key]
          },
        }),
      ),
    /durable proof changed/,
  )
  let changedFd = null
  assert.throws(
    () =>
      verifyPriorAttempt(
        new Proxy(fs, {
          get(target, key) {
            if (key === 'openSync')
              return (path, ...args) => {
                const fd = fs.openSync(path, ...args)
                if (path === journalPath) changedFd = fd
                return fd
              }
            if (key === 'readFileSync')
              return (path, ...args) => (path === changedFd ? Buffer.from('changed') : fs.readFileSync(path, ...args))
            return target[key]
          },
        }),
      ),
    /durable proof changed/,
  )
})

test('R6 p3 UNKNOWN root and owned journal bytes remain exact before any p4 effect', () => {
  const proof = verifyPriorAttempt()
  assert.equal(proof.r6.root, '/private/tmp/appraise-m02-ta-descriptors-p3')
  assert.deepEqual(proof.r6.pending, ['mcpStarts:T1-codex-mcp', 'threadStarts:T1-thread-start'])
  assert.equal(proof.r6.ownedCodexExitObserved, true)
  assert.equal(proof.r6.mcpExitProved, false)
  assert.equal(fs.existsSync('/private/tmp/appraise-m02-ta-descriptors-p4'), false)
  for (const path of [proof.r6.root, `${proof.r6.root}/supervisor/journal/journal.jsonl`]) {
    assert.throws(
      () =>
        verifyPriorAttempt(
          new Proxy(fs, {
            get(target, key) {
              if (key === 'lstatSync')
                return targetPath =>
                  targetPath === path
                    ? {
                        ...fs.lstatSync(targetPath),
                        ino: 1,
                        isDirectory: () => targetPath === proof.r6.root,
                        isFile: () => targetPath !== proof.r6.root,
                        isSymbolicLink: () => false,
                      }
                    : fs.lstatSync(targetPath)
              return target[key]
            },
          }),
        ),
      /durable proof changed/,
    )
  }
  const journalPath = `${proof.r6.root}/supervisor/journal/journal.jsonl`
  let changedFd = null
  assert.throws(
    () =>
      verifyPriorAttempt(
        new Proxy(fs, {
          get(target, key) {
            if (key === 'openSync')
              return (path, ...args) => {
                const fd = fs.openSync(path, ...args)
                if (path === journalPath) changedFd = fd
                return fd
              }
            if (key === 'readFileSync')
              return (path, ...args) => (path === changedFd ? Buffer.from('changed') : fs.readFileSync(path, ...args))
            return target[key]
          },
        }),
      ),
    /durable proof changed/,
  )
})

test('all 318 new schemas and executable metadata are pinned in pure preparation', async () => {
  const prepared = await prepareT1()
  assert.deepEqual(prepared.blockers, [])
  assert.equal(prepared.manifest.root, POLICY.roots.T1)
  assert.equal(prepared.manifest.replacementAttempt.classification, 'P3_UNKNOWN_NO_RESEND')
  assert.equal(prepared.manifest.replacementAttempt.originalClassification, 'LOST_RAW_ROOT_AFTER_REVIEW')
  assert.equal(prepared.manifest.artifacts.filter(item => item.purpose.startsWith('schema:')).length, 318)
  assert.equal(prepared.manifest.artifacts.find(item => item.purpose === 'codex').sha256, POLICY.executable.sha256)
  assert.equal(
    prepared.manifest.artifacts.find(item => item.purpose === 'schema').sha256,
    POLICY.executable.schemaDigest,
  )
  assert.equal(
    prepared.manifest.artifacts.find(item => item.purpose === 'protocol-framing').sha256,
    '40aacec14d421f41c1c1da5dc9bec2d491ca713f0c8e3552f495d60b9eda8a34',
  )
  assert.equal(prepared.manifestDigest, digest(prepared.manifest))
  assert.equal(prepared.qualification, 'OFFLINE_PREPARED_ONLY')
})

test('actual R7 outgoing request parameters validate against new draft-07 schemas', () => {
  const manifest = { phase: 'T1', root: POLICY.roots.T1 }
  const actual = prepareTrustedCase({ manifest, manifestDigest: digest(manifest) }, 'T1', {
    port: 44000,
    mcpExecutable: '/opt/homebrew/Cellar/node/26.11.0/bin/node',
    mcpArgs: ['scoped-worker-entry.mjs'],
  })
  valid('v1/InitializeParams.json', t1InitializeParams())
  valid('v2/ThreadStartParams.json', actual.threadStartParams)
  valid('v2/TurnStartParams.json', t1TurnParams(thread.id))
  assert.equal(actual.config.model_providers['m02-scripted'].request_max_retries, 0)
  assert.equal(actual.config.model_providers['m02-scripted'].stream_max_retries, 0)
  assert.equal(actual.config.approval_policy, 'never')
  assert.equal(actual.config.model, 'gpt-6.1-sol')
})

test('full synthetic responses and lifecycle notifications validate under new schemas', () => {
  valid('v1/InitializeResponse.json', {
    codexHome: `${POLICY.roots.T1}/cases/T1/codex`,
    platformFamily: 'unix',
    platformOs: 'macos',
    userAgent: 'offline-fixture',
  })
  valid('v2/ThreadStartResponse.json', {
    approvalPolicy: 'never',
    approvalsReviewer: 'user',
    cwd: POLICY.roots.T1,
    model: POLICY.model,
    modelProvider: 'm02-scripted',
    sandbox: { type: 'workspaceWrite' },
    thread,
  })
  valid('v2/TurnStartResponse.json', { turn })
  valid('v2/ThreadStartedNotification.json', { thread })
  valid('v2/TurnStartedNotification.json', { threadId: thread.id, turn })
  valid('v2/TurnCompletedNotification.json', { threadId: thread.id, turn: { ...turn, status: 'failed' } })
  for (const variant of ['httpConnectionFailed', 'responseStreamDisconnected', 'responseStreamConnectionFailed'])
    valid('v2/ErrorNotification.json', errorParams(variant))
  const check = schema('v2/ErrorNotification.json')
  assert.equal(check({ ...errorParams('responseStreamConnectionFailed'), willRetry: undefined }), false)
  assert.equal(check({ ...errorParams('responseStreamConnectionFailed'), threadId: undefined }), false)
})

test('R7 adapter accepts only the three captured exact nonretry 503 variants', async () => {
  for (const variant of ['httpConnectionFailed', 'responseStreamDisconnected', 'responseStreamConnectionFailed']) {
    const result = await driveAdapter(errorParams(variant))
    assert.equal(result.rejected, null)
    assert.equal(result.ambiguous, 0)
    assert.equal(result.accepted.length, 1)
    assert.equal(result.accepted[0].httpStatusCode, 503)
  }
  const mutations = [
    [errorParams('responseStreamConnectionFailed'), { captured: false, threadId: 'thread-1', turnId: 'turn-1' }],
    [{ ...errorParams('responseStreamConnectionFailed'), willRetry: true }],
    [{ ...errorParams('responseStreamConnectionFailed'), threadId: 'different' }],
    [{ ...errorParams('responseStreamConnectionFailed'), turnId: 'different' }],
    [
      {
        ...errorParams('responseStreamConnectionFailed'),
        error: { message: 'x', codexErrorInfo: { responseStreamConnectionFailed: { httpStatusCode: 502 } } },
      },
    ],
    [
      {
        ...errorParams('responseStreamConnectionFailed'),
        error: { message: 'x', codexErrorInfo: { responseStreamConnectionFailed: { httpStatusCode: null } } },
      },
    ],
    [
      {
        ...errorParams('responseStreamConnectionFailed'),
        error: { message: 'x', codexErrorInfo: { responseStreamConnectionFailed: {} } },
      },
    ],
    [
      {
        ...errorParams('responseStreamConnectionFailed'),
        error: {
          message: 'x',
          codexErrorInfo: { responseStreamConnectionFailed: { httpStatusCode: 503, extra: true } },
        },
      },
    ],
    [
      {
        ...errorParams('responseStreamConnectionFailed'),
        error: { message: 'x', codexErrorInfo: { responseStreamConnectionFailed: { httpStatusCode: 503 }, other: {} } },
      },
    ],
    [errorParams('newVariant')],
  ]
  for (const [params, state] of mutations) {
    const result = await driveAdapter(params, state)
    assert.ok(result.rejected)
    assert.equal(result.accepted.length, 0)
    assert.ok(result.ambiguous > 0)
  }
})

test('pre-effect gates reject prior/root/artifact drift without constructing runtime ports', async () => {
  const prepared = await prepareT1()
  let constructed = 0
  const make = preflight =>
    runT1({
      prepared,
      approved: async () => true,
      createJournal: () => {
        constructed++
        throw new Error('unexpected runtime journal')
      },
      preflight: {
        prepare: async () => prepared,
        verifyPrior: () => {},
        rootExists: () => false,
        verifyArtifacts: async () => {},
        sanitize: () => {},
        ...preflight,
      },
    })
  await assert.rejects(
    make({
      verifyPrior: () => {
        throw new Error('prior changed')
      },
    }),
    /prior changed/,
  )
  await assert.rejects(make({ rootExists: () => true }), /phase root already exists/)
  await assert.rejects(
    make({
      verifyArtifacts: async () => {
        throw new Error('binary or schema changed')
      },
    }),
    /binary or schema changed/,
  )
  await assert.rejects(
    make({ prepare: async () => ({ ...prepared, manifestDigest: '0'.repeat(64) }) }),
    /inventory differs/,
  )
  assert.equal(constructed, 0)
})

test('schema-valid peer sequence accepts failed terminal only after captured provider error', async () => {
  const { TrustedAppServerPeer } = await import('./fixtures/codex-app-server-m02-ta-runtime-r7/protocol.mjs')
  const manifest = { phase: 'T1', root: POLICY.roots.T1 }
  const config = prepareTrustedCase({ manifest, manifestDigest: digest(manifest) }, 'T1', {
    port: 44000,
    mcpExecutable: '/opt/homebrew/Cellar/node/26.11.0/bin/node',
  })
  let fenced = false
  const writes = []
  const journal = {
    snapshot: () => ({ pending: [], fenced }),
    acknowledge: async () => {},
    markUnknown: async () => {
      fenced = true
    },
  }
  const coordinator = { perform: async (_kind, _id, effect) => effect({}) }
  const make = captured =>
    new TrustedAppServerPeer({
      coordinator,
      journal,
      write: async bytes => {
        writes.push(JSON.parse(bytes))
        return bytes.length
      },
      caseId: 'T1',
      threadStartParams: config.threadStartParams,
      verifyCaptureTerminal: () => captured.value,
    })
  const captured = { value: false }
  const peer = make(captured)
  await peer.request('initialize', t1InitializeParams(), 'T1-initialize')
  await peer.feed(
    Buffer.from(
      `${JSON.stringify({ id: 'T1-initialize', result: { codexHome: '/private/tmp/x', platformFamily: 'unix', platformOs: 'macos', userAgent: 'fixture' } })}\n`,
    ),
  )
  assert.equal(writes.filter(item => item.method === 'thread/start').length, 1)
  const threadResult = {
    approvalPolicy: 'never',
    approvalsReviewer: 'user',
    cwd: POLICY.roots.T1,
    model: POLICY.model,
    modelProvider: 'm02-scripted',
    sandbox: { type: 'workspaceWrite' },
    thread,
  }
  valid('v2/ThreadStartResponse.json', threadResult)
  await peer.feed(Buffer.from(`${JSON.stringify({ id: 'T1-thread-start', result: threadResult })}\n`))
  await peer.request('turn/start', t1TurnParams(thread.id), 'T1-turn-start')
  const turnResult = { turn }
  valid('v2/TurnStartResponse.json', turnResult)
  await peer.feed(Buffer.from(`${JSON.stringify({ id: 'T1-turn-start', result: turnResult })}\n`))
  assert.equal(peer.snapshot().phase, 'turn')
  const terminal = { method: 'turn/completed', params: { threadId: thread.id, turn: { ...turn, status: 'failed' } } }
  valid('v2/TurnCompletedNotification.json', terminal.params)
  await assert.rejects(peer.feed(Buffer.from(`${JSON.stringify(terminal)}\n`)), /UNKNOWN/)
  assert.equal(fenced, true)
  assert.equal(writes.filter(item => item.method === 'turn/start').length, 1)

  // A fresh isolated peer can accept that same terminal once the durable capture flag is true.
  fenced = false
  captured.value = true
  const peer2 = make(captured)
  await peer2.request('initialize', t1InitializeParams(), 'T1-initialize-2')
  await peer2.feed(Buffer.from(`${JSON.stringify({ id: 'T1-initialize-2', result: { userAgent: 'fixture' } })}\n`))
  await peer2.feed(Buffer.from(`${JSON.stringify({ id: 'T1-thread-start', result: threadResult })}\n`))
  await peer2.request('turn/start', t1TurnParams(thread.id), 'T1-turn-start-2')
  await peer2.feed(Buffer.from(`${JSON.stringify({ id: 'T1-turn-start-2', result: turnResult })}\n`))
  await peer2.feed(Buffer.from(`${JSON.stringify(terminal)}\n`))
  assert.equal(peer2.snapshot().phase, 'capture-stopped')
  assert.equal(writes.filter(item => item.method === 'turn/start').length, 2)
})

test(
  'R7 pinned backend stages into an isolated private temp root with local dependency resolution',
  { timeout: 120_000 },
  async () => {
    const { mkdtemp, mkdir, rm, lstat } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { stageT1Modules, verifyT1ModuleResolution } =
      await import('./fixtures/codex-app-server-m02-ta-runtime-r7/t1-module-stage.mjs')
    const prepared = await prepareT1()
    const root = await fsp.realpath(await mkdtemp(join(tmpdir(), 'appraise-m02-r7-offline-stage-')))
    const supervisor = join(root, 'supervisor')
    const moduleRoot = join(supervisor, 'modules')
    try {
      await mkdir(supervisor, { mode: 0o700 })
      const changed = structuredClone(prepared)
      changed.manifest.artifacts.find(item => item.purpose === 'canonical-backend').sha256 = '0'.repeat(64)
      await assert.rejects(stageT1Modules({ prepared: changed, moduleRoot }), /module source hash drift/)
      await rm(moduleRoot, { recursive: true, force: true })
      const staged = await stageT1Modules({ prepared, moduleRoot })
      assert.ok(staged.copiedFiles > 100)
      assert.equal(await verifyT1ModuleResolution(moduleRoot), true)
      assert.equal((await lstat(staged.bundlePath)).isFile(), true)
      await assert.rejects(lstat(join(moduleRoot, '.env')), { code: 'ENOENT' })
      const source = prepared.manifest.artifacts.find(item => item.purpose === 'canonical-backend')
      assert.equal(
        createHash('sha256')
          .update(await fsp.readFile(staged.bundlePath))
          .digest('hex'),
        source.sha256,
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)

test('schema, metadata and executable byte drift block pure preparation', async () => {
  const pin = resolve('scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r7/schema-pin.json')
  const codex = POLICY.executable.path
  for (const changed of [
    pin,
    codex,
    resolve('.appraisejs/m02-executable-qualification-20261016-01/metadata-result.json'),
    resolve('.appraisejs/m02-executable-qualification-20261016-01/schema-inventory.json'),
  ]) {
    const io = new Proxy(fsp, {
      get(target, key) {
        if (key === 'readFile')
          return (path, ...args) =>
            path === changed ? Promise.resolve(Buffer.from('changed-offline-fixture')) : fsp.readFile(path, ...args)
        return target[key]
      },
    })
    await assert.rejects(
      prepareT1({ io }),
      /schema pin drift|T1 composition blocked|schema metadata pin drift|schema inventory pin drift/,
    )
  }
})

test('duplicate accepted provider error and unknown peer request fence UNKNOWN without resend', async () => {
  const accepted = []
  let ambiguous = 0
  const adapter = createT1ErrorAdapter({
    afterCapture: () => ({ captured: true, threadId: thread.id, turnId: turn.id }),
    onAccepted: value => accepted.push(value),
    onAmbiguous: () => ambiguous++,
  })
  adapter.stream.on('error', () => {})
  await new Promise((resolve, reject) =>
    adapter.stream.write(frame(errorParams('responseStreamConnectionFailed')), error =>
      error ? reject(error) : resolve(),
    ),
  )
  await new Promise(resolve =>
    adapter.stream.write(frame(errorParams('responseStreamConnectionFailed')), error => {
      assert.ok(error)
      resolve()
    }),
  )
  assert.equal(accepted.length, 1)
  assert.ok(ambiguous > 0)
  const { TrustedAppServerPeer } = await import('./fixtures/codex-app-server-m02-ta-runtime-r7/protocol.mjs')
  let fenced = false
  let writes = 0
  const peer = new TrustedAppServerPeer({
    coordinator: { perform: async (_kind, _id, effect) => effect({}) },
    journal: {
      snapshot: () => ({ pending: [], fenced }),
      markUnknown: async () => {
        fenced = true
      },
      acknowledge: async () => {},
    },
    write: async bytes => {
      writes++
      return bytes.length
    },
    caseId: 'T1',
  })
  await assert.rejects(peer.request('thread/resume', {}, 'forbidden'), /UNKNOWN/)
  assert.equal(fenced, true)
  assert.equal(writes, 0)
})

const hash = 'sha256:' + 'a'.repeat(64)
const privateDirectory = (ino = 2) => ({
  dev: 1,
  ino,
  uid: process.getuid(),
  mode: 0o700,
  isDirectory: () => true,
  isFile: () => false,
  isSymbolicLink: () => false,
})

function fakeRun({
  foreignStartup = false,
  hangingStop = false,
  providerBody = null,
  childExit = null,
  stallThread = false,
  fenceThread = false,
} = {}) {
  const artifacts = [
    'codex',
    'interpreter',
    'supervisor',
    'scoped-mcp-entry',
    'policy',
    'schema',
    'canonical-backend',
    'descriptor-collector',
  ].map((purpose, index) => ({
    purpose,
    path: purpose === 'codex' ? POLICY.executable.path : `/synthetic/${purpose}`,
    sha256: purpose === 'codex' ? POLICY.executable.sha256 : String(index + 1).padStart(64, '0'),
  }))
  const base = prepareTrustedComposition({ phase: 'T1', artifacts })
  const manifest = { ...base.manifest, root: T1_ROOT, replacementAttempt: R7_REPLACEMENT }
  const prepared = { ...base, manifest, manifestDigest: digest(manifest) }
  const journal = {
    fenced: false,
    counts: { providerRequests: 0, scopedCalls: 0 },
    completed: false,
    snapshot() {
      return { fenced: this.fenced, counts: this.counts, pending: [], seq: 3 }
    },
    markUnknown() {
      this.fenced = true
    },
    close() {},
  }
  const capability = 'a'.repeat(43)
  const config = {
    schema: 'appraise.m02-ta-bridge-bootstrap/v1',
    caseId: 'T1',
    capability,
    url: 'http://127.0.0.1:44000/m02/canonical',
  }
  const profileDigest = hash
  const capabilityHash = `sha256:${createHash('sha256').update(capability).digest('hex')}`
  const bootstrapHash = `sha256:${createHash('sha256').update(JSON.stringify(config)).digest('hex')}`
  const receipt = event => ({
    schema: 'appraise.m02-ta-t1-child-receipt/v1',
    caseId: 'T1',
    event,
    evidenceClass: 'TRUSTED_CHILD_SELF_REPORT',
    capabilityHash: foreignStartup ? 'sha256:' + 'b'.repeat(64) : capabilityHash,
    bootstrapHash: foreignStartup ? 'sha256:' + 'b'.repeat(64) : bootstrapHash,
    profileDigest,
    ...(event === 'node-exit-handler' ? { exitCode: 0 } : {}),
  })
  const io = {
    childObservations: [
      childExit ?? { exit: { code: null, signal: 'SIGTERM' }, close: { code: null, signal: 'SIGTERM' } },
    ],
    owned: { serverClosed: true, killCount: 1, serverCloseCount: 1 },
    nativeError: () => ({
      threadId: 'actual-thread-1',
      turnId: 'actual-turn-1',
      httpStatusCode: 503,
      notificationSha256: hash,
    }),
  }
  let capturedContext,
    capturedEvidence,
    finishCalled = false,
    starts = 0,
    evidenceWrites = 0
  const dependencies = {
    prepared,
    approved: () => true,
    collectorBundle: '/synthetic/descriptor-collector',
    bridgeBundle: '/synthetic/canonical-backend',
    createJournal: () => journal,
    preflight: {
      prepare: async () => prepared,
      verifyPrior: () => {},
      rootExists: () => false,
      verifyArtifacts: async () => {},
      sanitize: () => {},
      rootStat: () => privateDirectory(),
    },
    makeIo: () => io,
    makeJournalFacade: value => value,
    readChildReceipt: async path =>
      receipt(path.endsWith('mcp-startup.json') ? 'sdk-connect-returned' : 'node-exit-handler'),
    writeEvidence: (_path, value) => {
      evidenceWrites++
      capturedEvidence = value
    },
    writePreparationReceipt: () => {},
    loadBridge: async () => ({
      createLazyCanonicalSupervisorBridge: () => ({
        bootstrapConfig: () => config,
        handle: async request => ({ ok: true, requestId: request.requestId }),
        fenced: false,
        close: async () => {},
      }),
    }),
    stageModules: async () => ({
      bundlePath: '/synthetic/canonical-backend',
      copiedFiles: 4,
      stagedDigest: 'a'.repeat(64),
    }),
    loadCollector: async () => ({
      NativeDescriptorCollector: class {
        capture(_request, context) {
          capturedContext = context
          return { status: 'CAPTURED', descriptorHash: hash, provenance: { turnId: context.turnId } }
        }
      },
    }),
    makeLauncher: ({ verifyMcpStartup, journal: suppliedJournal }) => ({
      async startCase({ onCaptured, canonicalBridge }) {
        starts++
        canonicalBridge.bootstrapConfig(config.url)
        const state = { phase: 'new', threadId: null, turnId: null }
        const peer = {
          snapshot: () => ({ ...state }),
          async request(method, params) {
            if (method === 'initialize') {
              state.phase = 'ready'
              await this.request('thread/start', {}, 'T1-thread-start')
            } else if (method === 'thread/start') {
              if (fenceThread) {
                suppliedJournal.markUnknown()
                return
              }
              if (stallThread) return
              await canonicalBridge.handle({ action: 'bootstrap', requestId: 'bootstrap-1', payload: {} })
              await canonicalBridge.handle({
                action: 'bindProfile',
                requestId: 'profile-1',
                payload: { advertisedProfile: { profileDigest } },
              })
              if (!(await verifyMcpStartup({ thread: { id: 'actual-thread-1' } }))) {
                suppliedJournal.markUnknown()
                throw new Error('MCP startup UNKNOWN')
              }
              state.threadId = 'actual-thread-1'
              state.phase = 'thread'
            } else if (method === 'turn/start') {
              assert.equal(params.threadId, 'actual-thread-1')
              state.turnId = 'actual-turn-1'
              state.phase = 'turn'
              journal.counts.providerRequests++
              await onCaptured({
                method: 'POST',
                path: '/v1/responses',
                headers: {},
                body: Buffer.from(
                  JSON.stringify(providerBody ?? { model: POLICY.model, reasoning: { effort: POLICY.reasoning } }),
                ),
              })
              state.phase = 'capture-stopped'
            }
          },
        }
        return {
          peer,
          config: { config: {}, threadStartParams: {} },
          coordinator: {
            complete: async input => {
              assert.equal(input.cleanupKnown, true)
              assert.equal(input.verifyEvidence(), true)
              finishCalled = true
              journal.completed = true
            },
          },
          stopOwned: () => (hangingStop ? new Promise(() => {}) : Promise.resolve({ listenerClosed: true })),
        }
      },
    }),
  }
  return {
    dependencies,
    journal,
    config,
    profileDigest,
    evidence: () => ({ capturedContext, capturedEvidence, finishCalled, starts, evidenceWrites }),
  }
}

test('owned Codex exit accepts only consistent observed SIGTERM or zero exit after one stop', async () => {
  const term = { code: null, signal: 'SIGTERM' }
  const zero = { code: 0, signal: null }
  assert.equal(ownedCodexExitProved(term, term, 1), true)
  assert.equal(ownedCodexExitProved(zero, zero, 1), true)
  for (const [exit, close, count] of [
    [term, term, 0],
    [zero, zero, 2],
    [term, zero, 1],
    [{ code: 1, signal: null }, { code: 1, signal: null }, 1],
    [{ code: null, signal: 'SIGKILL' }, { code: null, signal: 'SIGKILL' }, 1],
    [term, null, 1],
  ])
    assert.equal(ownedCodexExitProved(exit, close, count), false)

  const accepted = fakeRun({ childExit: { exit: zero, close: zero } })
  assert.equal((await runT1(accepted.dependencies)).status, 'T1_CAPTURED')
  const rejected = fakeRun({ childExit: { exit: { code: 1, signal: null }, close: { code: 1, signal: null } } })
  await assert.rejects(runT1(rejected.dependencies), /owned child exit evidence incomplete/)
  assert.equal(rejected.journal.fenced, true)
  assert.equal(rejected.evidence().finishCalled, false)
})

test('an unresolved thread/start deadline stays UNKNOWN without a turn or capture', async () => {
  const fixture = fakeRun({ stallThread: true })
  fixture.dependencies.caseDeadlineMs = 100
  await assert.rejects(runT1(fixture.dependencies), /T1 deadline; UNKNOWN/)
  assert.equal(fixture.journal.fenced, true)
  assert.equal(fixture.evidence().capturedContext, undefined)
  assert.equal(fixture.evidence().finishCalled, false)
})

test('a fenced peer wakes the T1 phase wait before its deadline and never sends a turn', async () => {
  const fixture = fakeRun({ fenceThread: true })
  fixture.dependencies.caseDeadlineMs = 1000
  const startedAt = Date.now()
  await assert.rejects(runT1(fixture.dependencies), /T1 peer fenced UNKNOWN/)
  assert.ok(Date.now() - startedAt < 500)
  assert.equal(fixture.journal.fenced, true)
  assert.equal(fixture.evidence().capturedContext, undefined)
})

test('full inert R7 T1 flow accepts only remote-disabled telemetry during actual peer startup', async () => {
  const fixture = fakeRun()
  let h
  let captured = false
  let completed = false
  let observedRemote = 0
  fixture.dependencies.makeLauncher = ({ verifyMcpStartup }) => ({
    async startCase({ onCaptured, canonicalBridge }) {
      canonicalBridge.bootstrapConfig(fixture.config.url)
      h = offlinePeer({
        verifyMcpStartup: async result => {
          await canonicalBridge.handle({ action: 'bootstrap', requestId: 'bootstrap-1', payload: {} })
          await canonicalBridge.handle({
            action: 'bindProfile',
            requestId: 'profile-1',
            payload: { advertisedProfile: { profileDigest: fixture.profileDigest } },
          })
          return verifyMcpStartup(result)
        },
        verifyCaptureTerminal: () => captured,
        onWrite: async message => {
          const disabled = {
            method: 'remoteControl/status/changed',
            params: {
              installationId: 'synthetic-installation',
              serverName: 'synthetic-server',
              status: 'disabled',
              environmentId: null,
            },
          }
          if (message.method === 'initialize') {
            await h.peer.feed(peerFrame(disabled))
            observedRemote++
            await h.peer.feed(
              Buffer.concat([peerFrame({ id: message.id, result: { userAgent: 'fixture' } }), peerFrame(disabled)]),
            )
            observedRemote++
          } else if (message.method === 'thread/start') {
            await h.peer.feed(peerFrame({ id: message.id, result: { thread: { id: 'actual-thread-1' } } }))
            await h.peer.feed(peerFrame(disabled))
            observedRemote++
          } else if (message.method === 'turn/start') {
            await h.peer.feed(peerFrame({ id: message.id, result: { turn: { id: 'actual-turn-1' } } }))
            fixture.journal.counts.providerRequests++
            await onCaptured({
              method: 'POST',
              path: '/v1/responses',
              headers: {},
              body: Buffer.from(JSON.stringify({ model: POLICY.model, reasoning: { effort: POLICY.reasoning } })),
            })
            captured = true
            await h.peer.feed(
              peerFrame({
                method: 'turn/completed',
                params: { threadId: 'actual-thread-1', turn: { id: 'actual-turn-1', status: 'failed' } },
              }),
            )
          }
        },
      })
      return {
        peer: h.peer,
        config: { config: {}, threadStartParams: { cwd: '/synthetic' } },
        coordinator: {
          complete: async input => {
            assert.equal(input.cleanupKnown, true)
            assert.equal(input.verifyEvidence(), true)
            completed = true
          },
        },
        stopOwned: async () => ({ listenerClosed: true }),
      }
    },
  })
  const result = await runT1(fixture.dependencies)
  assert.equal(result.status, 'T1_CAPTURED')
  assert.equal(observedRemote, 3)
  assert.equal(h.fenced(), false)
  assert.equal(h.sent.filter(item => item.method === 'thread/start').length, 1)
  assert.equal(h.sent.filter(item => item.method === 'turn/start').length, 1)
  assert.equal(completed, true)
})

test('actual R7 stage receipt is fsynced in a private temp supervisor before inert launcher entry', async () => {
  const root = await fsp.realpath(
    await fsp.mkdtemp(join((await import('node:os')).tmpdir(), 'appraise-m02-r7-run-receipt-')),
  )
  try {
    const supervisor = join(root, 'supervisor')
    await fsp.mkdir(supervisor, { mode: 0o700 })
    const fixture = fakeRun()
    fixture.journal.parentStats = [fs.lstatSync(root), fs.lstatSync(supervisor)]
    fixture.dependencies.writePreparationReceipt = input => writeT1PreparationReceipt({ ...input, phaseRoot: root })
    const oldMakeLauncher = fixture.dependencies.makeLauncher
    let beforeLauncher = false
    fixture.dependencies.makeLauncher = input => {
      const receipt = JSON.parse(fs.readFileSync(join(supervisor, 'module-stage.json'), 'utf8'))
      assert.equal(receipt.stagedDigest, 'a'.repeat(64))
      assert.equal(fs.existsSync(join(root, 'cases')), false)
      beforeLauncher = true
      return oldMakeLauncher(input)
    }
    const result = await runT1(fixture.dependencies)
    assert.equal(result.status, 'T1_CAPTURED')
    assert.deepEqual(fixture.evidence().capturedEvidence.observedTuple, {
      model: POLICY.model,
      effort: POLICY.reasoning,
    })
    assert.equal(beforeLauncher, true)
    assert.equal(fixture.evidence().starts, 1)
    assert.equal(fs.existsSync(join(root, 'cases')), false)
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})

test('wrong observed provider tuple fences the full inert T1 flow before descriptor capture', async () => {
  const root = await fsp.realpath(
    await fsp.mkdtemp(join((await import('node:os')).tmpdir(), 'appraise-m02-r7-tuple-fail-')),
  )
  try {
    const supervisor = join(root, 'supervisor')
    await fsp.mkdir(supervisor, { mode: 0o700 })
    const fixture = fakeRun({ providerBody: { model: 'wrong-model', reasoning: { effort: POLICY.reasoning } } })
    fixture.journal.parentStats = [fs.lstatSync(root), fs.lstatSync(supervisor)]
    fixture.dependencies.writePreparationReceipt = input => writeT1PreparationReceipt({ ...input, phaseRoot: root })
    await assert.rejects(runT1(fixture.dependencies), /observed target tuple UNKNOWN/)
    assert.equal(fixture.evidence().capturedContext, undefined)
    assert.equal(fixture.evidence().evidenceWrites, 0)
    assert.equal(fixture.journal.fenced, true)
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})

test('UNKNOWN after owned child start records exit and close evidence without promoting cleanup', async () => {
  const root = await fsp.realpath(
    await fsp.mkdtemp(join((await import('node:os')).tmpdir(), 'appraise-m02-r7-unknown-exit-')),
  )
  try {
    const supervisor = join(root, 'supervisor')
    await fsp.mkdir(supervisor, { mode: 0o700 })
    const fixture = fakeRun({ foreignStartup: true })
    fixture.journal.parentStats = [fs.lstatSync(root), fs.lstatSync(supervisor)]
    fixture.dependencies.writePreparationReceipt = input => writeT1PreparationReceipt({ ...input, phaseRoot: root })
    const makeIo = fixture.dependencies.makeIo
    fixture.dependencies.makeIo = (...args) => {
      const io = makeIo(...args)
      io.owned.child = {}
      return io
    }
    await assert.rejects(runT1(fixture.dependencies), /MCP startup UNKNOWN/)
    const evidence = JSON.parse(await fsp.readFile(join(supervisor, 'owned-child-observation.json'), 'utf8'))
    assert.equal(evidence.status, 'UNKNOWN')
    assert.equal(evidence.exitObserved, true)
    assert.equal(evidence.closeObserved, true)
    assert.equal(evidence.processExitProved, true)
    assert.equal(evidence.exitSignal, 'SIGTERM')
    assert.equal(fixture.journal.fenced, true)
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})

test('missing owned child exit observation remains UNKNOWN with explicit unproved cleanup', async () => {
  const root = await fsp.realpath(
    await fsp.mkdtemp(join((await import('node:os')).tmpdir(), 'appraise-m02-r7-unproved-exit-')),
  )
  try {
    const supervisor = join(root, 'supervisor')
    await fsp.mkdir(supervisor, { mode: 0o700 })
    const fixture = fakeRun({ foreignStartup: true })
    fixture.journal.parentStats = [fs.lstatSync(root), fs.lstatSync(supervisor)]
    fixture.dependencies.writePreparationReceipt = input => writeT1PreparationReceipt({ ...input, phaseRoot: root })
    const makeIo = fixture.dependencies.makeIo
    fixture.dependencies.makeIo = (...args) => {
      const io = makeIo(...args)
      io.owned.child = {}
      io.childObservations[0] = { exit: { code: null, signal: 'SIGTERM' }, close: null }
      return io
    }
    await assert.rejects(runT1(fixture.dependencies), /MCP startup UNKNOWN/)
    const evidence = JSON.parse(await fsp.readFile(join(supervisor, 'owned-child-observation.json'), 'utf8'))
    assert.equal(evidence.status, 'UNKNOWN')
    assert.equal(evidence.exitObserved, true)
    assert.equal(evidence.closeObserved, false)
    assert.equal(evidence.processExitProved, false)
    assert.equal(fixture.journal.fenced, true)
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})

test('R7 symlink or missing stage receipt writer fences UNKNOWN, closes journal and never enters launcher', async () => {
  for (const broken of ['symlink', 'writer']) {
    const root = await fsp.realpath(
      await fsp.mkdtemp(join((await import('node:os')).tmpdir(), 'appraise-m02-r7-receipt-fail-')),
    )
    try {
      const supervisor = join(root, 'supervisor')
      await fsp.mkdir(supervisor, { mode: 0o700 })
      const fixture = fakeRun()
      fixture.journal.parentStats = [fs.lstatSync(root), fs.lstatSync(supervisor)]
      if (broken === 'symlink') {
        await fsp.symlink(join(root, 'foreign-target'), join(supervisor, 'module-stage.json'))
        fixture.dependencies.writePreparationReceipt = input => writeT1PreparationReceipt({ ...input, phaseRoot: root })
      } else {
        fixture.dependencies.writePreparationReceipt = () => {
          throw new Error('offline missing writer')
        }
      }
      let launcherCalls = 0
      let closed = false
      fixture.journal.close = () => {
        closed = true
      }
      fixture.dependencies.makeLauncher = () => {
        launcherCalls++
        throw new Error('launcher unreachable')
      }
      await assert.rejects(
        runT1(fixture.dependencies),
        error => error.message === 'T1 preparation UNKNOWN: OWNED_STAGE_RECEIPT_UNCERTAIN',
      )
      assert.equal(launcherCalls, 0)
      assert.equal(fixture.journal.fenced, true)
      assert.equal(closed, true)
      assert.equal(fs.existsSync(join(root, 'cases')), false)
      if (broken === 'symlink') {
        assert.deepEqual(JSON.parse(await fsp.readFile(join(supervisor, 'preparation-error.json'), 'utf8')), {
          schema: 'appraise.m02-ta-t1-preparation-error/v1',
          caseId: 'T1',
          code: 'OWNED_STAGE_RECEIPT_UNCERTAIN',
          status: 'UNKNOWN',
        })
      }
    } finally {
      await fsp.rm(root, { recursive: true, force: true })
    }
  }
})

test('R7 post-journal root identity failure closes UNKNOWN before launcher', async () => {
  const root = await fsp.realpath(
    await fsp.mkdtemp(join((await import('node:os')).tmpdir(), 'appraise-m02-r7-root-fail-')),
  )
  try {
    const supervisor = join(root, 'supervisor')
    await fsp.mkdir(supervisor, { mode: 0o700 })
    const fixture = fakeRun()
    fixture.journal.parentStats = [fs.lstatSync(root), fs.lstatSync(supervisor)]
    fixture.dependencies.writePreparationReceipt = input => writeT1PreparationReceipt({ ...input, phaseRoot: root })
    fixture.dependencies.preflight.rootStat = () => {
      throw new Error('sensitive root detail')
    }
    let launcherCalls = 0
    let closed = false
    fixture.journal.close = () => {
      closed = true
    }
    fixture.dependencies.makeLauncher = () => {
      launcherCalls++
      throw new Error('launcher unreachable')
    }
    await assert.rejects(
      runT1(fixture.dependencies),
      error => error.message === 'T1 preparation UNKNOWN: OWNED_RUNTIME_IO_SETUP_UNCERTAIN',
    )
    assert.equal(launcherCalls, 0)
    assert.equal(fixture.journal.fenced, true)
    assert.equal(closed, true)
    assert.deepEqual(JSON.parse(await fsp.readFile(join(supervisor, 'preparation-error.json'), 'utf8')), {
      schema: 'appraise.m02-ta-t1-preparation-error/v1',
      caseId: 'T1',
      code: 'OWNED_RUNTIME_IO_SETUP_UNCERTAIN',
      status: 'UNKNOWN',
    })
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})

test('failed descriptor receipt write never yields T1 capture acceptance', async () => {
  const fixture = fakeRun()
  let closed = false
  fixture.journal.close = () => {
    closed = true
  }
  fixture.dependencies.writeEvidence = path => {
    if (path.endsWith('/descriptor-capture.json')) throw new Error('offline fsync failure')
  }
  await assert.rejects(runT1(fixture.dependencies))
  assert.equal(fixture.journal.fenced, true)
  assert.equal(closed, true)
  assert.equal(fixture.journal.completed, false)
  assert.equal(fixture.evidence().finishCalled, false)
  assert.equal(fixture.journal.counts.providerRequests, 1)
  assert.equal(fixture.evidence().starts, 1)
  const rejected = await driveAdapter(errorParams('responseStreamConnectionFailed'), {
    captured: false,
    threadId: thread.id,
    turnId: turn.id,
  })
  assert.equal(rejected.accepted.length, 0)
  assert.ok(rejected.rejected)
})
