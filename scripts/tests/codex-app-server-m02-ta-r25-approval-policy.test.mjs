import { externalEffectAttempts } from './fixtures/codex-app-server-m02-ta-matrix-r23-composed/no-external-effects.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  applySelectedProfileApprovalPolicy,
  SELECTED_PROFILE_APPROVAL_PINS,
} from './fixtures/codex-app-server-m02-ta-r25-approval-policy-01/approval-policy.mjs'
import { loadSealedRouteEvidence, stableHash } from './fixtures/codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { prepareTrustedCase } from './fixtures/codex-app-server-m02-ta-matrix-r24/composition.mjs'
import { POLICY, digest } from './fixtures/codex-app-server-m02-ta-matrix-r24/policy.mjs'
import { B14_PROFILE } from './fixtures/codex-app-server-m02-ta-native-plans-r10/plans.mjs'

const seal = loadSealedRouteEvidence()
assert.equal(seal.status, 'SEALED_OFFLINE_ONLY')
const clone = value => structuredClone(value)
const selected = role => seal.profiles.roles.find(profile => profile.role === role)
function baseCase(caseId) {
  // The real configuration builder is pure: no runtime preparation, file staging, process, or socket.
  const manifest = { phase: 'T2', root: POLICY.roots.T2 }
  return prepareTrustedCase({ manifest, manifestDigest: digest(manifest) }, caseId, {
    port: 33333,
    mcpExecutable: '/offline/mock-node',
    mcpArgs: ['/offline/mock-entry.mjs'],
  })
}

test('six approval profiles bind exact full sealed evidence and native name lists', () => {
  assert.equal(Object.keys(SELECTED_PROFILE_APPROVAL_PINS).length, 6)
  for (const profile of seal.profiles.roles) {
    const pin = SELECTED_PROFILE_APPROVAL_PINS[profile.role]
    assert.equal(stableHash(profile), pin.sha256)
    assert.deepEqual(
      profile.toolsList.tools.map(tool => tool.name),
      [...pin.names],
    )
    assert.equal(Object.isFrozen(pin), true)
    assert.equal(Object.isFrozen(pin.names), true)
  }
})

test('all 22 ordinary cases add only selected sealed native tools through real config and thread serialization', () => {
  const beforeSeal = stableHash(seal.profiles)
  const ordinary = POLICY.cases.filter(item => item.phase === 'T2' && !['P00', 'B14'].includes(item.id))
  assert.equal(ordinary.length, 22)
  for (const item of ordinary) {
    const base = baseCase(item.id)
    const originalBytes = JSON.stringify(base)
    const profile = selected(item.role)
    const config = applySelectedProfileApprovalPolicy({
      caseId: item.id,
      selectedProfile: profile,
      config: base.config,
    })
    const tools = Object.fromEntries(profile.toolsList.tools.map(tool => [tool.name, { approval_mode: 'approve' }]))
    assert.deepEqual(config, {
      ...base.config,
      mcp_servers: { appraise_m02: { ...base.config.mcp_servers.appraise_m02, tools } },
    })
    assert.equal(config.approval_policy, 'never')
    assert.equal(Object.hasOwn(config.mcp_servers.appraise_m02, 'default_tools_approval_mode'), false)
    assert.ok(Object.keys(tools).every(name => !name.startsWith('mcp__')))
    const thread = { ...clone(base.threadStartParams), config: clone(config) }
    const wire = JSON.parse(
      JSON.stringify({ jsonrpc: '2.0', id: 'offline-thread', method: 'thread/start', params: thread }),
    )
    assert.equal(wire.params.approvalPolicy, 'never')
    assert.deepEqual(wire.params.config, config)
    assert.deepEqual(wire.params.config.mcp_servers.appraise_m02.tools, tools)
    assert.equal(JSON.stringify(base), originalBytes)
    if (
      item.script.operations.some(operation => !profile.toolsList.tools.some(tool => tool.name === operation.toolName))
    )
      for (const operation of item.script.operations)
        if (!profile.toolsList.tools.some(tool => tool.name === operation.toolName))
          assert.equal(Object.hasOwn(tools, operation.toolName), false)
  }
  assert.equal(stableHash(seal.profiles), beforeSeal)
  assert.deepEqual(externalEffectAttempts, [])
})

test('P00 and granular B14 retain exact configuration references and serialization without approval overrides', () => {
  for (const caseId of ['P00', 'B14']) {
    const base = baseCase(caseId)
    const before = JSON.stringify(base.config)
    const config = applySelectedProfileApprovalPolicy({ caseId, config: base.config })
    assert.equal(config, base.config)
    assert.equal(JSON.stringify(config), before)
    assert.equal(Object.hasOwn(config.mcp_servers.appraise_m02, 'tools'), false)
    assert.equal(Object.hasOwn(config.mcp_servers.appraise_m02, 'default_tools_approval_mode'), false)
    assert.deepEqual(JSON.parse(JSON.stringify(base.threadStartParams)).config, config)
    if (caseId === 'B14') {
      assert.deepEqual(config.approval_policy, B14_PROFILE.approval_policy)
      assert.deepEqual(base.threadStartParams.approvalPolicy, B14_PROFILE.approval_policy)
      assert.deepEqual(config.approval_policy.granular, {
        mcp_elicitations: false,
        sandbox_approval: false,
        rules: false,
        request_permissions: true,
        skill_approval: false,
      })
    } else assert.equal(config.approval_policy, 'never')
  }
})

test('missing duplicate reordered stale normalized and foreign profile members fail before config mutation', () => {
  for (const group of ['gatewayProfile', 'advertisedProfile', 'toolsList']) {
    for (const mutate of [
      tools => tools.pop(),
      tools => tools.push(clone(tools[0])),
      tools => tools.reverse(),
      tools => {
        tools[0].name = 'foreign_unregistered_tool'
      },
      tools => {
        tools[0].name = `mcp__appraise_m02__${tools[0].name}`
      },
      tools => tools.push(clone(selected('AUTOMATOR').toolsList.tools[0])),
    ]) {
      const profile = clone(selected('REQUIREMENT_ANALYZER'))
      mutate(profile[group].tools)
      const config = baseCase('B01').config
      const before = JSON.stringify(config)
      assert.throws(
        () => applySelectedProfileApprovalPolicy({ caseId: 'B01', selectedProfile: profile, config }),
        /MEMBERSHIP/,
      )
      assert.equal(JSON.stringify(config), before)
    }
  }
  for (const mutate of [
    profile => {
      profile.toolsList.tools[0].description += ' stale'
    },
    profile => {
      profile.toolsList.digest = `sha256:${'0'.repeat(64)}`
    },
    profile => {
      profile.advertisedProfile.profileDigest = `sha256:${'0'.repeat(64)}`
    },
    profile => {
      profile.gatewayProfile.tools[0].inputSchema.additionalProperties = true
    },
    profile => {
      profile.toolsList.tools[0].annotations = { readOnlyHint: true }
    },
  ]) {
    const profile = clone(selected('REQUIREMENT_ANALYZER'))
    mutate(profile)
    assert.throws(
      () =>
        applySelectedProfileApprovalPolicy({ caseId: 'B01', selectedProfile: profile, config: baseCase('B01').config }),
      /PROFILE_PIN/,
    )
  }
  for (const selectedProfile of [undefined, null, {}, selected('AUTOMATOR'), selected('SCOUT')])
    assert.throws(() =>
      applySelectedProfileApprovalPolicy({ caseId: 'B01', selectedProfile, config: baseCase('B01').config }),
    )
})

test('case-selected role remains authoritative when a negative packet uses another role', () => {
  const base = baseCase('B07-D01')
  assert.equal(base.role, 'TEST_SCENARIO_DESIGNER')
  assert.throws(
    () =>
      applySelectedProfileApprovalPolicy({
        caseId: 'B07-D01',
        selectedProfile: selected('AUTOMATOR'),
        config: base.config,
      }),
    /ROLE/,
  )
  const config = applySelectedProfileApprovalPolicy({
    caseId: 'B07-D01',
    selectedProfile: selected(base.role),
    config: base.config,
  })
  assert.deepEqual(Object.keys(config.mcp_servers.appraise_m02.tools), [
    ...SELECTED_PROFILE_APPROVAL_PINS.TEST_SCENARIO_DESIGNER.names,
  ])
  assert.equal(
    Object.hasOwn(config.mcp_servers.appraise_m02.tools, 'quality_journey_external_automator_materialize_v1'),
    false,
  )
})

test('existing server defaults foreign tools role unions alternate overrides and global policy drift fail closed', () => {
  for (const mutate of [
    config => {
      config.approval_policy = 'on-request'
    },
    config => {
      config.approval_policy = { granular: { mcp_elicitations: true } }
    },
    config => {
      config.mcp_servers.foreign = clone(config.mcp_servers.appraise_m02)
    },
    config => {
      config.mcp_servers.appraise_m02.default_tools_approval_mode = 'approve'
    },
    config => {
      config.mcp_servers.appraise_m02.default_tools_approval_mode = 'auto'
    },
    config => {
      config.mcp_servers.appraise_m02.approval_mode = 'approve'
    },
    config => {
      config.mcp_servers.appraise_m02.tools = { foreign: { approval_mode: 'approve' } }
    },
    config => {
      config.mcp_servers.appraise_m02.tools = Object.fromEntries(
        seal.profiles.roles.flatMap(profile =>
          profile.toolsList.tools.map(tool => [tool.name, { approval_mode: 'approve' }]),
        ),
      )
    },
    config => {
      config.mcp_servers.appraise_m02.enabled_tools = ['quality_journey_analysis_get']
    },
    config => {
      config.mcp_servers.appraise_m02.required = false
    },
  ]) {
    const config = clone(baseCase('B01').config)
    mutate(config)
    const before = JSON.stringify(config)
    assert.throws(
      () =>
        applySelectedProfileApprovalPolicy({
          caseId: 'B01',
          selectedProfile: selected('REQUIREMENT_ANALYZER'),
          config,
        }),
      /CONFIG|SERVER_OVERRIDES/,
    )
    assert.equal(JSON.stringify(config), before)
  }
})

test('accessors prototype members cycles sparse arrays and custom serialization are refused without getter execution', () => {
  let reads = 0
  const profile = clone(selected('REQUIREMENT_ANALYZER'))
  Object.defineProperty(profile.toolsList.tools[0], 'name', {
    enumerable: true,
    get() {
      reads++
      return 'quality_journey_analysis_get'
    },
  })
  assert.throws(
    () =>
      applySelectedProfileApprovalPolicy({ caseId: 'B01', selectedProfile: profile, config: baseCase('B01').config }),
    /JSON_DATA/,
  )
  for (const mutate of [
    config =>
      Object.defineProperty(config, 'approval_policy', {
        enumerable: true,
        get() {
          reads++
          return 'never'
        },
      }),
    config =>
      Object.defineProperty(config.mcp_servers.appraise_m02, 'toJSON', {
        value() {
          reads++
          return {}
        },
        enumerable: true,
      }),
    config => {
      config.cycle = config
    },
    config => {
      config.mcp_servers.appraise_m02.args = Array(2)
    },
    config => Object.setPrototypeOf(config.mcp_servers.appraise_m02, { default_tools_approval_mode: 'approve' }),
  ]) {
    const config = clone(baseCase('B01').config)
    mutate(config)
    assert.throws(
      () =>
        applySelectedProfileApprovalPolicy({
          caseId: 'B01',
          selectedProfile: selected('REQUIREMENT_ANALYZER'),
          config,
        }),
      /JSON_DATA/,
    )
  }
  assert.equal(reads, 0)
  assert.throws(
    () =>
      applySelectedProfileApprovalPolicy({
        caseId: 'N01',
        selectedProfile: selected('REQUIREMENT_ANALYZER'),
        config: {},
      }),
    /CASE/,
  )
  assert.deepEqual(externalEffectAttempts, [])
})

test('selected config serialization is stable and distinct across the six exact sealed roles', () => {
  const hashes = new Set()
  for (const item of POLICY.cases.filter(item => /^B0[1-6]$/.test(item.id))) {
    const config = applySelectedProfileApprovalPolicy({
      caseId: item.id,
      selectedProfile: selected(item.role),
      config: baseCase(item.id).config,
    })
    const bytes = JSON.stringify(config.mcp_servers.appraise_m02.tools)
    hashes.add(createHash('sha256').update(bytes).digest('hex'))
    assert.equal(JSON.stringify(JSON.parse(bytes)), bytes)
  }
  assert.equal(hashes.size, 6)
  assert.deepEqual(externalEffectAttempts, [])
})
