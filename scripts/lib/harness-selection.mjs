import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../config/development-harness')
const profileIds = new Set(['coordinator-only', 'investigator', 'executor', 'executor-advanced', 'solver', 'judge'])
const efforts = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultra'])
const profileFields = ['id', 'role', 'requiredCapabilities', 'authority', 'contextBoundary', 'stopConditions']
const selectionInputValues = {
  scope: ['localized', 'cross-module'],
  evidenceNeeds: ['low', 'medium', 'high'],
  judgment: ['low', 'medium', 'high'],
  consequence: ['low', 'medium', 'high'],
  verificationStrength: ['strong', 'weak', 'unknown'],
  expectedEffort: ['localized', 'extended'],
}
const profileInvariants = {
  'coordinator-only': {
    role: 'coordinator',
    sandbox: 'not-applicable',
    externalWrites: 'current-task-only',
    contextBoundary: 'not-applicable',
  },
  investigator: {
    role: 'investigator',
    sandbox: 'read-only',
    externalWrites: 'prohibited',
    contextBoundary: 'bounded',
  },
  executor: {
    role: 'executor',
    sandbox: 'workspace-write',
    externalWrites: 'approval-required',
    contextBoundary: 'bounded',
  },
  'executor-advanced': {
    role: 'executor',
    sandbox: 'workspace-write',
    externalWrites: 'approval-required',
    contextBoundary: 'bounded',
  },
  solver: { role: 'solver', sandbox: 'read-only', externalWrites: 'prohibited', contextBoundary: 'none' },
  judge: { role: 'judge', sandbox: 'read-only', externalWrites: 'prohibited', contextBoundary: 'none' },
}

export class SelectionLimitationError extends Error {
  constructor(message, limitation) {
    super(message)
    this.name = 'SelectionLimitationError'
    this.limitation = limitation
  }
}

export function loadHarnessSelectionContracts(root = harnessRoot) {
  const contracts = {
    profiles: readJson(path.join(root, 'agent-profiles.json')),
    catalog: readJson(path.join(root, 'model-catalog.json')),
    policy: readJson(path.join(root, 'selection-policy.json')),
  }
  validateHarnessSelectionContracts(contracts)
  return deepFreeze(contracts)
}

export function validateHarnessSelectionContracts(contracts) {
  assertObject(contracts, 'selection contracts')
  validateProfiles(contracts.profiles)
  validateCatalog(contracts.catalog)
  validatePolicy(contracts.policy, contracts.profiles, contracts.catalog)
  return contracts
}

export function profileDefaults(contracts = loadHarnessSelectionContracts()) {
  validateHarnessSelectionContracts(contracts)
  return Object.fromEntries(
    contracts.profiles.profiles.map(profile => {
      const selection = contracts.policy.defaults[profile.id]
      return [
        profile.id,
        Object.freeze({
          role: profile.role,
          model: selection.model,
          effort: selection.effort,
          sandbox: profile.authority.sandbox === 'not-applicable' ? null : profile.authority.sandbox,
          contextBoundary: profile.contextBoundary,
        }),
      ]
    }),
  )
}

export function selectionContractDigest(contracts = loadHarnessSelectionContracts()) {
  validateHarnessSelectionContracts(contracts)
  return createHash('sha256').update(stableJson(contracts)).digest('hex')
}

export function resolveModelSelection(input = {}, contracts = loadHarnessSelectionContracts()) {
  validateHarnessSelectionContracts(contracts)
  const profile = findProfile(input.profile, contracts)
  const selectionInputs = normalizedSelectionInputs(input)
  if (profile.id === 'coordinator-only') return coordinatorSelection(profile, contracts, selectionInputs)

  const explicit = normalizeExplicitOverride(input.override)
  const policyMatch = findPolicyMatch(profile.id, selectionInputs, contracts.policy.rules)
  const requested = explicit ?? policyMatch?.select ?? contracts.policy.defaults[profile.id]
  assertCandidateCompatible(requested, profile, contracts, 'requested selection')
  const hostAvailability = candidateHostAvailability(requested, input.host)

  if (explicit && hostAvailability.status === 'unsupported') {
    throw new SelectionLimitationError(
      `Explicit model override ${requested.model}/${requested.effort} is unavailable on this host.`,
      hostAvailability,
    )
  }

  const effectiveResult = resolveEffectiveCandidate({
    requested,
    profile,
    host: input.host,
    contracts,
    allowFallback: !explicit,
  })

  const rationale = explicit
    ? 'Compatible explicit override selected.'
    : policyMatch
      ? policyMatch.rationale
      : 'Insufficient policy evidence; preserved the approved existing default.'
  return freezeSelection({
    status: effectiveResult.effective ? 'selected' : 'limited',
    profile: profile.id,
    profileVersion: contracts.profiles.schemaVersion,
    catalogVersion: contracts.catalog.schemaVersion,
    policyVersion: contracts.policy.schemaVersion,
    contractDigest: selectionContractDigest(contracts),
    inputs: selectionInputs,
    requested: {
      ...requested,
      source: explicit ? 'explicit-override' : policyMatch ? `rule:${policyMatch.id}` : 'default',
    },
    effective: effectiveResult.effective,
    fallbackUsed: effectiveResult.fallbackUsed,
    rationale,
    hostSupport: effectiveResult.hostSupport,
    limitations: effectiveResult.limitations,
  })
}

export function replayRecordedSelection(recorded, { host } = {}, contracts = loadHarnessSelectionContracts()) {
  validateRecordedSelection(recorded, recorded?.profile, contracts)
  const expectedDigest = selectionContractDigest(contracts)
  if (recorded.contractDigest !== expectedDigest) {
    throw new SelectionLimitationError(
      'Recorded selection cannot be reproduced because contract content has changed.',
      {
        expectedDigest,
        recordedDigest: recorded.contractDigest,
      },
    )
  }
  const override =
    recorded.requested.source === 'explicit-override'
      ? { model: recorded.requested.model, effort: recorded.requested.effort }
      : undefined
  const replayed = resolveModelSelection(
    {
      profile: recorded.profile,
      ...recorded.inputs,
      host,
      ...(override ? { override } : {}),
    },
    contracts,
  )
  if (
    replayed.requested.model !== recorded.requested.model ||
    replayed.requested.effort !== recorded.requested.effort ||
    replayed.requested.source !== recorded.requested.source
  ) {
    throw new SelectionLimitationError('Recorded requested selection no longer matches the active policy.', {
      recorded: recorded.requested,
      replayed: replayed.requested,
    })
  }
  if (!sameCandidate(replayed.effective, recorded.effective)) {
    throw new SelectionLimitationError('Host cannot reproduce the recorded effective selection.', {
      recorded: recorded.effective,
      replayed: replayed.effective,
    })
  }
  return replayed
}

export function adaptSelectionForCodex(selection, contracts = loadHarnessSelectionContracts(), host = undefined) {
  validateHarnessSelectionContracts(contracts)
  const profile = findProfile(selection.profile, contracts)
  if (selection.status !== 'selected' || !selection.effective) {
    return Object.freeze({
      canSpawn: false,
      spawnArguments: null,
      profileContract: profileContract(profile),
      limitations: selection.limitations,
      effectiveExecution: unverifiedEffectiveExecution(profile),
    })
  }

  const limitations = []
  const hostProfile = host?.profiles?.[profile.id]
  if (!hostProfile || typeof hostProfile !== 'object') {
    limitations.push(`Host does not provide a profile descriptor for ${profile.id}.`)
  }
  if (hostProfile) assertHostProfileAuthority(profile, hostProfile, limitations)
  const forkTurns = hostProfile ? requiredForkTurns(profile, hostProfile, limitations) : null
  const modelSupport = candidateHostAvailability(selection.effective, host)
  if (modelSupport.status !== 'supported') {
    limitations.push(`Host does not confirm support for ${selection.effective.model}/${selection.effective.effort}.`)
  }
  const namedProfileMatchesSelection =
    hostProfile?.model === selection.effective.model && hostProfile?.reasoningEffort === selection.effective.effort
  const canUseNamedProfile = namedProfileMatchesSelection || hostProfile?.supportsModelOverride === true
  if (hostProfile && !canUseNamedProfile && host?.supportsRoleContractFallback === true) {
    limitations.push(
      `Host advertises a role-contract fallback for ${profile.id}, but this adapter has no enforceable role or sandbox mechanism for it.`,
    )
  } else if (hostProfile && !canUseNamedProfile) {
    limitations.push(
      `Host profile ${profile.id} is fixed to ${hostProfile.model}/${hostProfile.reasoningEffort} and cannot honor ${selection.effective.model}/${selection.effective.effort}.`,
    )
  }
  if (limitations.length) {
    return Object.freeze({
      canSpawn: false,
      spawnArguments: null,
      profileContract: profileContract(profile),
      limitations,
      effectiveExecution: unverifiedEffectiveExecution(profile),
    })
  }

  const spawnArguments = {
    model: selection.effective.model,
    reasoning_effort: selection.effective.effort,
    fork_turns: forkTurns,
    agent_type: profile.id,
  }
  return Object.freeze({
    canSpawn: true,
    spawnArguments: Object.freeze(spawnArguments),
    mode: 'named-profile',
    profileContract: profileContract(profile),
    limitations: Object.freeze([]),
    effectiveExecution: unverifiedEffectiveExecution(profile),
  })
}

function requiredForkTurns(profile, hostProfile, limitations) {
  const forkTurns = hostProfile.forkTurns
  if (profile.contextBoundary === 'none') {
    if (forkTurns === 'none') return 'none'
    limitations.push(`Host profile ${profile.id} must provide forkTurns "none" for independent execution.`)
    return null
  }
  if (profile.contextBoundary === 'bounded') {
    const normalized = typeof forkTurns === 'number' ? String(forkTurns) : forkTurns
    if (/^[1-9]\d*$/.test(normalized ?? '')) return normalized
    limitations.push(`Host profile ${profile.id} must provide a positive bounded forkTurns value.`)
    return null
  }
  return null
}

function assertHostProfileAuthority(profile, hostProfile, limitations) {
  const expected = profileInvariants[profile.id]
  for (const [field, value] of Object.entries({
    role: expected.role,
    sandbox: expected.sandbox,
    externalWrites: expected.externalWrites,
    contextBoundary: expected.contextBoundary,
  })) {
    if (hostProfile[field] == null) {
      limitations.push(`Host profile ${profile.id} does not advertise ${field} support.`)
    } else if (hostProfile[field] !== value) {
      limitations.push(`Host profile ${profile.id} advertises ${field} ${hostProfile[field]}, expected ${value}.`)
    }
  }
}

export function verifyEffectiveExecution(
  selectionOrProfile,
  receipts = {},
  contracts = loadHarnessSelectionContracts(),
) {
  const profileId = typeof selectionOrProfile === 'string' ? selectionOrProfile : selectionOrProfile?.profile
  const profile = findProfile(profileId, contracts)
  const selected = typeof selectionOrProfile === 'object' ? selectionOrProfile.effective : null
  const expected = {
    role: profile.role,
    model: selected?.model ?? null,
    reasoning: selected?.effort ?? null,
    context: profile.contextBoundary,
    sandbox: profile.authority.sandbox,
  }
  const claims = {}
  for (const property of ['role', 'model', 'reasoning', 'context', 'sandbox']) {
    const receipt = receipts[property] ?? null
    claims[property] = {
      status: validEffectiveReceipt(property, receipt, expected) ? 'verified' : 'unverified',
      receipt: validEffectiveReceipt(property, receipt, expected) ? receipt : null,
    }
  }
  const statuses = Object.values(claims).map(claim => claim.status)
  return Object.freeze({
    status: statuses.every(status => status === 'verified')
      ? 'verified'
      : statuses.some(status => status === 'verified')
        ? 'partial'
        : 'unverified',
    claims: Object.freeze(claims),
  })
}

export function validateConfiguredAgentMappings(
  { agentDefaults, registrations, agentFiles },
  contracts = loadHarnessSelectionContracts(),
) {
  validateHarnessSelectionContracts(contracts)
  const expected = profileDefaults(contracts)
  const failures = []
  if (agentDefaults?.default_subagent_model !== expected.executor.model) {
    failures.push(`default_subagent_model must be ${expected.executor.model}`)
  }
  if (agentDefaults?.default_subagent_reasoning_effort !== expected.executor.effort) {
    failures.push(`default_subagent_reasoning_effort must be ${expected.executor.effort}`)
  }
  for (const [profileId, selection] of Object.entries(expected)) {
    if (profileId === 'coordinator-only') continue
    const registration = registrations?.[profileId]
    const file = agentFiles?.[profileId]
    if (!registration) failures.push(`missing registration for ${profileId}`)
    if (registration && registration.config_file !== `agents/${profileId}.toml`) {
      failures.push(`invalid config_file for ${profileId}`)
    }
    if (!file) {
      failures.push(`missing agent file for ${profileId}`)
      continue
    }
    if (file.model !== selection.model) failures.push(`${profileId}: expected model ${selection.model}`)
    if (file.model_reasoning_effort !== selection.effort) {
      failures.push(`${profileId}: expected reasoning effort ${selection.effort}`)
    }
    if (file.sandbox_mode !== selection.sandbox) failures.push(`${profileId}: expected sandbox ${selection.sandbox}`)
  }
  return failures
}

export function validateRecordedSelection(selection, expectedProfile, contracts = loadHarnessSelectionContracts()) {
  assertObject(selection, 'recorded selection')
  const profile = findProfile(selection.profile, contracts)
  assert(profile.id === expectedProfile, 'recorded selection: profile contradicts routing profile')
  assert(['selected', 'limited'].includes(selection.status), 'recorded selection: unsupported status')
  assert(
    selection.profileVersion === contracts.profiles.schemaVersion,
    'recorded selection: unexpected profile version',
  )
  assert(selection.catalogVersion === contracts.catalog.schemaVersion, 'recorded selection: unexpected catalog version')
  assert(selection.policyVersion === contracts.policy.schemaVersion, 'recorded selection: unexpected policy version')
  assert(nonBlank(selection.contractDigest), 'recorded selection: contractDigest must be non-blank')
  normalizedSelectionInputs(selection.inputs)
  if (profile.id === 'coordinator-only') {
    assert(
      selection.requested?.model === null && selection.requested?.effort === null,
      'coordinator selection must be null',
    )
  } else {
    assertCandidateCompatible(selection.requested, profile, contracts, 'recorded selection requested')
  }
  if (selection.status === 'selected') {
    if (profile.id === 'coordinator-only') {
      assert(
        selection.effective?.model === null && selection.effective?.effort === null,
        'coordinator effective selection must be null',
      )
    } else {
      assertCandidateCompatible(selection.effective, profile, contracts, 'recorded selection effective')
    }
  } else {
    assert(selection.effective === null, 'recorded limited selection: effective must be null')
  }
  assert(typeof selection.fallbackUsed === 'boolean', 'recorded selection: fallbackUsed must be boolean')
  assert(nonBlank(selection.rationale), 'recorded selection: rationale must be non-blank')
  assertObject(selection.hostSupport, 'recorded selection: hostSupport')
  assertStringArray(selection.limitations, 'recorded selection: limitations')
  return selection
}

function coordinatorSelection(profile, contracts, inputs) {
  return freezeSelection({
    status: 'selected',
    profile: profile.id,
    profileVersion: contracts.profiles.schemaVersion,
    catalogVersion: contracts.catalog.schemaVersion,
    policyVersion: contracts.policy.schemaVersion,
    contractDigest: selectionContractDigest(contracts),
    inputs,
    requested: { model: null, effort: null, source: 'not-applicable' },
    effective: { model: null, effort: null },
    fallbackUsed: false,
    rationale: 'Coordinator-only work does not create a subagent selection.',
    hostSupport: { status: 'not-applicable' },
    limitations: [],
  })
}

function resolveEffectiveCandidate({ requested, profile, host, contracts, allowFallback }) {
  const requestedAvailability = candidateHostAvailability(requested, host)
  if (requestedAvailability.status !== 'unsupported') {
    return {
      effective: { model: requested.model, effort: requested.effort },
      fallbackUsed: false,
      hostSupport: requestedAvailability,
      limitations: [],
    }
  }
  if (allowFallback) {
    for (const candidate of contracts.policy.fallbacks[profile.id]) {
      assertCandidateCompatible(candidate, profile, contracts, `fallback for ${profile.id}`)
      const availability = candidateHostAvailability(candidate, host)
      if (availability.status !== 'unsupported') {
        return {
          effective: { model: candidate.model, effort: candidate.effort },
          fallbackUsed: true,
          hostSupport: availability,
          limitations: [
            `Requested ${requested.model}/${requested.effort} is unavailable; selected an approved compatible fallback.`,
          ],
        }
      }
    }
  }
  return {
    effective: null,
    fallbackUsed: false,
    hostSupport: requestedAvailability,
    limitations: [`Host cannot honor ${profile.id} with any approved compatible model and effort.`],
  }
}

function candidateHostAvailability(candidate, host) {
  if (!host || host.modelEfforts == null) return { status: 'unverified', receipt: null }
  const values = host.modelEfforts[candidate.model]
  if (!Array.isArray(values) || !values.includes(candidate.effort)) {
    return { status: 'unsupported', receipt: host.receipt ?? null }
  }
  return { status: 'supported', receipt: host.receipt ?? null }
}

function normalizedSelectionInputs(input) {
  const values = {
    scope: input.scope ?? (input.crossModule === true ? 'cross-module' : 'localized'),
    evidenceNeeds: input.evidenceNeeds ?? (input.missingEvidence === true ? 'high' : 'low'),
    judgment: input.judgment ?? (input.highJudgment === true ? 'high' : 'low'),
    consequence: input.consequence ?? 'low',
    verificationStrength: input.verificationStrength ?? 'strong',
    expectedEffort: input.expectedEffort ?? (input.crossModule === true ? 'extended' : 'localized'),
  }
  for (const [field, allowed] of Object.entries(selectionInputValues)) {
    if (!allowed.includes(values[field])) throw new Error(`selection input ${field}: unsupported value`)
  }
  return Object.freeze(values)
}

function normalizeExplicitOverride(override) {
  if (override == null) return null
  assertObject(override, 'explicit override')
  if (!nonBlank(override.model) || !nonBlank(override.effort)) {
    throw new Error('explicit override: model and effort are required together')
  }
  return { model: override.model, effort: override.effort }
}

function findPolicyMatch(profileId, inputs, rules) {
  return (
    rules.find(
      rule => rule.profile === profileId && Object.entries(rule.when).every(([key, value]) => inputs[key] === value),
    ) ?? null
  )
}

function findProfile(profileId, contracts) {
  if (!nonBlank(profileId)) throw new Error('selection profile: required')
  const profile = contracts.profiles.profiles.find(candidate => candidate.id === profileId)
  if (!profile) throw new Error(`selection profile: unsupported value ${profileId}`)
  return profile
}

function assertCandidateCompatible(candidate, profile, contracts, label) {
  if (!candidate || candidate.model == null || candidate.effort == null) {
    throw new Error(`${label}: model and effort are required`)
  }
  const model = contracts.catalog.models.find(item => item.id === candidate.model)
  if (!model) throw new Error(`${label}: model ${candidate.model} is not approved`)
  if (!model.supportedEfforts.includes(candidate.effort)) {
    throw new Error(`${label}: effort ${candidate.effort} is not approved for ${candidate.model}`)
  }
  const missing = profile.requiredCapabilities.filter(capability => !model.capabilities.includes(capability))
  if (missing.length) throw new Error(`${label}: ${candidate.model} lacks required capabilities: ${missing.join(', ')}`)
}

function validateProfiles(document) {
  assertObject(document, 'agent profiles')
  assert(document.schemaVersion === '1', 'agent profiles: unsupported schemaVersion')
  assertExactKeys(document, ['schemaVersion', 'profiles'], 'agent profiles')
  assert(
    Array.isArray(document.profiles) && document.profiles.length > 0,
    'agent profiles: profiles must be a non-empty array',
  )
  const seen = new Set()
  for (const profile of document.profiles) {
    assertObject(profile, 'agent profile')
    assertExactKeys(profile, profileFields, `agent profile ${profile.id ?? '<unknown>'}`)
    assert(profileIds.has(profile.id), `agent profile ${profile.id}: unsupported id`)
    assert(!seen.has(profile.id), `agent profile ${profile.id}: duplicate id`)
    seen.add(profile.id)
    assert(nonBlank(profile.role), `agent profile ${profile.id}: role must be non-blank`)
    assertStringArray(profile.requiredCapabilities, `agent profile ${profile.id}: requiredCapabilities`)
    assertObject(profile.authority, `agent profile ${profile.id}: authority`)
    assertExactKeys(profile.authority, ['sandbox', 'externalWrites'], `agent profile ${profile.id}: authority`)
    const invariant = profileInvariants[profile.id]
    assert(profile.role === invariant.role, `agent profile ${profile.id}: role must be ${invariant.role}`)
    assert(
      profile.authority.sandbox === invariant.sandbox,
      `agent profile ${profile.id}: authority.sandbox must be ${invariant.sandbox}`,
    )
    assert(
      profile.authority.externalWrites === invariant.externalWrites,
      `agent profile ${profile.id}: authority.externalWrites must be ${invariant.externalWrites}`,
    )
    assert(
      profile.contextBoundary === invariant.contextBoundary,
      `agent profile ${profile.id}: contextBoundary must be ${invariant.contextBoundary}`,
    )
    assertStringArray(profile.stopConditions, `agent profile ${profile.id}: stopConditions`, true)
  }
  assert(seen.size === profileIds.size, 'agent profiles: every supported profile must be present')
}

function validateCatalog(document) {
  assertObject(document, 'model catalog')
  assert(document.schemaVersion === '1', 'model catalog: unsupported schemaVersion')
  assertExactKeys(document, ['schemaVersion', 'models'], 'model catalog')
  assert(
    Array.isArray(document.models) && document.models.length > 0,
    'model catalog: models must be a non-empty array',
  )
  const seen = new Set()
  for (const model of document.models) {
    assertObject(model, 'model catalog entry')
    assertExactKeys(
      model,
      ['id', 'supportedEfforts', 'capabilities', 'availabilityEvidence'],
      `model ${model.id ?? '<unknown>'}`,
    )
    assert(nonBlank(model.id), 'model catalog: model id must be non-blank')
    assert(!seen.has(model.id), `model catalog: duplicate model ${model.id}`)
    seen.add(model.id)
    assertStringArray(model.supportedEfforts, `model ${model.id}: supportedEfforts`, true)
    assert(
      model.supportedEfforts.every(effort => efforts.has(effort)),
      `model ${model.id}: unsupported effort`,
    )
    assertStringArray(model.capabilities, `model ${model.id}: capabilities`, true)
    assert(nonBlank(model.availabilityEvidence), `model ${model.id}: availabilityEvidence must be non-blank`)
  }
}

function validatePolicy(document, profiles, catalog) {
  assertObject(document, 'selection policy')
  assert(document.schemaVersion === '1', 'selection policy: unsupported schemaVersion')
  assertExactKeys(document, ['schemaVersion', 'defaults', 'rules', 'fallbacks'], 'selection policy')
  assertObject(document.defaults, 'selection policy defaults')
  assertObject(document.fallbacks, 'selection policy fallbacks')
  assert(Array.isArray(document.rules), 'selection policy rules must be an array')
  const contracts = { profiles, catalog, policy: document }
  const ruleIds = new Set()
  for (const profile of profiles.profiles) {
    const defaultSelection = document.defaults[profile.id]
    if (profile.id === 'coordinator-only') {
      assertExactKeys(defaultSelection, ['model', 'effort'], 'coordinator-only default')
      assert(
        defaultSelection?.model === null && defaultSelection?.effort === null,
        'coordinator-only default must be null',
      )
      continue
    }
    assertExactKeys(defaultSelection, ['model', 'effort'], `default for ${profile.id}`)
    assertCandidateCompatible(defaultSelection, profile, contracts, `default for ${profile.id}`)
    assert(Array.isArray(document.fallbacks[profile.id]), `fallbacks for ${profile.id}: must be an array`)
    for (const fallback of document.fallbacks[profile.id]) {
      assertExactKeys(fallback, ['model', 'effort'], `fallback for ${profile.id}`)
      assertCandidateCompatible(fallback, profile, contracts, `fallback for ${profile.id}`)
    }
  }
  assertExactKeys(document.defaults, [...profileIds], 'selection policy defaults')
  assertExactKeys(
    document.fallbacks,
    [...profileIds].filter(id => id !== 'coordinator-only'),
    'selection policy fallbacks',
  )
  for (const rule of document.rules) {
    assertObject(rule, 'selection policy rule')
    assertExactKeys(rule, ['id', 'profile', 'when', 'select', 'rationale'], 'selection policy rule')
    assert(nonBlank(rule.id), 'selection policy rule: id must be non-blank')
    assert(!ruleIds.has(rule.id), `selection policy rule ${rule.id}: duplicate id`)
    ruleIds.add(rule.id)
    const profile = profiles.profiles.find(item => item.id === rule.profile)
    assert(profile && profile.id !== 'coordinator-only', `selection policy rule ${rule.id}: unsupported profile`)
    assertObject(rule.when, `selection policy rule ${rule.id}: when`)
    assert(Object.keys(rule.when).length > 0, `selection policy rule ${rule.id}: when must not be empty`)
    for (const [field, value] of Object.entries(rule.when)) {
      assert(field in selectionInputValues, `selection policy rule ${rule.id}: unsupported when field ${field}`)
      assert(
        selectionInputValues[field].includes(value),
        `selection policy rule ${rule.id}: unsupported when value for ${field}`,
      )
    }
    assertExactKeys(rule.select, ['model', 'effort'], `selection policy rule ${rule.id}: select`)
    assertCandidateCompatible(rule.select, profile, contracts, `selection policy rule ${rule.id}`)
    assert(nonBlank(rule.rationale), `selection policy rule ${rule.id}: rationale must be non-blank`)
  }
}

function profileContract(profile) {
  return Object.freeze({
    id: profile.id,
    role: profile.role,
    authority: Object.freeze({ ...profile.authority }),
    contextBoundary: profile.contextBoundary,
    stopConditions: Object.freeze([...profile.stopConditions]),
  })
}

function unverifiedEffectiveExecution(profile) {
  return Object.freeze({
    status: 'unverified',
    claims: Object.freeze(
      Object.fromEntries(
        ['role', 'model', 'reasoning', 'context', 'sandbox'].map(property => [
          property,
          { status: 'unverified', receipt: null },
        ]),
      ),
    ),
    expectedProfile: profile.id,
  })
}

function validEffectiveReceipt(property, receipt, expected) {
  if (!nonBlank(receipt)) return false
  const expectedValue = expected[property]
  if (expectedValue === 'not-applicable') return false
  const escaped = String(expectedValue).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (property === 'context') {
    if (expectedValue === 'none') return /^host-effective-context:fork_turns:none(?:;.+)?$/.test(receipt)
    if (expectedValue === 'bounded') return /^host-effective-context:fork_turns:bounded:[1-9]\d*(?:;.+)?$/.test(receipt)
  }
  return new RegExp(`^host-effective-${property}:${escaped}(?:;.+)?$`).test(receipt)
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`Unable to read ${path.basename(file)}: ${error.message}`)
  }
}

function assertExactKeys(object, expected, label) {
  const extras = Object.keys(object).filter(key => !expected.includes(key))
  if (extras.length) throw new Error(`${label}: unsupported keys ${extras.join(', ')}`)
  const missing = expected.filter(key => !(key in object))
  if (missing.length) throw new Error(`${label}: missing keys ${missing.join(', ')}`)
}

function assertStringArray(value, label, nonEmpty = false) {
  assert(Array.isArray(value), `${label} must be an array`)
  assert(!nonEmpty || value.length > 0, `${label} must not be empty`)
  assert(value.every(nonBlank), `${label} must contain non-blank strings`)
}

function assertObject(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: must be an object`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function freezeSelection(selection) {
  return Object.freeze({
    ...selection,
    requested: Object.freeze(selection.requested),
    effective: selection.effective ? Object.freeze(selection.effective) : null,
    hostSupport: Object.freeze(selection.hostSupport),
    limitations: Object.freeze([...selection.limitations]),
  })
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function sameCandidate(left, right) {
  return left?.model === right?.model && left?.effort === right?.effort
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}
