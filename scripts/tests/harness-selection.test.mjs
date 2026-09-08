import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  SelectionLimitationError,
  adaptSelectionForCodex,
  loadHarnessSelectionContracts,
  profileDefaults,
  replayRecordedSelection,
  resolveModelSelection,
  validateConfiguredAgentMappings,
  validateHarnessSelectionContracts,
  verifyEffectiveExecution,
} from '../lib/harness-selection.mjs'
import { createRoutingDecision } from '../lib/swarm-router.mjs'

const scriptsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoRoot = path.dirname(scriptsDir)
const contracts = loadHarnessSelectionContracts()

function hostProfile(profile, overrides = {}) {
  const contract = contracts.profiles.profiles.find(candidate => candidate.id === profile)
  return {
    model: profileDefaults(contracts)[profile].model,
    reasoningEffort: profileDefaults(contracts)[profile].effort,
    forkTurns: contract.contextBoundary === 'none' ? 'none' : 3,
    role: contract.role,
    sandbox: contract.authority.sandbox,
    externalWrites: contract.authority.externalWrites,
    contextBoundary: contract.contextBoundary,
    ...overrides,
  }
}

test('canonical selection contracts retain the existing profile defaults', () => {
  assert.deepEqual(profileDefaults(contracts).executor, {
    role: 'executor',
    model: 'gpt-5.6-terra',
    effort: 'medium',
    sandbox: 'workspace-write',
    contextBoundary: 'bounded',
  })
  assert.deepEqual(profileDefaults(contracts).judge, {
    role: 'judge',
    model: 'gpt-5.6-sol',
    effort: 'high',
    sandbox: 'read-only',
    contextBoundary: 'none',
  })
})

test('invalid selection records and incompatible policy candidates fail clearly', () => {
  const invalid = structuredClone(contracts)
  invalid.catalog.models[0].supportedEfforts = ['invalid']
  assert.throws(() => validateHarnessSelectionContracts(invalid), /unsupported effort/)

  assert.throws(
    () => resolveModelSelection({ profile: 'executor', override: { model: 'gpt-5.6-luna', effort: 'medium' } }),
    /lacks required capabilities/,
  )
})

test('selection contracts reject unsupported authority, context, defaults, fallbacks, and rule keys', () => {
  const cases = [
    [
      'judge authority',
      contracts =>
        (contracts.profiles.profiles.find(profile => profile.id === 'judge').authority.sandbox = 'workspace-write'),
      /authority\.sandbox/,
    ],
    [
      'judge context',
      contracts => (contracts.profiles.profiles.find(profile => profile.id === 'judge').contextBoundary = 'bounded'),
      /contextBoundary/,
    ],
    [
      'surprise default',
      contracts => (contracts.policy.defaults.rogue = { model: 'gpt-5.6-sol', effort: 'high' }),
      /unsupported keys rogue/,
    ],
    ['surprise fallback', contracts => (contracts.policy.fallbacks.rogue = []), /unsupported keys rogue/],
    ['surprise rule field', contracts => (contracts.policy.rules[0].rogue = true), /unsupported keys rogue/],
    [
      'rule when typo',
      contracts => (contracts.policy.rules[0].when.typoField = 'high'),
      /unsupported when field typoField/,
    ],
  ]
  for (const [, mutate, expected] of cases) {
    const invalid = structuredClone(contracts)
    mutate(invalid)
    assert.throws(() => validateHarnessSelectionContracts(invalid), expected)
  }
})

test('selection is deterministic, preserves defaults, and responds only to explicit policy evidence', () => {
  const baseline = resolveModelSelection({ profile: 'executor' })
  const elevated = resolveModelSelection({
    profile: 'executor',
    consequence: 'high',
    expectedEffort: 'extended',
  })
  assert.equal(baseline.requested.model, 'gpt-5.6-terra')
  assert.equal(baseline.requested.effort, 'medium')
  assert.equal(baseline.requested.source, 'default')
  assert.equal(elevated.requested.model, 'gpt-5.6-terra')
  assert.equal(elevated.requested.effort, 'high')
  assert.equal(elevated.requested.source, 'rule:executor-consequential-extended')
  assert.equal(elevated.fallbackUsed, false)
})

test('approved fallbacks are deterministic and cannot expand profile capabilities', () => {
  const fallback = resolveModelSelection({
    profile: 'executor-advanced',
    host: { modelEfforts: { 'gpt-6-astra': ['high'] }, receipt: 'host-catalog:fixture' },
  })
  assert.equal(fallback.status, 'selected')
  assert.deepEqual(fallback.requested, {
    model: 'gpt-5.6-terra',
    effort: 'high',
    source: 'default',
  })
  assert.deepEqual(fallback.effective, { model: 'gpt-6-astra', effort: 'high' })
  assert.equal(fallback.fallbackUsed, true)

  assert.throws(
    () =>
      resolveModelSelection({
        profile: 'executor',
        host: { modelEfforts: { 'gpt-5.6-terra': ['medium'] } },
        override: { model: 'gpt-5.6-terra', effort: 'high' },
      }),
    error => error instanceof SelectionLimitationError && /Explicit model override/.test(error.message),
  )
})

test('adapter reports unsupported profile or context boundaries without inventing effective execution proof', () => {
  const selection = resolveModelSelection({ profile: 'solver' })
  const unsupported = adaptSelectionForCodex(selection, contracts, {
    modelEfforts: { 'gpt-5.6-sol': ['high'] },
    profiles: {
      executor: { model: 'gpt-5.6-terra', reasoningEffort: 'medium', forkTurns: 3 },
    },
  })
  assert.equal(unsupported.canSpawn, false)
  assert.equal(unsupported.spawnArguments, null)
  assert.match(unsupported.limitations.join(' '), /does not provide a profile descriptor/)
  assert.equal(unsupported.effectiveExecution.status, 'unverified')

  const supported = adaptSelectionForCodex(selection, contracts, {
    modelEfforts: { 'gpt-5.6-sol': ['high'] },
    profiles: {
      solver: hostProfile('solver'),
    },
  })
  assert.deepEqual(supported.spawnArguments, {
    model: 'gpt-5.6-sol',
    reasoning_effort: 'high',
    fork_turns: 'none',
    agent_type: 'solver',
  })
})

test('adapter refuses fixed profiles without an enforceable host role-contract fallback mechanism', () => {
  const selection = resolveModelSelection({
    profile: 'executor',
    consequence: 'high',
    expectedEffort: 'extended',
    host: { modelEfforts: { 'gpt-5.6-terra': ['high'] } },
  })
  const fixedHost = {
    modelEfforts: { 'gpt-5.6-terra': ['high'] },
    profiles: {
      executor: hostProfile('executor'),
    },
  }
  const rejected = adaptSelectionForCodex(selection, contracts, fixedHost)
  assert.equal(rejected.canSpawn, false)
  assert.match(rejected.limitations.join(' '), /is fixed to gpt-5.6-terra\/medium/)

  const fallback = adaptSelectionForCodex(selection, contracts, {
    ...fixedHost,
    supportsRoleContractFallback: true,
  })
  assert.equal(fallback.canSpawn, false)
  assert.equal(fallback.spawnArguments, null)
  assert.match(fallback.limitations.join(' '), /no enforceable role or sandbox mechanism/)
  assert.deepEqual(selection.effective, { model: 'gpt-5.6-terra', effort: 'high' })
})

test('adapter requires host-advertised authority and context compatible with the profile', () => {
  const selection = resolveModelSelection({
    profile: 'executor',
    host: { modelEfforts: { 'gpt-5.6-terra': ['medium'] } },
  })
  const incompatible = adaptSelectionForCodex(selection, contracts, {
    modelEfforts: { 'gpt-5.6-terra': ['medium'] },
    profiles: {
      executor: hostProfile('executor', { role: 'executor', sandbox: 'workspace-write', externalWrites: 'allowed' }),
    },
  })
  assert.equal(incompatible.canSpawn, false)
  assert.match(incompatible.limitations.join(' '), /externalWrites allowed, expected approval-required/)

  const missing = adaptSelectionForCodex(selection, contracts, {
    modelEfforts: { 'gpt-5.6-terra': ['medium'] },
    profiles: { executor: { model: 'gpt-5.6-terra', reasoningEffort: 'medium', forkTurns: 3 } },
  })
  assert.equal(missing.canSpawn, false)
  assert.match(missing.limitations.join(' '), /does not advertise role support/)

  const judgeSelection = resolveModelSelection({
    profile: 'judge',
    host: { modelEfforts: { 'gpt-5.6-sol': ['high'] } },
  })
  const judge = adaptSelectionForCodex(judgeSelection, contracts, {
    modelEfforts: { 'gpt-5.6-sol': ['high'] },
    profiles: {
      judge: hostProfile('judge', {
        sandbox: 'workspace-write',
        externalWrites: 'allowed',
        contextBoundary: 'bounded',
        forkTurns: 3,
      }),
    },
  })
  assert.equal(judge.canSpawn, false)
  assert.match(judge.limitations.join(' '), /sandbox workspace-write, expected read-only/)
  assert.match(judge.limitations.join(' '), /contextBoundary bounded, expected none/)
})

test('requested selection and verified effective execution remain separate receipts', () => {
  const selection = resolveModelSelection({ profile: 'solver' })
  const proof = verifyEffectiveExecution(selection, {
    role: 'host-effective-role:solver',
    model: 'host-effective-model:gpt-5.6-sol',
    reasoning: 'host-effective-reasoning:high',
    context: 'host-effective-context:fork_turns:none',
    sandbox: 'host-effective-sandbox:read-only',
  })
  assert.equal(selection.requested.source, 'default')
  assert.equal(proof.status, 'verified')
  assert.equal(proof.claims.model.receipt, 'host-effective-model:gpt-5.6-sol')
})

test('recorded selections replay only against the same contract content and host-effective choice', () => {
  const host = { modelEfforts: { 'gpt-5.6-terra': ['medium'] } }
  const recorded = resolveModelSelection({ profile: 'executor', host })
  const replayed = replayRecordedSelection(recorded, { host })
  assert.deepEqual(replayed.effective, recorded.effective)
  assert.equal(replayed.contractDigest, recorded.contractDigest)

  const changedContracts = structuredClone(contracts)
  changedContracts.policy.rules[0].rationale = 'Changed without a schema version bump.'
  assert.throws(
    () => replayRecordedSelection(recorded, { host }, changedContracts),
    error => error instanceof SelectionLimitationError && /contract content has changed/.test(error.message),
  )
})

test('routing records canonical selection inputs and validates a policy-selected effective model receipt', () => {
  const decision = createRoutingDecision({
    taskClass: 'release-gate',
    consequence: 'high',
    verificationStrength: 'weak',
    expectedEffort: 'extended',
    runtimeProof: {
      status: 'partial',
      receipt: null,
      claims: {
        role: { status: 'unverified', receipt: null },
        model: { status: 'verified', receipt: 'host-effective-model:gpt-6-astra' },
        reasoning: { status: 'verified', receipt: 'host-effective-reasoning:high' },
        context: { status: 'unverified', receipt: null },
        sandbox: { status: 'unverified', receipt: null },
      },
    },
  })
  assert.equal(decision.profile, 'judge')
  assert.equal(decision.selection.requested.source, 'rule:judge-consequential-weak-proof')
  assert.equal(decision.selection.effective.model, 'gpt-6-astra')
})

test('canonical defaults validate the current host configuration and reject drift', () => {
  const defaults = {
    default_subagent_model: 'gpt-5.6-terra',
    default_subagent_reasoning_effort: 'medium',
  }
  const registrations = Object.fromEntries(
    Object.keys(profileDefaults(contracts))
      .filter(profile => profile !== 'coordinator-only')
      .map(profile => [profile, { config_file: `agents/${profile}.toml` }]),
  )
  const agentFiles = Object.fromEntries(
    Object.entries(profileDefaults(contracts))
      .filter(([profile]) => profile !== 'coordinator-only')
      .map(([profile, defaultSelection]) => [
        profile,
        {
          model: defaultSelection.model,
          model_reasoning_effort: defaultSelection.effort,
          sandbox_mode: defaultSelection.sandbox,
        },
      ]),
  )
  assert.deepEqual(
    validateConfiguredAgentMappings({ agentDefaults: defaults, registrations, agentFiles }, contracts),
    [],
  )
  agentFiles.judge.model = 'gpt-5.6-terra'
  assert.match(
    validateConfiguredAgentMappings({ agentDefaults: defaults, registrations, agentFiles }, contracts).join('\n'),
    /judge: expected model gpt-5.6-sol/,
  )
})

test('selection CLI exposes spawn arguments and fails clearly when the host cannot honor a profile', () => {
  const output = execFileSync(
    process.execPath,
    [
      path.join(scriptsDir, 'select-harness-agent.mjs'),
      '--profile',
      'executor',
      '--host-support',
      '{"modelEfforts":{"gpt-5.6-terra":["medium"]},"profiles":{"executor":{"model":"gpt-5.6-terra","reasoningEffort":"medium","forkTurns":2,"role":"executor","sandbox":"workspace-write","externalWrites":"approval-required","contextBoundary":"bounded"}}}',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.deepEqual(JSON.parse(output).adapter.spawnArguments, {
    model: 'gpt-5.6-terra',
    reasoning_effort: 'medium',
    fork_turns: '2',
    agent_type: 'executor',
  })
  const unavailable = spawnSync(
    process.execPath,
    [
      path.join(scriptsDir, 'select-harness-agent.mjs'),
      '--profile',
      'solver',
      '--host-support',
      '{"modelEfforts":{"gpt-5.6-sol":["high"]},"profiles":{"executor":{"model":"gpt-5.6-terra","reasoningEffort":"medium","forkTurns":2}}}',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.equal(unavailable.status, 2)
  assert.match(JSON.parse(unavailable.stdout).adapter.limitations.join(' '), /does not provide a profile descriptor/)
})

test('replay CLI reproduces a recorded selection and rejects changed contract content', () => {
  const host = { modelEfforts: { 'gpt-5.6-sol': ['high'] } }
  const recorded = resolveModelSelection({ profile: 'solver', host })
  const output = execFileSync(
    process.execPath,
    [
      path.join(scriptsDir, 'replay-harness-selection.mjs'),
      '--recorded-selection',
      JSON.stringify(recorded),
      '--host-support',
      JSON.stringify(host),
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.equal(JSON.parse(output).reproduced, true)
  const stale = { ...recorded, contractDigest: '0'.repeat(64) }
  const result = spawnSync(
    process.execPath,
    [path.join(scriptsDir, 'replay-harness-selection.mjs'), '--recorded-selection', JSON.stringify(stale)],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /contract content has changed/)
})
