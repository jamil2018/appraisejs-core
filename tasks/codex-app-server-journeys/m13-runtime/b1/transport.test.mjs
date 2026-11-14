import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { test } from 'node:test'
import {
  B1Transport,
  B1Refusal,
  SERVER_NAME,
  SERVER_INFO,
  SERVER_CAPABILITIES,
  TOOL_SCHEMA,
  assertReadyStatus,
  isRequiredMcpRefusal,
  loadValidators,
} from './transport.mjs'

const schemaRoot = resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
  '.appraisejs/m13-runtime-evidence/native-introspection-20261114-01/schema/schemas',
)
const validate = loadValidators(schemaRoot)
const initializedResult = {
  codexHome: '/fresh/codex',
  platformFamily: 'unix',
  platformOs: 'macos',
  userAgent: 'synthetic',
}
function fake(event) {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const requests = []
  stdin.on('data', data => requests.push(JSON.parse(data.toString())))
  const transport = new B1Transport({ stdin, stdout, stderr, validate, event })
  const respond = result => stdout.write(`${JSON.stringify({ id: requests.at(-1).id, result })}\n`)
  return { transport, stdout, stderr, requests, respond }
}
function status() {
  return {
    data: [
      {
        name: SERVER_NAME,
        authStatus: 'unsupported',
        runtimeStatus: 'connected',
        toolsError: null,
        serverInfo: { ...SERVER_INFO },
        serverCapabilities: structuredClone(SERVER_CAPABILITIES),
        resources: [],
        resourceTemplates: [],
        tools: { fixture_observe: { name: 'fixture_observe', inputSchema: structuredClone(TOOL_SCHEMA) } },
      },
    ],
    nextCursor: null,
  }
}

test('uses exact generated schema and sends initialize then initialized only once', async () => {
  const f = fake()
  const pending = f.transport.initialize()
  f.respond(initializedResult)
  await pending
  assert.deepEqual(
    f.requests.map(value => value.method),
    ['initialize', 'initialized'],
  )
  await assert.rejects(f.transport.initialize(), { category: 'sequence_refused' })
  f.transport.abort()
})

test('config uses includeLayers false and duplicate requests cannot replay', async () => {
  const f = fake()
  const init = f.transport.initialize()
  f.respond(initializedResult)
  await init
  const config = f.transport.configRead('/fresh/cwd')
  assert.deepEqual(f.requests.at(-1).params, { cwd: '/fresh/cwd', includeLayers: false })
  f.respond({ config: {}, origins: {}, layers: null })
  await config
  await assert.rejects(f.transport.configRead('/fresh/cwd'), { category: 'sequence_refused' })
  f.transport.abort()
})

test('schema errors and raw RPC failures expose only sanitized categories and hashes', async () => {
  const f = fake()
  const pending = f.transport.initialize()
  f.respond({ protectedValue: 'must-never-surface' })
  await assert.rejects(
    pending,
    error => error instanceof B1Refusal && !JSON.stringify(error).includes('must-never-surface'),
  )
})

test('server requests are refused without sending an approval response', async () => {
  const f = fake()
  const pending = f.transport.initialize()
  f.stdout.write(`${JSON.stringify({ id: 99, method: 'item/commandExecution/requestApproval', params: {} })}\n`)
  await assert.rejects(pending, { category: 'server_request_refused' })
  assert.equal(f.requests.length, 1)
})

test('frame and total stderr byte limits refuse bounded streams', async () => {
  const f = fake()
  const pending = f.transport.initialize()
  f.stdout.write(Buffer.alloc(256 * 1024 + 1, 65))
  await assert.rejects(pending, { category: 'frame_limit' })
  const g = fake()
  const second = g.transport.initialize()
  g.stderr.write(Buffer.alloc(8 * 1024 * 1024 + 1))
  await assert.rejects(second, { category: 'output_limit' })
})

test('malformed, uncorrelated and effect notifications fail closed', async () => {
  for (const message of ['{bad\n', '{"id":2,"result":{}}\n', '{"method":"turn/started","params":{}}\n']) {
    const f = fake()
    const pending = f.transport.initialize()
    f.stdout.write(message)
    await assert.rejects(pending, B1Refusal)
  }
})

test('negative predicate requires exact required MCP startup failure, excluding auth and timeouts', () => {
  assert.equal(
    isRequiredMcpRefusal({ code: -32000, message: 'Required MCP server m13_b1_fixture failed to start' }),
    true,
  )
  for (const message of [
    'Required MCP server m13_b1_fixture2 failed',
    'MCP m13_b1_fixture failed',
    'Required MCP server m13_b1_fixture authentication failed',
    'Required MCP server m13_b1_fixture timed out',
    'generic error',
    'Required MCP server m13_b1_fixture ready',
  ])
    assert.equal(isRequiredMcpRefusal({ code: -32000, message }), false)
})

test('native readiness requires connected status, exact inventory and no pagination', () => {
  assert.doesNotThrow(() => {
    validate('v2/ListMcpServerStatusResponse.json', status())
    assertReadyStatus(status())
  })
  for (const change of [
    x => {
      x.nextCursor = 'next'
    },
    x => {
      x.data[0].runtimeStatus = 'starting'
    },
    x => {
      x.data[0].toolsError = 'failed'
    },
    x => {
      x.data[0].tools.fixture_observe.inputSchema.additionalProperties = true
    },
    x => {
      x.data[0].serverInfo.version = '2.0.0'
    },
    x => {
      x.data.push(x.data[0])
    },
  ]) {
    const x = status()
    change(x)
    assert.throws(() => assertReadyStatus(x), B1Refusal)
  }
})

test('invalid generated request parameter shapes are refused', () => {
  assert.throws(() => validate('v2/ListMcpServerStatusParams.json', { limit: '1' }), B1Refusal)
  assert.throws(() => validate('v2/ThreadStartParams.json', { ephemeral: 'true' }), B1Refusal)
})

function emptyThread() {
  return {
    model: 'gpt-6.1-sol',
    modelProvider: 'openai',
    reasoningEffort: 'medium',
    cwd: '/fresh/cwd',
    approvalPolicy: 'never',
    approvalsReviewer: 'user',
    sandbox: { type: 'readOnly' },
    thread: {
      id: 'original-thread',
      cliVersion: '0.167.0-alpha.4.1',
      createdAt: 1,
      updatedAt: 1,
      cwd: '/fresh/cwd',
      ephemeral: true,
      modelProvider: 'openai',
      preview: '',
      projectId: null,
      sessionId: 'original-session',
      source: 'appServer',
      status: { type: 'idle' },
      turns: [],
    },
  }
}

test('full healthy sequence binds status discovery to the original empty ephemeral thread', async () => {
  const f = fake()
  const init = f.transport.initialize()
  f.respond(initializedResult)
  await init
  const config = f.transport.configRead('/fresh/cwd')
  f.respond({ config: {}, origins: {} })
  await config
  const thread = f.transport.startThread('/fresh/cwd')
  f.respond(emptyThread())
  await thread
  const listing = f.transport.listStatus()
  assert.deepEqual(f.requests.at(-1).params, {
    threadId: 'original-thread',
    serverName: SERVER_NAME,
    detail: 'full',
    limit: 1,
  })
  f.respond(status())
  await listing
  assert.deepEqual(
    f.requests.map(value => value.method),
    ['initialize', 'initialized', 'config/read', 'thread/start', 'mcpServerStatus/list'],
  )
  assert.deepEqual(f.transport.counts, { initialize: 1, initialized: 1, configRead: 1, threadStart: 1, statusList: 1 })
  f.transport.abort()
})

test('negative thread refusal is sanitized and cannot reach status without a returned thread', async () => {
  const f = fake()
  const init = f.transport.initialize()
  f.respond(initializedResult)
  await init
  const config = f.transport.configRead('/fresh/cwd')
  f.respond({ config: {}, origins: {} })
  await config
  const thread = f.transport.startThread('/fresh/cwd', true)
  f.stdout.write(
    `${JSON.stringify({ id: f.requests.at(-1).id, error: { code: -32000, message: 'Required MCP server m13_b1_fixture failed to start' } })}\n`,
  )
  await assert.rejects(thread, { category: 'required_mcp_refused' })
  await assert.rejects(f.transport.listStatus(), { category: 'sequence_refused' })
  assert.equal(f.transport.counts.statusList, 0)
  f.transport.abort()
})

test('known optional null server presentation fields are accepted and nonnull drift refuses', () => {
  const x = status()
  Object.assign(x.data[0].serverInfo, { description: null, icons: null, title: null, websiteUrl: null })
  assert.doesNotThrow(() => assertReadyStatus(x))
  x.data[0].serverInfo.title = 'changed'
  assert.throws(() => assertReadyStatus(x), B1Refusal)
})

test('coalesced initialize reply and forbidden frame cannot emit initialized', async () => {
  for (const trailing of [
    JSON.stringify({ id: 99, method: 'item/commandExecution/requestApproval', params: {} }),
    '{bad',
  ]) {
    const f = fake()
    const pending = f.transport.initialize()
    f.stdout.write(`${JSON.stringify({ id: 1, result: initializedResult })}\n${trailing}\n`)
    await assert.rejects(pending, B1Refusal)
    assert.deepEqual(
      f.requests.map(value => value.method),
      ['initialize'],
    )
    assert.equal(f.transport.counts.initialized, 0)
  }
})

test('schema-valid echoed thread privilege or provider contradictions refuse status discovery', async () => {
  for (const change of [
    value => {
      value.approvalPolicy = 'on-request'
    },
    value => {
      value.modelProvider = 'other'
    },
    value => {
      value.thread.modelProvider = 'other'
    },
    value => {
      value.sandbox = { type: 'dangerFullAccess' }
    },
    value => {
      value.sandbox = { type: 'readOnly', networkAccess: true }
    },
  ]) {
    const f = fake()
    const init = f.transport.initialize()
    f.respond(initializedResult)
    await init
    const config = f.transport.configRead('/fresh/cwd')
    f.respond({ config: {}, origins: {} })
    await config
    const response = emptyThread()
    change(response)
    validate('v2/ThreadStartResponse.json', response)
    const thread = f.transport.startThread('/fresh/cwd')
    f.respond(response)
    await assert.rejects(thread, { category: 'thread_contract_refused' })
    await assert.rejects(f.transport.listStatus(), { category: 'sequence_refused' })
    assert.equal(f.transport.counts.statusList, 0)
    f.transport.abort()
  }
})

test('final valid reply followed by partial-frame EOF cannot pass drain', async () => {
  const f = fake()
  const init = f.transport.initialize()
  f.respond(initializedResult)
  await init
  const config = f.transport.configRead('/fresh/cwd')
  f.respond({ config: {}, origins: {} })
  await config
  const thread = f.transport.startThread('/fresh/cwd')
  f.respond(emptyThread())
  await thread
  const listing = f.transport.listStatus()
  f.stdout.end(`${JSON.stringify({ id: f.requests.at(-1).id, result: status() })}\n{"id":`)
  f.stderr.end()
  await listing
  await assert.rejects(f.transport.waitForDrain(), { category: 'partial_frame_eof' })
})

test('fatal UTF-8 decoding refuses malformed byte sequences inside otherwise valid JSON', async () => {
  const f = fake()
  const pending = f.transport.initialize()
  const bytes = Buffer.from(JSON.stringify({ id: 1, result: { ...initializedResult, userAgent: 'X' } }) + '\n')
  bytes[bytes.indexOf('X')] = 0xff
  f.stdout.write(bytes)
  await assert.rejects(pending, { category: 'malformed_frame' })
})

test('stderr output bound after normal stdout EOF still refuses final drain', async () => {
  const f = fake()
  f.stdout.end()
  await new Promise(resolve => f.stdout.once('end', resolve))
  f.stderr.end(Buffer.alloc(8 * 1024 * 1024 + 1))
  await assert.rejects(f.transport.waitForDrain(), { category: 'output_limit' })
})

test('diagnostics retain only declared public method, sequence and phase before policy refusal', async () => {
  const events = []
  const f = fake(value => events.push(value))
  const pending = f.transport.initialize()
  f.stdout.write(JSON.stringify({ method: 'account/updated', params: { authMode: null, planType: null } }) + '\n')
  await assert.rejects(pending, { category: 'notification_refused' })
  assert.deepEqual(events, [
    { category: 'notification_method', method: 'account/updated', sequence: 1, phase: 'INITIALIZATION' },
  ])
  assert.equal(f.requests.length, 1)
})

test('only disabled remote-control status without a remote environment is accepted and redacted', async () => {
  for (const environment of [{}, { environmentId: null }]) {
    const events = []
    const f = fake(value => events.push(value))
    const pending = f.transport.initialize()
    f.stdout.write(
      JSON.stringify({
        method: 'remoteControl/status/changed',
        params: {
          installationId: 'private-installation',
          serverName: 'private-server',
          status: 'disabled',
          ...environment,
        },
      }) + '\n',
    )
    f.respond(initializedResult)
    await pending
    assert.deepEqual(events, [{ category: 'remote_control_disabled', count: 1 }])
    assert.equal(JSON.stringify(events).includes('private-'), false)
    f.transport.abort()
  }
})

test('active, errored, remote-bound or malformed remote control status fences before initialized', async () => {
  for (const params of [
    { status: 'connecting' },
    { status: 'connected' },
    { status: 'errored' },
    { status: 'disabled', environmentId: 'remote-environment' },
    { status: false },
  ]) {
    const f = fake()
    const pending = f.transport.initialize()
    f.stdout.write(
      JSON.stringify({
        method: 'remoteControl/status/changed',
        params: {
          installationId: 'private-installation',
          serverName: 'private-server',
          ...params,
        },
      }) + '\n',
    )
    await assert.rejects(pending, B1Refusal)
    assert.equal(f.requests.length, 1)
    assert.equal(f.transport.counts.initialized, 0)
  }
})

test('disabled remote-control notifications have a finite count bound', async () => {
  const events = []
  const f = fake(value => events.push(value))
  const pending = f.transport.initialize()
  const frame =
    JSON.stringify({
      method: 'remoteControl/status/changed',
      params: {
        installationId: 'private-installation',
        serverName: 'private-server',
        status: 'disabled',
      },
    }) + '\n'
  f.stdout.write(frame.repeat(33))
  await assert.rejects(pending, { category: 'notification_limit' })
  assert.equal(events.length, 32)
  assert.equal(f.requests.length, 1)
})

test('concrete B1 codec preserves first failure and emits no downstream RPC after malformed initialization', async () => {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const requests = []
  stdin.on('data', data => requests.push(JSON.parse(data.toString())))
  const client = new B1Transport({ stdin, stdout, stderr, validate })
  const initialized = client.initialize()
  stdout.write('invalid-json\n')
  await assert.rejects(initialized, { category: 'malformed_frame' })
  await assert.rejects(client.configRead('/blocked'), { category: 'malformed_frame' })
  await assert.rejects(client.startThread('/blocked'), { category: 'malformed_frame' })
  await assert.rejects(client.listStatus(), { category: 'sequence_refused' })
  assert.deepEqual(
    requests.map(request => request.method),
    ['initialize'],
  )
  assert.equal(client.failureCategory, 'malformed_frame')
  stdout.end()
  stderr.end()
  await assert.rejects(client.waitForDrain(), { category: 'malformed_frame' })
})
