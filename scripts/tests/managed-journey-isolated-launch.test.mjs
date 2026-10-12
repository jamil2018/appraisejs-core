import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  composeIsolatedLaunch,
  FIXTURE_TOOL_NAME,
  normalizeMcpInventory,
  REQUIRED_FIXTURE_MCP,
  sameProcessIdentity,
  sanitizeLaunchComposition,
  sanitizeResolvedConfiguration,
  terminateOwnedProcessGroup,
} from '../lib/managed-journey-isolated-launch.mjs'

const executable = '/fixture/codex'
const fixtureScript = '/fixture/synthetic-mcp.mjs'

test('composition uses dedicated state, cwd, config and an allowlisted environment', () => {
  const secret = 'must-not-cross-boundary'
  const composition = compose({
    parentEnv: { LANG: 'C', PATH: '/usr/bin', OPENAI_API_KEY: secret, SECRET_TOKEN: secret },
  })

  assert.equal(composition.environment.OPENAI_API_KEY, undefined)
  assert.equal(composition.environment.SECRET_TOKEN, undefined)
  assert.equal(composition.environment.HOME, composition.stateRoot)
  assert.equal(composition.environment.CODEX_HOME, composition.stateRoot)
  assert.notEqual(composition.workingDirectory, process.cwd())
  assert.match(composition.configText, /appraise-quality-journey/)
  assert.doesNotMatch(JSON.stringify(sanitizeLaunchComposition(composition)), new RegExp(secret))
})

test('healthy config registers only the required synthetic MCP and fixed tool', () => {
  const composition = compose()
  assert.match(composition.configText, new RegExp(REQUIRED_FIXTURE_MCP))
  assert.match(composition.configText, new RegExp(FIXTURE_TOOL_NAME))
  assert.doesNotMatch(composition.configText, /ambient-fixture/)
})

test('absent, unhealthy and ambient modes are deterministic config fixtures', () => {
  assert.doesNotMatch(compose({ mode: 'absent' }).configText, /mcp_servers/)
  assert.match(compose({ mode: 'unhealthy' }).configText, /"unhealthy"/)
  assert.match(compose({ mode: 'ambient' }).configText, /ambient-fixture/)
})

test('resolved configuration receipt hashes raw config and source paths', () => {
  const secretPath = '/secret/account/config.toml'
  const receipt = sanitizeResolvedConfiguration({
    config: { model: 'fixture' },
    layers: [{ name: { type: 'user', file: secretPath }, version: '1', config: { hidden: true } }],
    origins: { model: { name: { type: 'user', file: secretPath }, version: '1' } },
  })

  assert.equal(JSON.stringify(receipt).includes(secretPath), false)
  assert.equal(receipt.layers[0].source.type, 'user')
  assert.equal(receipt.layers[0].source.fileHash.length, 64)
})

test('provider MCP response is normalized into ordered canonical tool evidence', () => {
  const inputSchema = { type: 'object', properties: { probe: { type: 'string' } } }
  const inventory = normalizeMcpInventory({
    data: [
      {
        name: REQUIRED_FIXTURE_MCP,
        runtimeStatus: 'connected',
        tools: { fixture_observe: { name: FIXTURE_TOOL_NAME, inputSchema } },
      },
    ],
  })

  assert.equal(inventory[0].status, 'ready')
  assert.equal(inventory[0].health, 'healthy')
  assert.equal(inventory[0].tools[0].origin, `mcp:${REQUIRED_FIXTURE_MCP}`)
  assert.equal(inventory[0].tools[0].schemaHash.length, 64)
})

test('provider MCP tool maps are normalized by name without claiming model-request order', () => {
  const inventory = normalizeMcpInventory({
    data: [
      {
        name: REQUIRED_FIXTURE_MCP,
        runtimeStatus: 'connected',
        tools: {
          second: { name: 'z_tool', inputSchema: { type: 'object' } },
          first: { name: 'a_tool', inputSchema: { type: 'object' } },
        },
      },
    ],
  })
  assert.deepEqual(
    inventory[0].tools.map(tool => tool.name),
    ['a_tool', 'z_tool'],
  )
})

test('process identity binds PID, PGID and birth marker while retaining command as mutable evidence', () => {
  const expected = { pid: 10, pgid: 10, birthMarker: 'birth', command: '/fixture/codex' }
  assert.equal(sameProcessIdentity(expected, { ...expected }), true)
  for (const [field, value] of [
    ['pid', 11],
    ['pgid', 12],
    ['birthMarker', 'later'],
  ]) {
    assert.equal(sameProcessIdentity(expected, { ...expected, [field]: value }), false, field)
  }
  assert.equal(sameProcessIdentity(expected, { ...expected, command: '/same-process-after-exec' }), true)
})

test('cleanup accepts an exited owned group after the launch identity disappears', async () => {
  const child = { exitCode: 1, signalCode: null }
  const expected = { pid: 10, pgid: 10, birthMarker: 'birth', command: '/fixture/codex' }
  const receipt = await terminateOwnedProcessGroup(child, expected, {
    inspect: async () => ({ ...expected, birthMarker: 'later' }),
    inspectGroup: async () => [],
  })
  assert.deepEqual(receipt, {
    cleanupConfirmed: true,
    processIdentity: expected,
    survivingProcessCount: 0,
  })
})

function compose(overrides = {}) {
  return composeIsolatedLaunch({
    executable,
    fixtureScript,
    launchNonce: 'fixture-launch-nonce',
    parentEnv: { LANG: 'C', PATH: '/usr/bin' },
    root: mkdtempSync(path.join(tmpdir(), 'appraise-isolated-launch-test-')),
    ...overrides,
  })
}
