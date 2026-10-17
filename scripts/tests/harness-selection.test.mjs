import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
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
  validateRecordedSelection,
  verifyEffectiveExecution,
} from '../lib/harness-selection.mjs'
import { createRoutingDecision } from '../lib/swarm-router.mjs'

const scriptsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoRoot = path.dirname(scriptsDir)
const contracts = loadHarnessSelectionContracts()
const packet = {
  objective: 'Complete the bounded assigned work.',
  evidence: ['No prior evidence was supplied.'],
  constraints: ['Preserve unrelated work.'],
  acceptanceCriteria: ['Return validation evidence.'],
}

function hostProfile(profile, overrides = {}) {
  const contract = contracts.profiles.profiles.find(candidate => candidate.id === profile)
  return {
    model: profileDefaults(contracts)[profile].model,
    reasoningEffort: profileDefaults(contracts)[profile].effort,
    forkTurns: 'none',
    role: contract.role,
    sandbox: contract.authority.sandbox,
    externalWrites: contract.authority.externalWrites,
    contextBoundary: contract.contextBoundary,
    ...overrides,
  }
}

test('canonical selection contracts use the tiered GPT-6 defaults', () => {
  assert.equal(contracts.catalog.models.find(model => model.id === 'gpt-6.1-sol').status, 'active')
  assert.deepEqual(profileDefaults(contracts).executor, {
    role: 'executor',
    model: 'gpt-6-sol',
    effort: 'medium',
    sandbox: 'workspace-write',
    contextBoundary: 'bounded',
  })
  assert.deepEqual(profileDefaults(contracts).judge, {
    role: 'judge',
    model: 'gpt-6-sol',
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
    () => resolveModelSelection({ profile: 'executor', override: { model: 'gpt-6-luna', effort: 'medium' } }),
    /lacks required capabilities/,
  )
  assert.throws(
    () => resolveModelSelection({ profile: 'executor', override: { model: 'gpt-5.6-terra', effort: 'medium' } }),
    /model gpt-5\.6-terra is historical only/,
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
      contracts => (contracts.policy.defaults.rogue = { model: 'gpt-6-sol', effort: 'high' }),
      /unsupported keys rogue/,
    ],
    [
      'historical default',
      contracts => (contracts.policy.defaults.executor = { model: 'gpt-5.6-terra', effort: 'medium' }),
      /historical only/,
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

test('selection is deterministic and responds only to explicit policy evidence', () => {
  const baseline = resolveModelSelection({ profile: 'executor' })
  const elevated = resolveModelSelection({
    profile: 'executor',
    consequence: 'high',
    expectedEffort: 'extended',
  })
  assert.equal(baseline.requested.model, 'gpt-6-sol')
  assert.equal(baseline.requested.effort, 'medium')
  assert.equal(baseline.requested.source, 'default')
  assert.equal(elevated.requested.model, 'gpt-6-sol')
  assert.equal(elevated.requested.effort, 'high')
  assert.equal(elevated.requested.source, 'rule:executor-consequential-extended')
  assert.equal(elevated.fallbackUsed, false)
})

test('unsupported hosts fail closed without a cross-tier or legacy fallback', () => {
  const limited = resolveModelSelection({
    profile: 'executor-advanced',
    host: { modelEfforts: { 'gpt-6-astra': ['high'] }, receipt: 'host-catalog:fixture' },
  })
  assert.equal(limited.status, 'limited')
  assert.deepEqual(limited.requested, {
    model: 'gpt-6-sol',
    effort: 'high',
    source: 'default',
  })
  assert.equal(limited.effective, null)
  assert.equal(limited.fallbackUsed, false)

  const legacyHost = resolveModelSelection({
    profile: 'executor',
    host: { modelEfforts: { 'gpt-5.6-terra': ['medium'] } },
  })
  assert.equal(legacyHost.status, 'limited')
  assert.equal(adaptSelectionForCodex(legacyHost).canSpawn, false)

  assert.throws(
    () =>
      resolveModelSelection({
        profile: 'executor',
        host: { modelEfforts: { 'gpt-6-sol': ['medium'] } },
        override: { model: 'gpt-6-sol', effort: 'high' },
      }),
    error => error instanceof SelectionLimitationError && /Explicit model override/.test(error.message),
  )
})

test('adapter reports unsupported profile or context boundaries without inventing effective execution proof', () => {
  const selection = resolveModelSelection({ profile: 'solver' })
  const unsupported = adaptSelectionForCodex(selection, contracts, {
    modelEfforts: { 'gpt-6-sol': ['high'] },
    profiles: {
      executor: { model: 'gpt-6-sol', reasoningEffort: 'medium', forkTurns: 3 },
    },
  })
  assert.equal(unsupported.canSpawn, false)
  assert.equal(unsupported.spawnArguments, null)
  assert.match(unsupported.limitations.join(' '), /does not provide a profile descriptor/)
  assert.equal(unsupported.effectiveExecution.status, 'unverified')

  const supported = adaptSelectionForCodex(
    selection,
    contracts,
    {
      modelEfforts: { 'gpt-6-sol': ['high'] },
      profiles: {
        solver: hostProfile('solver'),
      },
    },
    { assignmentPacket: packet },
  )
  assert.deepEqual(supported.spawnArguments, {
    fork_turns: 'none',
    agent_type: 'solver',
  })
})

test('adapter refuses fixed profiles without an enforceable host role-contract fallback mechanism', () => {
  const selection = resolveModelSelection({
    profile: 'executor',
    consequence: 'high',
    expectedEffort: 'extended',
    host: { modelEfforts: { 'gpt-6-sol': ['high'] } },
  })
  const fixedHost = {
    modelEfforts: { 'gpt-6-sol': ['high'] },
    profiles: {
      executor: hostProfile('executor'),
    },
  }
  const rejected = adaptSelectionForCodex(selection, contracts, fixedHost, { assignmentPacket: packet })
  assert.equal(rejected.canSpawn, false)
  assert.match(rejected.limitations.join(' '), /executor-high/)

  const fallback = adaptSelectionForCodex(
    selection,
    contracts,
    {
      ...fixedHost,
      supportsRoleContractFallback: true,
    },
    { assignmentPacket: packet },
  )
  assert.equal(fallback.canSpawn, false)
  assert.equal(fallback.spawnArguments, null)
  assert.match(fallback.limitations.join(' '), /executor-high/)
  assert.deepEqual(selection.effective, { model: 'gpt-6-sol', effort: 'high' })
})

test('a GPT-5.6 named role cannot run a GPT-6 selection even when the model is otherwise available', () => {
  const selection = resolveModelSelection({ profile: 'executor' })
  const adapter = adaptSelectionForCodex(
    selection,
    contracts,
    {
      modelEfforts: { 'gpt-6-sol': ['medium'] },
      profiles: {
        executor: hostProfile('executor', { model: 'gpt-5.6-terra' }),
      },
    },
    { assignmentPacket: packet },
  )
  assert.equal(adapter.canSpawn, false)
  assert.match(adapter.limitations.join(' '), /is fixed to gpt-5\.6-terra\/medium/)
  assert.equal(adapter.effectiveExecution.status, 'unverified')
})

test('exceptional Astra review requires an exact registered judge variant', () => {
  const selection = resolveModelSelection({
    profile: 'judge',
    consequence: 'high',
    verificationStrength: 'weak',
    expectedEffort: 'extended',
  })
  const host = {
    modelEfforts: { 'gpt-6-astra': ['high'] },
    profiles: { judge: hostProfile('judge') },
  }
  const fixed = adaptSelectionForCodex(selection, contracts, host, { assignmentPacket: packet })
  assert.equal(fixed.canSpawn, false)
  assert.match(fixed.limitations.join(' '), /judge-astra-high/)

  const overrideCapable = adaptSelectionForCodex(
    selection,
    contracts,
    {
      ...host,
      profiles: { 'judge-astra-high': hostProfile('judge', { model: 'gpt-6-astra' }) },
    },
    { assignmentPacket: packet },
  )
  assert.deepEqual(overrideCapable.spawnArguments, {
    fork_turns: 'none',
    agent_type: 'judge-astra-high',
  })
  assert.equal(overrideCapable.effectiveExecution.status, 'unverified')
})

test('host model override alone cannot bypass an absent exact registration or bounded packet', () => {
  const selection = resolveModelSelection({
    profile: 'judge',
    consequence: 'high',
    verificationStrength: 'weak',
    expectedEffort: 'extended',
  })
  const host = {
    modelEfforts: { 'gpt-6-astra': ['high'] },
    profiles: { judge: hostProfile('judge', { supportsModelOverride: true }) },
  }
  assert.equal(adaptSelectionForCodex(selection, contracts, host, { assignmentPacket: packet }).canSpawn, false)
  const registered = {
    ...host,
    profiles: { 'judge-astra-high': hostProfile('judge', { model: 'gpt-6-astra' }) },
  }
  assert.equal(adaptSelectionForCodex(selection, contracts, registered).canSpawn, false)
  assert.equal(
    adaptSelectionForCodex(selection, contracts, registered, {
      assignmentPacket: { ...packet, evidence: [] },
    }).canSpawn,
    false,
  )
  const ready = adaptSelectionForCodex(selection, contracts, registered, { assignmentPacket: packet })
  assert.equal(ready.canSpawn, true)
  assert.equal('model' in ready.spawnArguments, false)
})

test('GPT-6.1 Sol is selectable for evaluation but the approved default stays on GPT-6 Sol', () => {
  const defaultSelection = resolveModelSelection({ profile: 'executor' })
  assert.equal(defaultSelection.requested.model, 'gpt-6-sol')
  const candidate = resolveModelSelection({
    profile: 'executor',
    override: { model: 'gpt-6.1-sol', effort: 'medium' },
  })
  assert.equal(candidate.requested.model, 'gpt-6.1-sol')
  const adapter = adaptSelectionForCodex(
    candidate,
    contracts,
    {
      modelEfforts: { 'gpt-6.1-sol': ['medium'] },
      profiles: { executor: hostProfile('executor', { supportsModelOverride: true }) },
    },
    { assignmentPacket: packet },
  )
  assert.equal(adapter.canSpawn, false)
  assert.match(adapter.limitations.join(' '), /profile descriptor for executor-sol61/)
  const registered = adaptSelectionForCodex(
    candidate,
    contracts,
    {
      modelEfforts: { 'gpt-6.1-sol': ['medium'] },
      profiles: { 'executor-sol61': hostProfile('executor', { model: 'gpt-6.1-sol' }) },
    },
    { assignmentPacket: packet },
  )
  assert.deepEqual(registered.spawnArguments, { fork_turns: 'none', agent_type: 'executor-sol61' })
})

test('currency report identifies the opt-in candidate without changing defaults', () => {
  const output = execFileSync(process.execPath, [path.join(scriptsDir, 'report-harness-model-currency.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  const report = JSON.parse(output)
  assert.equal(report.automaticUpgrade, false)
  assert.equal(report.refreshedOfficialEvidence, false)
  assert.equal(report.candidates.find(candidate => candidate.model === 'gpt-6.1-sol').evaluationCandidate, true)
  assert.equal(report.candidates.find(candidate => candidate.model === 'gpt-6.1-sol').hostAvailability, 'unverified')
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-currency-'))
  try {
    const evidenceFile = path.join(temporary, 'official.json')
    fs.writeFileSync(
      evidenceFile,
      JSON.stringify({
        checkedAt: '2026-10-17',
        sourceUrl: 'https://learn.chatgpt.com/docs/models',
        models: ['gpt-6-luna', 'gpt-6-sol', 'gpt-6.1-sol', 'gpt-6.2-sol'],
      }),
    )
    const refreshed = JSON.parse(
      execFileSync(
        process.execPath,
        [path.join(scriptsDir, 'report-harness-model-currency.mjs'), '--official-evidence-file', evidenceFile],
        { cwd: repoRoot, encoding: 'utf8' },
      ),
    )
    assert.equal(refreshed.refreshedOfficialEvidence, true)
    assert.deepEqual(refreshed.officialModelsAbsentFromCatalog, ['gpt-6.2-sol'])
    assert.equal(refreshed.automaticUpgrade, false)
    fs.writeFileSync(
      evidenceFile,
      JSON.stringify({
        checkedAt: '2026-10-17',
        sourceUrl: 'https://example.com/models',
        models: ['gpt-6.2-sol'],
      }),
    )
    const invalid = spawnSync(
      process.execPath,
      [path.join(scriptsDir, 'report-harness-model-currency.mjs'), '--official-evidence-file', evidenceFile],
      { cwd: repoRoot, encoding: 'utf8' },
    )
    assert.notEqual(invalid.status, 0)
    assert.match(invalid.stderr, /official OpenAI HTTPS URL/)
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})

test('adapter requires host-advertised authority and context compatible with the profile', () => {
  const selection = resolveModelSelection({
    profile: 'executor',
    host: { modelEfforts: { 'gpt-6-sol': ['medium'] } },
  })
  const incompatible = adaptSelectionForCodex(selection, contracts, {
    modelEfforts: { 'gpt-6-sol': ['medium'] },
    profiles: {
      executor: hostProfile('executor', { role: 'executor', sandbox: 'workspace-write', externalWrites: 'allowed' }),
    },
  })
  assert.equal(incompatible.canSpawn, false)
  assert.match(incompatible.limitations.join(' '), /externalWrites allowed, expected approval-required/)

  const missing = adaptSelectionForCodex(selection, contracts, {
    modelEfforts: { 'gpt-6-sol': ['medium'] },
    profiles: { executor: { model: 'gpt-6-sol', reasoningEffort: 'medium', forkTurns: 3 } },
  })
  assert.equal(missing.canSpawn, false)
  assert.match(missing.limitations.join(' '), /does not advertise role support/)

  const judgeSelection = resolveModelSelection({
    profile: 'judge',
    host: { modelEfforts: { 'gpt-6-sol': ['high'] } },
  })
  const judge = adaptSelectionForCodex(judgeSelection, contracts, {
    modelEfforts: { 'gpt-6-sol': ['high'] },
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
    model: 'host-effective-model:gpt-6-sol',
    reasoning: 'host-effective-reasoning:high',
    context: 'host-effective-context:fork_turns:none',
    sandbox: 'host-effective-sandbox:read-only',
  })
  assert.equal(selection.requested.source, 'default')
  assert.equal(proof.status, 'verified')
  assert.equal(proof.claims.model.receipt, 'host-effective-model:gpt-6-sol')
  const bounded = verifyEffectiveExecution(resolveModelSelection({ profile: 'executor' }), {
    context: 'host-effective-context:fork_turns:none;assignment-packet:bounded',
  })
  assert.equal(bounded.claims.context.status, 'verified')
  const requestedOnly = verifyEffectiveExecution(resolveModelSelection({ profile: 'executor' }), {
    context: 'fork_turns:none;assignment-packet:bounded',
  })
  assert.equal(requestedOnly.claims.context.status, 'unverified')
})

test('recorded selections replay only against the same contract content and host-effective choice', () => {
  const host = { modelEfforts: { 'gpt-6-sol': ['medium'] } }
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

test('historical selections remain inspectable but cannot replay under the GPT-6 contract', () => {
  const historical = {
    ...resolveModelSelection({ profile: 'executor' }),
    contractDigest: '0'.repeat(64),
    requested: { model: 'gpt-5.6-terra', effort: 'medium', source: 'default' },
    effective: { model: 'gpt-5.6-terra', effort: 'medium' },
  }
  assert.equal(validateRecordedSelection(historical, 'executor'), historical)
  assert.throws(() => replayRecordedSelection(historical), /contract content has changed/)
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
    default_subagent_model: 'gpt-6-sol',
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
  for (const [id, model, effort, sandbox] of [
    ['investigator-high', 'gpt-6-luna', 'high', 'read-only'],
    ['executor-high', 'gpt-6-sol', 'high', 'workspace-write'],
    ['solver-xhigh', 'gpt-6-sol', 'xhigh', 'read-only'],
    ['judge-astra-high', 'gpt-6-astra', 'high', 'read-only'],
    ['executor-sol61', 'gpt-6.1-sol', 'medium', 'workspace-write'],
    ['executor-sol61-high', 'gpt-6.1-sol', 'high', 'workspace-write'],
    ['executor-advanced-sol61', 'gpt-6.1-sol', 'high', 'workspace-write'],
    ['solver-sol61', 'gpt-6.1-sol', 'high', 'read-only'],
    ['judge-sol61', 'gpt-6.1-sol', 'high', 'read-only'],
  ]) {
    registrations[id] = { config_file: `agents/${id}.toml` }
    agentFiles[id] = { model, model_reasoning_effort: effort, sandbox_mode: sandbox }
  }
  assert.deepEqual(
    validateConfiguredAgentMappings({ agentDefaults: defaults, registrations, agentFiles }, contracts),
    [],
  )
  agentFiles.judge.model = 'gpt-5.6-sol'
  assert.match(
    validateConfiguredAgentMappings({ agentDefaults: defaults, registrations, agentFiles }, contracts).join('\n'),
    /judge: expected model gpt-6-sol/,
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
      '{"modelEfforts":{"gpt-6-sol":["medium"]},"profiles":{"executor":{"model":"gpt-6-sol","reasoningEffort":"medium","forkTurns":"none","role":"executor","sandbox":"workspace-write","externalWrites":"approval-required","contextBoundary":"bounded"}}}',
      '--assignment-packet',
      JSON.stringify(packet),
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.deepEqual(JSON.parse(output).adapter.spawnArguments, {
    fork_turns: 'none',
    agent_type: 'executor',
  })
  const unavailable = spawnSync(
    process.execPath,
    [
      path.join(scriptsDir, 'select-harness-agent.mjs'),
      '--profile',
      'solver',
      '--host-support',
      '{"modelEfforts":{"gpt-6-sol":["high"]},"profiles":{"executor":{"model":"gpt-6-sol","reasoningEffort":"medium","forkTurns":2}}}',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.equal(unavailable.status, 2)
  assert.match(JSON.parse(unavailable.stdout).adapter.limitations.join(' '), /does not provide a profile descriptor/)
})

test('replay CLI reproduces a recorded selection and rejects changed contract content', () => {
  const host = { modelEfforts: { 'gpt-6-sol': ['high'] } }
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
