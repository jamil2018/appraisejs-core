export const ROUTES = Object.freeze(['coordinator-only', 'investigator', 'solver', 'executor', 'judge'])

export const TASK_CLASSES = Object.freeze([
  'localized-fix',
  'cross-module-feature',
  'architecture-review',
  'release-gate',
  'harness-configuration',
])

const taskClassAliases = Object.freeze({
  'mechanical-refactor': 'localized-fix',
  'runtime-debugging': 'localized-fix',
  'architecture-decision': 'architecture-review',
  'public-contract-change': 'cross-module-feature',
  'security-change': 'cross-module-feature',
})

export const PROFILE_IDS = Object.freeze([
  'coordinator-only',
  'investigator',
  'executor',
  'executor-advanced',
  'solver',
  'judge',
])

export const SUPPORTED_PROFILES = Object.freeze({
  'coordinator-only': Object.freeze({ role: 'coordinator', model: null, effort: null, sandbox: null }),
  investigator: Object.freeze({ role: 'investigator', model: 'gpt-5.6-luna', effort: 'medium', sandbox: 'read-only' }),
  executor: Object.freeze({ role: 'executor', model: 'gpt-5.6-terra', effort: 'medium', sandbox: 'workspace-write' }),
  'executor-advanced': Object.freeze({
    role: 'executor',
    model: 'gpt-5.6-terra',
    effort: 'high',
    sandbox: 'workspace-write',
  }),
  solver: Object.freeze({ role: 'solver', model: 'gpt-5.6-sol', effort: 'high', sandbox: 'read-only' }),
  judge: Object.freeze({ role: 'judge', model: 'gpt-5.6-sol', effort: 'high', sandbox: 'read-only' }),
})

const requiredSignalKeys = [
  'missingEvidence',
  'contradictoryEvidence',
  'evidenceLedger',
  'highJudgment',
  'crossModule',
  'securityRisk',
  'persistenceRisk',
  'migrationRisk',
  'publicContractRisk',
  'invariantInvalidated',
  'duplicateDelegation',
  'executorFailures',
]
const verificationStrengths = new Set(['strong', 'weak', 'unknown'])
const consequences = new Set(['low', 'medium', 'high'])
const routeProfiles = {
  'coordinator-only': new Set(['coordinator-only']),
  investigator: new Set(['investigator']),
  solver: new Set(['solver']),
  executor: new Set(['executor', 'executor-advanced']),
  judge: new Set(['judge']),
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function assertIsoTimestamp(value, label) {
  assert(nonBlank(value) && !Number.isNaN(Date.parse(value)), `${label}: must be an ISO timestamp`)
}

function validateSignals(signals, label) {
  assert(signals && typeof signals === 'object' && !Array.isArray(signals), `${label}.signals: must be an object`)
  for (const key of requiredSignalKeys) {
    assert(typeof signals[key] === 'boolean' || key === 'executorFailures', `${label}.signals.${key}: must be boolean`)
  }
  assert(
    Number.isInteger(signals.executorFailures) && signals.executorFailures >= 0,
    `${label}.signals.executorFailures: must be a non-negative integer`,
  )
}

function validateRuntimeProof(runtimeProof, label) {
  assert(
    runtimeProof && typeof runtimeProof === 'object' && !Array.isArray(runtimeProof),
    `${label}.runtimeProof: must be an object`,
  )
  assert(
    ['verified', 'partial', 'unverified'].includes(runtimeProof.status),
    `${label}.runtimeProof.status: must be verified, partial, or unverified`,
  )
  assert(
    runtimeProof.receipt == null || nonBlank(runtimeProof.receipt),
    `${label}.runtimeProof.receipt: must be blankless when present`,
  )
  assert(
    runtimeProof.claims && typeof runtimeProof.claims === 'object',
    `${label}.runtimeProof.claims: must be an object`,
  )
  for (const property of ['role', 'model', 'reasoning', 'context', 'sandbox']) {
    const claim = runtimeProof.claims[property]
    assert(
      claim && ['verified', 'unverified'].includes(claim.status),
      `${label}.runtimeProof.claims.${property}: invalid status`,
    )
    if (claim.status === 'verified') {
      assert(
        validHostEffectiveReceipt(property, claim.receipt, runtimeProof.profile),
        `${label}.runtimeProof.claims.${property}: verified status requires a matching host-effective receipt`,
      )
    } else {
      assert(
        claim.receipt == null || nonBlank(claim.receipt),
        `${label}.runtimeProof.claims.${property}: invalid receipt`,
      )
    }
  }
  const claimStatuses = Object.values(runtimeProof.claims).map(claim => claim.status)
  const expectedStatus = claimStatuses.every(status => status === 'verified')
    ? 'verified'
    : claimStatuses.some(status => status === 'verified')
      ? 'partial'
      : 'unverified'
  assert(runtimeProof.status === expectedStatus, `${label}.runtimeProof.status: inconsistent with property claims`)
}

function validHostEffectiveReceipt(property, receipt, profile) {
  if (!nonBlank(receipt)) return false
  if (property === 'context') return isEffectiveContextReceipt(receipt)
  const expected = property === 'reasoning' ? SUPPORTED_PROFILES[profile].effort : SUPPORTED_PROFILES[profile][property]
  const value = expected == null ? '[^;\\s]+' : escapeRegExp(expected)
  return new RegExp(`^host-effective-${property}:${value}(?:;.+)?$`).test(receipt)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function isEffectiveContextReceipt(receipt) {
  return (
    /^host-effective-context:fork_turns:none(?:;.+)?$/.test(receipt) ||
    /^host-effective-context:fork_turns:bounded:[1-9]\d*(?:;.+)?$/.test(receipt)
  )
}

export function isEffectiveIndependentJudgeContext(context, receipt) {
  if (context === 'none') return /^host-effective-context:fork_turns:none(?:;.+)?$/.test(receipt)
  if (context === 'bounded') return /^host-effective-context:fork_turns:bounded:[1-9]\d*(?:;.+)?$/.test(receipt)
  return false
}

export function normalizeTaskClass(taskClass) {
  const normalized = taskClassAliases[taskClass] ?? taskClass
  assert(TASK_CLASSES.includes(normalized), 'taskClass: unsupported value')
  return normalized
}

export function validateRoutingDecision(decision, label = 'routing decision') {
  assert(decision && typeof decision === 'object' && !Array.isArray(decision), `${label}: must be an object`)
  for (const field of ['decisionId', 'taskClass', 'rationale']) {
    assert(nonBlank(decision[field]), `${label}.${field}: must be non-blank`)
  }
  assert(TASK_CLASSES.includes(decision.taskClass), `${label}.taskClass: unsupported value`)
  assertIsoTimestamp(decision.recordedAt, `${label}.recordedAt`)
  assert(ROUTES.includes(decision.route), `${label}.route: unsupported route`)
  assert(verificationStrengths.has(decision.verificationStrength), `${label}.verificationStrength: unsupported value`)
  assert(consequences.has(decision.consequence), `${label}.consequence: unsupported value`)
  assert(PROFILE_IDS.includes(decision.profile), `${label}.profile: unknown profile`)
  assert(routeProfiles[decision.route].has(decision.profile), `${label}: route and profile contradict each other`)
  assert(
    Number.isInteger(decision.delegationCount) && decision.delegationCount >= 0,
    `${label}.delegationCount: must be a non-negative integer`,
  )
  assert(typeof decision.material === 'boolean', `${label}.material: must be boolean`)
  assert(typeof decision.requiresIndependentJudge === 'boolean', `${label}.requiresIndependentJudge: must be boolean`)
  assert(
    Number.isInteger(decision.classificationLatencyMs) && decision.classificationLatencyMs >= 0,
    `${label}.classificationLatencyMs: must be a non-negative integer`,
  )
  for (const field of ['escalationCount', 'retryCount', 'rerouteCount']) {
    assert(
      Number.isInteger(decision[field]) && decision[field] >= 0,
      `${label}.${field}: must be a non-negative integer`,
    )
  }
  assert(decision.linkedRunId == null, `${label}.linkedRunId: routing receipts cannot link future runs`)
  validateSignals(decision.signals, label)
  validateRuntimeProof({ ...decision.runtimeProof, profile: decision.profile }, label)

  if (materialRisk(decision.signals) || (decision.consequence === 'high' && decision.verificationStrength === 'weak')) {
    assert(
      decision.requiresIndependentJudge,
      `${label}: material or weak high-consequence work requires an independent judge`,
    )
  }

  if (decision.route === 'coordinator-only') {
    assert(decision.delegationCount === 0, `${label}: coordinator-only cannot delegate`)
    assert(decision.profile === 'coordinator-only', `${label}: coordinator-only requires the coordinator-only profile`)
  } else {
    assert(decision.delegationCount > 0, `${label}: delegated routes require delegationCount above zero`)
  }
  if (decision.route === 'solver') {
    assert(decision.signals.evidenceLedger, `${label}: solver requires an evidence ledger`)
    assert(
      decision.signals.highJudgment || materialRisk(decision.signals),
      `${label}: solver requires high judgment or material risk`,
    )
  }
  if (decision.profile === 'executor-advanced') {
    assert(decision.signals.crossModule, `${label}: executor-advanced requires cross-module scope`)
    assert(decision.verificationStrength === 'strong', `${label}: executor-advanced requires strong verification`)
  }
  return decision
}

function materialRisk(signals) {
  return ['securityRisk', 'persistenceRisk', 'migrationRisk', 'publicContractRisk'].some(field => signals[field])
}
