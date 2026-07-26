import { randomUUID } from 'node:crypto'
import { normalizeTaskClass, validateRoutingDecision } from './swarm-routing-contract.mjs'

const riskSignals = ['securityRisk', 'persistenceRisk', 'migrationRisk', 'publicContractRisk']

function bool(value) {
  return value === true
}

function hasMaterialRisk(signals) {
  return riskSignals.some(signal => bool(signals[signal]))
}

function normalizedSignals(input) {
  return {
    missingEvidence: bool(input.missingEvidence),
    contradictoryEvidence: bool(input.contradictoryEvidence),
    evidenceLedger: bool(input.evidenceLedger),
    highJudgment: bool(input.highJudgment),
    crossModule: bool(input.crossModule),
    securityRisk: bool(input.securityRisk),
    persistenceRisk: bool(input.persistenceRisk),
    migrationRisk: bool(input.migrationRisk),
    publicContractRisk: bool(input.publicContractRisk),
    invariantInvalidated: bool(input.invariantInvalidated),
    duplicateDelegation: bool(input.duplicateDelegation),
    executorFailures:
      Number.isInteger(input.executorFailures) && input.executorFailures > 0 ? input.executorFailures : 0,
  }
}

export function recommendSwarmRoute(input = {}) {
  const signals = normalizedSignals(input)
  const materialRisk = hasMaterialRisk(signals)
  const reclassificationRequired = signals.executorFailures >= 2 || signals.invariantInvalidated
  const consequence = input.consequence ?? (materialRisk ? 'high' : 'low')
  const verificationStrength = input.verificationStrength ?? 'strong'
  const requiresIndependentJudge = materialRisk || (consequence === 'high' && verificationStrength === 'weak')
  const context = { input, signals, materialRisk, reclassificationRequired, consequence, verificationStrength }
  const selection = routingRules.find(rule => rule.matches(context)).select(context)

  return {
    ...selection,
    signals,
    consequence,
    verificationStrength,
    delegationCount: selection.route === 'coordinator-only' ? 0 : 1,
    requiresIndependentJudge,
    reclassificationRequired,
  }
}

const routingRules = [
  {
    matches: ({ reclassificationRequired, signals }) =>
      reclassificationRequired || signals.missingEvidence || signals.contradictoryEvidence,
    select: ({ reclassificationRequired }) => ({
      route: 'investigator',
      profile: 'investigator',
      rationale: reclassificationRequired
        ? 'Accepted invariants were invalidated or execution failed twice; facts must be re-established.'
        : 'Facts or causal evidence are missing or contradictory.',
    }),
  },
  {
    matches: ({ signals }) => signals.highJudgment && !signals.evidenceLedger,
    select: () => ({
      route: 'investigator',
      profile: 'investigator',
      rationale: 'High judgment is evidence-gated; establish an evidence ledger before solver review.',
    }),
  },
  {
    matches: ({ materialRisk, signals }) => materialRisk && !signals.evidenceLedger,
    select: () => ({
      route: 'investigator',
      profile: 'investigator',
      rationale: 'Material risk is evidence-gated; establish an evidence ledger before Sol-level judgment.',
    }),
  },
  {
    matches: ({ signals, materialRisk }) => signals.highJudgment || materialRisk,
    select: ({ materialRisk }) => ({
      route: 'solver',
      profile: 'solver',
      rationale: materialRisk
        ? 'Material risk requires Sol-level judgment after evidence is established.'
        : 'Evidence exists but irreducible judgment remains.',
    }),
  },
  {
    matches: ({ input }) => input.requiresExecution === true,
    select: ({ signals, verificationStrength }) =>
      executorSelection(signals.crossModule && verificationStrength === 'strong'),
  },
  {
    matches: ({ consequence, verificationStrength }) => consequence === 'high' && verificationStrength === 'weak',
    select: () => ({
      route: 'judge',
      profile: 'judge',
      rationale: 'High consequence with weak verification needs independent evaluation.',
    }),
  },
  {
    matches: () => true,
    select: () => ({
      route: 'coordinator-only',
      profile: 'coordinator-only',
      rationale: 'The task is sufficiently bounded for coordinator-only handling.',
    }),
  },
]

function executorSelection(advanced) {
  return {
    route: 'executor',
    profile: advanced ? 'executor-advanced' : 'executor',
    rationale: advanced
      ? 'Cross-module execution is settled and has strong deterministic verification.'
      : 'Execution is settled and deterministically verifiable.',
  }
}

export function createRoutingDecision(input = {}) {
  const recommendation = recommendSwarmRoute(input)
  const decision = {
    decisionId: defaultValue(input.decisionId, randomUUID()),
    recordedAt: defaultValue(input.recordedAt, new Date().toISOString()),
    taskClass: normalizeTaskClass(defaultValue(input.taskClass, 'localized-fix')),
    route: recommendation.route,
    signals: recommendation.signals,
    verificationStrength: recommendation.verificationStrength,
    consequence: recommendation.consequence,
    profile: recommendation.profile,
    delegationCount: recommendation.delegationCount,
    rationale: recommendation.rationale,
    material: defaultValue(input.material, recommendation.route !== 'coordinator-only'),
    requiresIndependentJudge: recommendation.requiresIndependentJudge,
    runtimeProof: defaultValue(input.runtimeProof, unverifiedRuntimeProof()),
    classificationLatencyMs: defaultValue(input.classificationLatencyMs, 0),
    escalationCount: defaultValue(input.escalationCount, Number(recommendation.reclassificationRequired)),
    retryCount: defaultValue(input.retryCount, recommendation.signals.executorFailures),
    rerouteCount: defaultValue(input.rerouteCount, Number(recommendation.reclassificationRequired)),
    linkedRunId: null,
  }
  return validateRoutingDecision(decision)
}

function defaultValue(value, fallback) {
  return value === undefined ? fallback : value
}

function unverifiedRuntimeProof() {
  return {
    status: 'unverified',
    receipt: null,
    claims: Object.fromEntries(
      ['role', 'model', 'reasoning', 'context', 'sandbox'].map(property => [
        property,
        { status: 'unverified', receipt: null },
      ]),
    ),
  }
}
