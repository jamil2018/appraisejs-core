import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { CONFIGURATION_REASONS, casePaths, verifyEffectiveConfig } from '../b1/runner.mts'
import { SERVER_NAME } from '../b1/transport.mjs'
import {
  configurationReason,
  configurationDiagnosticEvent,
  projectConfigFacts,
  configurationInputPaths,
  runConfigurationDiagnosticProtocol,
} from './runner.mts'

type Response = { config: Record<string, unknown>; origins: Record<string, unknown> }
const root = '/private/tmp/m13-d1-synthetic'
const canary = 'PRIVATE_CANARY_ACCOUNT_ENDPOINT_KEY_NAME_VALUE'
function base(): Response {
  return {
    config: {
      model: 'gpt-6.1-sol',
      model_reasoning_effort: 'medium',
      approval_policy: 'never',
      sandbox_mode: 'read-only',
      analytics: { enabled: false },
      features: { hooks: false, remote_plugin: false },
    },
    origins: {},
  }
}
function detailed(): Response {
  const response = base()
  response.config.cli_auth_credentials_store = 'ephemeral'
  response.config.mcp_servers = {
    [SERVER_NAME]: {
      command: realpathSync(process.execPath),
      args: [
        fileURLToPath(new URL('../b1/fixture.mjs', import.meta.url)),
        'healthy',
        casePaths(root, 'healthy').journal,
      ],
      env: {},
      env_vars: [],
      enabled: true,
      required: true,
      startup_timeout_sec: 5,
      enabled_tools: ['fixture_observe'],
    },
  }
  return response
}
function server(response: Response) {
  return (response.config.mcp_servers as Record<string, Record<string, unknown>>)[SERVER_NAME]
}
type Vector = { code: string; value: unknown }
const vectors: Vector[] = [{ code: 'CONFIG_RESPONSE_OR_CONFIG_NOT_OBJECT', value: null }]
for (const [key, label] of [
  ['model', 'MODEL'],
  ['model_reasoning_effort', 'REASONING_EFFORT'],
  ['approval_policy', 'APPROVAL_POLICY'],
  ['sandbox_mode', 'SANDBOX_MODE'],
]) {
  const absent = base()
  delete absent.config[key]
  vectors.push({ code: `PUBLIC_${label}_MISSING`, value: absent })
  const wrong = base()
  wrong.config[key] = canary
  vectors.push({ code: `PUBLIC_${label}_MISMATCH`, value: wrong })
}
{
  const value = base()
  delete value.config.analytics
  vectors.push({ code: 'PUBLIC_ANALYTICS_ENABLED_MISSING', value })
}
{
  const value = base()
  value.config.analytics = { enabled: true }
  vectors.push({ code: 'PUBLIC_ANALYTICS_ENABLED_MISMATCH', value })
}
{
  const value = base()
  delete value.config.features
  vectors.push({ code: 'PUBLIC_FEATURES_NOT_OBJECT', value })
}
for (const [key, label] of [
  ['hooks', 'HOOKS'],
  ['remote_plugin', 'REMOTE_PLUGIN'],
]) {
  const absent = base()
  delete (absent.config.features as Record<string, unknown>)[key]
  vectors.push({ code: `PUBLIC_FEATURE_${label}_MISSING`, value: absent })
  const wrong = base()
  ;(wrong.config.features as Record<string, unknown>)[key] = canary
  vectors.push({ code: `PUBLIC_FEATURE_${label}_MISMATCH`, value: wrong })
}
{
  const value = base()
  value.config.cli_auth_credentials_store = canary
  vectors.push({ code: 'PRIVATE_AUTH_STORE_MISMATCH', value })
}
{
  const value = base()
  value.config.mcp_servers = null
  vectors.push({ code: 'MCP_CONTAINER_NOT_OBJECT', value })
}
{
  const value = base()
  value.config.mcp_servers = { [canary]: {} }
  vectors.push({ code: 'MCP_SERVER_SET_MISMATCH', value })
}
{
  const value = base()
  value.config.mcp_servers = { [SERVER_NAME]: null }
  vectors.push({ code: 'MCP_EXPECTED_SERVER_NOT_OBJECT', value })
}
for (const [key, label] of [
  ['command', 'COMMAND'],
  ['args', 'ARGS'],
  ['env', 'ENV'],
  ['env_vars', 'ENV_VARS'],
  ['enabled', 'ENABLED'],
  ['required', 'REQUIRED'],
  ['startup_timeout_sec', 'STARTUP_TIMEOUT_SEC'],
  ['enabled_tools', 'ENABLED_TOOLS'],
]) {
  const absent = detailed()
  delete server(absent)[key]
  if (key !== 'env_vars') vectors.push({ code: `MCP_${label}_MISSING`, value: absent })
  const wrong = detailed()
  server(wrong)[key] = canary
  vectors.push({ code: `MCP_${label}_MISMATCH`, value: wrong })
}
{
  const value = base()
  value.config.api_key = canary
  vectors.push({ code: 'GENERIC_CREDENTIAL_OR_ENDPOINT_NONEMPTY', value })
}
{
  const value = base()
  value.config.notify = [canary]
  vectors.push({ code: 'GENERIC_STARTUP_OR_HOOK_PLUGIN_NONEMPTY', value })
}
{
  const value = base()
  value.config[`${canary}_capabilities`] = { [canary]: canary }
  vectors.push({ code: 'GENERIC_CAPABILITY_NONEMPTY', value })
}
{
  const value = base()
  value.config.model_provider = canary
  vectors.push({ code: 'PUBLIC_PROVIDER_OVERRIDE', value })
}

for (const vector of vectors)
  test(`actual verifier reports ${vector.code} while safe facts exclude secret canaries`, () => {
    const facts = projectConfigFacts(vector.value, root)
    assert.equal(JSON.stringify(facts).includes(canary), false)
    assert.throws(
      () => verifyEffectiveConfig(vector.value, root, 'healthy'),
      error => {
        assert.equal(configurationReason(error), vector.code)
        assert.equal(JSON.stringify(error).includes(canary), false)
        return true
      },
    )
  })

test('all instrumented verifier failure codes have a source regression vector', () => {
  assert.deepEqual([...new Set(vectors.map(vector => vector.code))].sort(), [...CONFIGURATION_REASONS].sort())
})

test('complete matching public and private projections remain accepted', () => {
  for (const response of [base(), detailed()])
    assert.doesNotThrow(() => verifyEffectiveConfig(response, root, 'healthy'))
  const facts = projectConfigFacts(detailed(), root)
  assert.ok(
    Object.values(facts.critical).every(field => field.present && field.matchExpected && field.enumTag === 'EXPECTED'),
  )
  assert.equal(facts.analytics.enabled.boolean, false)
  assert.equal(facts.features.hooks.matchExpectedFalse, true)
  assert.equal(facts.features.remote_plugin.matchExpectedFalse, true)
  assert.equal(facts.features.plugins.booleanTag, 'ABSENT')
  assert.equal(facts.credentialStore.matchExpected, true)
  assert.equal(facts.mcp.onlyExpectedServer, true)
  assert.ok(Object.values(facts.mcp.fields).every(field => field.present && field.matchExpected))
  assert.deepEqual(facts.genericViolations, [])
})

test('all generic verifier branches are projected with finite path vocabulary and no actual values or arbitrary names', () => {
  const response = base()
  response.config[canary] = {
    api_key: canary,
    base_url: `https://${canary}.invalid`,
    notify: [canary],
    [`${canary}_plugin`]: { [canary]: canary },
    [`${canary}_capabilities`]: true,
  }
  const facts = projectConfigFacts(response, root)
  assert.deepEqual(
    new Set(facts.genericViolations.map(row => row.category)),
    new Set(['CREDENTIAL_VALUE', 'ENDPOINT_OVERRIDE', 'STARTUP_COMMAND', 'HOOK_PLUGIN', 'CAPABILITY']),
  )
  assert.ok(facts.genericViolations.every(row => row.path[0] === 'OTHER_KEY' && row.nonempty === true))
  assert.equal(JSON.stringify(facts).includes(canary), false)
  assert.equal(JSON.stringify(facts).includes('https://'), false)
})

test('public OTHER/NULL/ABSENT tags and private MCP mismatch facts never echo values, names, argv or env', () => {
  const response = detailed()
  response.config.model = null
  response.config.model_reasoning_effort = canary
  delete response.config.approval_policy
  response.config.analytics = { enabled: canary }
  response.config.cli_auth_credentials_store = canary
  response.config.model_provider = canary
  server(response).args = [canary]
  server(response).env = { [canary]: canary }
  ;(response.config.mcp_servers as Record<string, unknown>)[canary] = { command: canary }
  const facts = projectConfigFacts(response, root)
  assert.equal(facts.critical.model.enumTag, 'NULL')
  assert.equal(facts.critical.model_reasoning_effort.enumTag, 'OTHER')
  assert.equal(facts.critical.approval_policy.enumTag, 'ABSENT')
  assert.equal(facts.analytics.enabled.boolean, null)
  assert.equal(facts.credentialStore.matchExpected, false)
  assert.equal(facts.mcp.serverCount, 2)
  assert.equal(facts.mcp.fields.args.matchExpected, false)
  assert.equal(facts.mcp.fields.env.matchExpected, false)
  assert.equal(facts.provider.enumTag, 'OTHER')
  assert.equal(JSON.stringify(facts).includes(canary), false)
})

test('first failure retains the actual verifier order rather than inferred order from facts', () => {
  const response = base()
  response.config.model = canary
  response.config.api_key = canary
  response.config.model_provider = canary
  const facts = projectConfigFacts(response, root)
  assert.equal(facts.genericViolations[0].category, 'CREDENTIAL_VALUE')
  assert.throws(
    () => verifyEffectiveConfig(response, root, 'healthy'),
    error => configurationReason(error) === 'PUBLIC_MODEL_MISMATCH',
  )
})

test('unrecognized error reason strings and remote identities are not retained', () => {
  assert.equal(configurationReason({ configurationReason: canary }), 'NOT_REPORTED')
  assert.deepEqual(
    configurationDiagnosticEvent(
      {
        category: 'remote_control_disabled',
        count: 1,
        installationId: canary,
        serverName: canary,
        params: { [canary]: canary },
      },
      new Set(),
    ),
    { category: 'remote_control_disabled', count: 1 },
  )
  assert.equal(configurationDiagnosticEvent({ category: 'remote_control_disabled', count: 33 }, new Set()), undefined)
})

test('structural projection is bounded and marks incomplete scanning without echoing keys', () => {
  const response = base()
  response.config[canary] = Object.fromEntries(
    Array.from({ length: 8300 }, (_, index) => [`${canary}${index}`, canary]),
  )
  const facts = projectConfigFacts(response, root)
  assert.equal(facts.scanComplete, false)
  assert.equal(facts.scannedFields, 8192)
  assert.equal(JSON.stringify(facts).includes(canary), false)
})

test('D1 freezes all transitive D0 public inputs plus its independent source', () => {
  const paths = configurationInputPaths('/frozen/schema')
  assert.equal(paths.length, 36)
  assert.equal(new Set(paths).size, 36)
  assert.ok(paths.some(path => path.endsWith('/m13-runtime/d1/runner.mts')))
  assert.ok(paths.some(path => path.endsWith('/m13-runtime/d0/runner.mts')))
  assert.equal(
    paths.some(path => path.endsWith('/auth.json')),
    false,
  )
})

test('config facts are observed before the same imported verifier refuses, with no further RPC', async () => {
  const temp = mkdtempSync('/private/tmp/m13-d1-source-test-')
  const paths = casePaths(temp, 'healthy')
  mkdirSync(paths.root)
  mkdirSync(paths.codexHome)
  const calls: string[] = []
  let captured: unknown
  const response = base()
  delete response.config.model
  const client = {
    assertHealthy: () => {},
    initialize: async () => {
      calls.push('initialize')
      return { codexHome: paths.codexHome }
    },
    configRead: async () => {
      calls.push('config/read')
      return response
    },
  }
  try {
    await assert.rejects(
      runConfigurationDiagnosticProtocol(client, temp, facts => {
        captured = facts
      }),
      error => configurationReason(error) === 'PUBLIC_MODEL_MISSING',
    )
    assert.ok(captured)
    assert.deepEqual(calls, ['initialize', 'config/read'])
  } finally {
    rmSync(temp, { recursive: true })
  }
})

test('features diagnostics retain only exact static path facts and finite boolean tags', () => {
  for (const [value, tag, type] of [
    [undefined, 'ABSENT', 'absent'],
    [false, 'FALSE', 'boolean'],
    [true, 'TRUE', 'boolean'],
    [canary, 'OTHER', 'string'],
    [null, 'OTHER', 'null'],
  ] as const) {
    const response = base()
    const features = response.config.features as Record<string, unknown>
    if (value !== undefined) features.plugins = value
    features[canary] = { [`${canary}_plugin`]: canary }
    const facts = projectConfigFacts(response, root)
    assert.deepEqual(facts.features.plugins, { present: value !== undefined, type, booleanTag: tag })
    assert.equal(JSON.stringify(facts).includes(canary), false)
    if (value === true) assert.ok(facts.genericViolations.some(row => row.path.join('.') === 'features.plugins'))
  }
  for (const [value, expectedType] of [
    [undefined, 'absent'],
    [null, 'null'],
    [canary, 'string'],
  ] as const) {
    const response = base()
    if (value === undefined) delete response.config.features
    else response.config.features = value
    const facts = projectConfigFacts(response, root)
    assert.equal(facts.features.type, expectedType)
    assert.equal(facts.features.hooks.matchExpectedFalse, false)
    assert.equal(facts.features.remote_plugin.matchExpectedFalse, false)
    assert.equal(JSON.stringify(facts).includes(canary), false)
  }
})

test('omitted frozen empty whitelist remains absent in raw facts while the verifier accepts normalization', () => {
  const response = detailed()
  delete server(response).env_vars
  assert.doesNotThrow(() => verifyEffectiveConfig(response, root, 'healthy'))
  assert.deepEqual(projectConfigFacts(response, root).mcp.fields.env_vars, {
    present: false,
    type: 'absent',
    matchExpected: false,
  })
})

test('feature refusal ends the synthetic diagnostic before any downstream thread, status or account work', async () => {
  const temp = mkdtempSync('/private/tmp/m13-d1-feature-source-test-')
  const paths = casePaths(temp, 'healthy')
  mkdirSync(paths.root)
  mkdirSync(paths.codexHome)
  try {
    for (const key of ['hooks', 'remote_plugin']) {
      for (const value of [undefined, true, 'false']) {
        const response = base()
        const features = response.config.features as Record<string, unknown>
        if (value === undefined) delete features[key]
        else features[key] = value
        const calls: string[] = []
        const unexpected = async (method: string) => {
          calls.push(method)
          throw new Error('unexpected_synthetic_downstream_call')
        }
        const client = {
          assertHealthy: () => {},
          initialize: async () => {
            calls.push('initialize')
            return { codexHome: paths.codexHome }
          },
          configRead: async () => {
            calls.push('config/read')
            return response
          },
          startThread: () => unexpected('thread/start'),
          listStatus: () => unexpected('mcpServerStatus/list'),
          accountRead: () => unexpected('account/read'),
        }
        await assert.rejects(runConfigurationDiagnosticProtocol(client, temp), error =>
          configurationReason(error).startsWith('PUBLIC_FEATURE_'),
        )
        assert.deepEqual(calls, ['initialize', 'config/read'])
      }
    }
  } finally {
    rmSync(temp, { recursive: true })
  }
})

test('bounded scan retains the first 256 violations and marks only overflow incomplete', () => {
  for (const count of [256, 257]) {
    const config = Object.fromEntries(
      Array.from({ length: count }, (_, index) => [`${canary}${index}`, { api_key: canary }]),
    )
    const facts = projectConfigFacts({ config }, root)
    assert.equal(facts.genericViolations.length, 256)
    assert.equal(facts.scanComplete, count === 256)
    assert.equal(JSON.stringify(facts).includes(canary), false)
    assert.deepEqual(facts.genericViolations[0], {
      category: 'CREDENTIAL_VALUE',
      path: ['OTHER_KEY', 'apikey'],
      type: 'string',
      nonempty: true,
    })
  }
})

test('cycle and depth limits stop traversal without leaking arbitrary path names or values', () => {
  const cycle: Record<string, unknown> = {}
  cycle[canary] = cycle
  const cycleFacts = projectConfigFacts({ config: cycle }, root)
  assert.equal(cycleFacts.scanComplete, false)
  assert.equal(cycleFacts.scannedFields, 1)
  let deep: Record<string, unknown> = { api_key: canary }
  for (let index = 0; index < 49; index++) deep = { [canary]: deep }
  const depthFacts = projectConfigFacts({ config: deep }, root)
  assert.equal(depthFacts.scanComplete, false)
  assert.equal(depthFacts.scannedFields, 49)
  assert.deepEqual(depthFacts.genericViolations, [])
  assert.equal(JSON.stringify([cycleFacts, depthFacts]).includes(canary), false)
})

test('credential-store subtree exemption and nontraversed arrays retain original scan behavior', () => {
  const facts = projectConfigFacts(
    { config: { cli_auth_credentials_store: { api_key: canary }, [canary]: [{ api_key: canary }] } },
    root,
  )
  assert.equal(facts.scanComplete, true)
  assert.equal(facts.scannedFields, 2)
  assert.deepEqual(facts.genericViolations, [])
  assert.equal(JSON.stringify(facts).includes(canary), false)
})
