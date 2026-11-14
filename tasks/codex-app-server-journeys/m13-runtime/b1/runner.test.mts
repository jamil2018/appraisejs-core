import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  OwnedAcquisition,
  withDeadline,
  runUntilRefused,
  reserveCampaign,
  closedEnvironment,
  writeClosedConfig,
  writeLaunchSpent,
} from '../runtime-common.mts'
import type { OwnedEffects } from '../runtime-common.mts'
import type { SpawnedProcess } from '../../../../src/lib/process/task-spawner.ts'
import { B1Refusal, B1Transport } from './transport.mjs'
import {
  CampaignLifetime,
  CaseLifetime,
  runB1Protocol,
  casePaths,
  renderConfig,
  requiredInputPaths,
  verifyFixtureJournal,
  verifyManifest,
  verifyEffectiveConfig,
} from './runner.mts'

function temporary(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'm13-b1-source-test-'))
  try {
    run(root)
  } finally {
    rmSync(root, { recursive: true })
  }
}

test('deterministic config binds ephemeral credentials and exact single local fixture', () => {
  const root = '/fresh/evidence/b1-campaign'
  for (const mode of ['healthy', 'missing'] as const) {
    const config = renderConfig(root, mode)
    assert.equal(config, renderConfig(root, mode))
    assert.match(config, /cli_auth_credentials_store = "ephemeral"/)
    assert.match(config, /model = "gpt-6.1-sol"/)
    assert.match(config, /model_reasoning_effort = "medium"/)
    assert.match(config, /\[features\]\nhooks = false\nremote_plugin = false\n/)
    assert.equal(config.match(/\[mcp_servers\./g)?.length, 1)
    assert.match(config, /required = true/)
    assert.match(config, /env_vars = \[\]/)
    assert.ok(config.includes(casePaths(root, mode).journal))
  }
  assert.notEqual(renderConfig(root, 'healthy'), renderConfig(root, 'missing'))
})

test('freeze inventory includes exact generated schemas and original supervisor source', () => {
  const paths = requiredInputPaths('/frozen/schema')
  assert.equal(new Set(paths).size, paths.length)
  assert.equal(paths.filter(path => path.startsWith('/frozen/schema/')).length, 12)
  assert.ok(paths.some(path => path.endsWith('/src/lib/process/owned-process-stop.ts')))
  assert.ok(paths.some(path => path.endsWith('/scripts/owned-process-supervisor.mjs')))
  assert.ok(paths.every(path => path.startsWith('/')))
})

test('manifest mismatch refuses before fresh-root reservation or native acquisition', () =>
  temporary(root => {
    const path = join(root, 'manifest.json')
    writeFileSync(path, '{}')
    assert.throws(() => verifyManifest(path, '0'.repeat(64)), { category: 'manifest_hash_mismatch' })
    assert.equal(readFileSync(path, 'utf8'), '{}')
  }))

test('journal witnesses local discovery and negative startup without any tool invocation', () =>
  temporary(root => {
    const path = join(root, 'fixture.jsonl')
    const write = (events: string[]) =>
      writeFileSync(path, events.map(event => JSON.stringify({ event })).join('\n') + '\n')
    write(['startup', 'tools-list', 'tools-list'])
    assert.deepEqual(verifyFixtureJournal(path, 'healthy'), {
      startup: 1,
      toolsList: 2,
      toolsCall: 0,
      startupExit19: 0,
    })
    write(['startup', 'startup_exit_19'])
    assert.deepEqual(verifyFixtureJournal(path, 'missing'), {
      startup: 1,
      toolsList: 0,
      toolsCall: 0,
      startupExit19: 1,
    })
    for (const events of [
      ['startup', 'startup', 'tools-list'],
      ['startup', 'tools-list', 'tools-call'],
      ['startup'],
      ['startup', 'protected-event'],
    ]) {
      write(events)
      assert.throws(() => verifyFixtureJournal(path, 'healthy'))
    }
    writeFileSync(path, JSON.stringify({ event: 'startup', rawPayload: 'hidden' }) + '\n')
    assert.throws(() => verifyFixtureJournal(path, 'healthy'), { category: 'fixture_journal_refused' })
    writeFileSync(path, Buffer.alloc(64 * 1024 + 1))
    assert.throws(() => verifyFixtureJournal(path, 'healthy'), { category: 'fixture_journal_limit' })
  }))

// Only injected ownership effects and fake protocol clients are used below; no native case runner is called.

function projectedConfig(mode: 'healthy' | 'missing' = 'healthy') {
  const root = '/private/tmp/m13-b1-synthetic'
  const paths = casePaths(root, mode)
  const fixturePath = new URL('./fixture.mjs', import.meta.url)
  return {
    config: {
      model: 'gpt-6.1-sol',
      model_reasoning_effort: 'medium',
      approval_policy: 'never',
      sandbox_mode: 'read-only',
      cli_auth_credentials_store: 'ephemeral',
      analytics: { enabled: false },
      features: { hooks: false, remote_plugin: false },
      mcp_servers: {
        m13_b1_fixture: {
          command: process.execPath,
          args: [decodeURIComponent(fixturePath.pathname), mode, paths.journal],
          env: {},
          env_vars: [],
          enabled: true,
          required: true,
          startup_timeout_sec: 5,
          enabled_tools: ['fixture_observe'],
        },
      },
    } as Record<string, unknown>,
    origins: {},
    layers: null,
  }
}

test('declared public config matches while omitted private settings are not independently attested', () => {
  for (const mode of ['healthy', 'missing'] as const) {
    const response = projectedConfig(mode)
    assert.doesNotThrow(() => verifyEffectiveConfig(response, '/private/tmp/m13-b1-synthetic', mode))
    const publicOnly = structuredClone(response)
    delete publicOnly.config.cli_auth_credentials_store
    delete publicOnly.config.mcp_servers
    assert.doesNotThrow(() => verifyEffectiveConfig(publicOnly, '/private/tmp/m13-b1-synthetic', mode))
    for (const key of ['model', 'analytics']) {
      const changed = structuredClone(response)
      delete changed.config[key]
      assert.throws(() => verifyEffectiveConfig(changed, '/private/tmp/m13-b1-synthetic', mode), {
        category: 'CONFIGURATION_UNVERIFIED',
      })
    }
  }
})

test('config mismatch, MCP env drift and additional servers refuse', () => {
  for (const mutate of [
    (x: ReturnType<typeof projectedConfig>) => {
      x.config.model = 'fallback'
    },
    (x: ReturnType<typeof projectedConfig>) => {
      x.config.cli_auth_credentials_store = 'keyring'
    },
    (x: ReturnType<typeof projectedConfig>) => {
      ;(x.config.mcp_servers as Record<string, unknown>).extra = {}
    },
    (x: ReturnType<typeof projectedConfig>) => {
      ;(x.config.mcp_servers as Record<string, Record<string, unknown>>).m13_b1_fixture.env = { KEY: 'unexpected' }
    },
    (x: ReturnType<typeof projectedConfig>) => {
      ;(x.config.mcp_servers as Record<string, Record<string, unknown>>).m13_b1_fixture.required = false
    },
  ]) {
    const response = projectedConfig()
    mutate(response)
    assert.throws(() => verifyEffectiveConfig(response, '/private/tmp/m13-b1-synthetic', 'healthy'), {
      category: 'configuration_refused',
    })
  }
})

test('nonempty credential slots, endpoint overrides and extra startup effects remain unverified', () => {
  for (const [key, value] of [
    ['api_key', 'protected'],
    ['http_headers', { authorization: 'protected' }],
    ['base_url', 'https://unapproved.invalid'],
    ['hooks', ['command']],
    ['plugins', { unknown: {} }],
    ['notify', ['command']],
    ['server_capabilities', { tools: {} }],
  ] as const) {
    const response = projectedConfig()
    response.config[key] = value
    assert.throws(() => verifyEffectiveConfig(response, '/private/tmp/m13-b1-synthetic', 'healthy'), {
      category: 'CONFIGURATION_UNVERIFIED',
    })
  }
  const harmless = projectedConfig()
  Object.assign(harmless.config, {
    model_context_window: 100000,
    model_max_output_tokens: 1000,
    http_headers: {},
    base_url: null,
    plugins: [],
    model_provider: 'openai',
  })
  assert.doesNotThrow(() => verifyEffectiveConfig(harmless, '/private/tmp/m13-b1-synthetic', 'healthy'))
})

test('only the frozen expected-server empty env whitelist may be omitted', () => {
  for (const mode of ['healthy', 'missing'] as const) {
    const response = projectedConfig(mode)
    const server = (response.config.mcp_servers as Record<string, Record<string, unknown>>).m13_b1_fixture
    delete server.env_vars
    assert.doesNotThrow(() => verifyEffectiveConfig(response, '/private/tmp/m13-b1-synthetic', mode))
    for (const value of [null, 'unexpected', ['UNAPPROVED'], {}, false]) {
      server.env_vars = value
      assert.throws(() => verifyEffectiveConfig(response, '/private/tmp/m13-b1-synthetic', mode), {
        category: 'configuration_refused',
        configurationReason: 'MCP_ENV_VARS_MISMATCH',
      })
    }
  }
})

test('feature controls must be reported explicitly as false without exempting arbitrary plugin or hook switches', () => {
  for (const value of [undefined, null, false, [], 'false']) {
    const response = projectedConfig()
    if (value === undefined) delete response.config.features
    else response.config.features = value
    assert.throws(() => verifyEffectiveConfig(response, '/private/tmp/m13-b1-synthetic', 'healthy'), {
      category: 'CONFIGURATION_UNVERIFIED',
      configurationReason: 'PUBLIC_FEATURES_NOT_OBJECT',
    })
  }
})

test('feature hook and remote-plugin controls explicitly report false', () => {
  for (const [key, label] of [
    ['hooks', 'HOOKS'],
    ['remote_plugin', 'REMOTE_PLUGIN'],
  ] as const) {
    for (const value of [undefined, true, 'false', null, 0]) {
      const response = projectedConfig()
      const features = response.config.features as Record<string, unknown>
      if (value === undefined) delete features[key]
      else features[key] = value
      assert.throws(() => verifyEffectiveConfig(response, '/private/tmp/m13-b1-synthetic', 'healthy'), {
        category: value === undefined ? 'CONFIGURATION_UNVERIFIED' : 'configuration_refused',
        configurationReason: `PUBLIC_FEATURE_${label}_${value === undefined ? 'MISSING' : 'MISMATCH'}`,
      })
    }
  }
})

test('harmless false feature switches pass while arbitrary active capabilities refuse', () => {
  const harmless = projectedConfig()
  Object.assign(harmless.config.features as Record<string, unknown>, {
    harmless_feature: true,
    unknown_plugin: false,
    unknown_hook: false,
  })
  assert.doesNotThrow(() => verifyEffectiveConfig(harmless, '/private/tmp/m13-b1-synthetic', 'healthy'))
  for (const key of ['unknown_plugin', 'unknown_hook', 'plugins', 'capabilities']) {
    const response = projectedConfig()
    ;(response.config.features as Record<string, unknown>)[key] = true
    assert.throws(() => verifyEffectiveConfig(response, '/private/tmp/m13-b1-synthetic', 'healthy'), {
      category: 'CONFIGURATION_UNVERIFIED',
    })
  }
})

function fakeOwnership(stopFailure = false) {
  const calls: string[] = []
  const original = {
    process: {
      connected: true,
      disconnect: () => {
        calls.push('disconnect')
      },
    },
  } as unknown as SpawnedProcess
  const observation = {
    kind: 'group_exit_observed' as const,
    groupId: 123,
    observedAt: 'synthetic',
    supervisorProtocol: 'appraise.owned-supervisor/v1' as const,
    runtimeBrowserCleanup: 'NOT_REQUIRED' as const,
  }
  const effects: OwnedEffects = {
    acquire: async () => {
      calls.push('acquire')
      return original
    },
    stop: async handle => {
      assert.equal(handle, original)
      calls.push('physical-stop')
      if (stopFailure) throw new Error('synthetic-stop-failure')
      return observation
    },
  }
  return { original, calls, observation, owned: new OwnedAcquisition(effects) }
}
async function acquireFake(fake: ReturnType<typeof fakeOwnership>) {
  await fake.owned.acquire('synthetic-only', [], {
    supervisorPath: '/synthetic-supervisor',
    cwd: '/synthetic',
    env: {},
  })
}

test('owned acquisition failure remains attempted with no cleanup handle or second acquisition', async () => {
  let attempts = 0
  let stops = 0
  const owned = new OwnedAcquisition({
    acquire: async () => {
      attempts++
      throw new Error('synthetic-acquisition-failure')
    },
    stop: async () => {
      stops++
      throw new Error('must-not-run')
    },
  })
  await assert.rejects(
    owned.acquire('synthetic-only', [], { supervisorPath: '/synthetic-supervisor', cwd: '/synthetic', env: {} }),
    /synthetic-acquisition-failure/,
  )
  assert.equal(owned.attempted, true)
  assert.equal(owned.original, undefined)
  await assert.rejects(owned.stop(), /ownership_unavailable/)
  assert.equal(attempts, 1)
  assert.equal(stops, 0)
})

test('cleanup preserves physical observation before a refused drain and retains the first work failure', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = fakeOwnership()
  await acquireFake(fake)
  const events: { category: string }[] = []
  const campaign = new CampaignLifetime(event => events.push(event))
  campaign.owned = fake.owned
  campaign.transport = {
    waitForDrain: async () => {
      fake.calls.push('drain')
      throw new Error('synthetic-drain-failure')
    },
  } as unknown as B1Transport
  const state = new CaseLifetime(campaign, 'healthy')
  state.workFailure = { category: 'first_failure' }
  try {
    await state.cleanup()
    assert.deepEqual(fake.calls, ['acquire', 'physical-stop', 'drain'])
    assert.deepEqual(
      events.map(event => event.category),
      ['owned_group_exit_observed', 'cleanup_protocol_refused'],
    )
    assert.equal(state.physicalCleanup, fake.observation)
    assert.equal(state.cleaned, true)
    assert.equal(state.workFailure.category, 'first_failure')
    assert.equal(state.result(undefined).disposition, 'REFUSED')
    t.mock.timers.tick(90_000)
    assert.equal(state.hardExpired, false)
  } finally {
    clearTimeout(campaign.timer)
  }
})

test('unobserved physical cleanup never drains and disconnects only the original fake supervisor', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = fakeOwnership(true)
  await acquireFake(fake)
  const events: { category: string }[] = []
  const campaign = new CampaignLifetime(event => events.push(event))
  campaign.owned = fake.owned
  campaign.transport = {
    waitForDrain: async () => {
      throw new Error('must-not-drain')
    },
  } as unknown as B1Transport
  const state = new CaseLifetime(campaign, 'healthy')
  try {
    await state.cleanup()
    assert.deepEqual(fake.calls, ['acquire', 'physical-stop', 'disconnect'])
    assert.equal(state.physicalCleanup, undefined)
    assert.equal(state.cleaned, false)
    assert.equal(state.result(undefined).disposition, 'UNKNOWN')
    assert.deepEqual(
      events.map(event => event.category),
      ['cleanup_unknown'],
    )
  } finally {
    clearTimeout(campaign.timer)
  }
})

test('case work and hard deadlines stay distinct and hard expiry records UNKNOWN before original disconnect', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = fakeOwnership()
  await acquireFake(fake)
  const events: { category: string; disposition?: unknown }[] = []
  const campaign = new CampaignLifetime(event => {
    events.push(event)
    fake.calls.push(event.category)
  })
  campaign.owned = fake.owned
  campaign.transport = {
    abort: (category: string) => {
      fake.calls.push(category)
    },
  } as unknown as B1Transport
  const state = new CaseLifetime(campaign, 'healthy')
  const exit = new Error('synthetic-exit')
  t.mock.method(process, 'exit', () => {
    throw exit
  })
  try {
    t.mock.timers.tick(80_000)
    assert.equal(state.workExpired, true)
    assert.equal(state.hardExpired, false)
    assert.equal(events.length, 0)
    assert.throws(
      () => t.mock.timers.tick(10_000),
      error => error === exit,
    )
    assert.equal(state.hardExpired, true)
    assert.equal(events[0].disposition, 'UNKNOWN')
    assert.deepEqual(fake.calls.slice(-3), ['case_hard_deadline', 'case_hard_deadline', 'disconnect'])
  } finally {
    clearTimeout(campaign.timer)
    clearTimeout(state.workTimer)
    clearTimeout(state.hardTimer)
  }
})

test('bounded phase timer expires once and is canceled after rejected work', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let expired = 0
  let finish: (() => void) | undefined
  const phase = withDeadline(
    10_000,
    () => {
      expired++
    },
    () =>
      new Promise<void>(resolve => {
        finish = resolve
      }),
  )
  t.mock.timers.tick(9_999)
  assert.equal(expired, 0)
  t.mock.timers.tick(1)
  assert.equal(expired, 1)
  finish!()
  await phase
  await assert.rejects(
    withDeadline(
      10_000,
      () => {
        expired++
      },
      async () => {
        throw new Error('synthetic-phase-refusal')
      },
    ),
    /synthetic-phase-refusal/,
  )
  t.mock.timers.tick(20_000)
  assert.equal(expired, 1)
})

test('ordered campaign refuses the next case without repeating the failed or unknown case', async () => {
  for (const disposition of ['REFUSED', 'UNKNOWN']) {
    const attempted: string[] = []
    const recorded: string[] = []
    const results = await runUntilRefused(
      ['healthy', 'missing'],
      async mode => {
        attempted.push(mode)
        return { disposition }
      },
      result => recorded.push(result.disposition),
    )
    assert.deepEqual(attempted, ['healthy'])
    assert.deepEqual(recorded, [disposition])
    assert.equal(results.length, 1)
  }
})

test('reservation and launch-spent files are exclusive and the environment has no ambient credentials', () =>
  temporary(root => {
    const freshRoot = join(root, 'campaign')
    const record = reserveCampaign({ freshRoot, campaignId: 'synthetic' }, 'synthetic-hash')
    record({ category: 'synthetic' })
    assert.throws(() => reserveCampaign({ freshRoot, campaignId: 'synthetic' }, 'synthetic-hash'), { code: 'EEXIST' })
    const paths = casePaths(freshRoot, 'healthy')
    writeClosedConfig(paths, 'synthetic-config')
    writeLaunchSpent(paths.root, 'synthetic-hash')
    assert.throws(() => writeLaunchSpent(paths.root, 'synthetic-hash'), { code: 'EEXIST' })
    assert.equal(JSON.parse(readFileSync(join(paths.root, 'launch-spent.json'), 'utf8')).nativeLaunches, 1)
    assert.deepEqual(Object.keys(closedEnvironment(paths)).sort(), [
      'CODEX_HOME',
      'HOME',
      'LANG',
      'LC_ALL',
      'PATH',
      'TEMP',
      'TMP',
      'TMPDIR',
      'XDG_CONFIG_HOME',
    ])
  }))

async function syntheticProtocol(
  run: (root: string, calls: string[], client: Parameters<typeof runB1Protocol>[0]) => Promise<void>,
  negative = false,
) {
  const root = mkdtempSync('/private/tmp/m13-b1-protocol-source-')
  const mode = negative ? 'missing' : 'healthy'
  const paths = casePaths(root, mode)
  mkdirSync(paths.root)
  mkdirSync(paths.codexHome)
  const calls: string[] = []
  const response = projectedConfig(mode)
  delete response.config.mcp_servers
  const client = {
    initialize: async () => {
      calls.push('initialize')
      return { codexHome: paths.codexHome }
    },
    configRead: async () => {
      calls.push('config')
      return response
    },
    startThread: async () => {
      calls.push('thread')
      if (negative) throw new B1Refusal('required_mcp_refused')
    },
    listStatus: async () => {
      calls.push('status')
    },
    assertHealthy: () => {
      calls.push('healthy')
    },
  }
  try {
    await run(root, calls, client)
  } finally {
    rmSync(root, { recursive: true })
  }
}
test('B1 finite protocol witnesses the exact healthy sequence without repeated RPCs', () =>
  syntheticProtocol(async (root, calls, client) => {
    assert.equal(await runB1Protocol(client, root, 'healthy', () => {}), true)
    assert.deepEqual(calls, ['initialize', 'config', 'thread', 'status', 'healthy'])
  }))
test('B1 finite negative protocol accepts only the explicit required-MCP refusal and omits status', () =>
  syntheticProtocol(async (root, calls, client) => {
    assert.equal(await runB1Protocol(client, root, 'missing', () => {}), true)
    assert.deepEqual(calls, ['initialize', 'config', 'thread', 'healthy'])
  }, true))
test('B1 configuration refusal stops before any thread or status RPC', () =>
  syntheticProtocol(async (root, calls, client) => {
    const originalRead = client.configRead
    client.configRead = async cwd => {
      const response = await originalRead(cwd)
      response.config.model = 'fallback'
      return response
    }
    await assert.rejects(
      runB1Protocol(client, root, 'healthy', () => {}),
      { category: 'configuration_refused' },
    )
    assert.deepEqual(calls, ['initialize', 'config'])
  }))
