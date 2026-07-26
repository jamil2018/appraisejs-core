#!/usr/bin/env node

import crypto from 'node:crypto'
import { parseStrictArgs } from './lib/swarm-cli.mjs'
import { withLockedSwarmJournal } from './lib/swarm-ledger-access.mjs'
import { appendEvent, validateRun, validateRunRoutingLink } from './lib/swarm-ledger-store.mjs'
import { normalizeTaskClass } from './lib/swarm-routing-contract.mjs'

const argv = process.argv.slice(2)
if (argv.includes('--help')) {
  console.log(
    'Usage: npm run swarm:record -- --task-class <class> --routing-decision-id <prior route receipt> --accuracy <0-2> --coverage <0-2> --routing <0-2> --efficiency <0-2> --coordination <0-2> --solver-context <mode> --solver-context-evidence <effective host receipt> --judge-context <mode> --judge-context-evidence <effective host receipt> --evidence <text> --optimization <text> [--observation "domain|severity|summary|evidence|impact|options"] [--trigger <code>] [--critical-override <reason>] [metrics]',
  )
  process.exit(0)
}

const values = parseStrictArgs(argv, {
  'task-class': { required: true },
  accuracy: { required: true },
  coverage: { required: true },
  routing: { required: true },
  efficiency: { required: true },
  coordination: { required: true },
  'solver-context': { required: true },
  'solver-context-evidence': { required: true },
  'judge-context': { required: true },
  'judge-context-evidence': { required: true },
  evidence: { required: true },
  optimization: { required: true },
  observation: { multiple: true },
  trigger: { multiple: true },
  'critical-override': {},
  'duration-ms': {},
  'input-tokens': {},
  'output-tokens': {},
  'agent-count': {},
  'retry-count': {},
  'reroute-count': {},
  'model-use': { multiple: true },
  'routing-decision-id': { required: true },
})

const dimensionOptions = {
  accuracy: 'accuracy',
  coverage: 'requirement coverage',
  routing: 'routing quality',
  efficiency: 'efficiency',
  coordination: 'coordination',
}
const contexts = new Set(['none', 'bounded', 'all', 'not-used'])
const triggerCodes = new Set([
  'executor-retry',
  'avoidable-reroute',
  'duplicate-work',
  'coordinator-rework',
  'oversized-sol',
  'judge-material-finding',
  'context-boundary-unverified',
])
const observationDomains = new Set([
  'outcome',
  'accuracy',
  'coverage',
  'routing',
  'model-fit',
  'context',
  'coordination',
  'efficiency',
  'cost',
  'latency',
  'usability',
  'operability',
  'tooling',
  'validation',
  'evidence-integrity',
  'authorization',
])
const observations = (values.observation ?? []).map(raw => {
  const [domain, severity, summary, evidence, impact, proposedOptions] = raw.split('|').map(part => part.trim())
  if (
    !observationDomains.has(domain) ||
    !['minor', 'material', 'critical'].includes(severity) ||
    [summary, evidence, impact, proposedOptions].some(value => !value)
  ) {
    throw new Error(`Invalid observation: ${raw}`)
  }
  return { domain, severity, summary, evidence, impact, proposedOptions }
})
const dimensions = Object.fromEntries(
  Object.entries(dimensionOptions).map(([optionName, label]) => {
    const value = Number(values[optionName])
    if (!Number.isInteger(value) || value < 0 || value > 2) throw new Error(`Invalid score: --${optionName}`)
    return [label, value]
  }),
)
const taskClass = normalizeTaskClass(values['task-class'])
if (!contexts.has(values['solver-context']) || !contexts.has(values['judge-context'])) {
  throw new Error('Invalid context mode')
}
const verifiedReceipt = (context, receipt) => {
  if (context === 'not-used') return receipt === 'not-used'
  if (context === 'none') return /^host-effective-context:fork_turns:none(?:;.+)?$/.test(receipt)
  if (context === 'bounded') return /^host-effective-context:fork_turns:bounded:[1-9]\d*(?:;.+)?$/.test(receipt)
  return false
}
const triggers = new Set(values.trigger ?? [])
for (const trigger of triggers) {
  if (!triggerCodes.has(trigger)) throw new Error(`Invalid trigger: ${trigger}`)
}
if (
  !verifiedReceipt(values['solver-context'], values['solver-context-evidence']) ||
  !verifiedReceipt(values['judge-context'], values['judge-context-evidence'])
) {
  triggers.add('context-boundary-unverified')
}
const score = Object.values(dimensions).reduce((total, value) => total + value, 0)
for (const [dimension, value] of Object.entries(dimensions)) {
  if (value < 2) {
    observations.push({
      domain: dimension === 'requirement coverage' ? 'coverage' : dimension.replace(' quality', ''),
      severity: value === 0 ? 'material' : 'minor',
      summary: `${dimension} scored ${value}/2`,
      evidence: values.evidence,
      impact: `The run is not optimal in ${dimension}`,
      proposedOptions: values.optimization,
      generated: true,
    })
  }
}
for (const trigger of triggers) {
  observations.push({
    domain: trigger === 'context-boundary-unverified' ? 'context' : 'coordination',
    severity: 'material',
    summary: `Evolution trigger: ${trigger}`,
    evidence: values.evidence,
    impact: 'The trigger requires user-visible harness review',
    proposedOptions: values.optimization,
    generated: true,
  })
}
const criticalObservation = observations.find(observation => observation.severity === 'critical')
const criticalOverride =
  values['critical-override'] ??
  (criticalObservation ? `${criticalObservation.domain}: ${criticalObservation.summary}` : null)
if (criticalOverride) {
  observations.push({
    domain: 'evidence-integrity',
    severity: 'critical',
    summary: `Critical override: ${criticalOverride}`,
    evidence: values.evidence,
    impact: 'The run is failed regardless of numeric score',
    proposedOptions: values.optimization,
    generated: true,
  })
}
const status = criticalOverride
  ? 'failed'
  : score >= 9
    ? 'healthy'
    : score >= 7
      ? 'acceptable'
      : score >= 5
        ? 'optimization_indicated'
        : 'failed'
const metricNames = ['duration-ms', 'input-tokens', 'output-tokens', 'agent-count', 'retry-count', 'reroute-count']

function optionalMetric(name) {
  if (!(name in values)) return null
  return validatedMetric(name, values[name])
}

function validatedMetric(name, raw) {
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)
    throw new Error(`Invalid metric: --${name}`)
  return value
}

const metricValue = name => {
  if (!metricNames.includes(name)) throw new Error(`Unknown metric: --${name}`)
  return optionalMetric(name)
}
const modelUse = (values['model-use'] ?? []).map(item => {
  const match = item.match(/^([^:]{1,100}):(\d+)$/)
  if (!match) throw new Error(`Invalid model use: ${item}`)
  return { model: match[1], calls: Number(match[2]) }
})
const minimum = Math.min(...Object.values(dimensions))
const run = {
  schemaVersion: 5,
  runId: crypto.randomUUID(),
  recordedAt: new Date().toISOString(),
  taskClass,
  dimensions,
  score,
  status,
  weakestDimensions: Object.entries(dimensions)
    .filter(([, value]) => minimum < 2 && value === minimum)
    .map(([name]) => name),
  criticalOverride,
  triggers: [...triggers],
  solverContext: values['solver-context'],
  solverContextEvidence: values['solver-context-evidence'],
  judgeContext: values['judge-context'],
  judgeContextEvidence: values['judge-context-evidence'],
  evidence: values.evidence,
  proposedOptimization: values.optimization,
  routingDecisionId: values['routing-decision-id'],
  metrics: {
    durationMs: metricValue('duration-ms'),
    inputTokens: metricValue('input-tokens'),
    outputTokens: metricValue('output-tokens'),
    agentCount: metricValue('agent-count'),
    retryCount: metricValue('retry-count'),
    rerouteCount: metricValue('reroute-count'),
    modelUse,
  },
  evolution: {
    phase: 'no_change',
    observations,
    notificationRequired: false,
    notifiedAt: null,
    notificationReceipt: null,
    userGuidance: null,
    guidanceProvenance: null,
    guidanceRecordedAt: null,
    updateSummary: null,
    verification: null,
    verificationRecordedAt: null,
    reevaluationRunId: null,
    updatedAt: null,
  },
}

const summary = withLockedSwarmJournal((journal, journalPath) => {
  const routingDecision = linkedRoutingDecision(journal, run)
  validateRunRoutingLink(run, routingDecision)
  const window = comparableWindow(journal.runs, run)
  const { lowOrFailedRuns, repeatedWeaknesses, triggered: longitudinal } = longitudinalSummary(window)
  addLongitudinalObservation(run, lowOrFailedRuns, repeatedWeaknesses, longitudinal)
  finalizeEvolution(run, longitudinal)
  validateRun(run)
  appendEvent(journalPath, { kind: 'run.recorded', run }, journal.lastHash)
  return {
    run,
    routingDecisionId: routingDecisionId(routingDecision),
    comparableWindowSize: window.length,
    lowOrFailedRuns,
    repeatedWeaknesses,
    journalPath,
  }
})
console.log(JSON.stringify(summary))

function linkedRoutingDecision(journal, candidateRun) {
  if (!candidateRun.routingDecisionId) throw new Error('Scored runs require a prior routing decision')
  const decision = journal.routes.get(candidateRun.routingDecisionId)
  if (!decision) throw new Error(`Unknown routing decision: ${candidateRun.routingDecisionId}`)
  if (decision.taskClass !== candidateRun.taskClass) throw new Error('Routing decision task class mismatch')
  const alreadyLinked = [...journal.runs.values()].some(run => run.routingDecisionId === candidateRun.routingDecisionId)
  if (alreadyLinked) throw new Error(`Routing decision already linked: ${candidateRun.routingDecisionId}`)
  return decision
}

function finalizeEvolution(candidateRun, longitudinal) {
  candidateRun.evolution.notificationRequired = [
    score < 10,
    Boolean(criticalOverride),
    triggers.size > 0,
    observations.length > 0,
    longitudinal,
  ].some(Boolean)
  candidateRun.evolution.phase = ['no_change', 'notification_required'][
    Number(candidateRun.evolution.notificationRequired)
  ]
}

function routingDecisionId(decision) {
  return decision ? decision.decisionId : null
}

function comparableWindow(runs, candidateRun) {
  const previous = [...runs.values()].filter(item => item.taskClass === candidateRun.taskClass).slice(-4)
  return [...previous, candidateRun]
}

function longitudinalSummary(window) {
  const lowOrFailedRuns = window.filter(item => item.score <= 6 || item.status === 'failed').length
  const weakestCounts = window.flatMap(item => item.weakestDimensions).reduce(countValues, {})
  const repeatedWeaknesses = Object.entries(weakestCounts)
    .filter(([, count]) => count >= 2)
    .map(([dimension]) => dimension)
  return {
    lowOrFailedRuns,
    repeatedWeaknesses,
    triggered: lowOrFailedRuns >= 2 || repeatedWeaknesses.length > 0,
  }
}

function countValues(counts, value) {
  counts[value] = (counts[value] ?? 0) + 1
  return counts
}

function addLongitudinalObservation(candidateRun, lowOrFailedRuns, repeatedWeaknesses, triggered) {
  if (!triggered) return
  candidateRun.evolution.observations.push({
    domain: 'evidence-integrity',
    severity: 'material',
    summary: 'Longitudinal evolution trigger',
    evidence: `Last-five window has ${lowOrFailedRuns} low or failed runs; repeated weaknesses: ${repeatedWeaknesses.join(', ') || 'none'}`,
    impact: 'Historical swarm performance remains non-optimal',
    proposedOptions: values.optimization,
    generated: true,
  })
}
