import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { B2Transport, categorizeAccount, loadValidators } from './transport.mjs'
import { B2Refusal } from './topology.mjs'

const schemaRoot = resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
  '.appraisejs/m13-runtime-evidence/native-introspection-20261114-01/schema/schemas',
)
const validate = loadValidators(schemaRoot)
const initResult = { codexHome: '/fresh/codex', platformFamily: 'unix', platformOs: 'macos', userAgent: 'synthetic' }
function fake(event = () => {}) {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const sent = []
  stdin.on('data', chunk => sent.push(JSON.parse(chunk.toString('utf8'))))
  const transport = new B2Transport({ stdin, stdout, stderr, validate, event })
  const reply = result => stdout.write(`${JSON.stringify({ id: sent.at(-1).id, result })}\n`)
  return { transport, stdout, stderr, sent, reply }
}
async function ready(f) {
  const initialize = f.transport.initialize()
  f.reply(initResult)
  await initialize
  const config = f.transport.configRead('/fresh/cwd')
  f.reply({ config: {}, origins: {} })
  await config
}

test('exact native schema validates closed request sequence with refreshToken false and no thread', async () => {
  const f = fake()
  await ready(f)
  const account = f.transport.accountRead()
  assert.deepEqual(f.sent.at(-1).params, { refreshToken: false })
  f.reply({
    account: {
      type: 'chatgpt',
      email: 'private@example.invalid',
      planType: 'pro',
      workspaceName: 'private-workspace',
      workspaceRouting: { chatgptAccountId: 'private-id' },
    },
    requiresOpenaiAuth: true,
  })
  const observed = await account
  assert.deepEqual(observed, { accountType: 'chatgpt', present: true, requiresOpenaiAuth: true })
  assert.equal(JSON.stringify(observed).includes('private'), false)
  assert.deepEqual(
    f.sent.map(row => row.method),
    ['initialize', 'initialized', 'config/read', 'account/read'],
  )
  assert.deepEqual(f.transport.counts, { initialize: 1, initialized: 1, configRead: 1, accountRead: 1 })
  await assert.rejects(f.transport.accountRead(), { category: 'sequence_refused' })
  f.transport.abort()
})

test('missing/API-key/provider account categories retain no account-specific values', () => {
  for (const type of ['apiKey', 'amazonBedrock', 'gcp'])
    assert.deepEqual(categorizeAccount({ account: { type, extra: 'private' }, requiresOpenaiAuth: true }), {
      accountType: type,
      present: true,
      requiresOpenaiAuth: true,
    })
  assert.deepEqual(categorizeAccount({ account: null, requiresOpenaiAuth: true }), {
    accountType: 'missing',
    present: false,
    requiresOpenaiAuth: true,
  })
})

test('coalesced forbidden server request prevents initialized notification after resolved initialize', async () => {
  const f = fake()
  const initialize = f.transport.initialize()
  f.stdout.write(
    `${JSON.stringify({ id: 1, result: initResult })}\n${JSON.stringify({ id: 99, method: 'account/chatgptAuthTokens/refresh', params: { token: 'private' } })}\n`,
  )
  await assert.rejects(initialize, { category: 'server_request_refused' })
  assert.deepEqual(
    f.sent.map(row => row.method),
    ['initialize'],
  )
  assert.equal(f.transport.counts.initialized, 0)
})

test('coalesced unsolicited notification prevents account observation from escaping', async () => {
  const f = fake()
  await ready(f)
  const account = f.transport.accountRead()
  f.stdout.write(
    `${JSON.stringify({ id: 3, result: { account: { type: 'chatgpt', email: 'private', planType: 'pro' }, requiresOpenaiAuth: true } })}\n${JSON.stringify({ method: 'account/updated', params: { email: 'private' } })}\n`,
  )
  await assert.rejects(account, { category: 'account_update_refused' })
})

test('raw RPC errors and schema failures retain categories only, never payload hashes or account values', async () => {
  for (const response of [
    { error: { code: -32000, message: 'private-email private-token', data: { plan: 'private-plan' } } },
    {
      result: {
        account: { type: 'chatgpt', email: 'private', planType: 'invalid-private-plan' },
        requiresOpenaiAuth: true,
      },
    },
  ]) {
    const f = fake()
    await ready(f)
    const account = f.transport.accountRead()
    f.stdout.write(`${JSON.stringify({ id: 3, ...response })}\n`)
    await assert.rejects(
      account,
      error =>
        error instanceof B2Refusal && !JSON.stringify(error).includes('private') && !Object.hasOwn(error, 'hash'),
    )
  }
})

test('partial EOF and invalid UTF8 cannot pass a native frame', async () => {
  const f = fake()
  const initialize = f.transport.initialize()
  f.stdout.end('{"id":1')
  await assert.rejects(initialize, { category: 'truncated_frame' })
  const g = fake()
  const second = g.transport.initialize()
  g.stdout.write(
    Buffer.concat([Buffer.from('{"id":1,"result":{"userAgent":"'), Buffer.from([0xff]), Buffer.from('"}}\n')]),
  )
  await assert.rejects(second, { category: 'malformed_frame' })
})

test('bounded frames and aggregate output limits discard stderr without decoding or logging', async () => {
  const f = fake()
  const initialize = f.transport.initialize()
  f.stdout.write(Buffer.alloc(256 * 1024 + 1, 65))
  await assert.rejects(initialize, { category: 'frame_limit' })
  const g = fake()
  const second = g.transport.initialize()
  g.stderr.write(Buffer.alloc(8 * 1024 * 1024 + 1))
  await assert.rejects(second, { category: 'output_limit' })
})

test('generated schema rejects guessed account params and malformed account results', () => {
  assert.throws(() => validate('v2/GetAccountParams.json', { refreshToken: 'false' }), B2Refusal)
  assert.throws(
    () => validate('v2/GetAccountResponse.json', { account: { type: 'unknown' }, requiresOpenaiAuth: true }),
    B2Refusal,
  )
})

test('drain completion requires both stdout and stderr EOF', async () => {
  const f = fake()
  let drained = false
  const completion = f.transport.waitForDrain().then(() => {
    drained = true
  })
  f.stdout.end()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(drained, false)
  f.stderr.end()
  await completion
  assert.equal(drained, true)
})

test('successful account reply does not hide a later partial EOF', async () => {
  const f = fake()
  await ready(f)
  const pending = f.transport.accountRead()
  f.reply({ account: { type: 'chatgpt', email: 'private', planType: 'pro' }, requiresOpenaiAuth: true })
  assert.deepEqual(await pending, { accountType: 'chatgpt', present: true, requiresOpenaiAuth: true })
  f.stdout.end('{"unfinished":')
  f.stderr.end()
  await assert.rejects(f.transport.waitForDrain(), { category: 'truncated_frame' })
})

test('coalesced account reply and partial EOF cannot qualify after drain', async () => {
  const f = fake()
  await ready(f)
  const pending = f.transport.accountRead().then(
    value => ({ value }),
    error => ({ error }),
  )
  f.stdout.end(
    `${JSON.stringify({ id: 3, result: { account: { type: 'chatgpt', email: 'private', planType: 'pro' }, requiresOpenaiAuth: true } })}\n{"unfinished":`,
  )
  f.stderr.end()
  await pending
  await assert.rejects(f.transport.waitForDrain(), { category: 'truncated_frame' })
})

test('late fatal UTF8 after account reply is retained through final drain', async () => {
  const f = fake()
  await ready(f)
  const pending = f.transport.accountRead()
  f.reply({ account: { type: 'chatgpt', email: null, planType: 'unknown' }, requiresOpenaiAuth: true })
  await pending
  f.stdout.write(Buffer.from([0xff, 0x0a]))
  f.stdout.end()
  f.stderr.end()
  await assert.rejects(f.transport.waitForDrain(), { category: 'malformed_frame' })
})

test('normal stdout EOF cannot mask a later stderr output bound fault', async () => {
  const f = fake()
  f.stdout.end()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.transport.failureCategory, 'transport_closed')
  f.stderr.write(Buffer.alloc(8 * 1024 * 1024 + 1))
  f.stderr.end()
  await assert.rejects(f.transport.waitForDrain(), { category: 'output_limit' })
})

test('normal stdout EOF cannot mask stderr close without observed end', async () => {
  const f = fake()
  f.stdout.end()
  await new Promise(resolve => setImmediate(resolve))
  f.stderr.destroy()
  await assert.rejects(f.transport.waitForDrain(), { category: 'stream_drain_unobserved' })
})

test('known unsolicited notification emits method-only metadata before retaining the strict refusal', async () => {
  const events = []
  const f = fake(event => events.push(event))
  const initialize = f.transport.initialize()
  f.stdout.write(
    `${JSON.stringify({ method: 'warning', params: { message: 'private-warning', email: 'private@example.invalid', planType: 'pro' } })}\n`,
  )
  await assert.rejects(initialize, { category: 'unsolicited_notification_refused' })
  assert.deepEqual(events, [
    { category: 'notification_method', method: 'warning', sequence: 1, phase: 'INITIALIZATION' },
  ])
  assert.equal(JSON.stringify(events).includes('private'), false)
  assert.equal(Object.hasOwn(events[0], 'hash'), false)
  f.stdout.end()
  f.stderr.end()
  await assert.rejects(f.transport.waitForDrain(), { category: 'unsolicited_notification_refused' })
})

test('only schema-valid disabled remote control with no environment is accepted without retaining identity', async () => {
  for (const extra of [{}, { environmentId: null }]) {
    const events = []
    const f = fake(event => events.push(event))
    const initialize = f.transport.initialize()
    f.stdout.write(
      `${JSON.stringify({ method: 'remoteControl/status/changed', params: { status: 'disabled', installationId: 'private-installation', serverName: 'private-server', ...extra } })}\n`,
    )
    f.reply(initResult)
    await initialize
    assert.deepEqual(events, [{ category: 'remote_control_disabled', count: 1 }])
    assert.equal(JSON.stringify(events).includes('private'), false)
    f.stdout.end()
    f.stderr.end()
    await f.transport.waitForDrain()
  }
})

test('active remote control, a nonnull environment, and invalid native payloads synchronously fence further RPC', async () => {
  for (const params of [
    { status: 'connecting', installationId: 'private', serverName: 'private' },
    { status: 'connected', installationId: 'private', serverName: 'private' },
    { status: 'errored', installationId: 'private', serverName: 'private' },
    { status: 'disabled', installationId: 'private', serverName: 'private', environmentId: '' },
    { status: 'disabled', installationId: 'private', serverName: 'private', environmentId: 'private' },
    { status: 'disabled' },
  ]) {
    const events = []
    const f = fake(event => events.push(event))
    const initialize = f.transport.initialize()
    f.stdout.write(
      `${JSON.stringify({ id: 1, result: initResult })}\n${JSON.stringify({ method: 'remoteControl/status/changed', params })}\n`,
    )
    await assert.rejects(initialize, {
      category: 'installationId' in params ? 'remote_control_status_refused' : 'schema_refused',
    })
    assert.deepEqual(
      f.sent.map(row => row.method),
      ['initialize'],
    )
    assert.equal(JSON.stringify(events).includes('private'), false)
    assert.equal(
      events.some(event => event.category === 'remote_control_disabled'),
      false,
    )
    f.stdout.end()
    f.stderr.end()
    await assert.rejects(f.transport.waitForDrain(), B2Refusal)
  }
})

test('disabled remote-control input noise stops before event 33 and sends no additional RPC', async () => {
  const events = []
  const f = fake(event => events.push(event))
  const initialize = f.transport.initialize()
  const notification =
    JSON.stringify({
      method: 'remoteControl/status/changed',
      params: { status: 'disabled', installationId: 'private', serverName: 'private' },
    }) + '\n'
  f.stdout.write(notification.repeat(33))
  await assert.rejects(initialize, { category: 'remote_control_noise_refused' })
  assert.equal(events.length, 32)
  assert.deepEqual(events.at(-1), { category: 'remote_control_disabled', count: 32 })
  assert.deepEqual(
    f.sent.map(row => row.method),
    ['initialize'],
  )
  assert.equal(JSON.stringify(events).includes('private'), false)
  f.stdout.end()
  f.stderr.end()
  await assert.rejects(f.transport.waitForDrain(), { category: 'remote_control_noise_refused' })
})

const accountResult = {
  account: { type: 'chatgpt', email: 'PRIVATE_ACCOUNT_CANARY', planType: 'pro' },
  requiresOpenaiAuth: true,
}
function accountUpdate(params = { authMode: 'chatgpt' }) {
  return JSON.stringify({ method: 'account/updated', params }) + '\n'
}

test('one account-phase update is reduced to a fixed event while the response alone supplies account facts', async () => {
  const events = []
  const f = fake(event => events.push(event))
  await ready(f)
  let settled = false
  const pending = f.transport.accountRead().then(value => {
    settled = true
    return value
  })
  f.stdout.write(
    accountUpdate({
      authMode: 'chatgpt',
      planType: 'pro',
      email: 'PRIVATE_ACCOUNT_CANARY',
      accountId: 'PRIVATE_ACCOUNT_CANARY',
    }),
  )
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(settled, false)
  assert.deepEqual(events, [{ category: 'account_update_observed', count: 1 }])
  f.reply(accountResult)
  assert.deepEqual(await pending, { accountType: 'chatgpt', present: true, requiresOpenaiAuth: true })
  assert.deepEqual(f.transport.counts, { initialize: 1, initialized: 1, configRead: 1, accountRead: 1 })
  assert.deepEqual(
    f.sent.map(row => row.method),
    ['initialize', 'initialized', 'config/read', 'account/read'],
  )
  assert.equal(JSON.stringify(events).includes('PRIVATE_ACCOUNT_CANARY'), false)
  assert.equal(JSON.stringify(events).includes('chatgpt'), false)
  assert.equal(JSON.stringify(events).includes('pro'), false)
  assert.equal(Object.hasOwn(events[0], 'hash'), false)
  f.stdout.end()
  f.stderr.end()
  await f.transport.waitForDrain()
})

test('coalesced account update and reply preserve the sole response qualification gate', async () => {
  const f = fake()
  await ready(f)
  const pending = f.transport.accountRead()
  f.stdout.write(
    accountUpdate() + JSON.stringify({ id: 3, result: { account: null, requiresOpenaiAuth: true } }) + '\n',
  )
  assert.deepEqual(await pending, { accountType: 'missing', present: false, requiresOpenaiAuth: true })
  f.stdout.end()
  f.stderr.end()
  await f.transport.waitForDrain()
})

for (const params of [
  {},
  { authMode: null },
  ...[
    'apikey',
    'chatgptAuthTokens',
    'headers',
    'agentIdentity',
    'personalAccessToken',
    'bedrockApiKey',
    'bedrockAccessKeys',
  ].map(authMode => ({ authMode })),
])
  test(`account update refuses ${JSON.stringify(params)} without retaining parameters`, async () => {
    const events = []
    const f = fake(event => events.push(event))
    await ready(f)
    const pending = f.transport.accountRead()
    f.stdout.write(accountUpdate({ ...params, accountId: 'PRIVATE_ACCOUNT_CANARY' }))
    await assert.rejects(pending, { category: 'account_update_refused' })
    assert.deepEqual(events, [])
    assert.equal(f.sent.length, 4)
  })

for (const phase of ['unstarted', 'initialize', 'configuration'])
  test(`account update refuses outside account-read phase: ${phase}`, async () => {
    const f = fake()
    let pending
    if (phase === 'initialize') pending = f.transport.initialize()
    if (phase === 'configuration') await ready(f)
    f.stdout.write(accountUpdate())
    if (pending) await assert.rejects(pending, { category: 'account_update_refused' })
    assert.throws(() => f.transport.assertHealthy(), { category: 'account_update_refused' })
    assert.equal(f.transport.counts.accountRead, 0)
  })

test('a second account update refuses before a pending account response can escape', async () => {
  const events = []
  const f = fake(event => events.push(event))
  await ready(f)
  const pending = f.transport.accountRead()
  f.stdout.write(accountUpdate() + accountUpdate())
  await assert.rejects(pending, { category: 'account_update_refused' })
  assert.deepEqual(events, [{ category: 'account_update_observed', count: 1 }])
  assert.equal(f.sent.length, 4)
})

for (const params of [
  { authMode: 7 },
  { authMode: 'unknown' },
  { authMode: 'chatgpt', planType: 'PRIVATE_ACCOUNT_CANARY' },
])
  test(`schema-invalid account update refuses ${JSON.stringify(params)}`, async () => {
    const events = []
    const f = fake(event => events.push(event))
    await ready(f)
    const pending = f.transport.accountRead()
    f.stdout.write(accountUpdate(params))
    await assert.rejects(
      pending,
      error => error.category === 'schema_refused' && !JSON.stringify(error).includes('PRIVATE_ACCOUNT_CANARY'),
    )
    assert.deepEqual(events, [])
  })

test('accepted account update and response never hide malformed late drain', async () => {
  const f = fake()
  await ready(f)
  const pending = f.transport.accountRead()
  f.stdout.write(accountUpdate())
  f.reply(accountResult)
  await pending
  f.stdout.end('{"unfinished":')
  f.stderr.end()
  await assert.rejects(f.transport.waitForDrain(), { category: 'truncated_frame' })
})

test('a late repeated account update remains a refusal through final stream drain', async () => {
  const events = []
  const f = fake(event => events.push(event))
  await ready(f)
  const pending = f.transport.accountRead()
  f.stdout.write(accountUpdate())
  f.reply(accountResult)
  await pending
  f.stdout.end(accountUpdate())
  f.stderr.end()
  await assert.rejects(f.transport.waitForDrain(), { category: 'account_update_refused' })
  assert.deepEqual(events, [{ category: 'account_update_observed', count: 1 }])
  assert.equal(f.sent.length, 4)
})

test('concrete B2 codec preserves first failure without config or account writes after malformed initialization', async () => {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const requests = []
  stdin.on('data', data => requests.push(JSON.parse(data.toString())))
  const client = new B2Transport({ stdin, stdout, stderr, validate })
  const initialized = client.initialize()
  stdout.write('invalid-json\n')
  await assert.rejects(initialized, { category: 'malformed_frame' })
  await assert.rejects(client.configRead('/blocked'), { category: 'malformed_frame' })
  await assert.rejects(client.accountRead(), { category: 'malformed_frame' })
  assert.deepEqual(
    requests.map(request => request.method),
    ['initialize'],
  )
  assert.equal(client.failureCategory, 'malformed_frame')
  stdout.end()
  stderr.end()
  await assert.rejects(client.waitForDrain(), { category: 'malformed_frame' })
})
