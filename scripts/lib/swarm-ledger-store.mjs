import crypto from 'node:crypto'
import fs from 'node:fs'
import { isEffectiveIndependentJudgeContext, validateRoutingDecision } from './swarm-routing-contract.mjs'

const phases = new Set([
  'notification_required',
  'awaiting_user_guidance',
  'guidance_received',
  'awaiting_reevaluation',
  'verified',
  'resolved_by_verified_update',
  'no_change',
])

function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export function validateObservation(observation, label = 'observation') {
  assert(observation && typeof observation === 'object', `${label}: expected object`)
  for (const field of ['domain', 'severity', 'summary', 'evidence', 'impact', 'proposedOptions']) {
    assert(nonBlank(observation[field]), `${label}: blank ${field}`)
  }
}

function validateDimensions(run, label) {
  assert(run.dimensions && Object.keys(run.dimensions).length === 5, `${label}: invalid dimensions`)
  assert(
    Object.values(run.dimensions).every(value => Number.isInteger(value) && value >= 0 && value <= 2),
    `${label}: invalid dimension score`,
  )
  const score = Object.values(run.dimensions).reduce((total, value) => total + value, 0)
  assert(run.score === score, `${label}: inconsistent score`)
}

function expectedStatus(run) {
  if (run.criticalOverride) return 'failed'
  return [
    'failed',
    'failed',
    'failed',
    'failed',
    'failed',
    'optimization_indicated',
    'optimization_indicated',
    'acceptable',
    'acceptable',
    'healthy',
    'healthy',
  ][run.score]
}

function validateStatusAndWeakestDimensions(run, label) {
  const hasCriticalObservation = run.evolution?.observations?.some(observation => observation.severity === 'critical')
  assert(
    !hasCriticalObservation || nonBlank(run.criticalOverride),
    `${label}: critical observation requires critical override`,
  )
  assert(run.status === expectedStatus(run), `${label}: inconsistent status`)
  assert(Array.isArray(run.weakestDimensions), `${label}: invalid weakestDimensions`)
  const minimum = Math.min(...Object.values(run.dimensions))
  const expectedWeakest = Object.entries(run.dimensions)
    .filter(([, value]) => minimum < 2 && value === minimum)
    .map(([name]) => name)
  assert(
    JSON.stringify(run.weakestDimensions) === JSON.stringify(expectedWeakest),
    `${label}: inconsistent weakestDimensions`,
  )
}

function validateEvolution(run, label) {
  assert(run.evolution && phases.has(run.evolution.phase), `${label}: invalid evolution phase`)
  assert(Array.isArray(run.evolution.observations), `${label}: invalid observations`)
  run.evolution.observations.forEach((observation, index) =>
    validateObservation(observation, `${label}.observations[${index}]`),
  )
  assert(typeof run.evolution.notificationRequired === 'boolean', `${label}: invalid notification flag`)
}

function validateMetrics(metrics, label) {
  if (metrics === undefined) return
  assert(metrics && typeof metrics === 'object', `${label}: invalid metrics`)
  const invalid = ['durationMs', 'inputTokens', 'outputTokens', 'agentCount', 'retryCount', 'rerouteCount'].find(
    field => metrics[field] !== null && (!Number.isInteger(metrics[field]) || metrics[field] < 0),
  )
  assert(!invalid, `${label}: invalid metric ${invalid}`)
  assert(Array.isArray(metrics.modelUse), `${label}: invalid modelUse`)
}

export function validateRun(run, label = 'run') {
  assert(run && typeof run === 'object', `${label}: expected object`)
  assert(nonBlank(run.runId), `${label}: blank runId`)
  assert(Number.isFinite(Date.parse(run.recordedAt)), `${label}: invalid recordedAt`)
  assert(nonBlank(run.taskClass), `${label}: blank taskClass`)
  assert(run.routingDecisionId == null || nonBlank(run.routingDecisionId), `${label}: invalid routingDecisionId`)
  if (run.schemaVersion >= 5) {
    assert(nonBlank(run.routingDecisionId), `${label}: scored runs require a prior routing decision`)
  }
  validateDimensions(run, label)
  validateStatusAndWeakestDimensions(run, label)
  assert(Array.isArray(run.triggers), `${label}: invalid triggers`)
  for (const field of [
    'solverContext',
    'solverContextEvidence',
    'judgeContext',
    'judgeContextEvidence',
    'evidence',
    'proposedOptimization',
  ]) {
    assert(nonBlank(run[field]), `${label}: blank ${field}`)
  }
  validateEvolution(run, label)
  validateMetrics(run.metrics, label)
}

function eventHash(event) {
  const unsigned = { ...event }
  delete unsigned.hash
  return crypto.createHash('sha256').update(JSON.stringify(unsigned)).digest('hex')
}

function validateEventEnvelope(event, previousHash, lineNumber) {
  assert(event?.schemaVersion === 1, `line ${lineNumber}: invalid event schema`)
  assert(nonBlank(event.eventId), `line ${lineNumber}: blank eventId`)
  assert(nonBlank(event.kind), `line ${lineNumber}: blank event kind`)
  assert(Number.isFinite(Date.parse(event.recordedAt)), `line ${lineNumber}: invalid event time`)
  assert(event.previousHash === previousHash, `line ${lineNumber}: broken hash chain`)
  assert(event.hash === eventHash(event), `line ${lineNumber}: invalid event hash`)
}

function validateTransitionEvent(event, lineNumber) {
  assert(nonBlank(event.runId), `line ${lineNumber}: blank transition runId`)
  assert(nonBlank(event.action), `line ${lineNumber}: blank transition action`)
  assert(event.patch && typeof event.patch === 'object', `line ${lineNumber}: invalid transition patch`)
}

function validateEvent(event, previousHash, lineNumber) {
  validateEventEnvelope(event, previousHash, lineNumber)
  if (event.kind === 'run.recorded') validateRun(event.run, `line ${lineNumber}.run`)
  else if (event.kind === 'run.transition') validateTransitionEvent(event, lineNumber)
  else if (event.kind === 'route.recorded') validateRoutingDecision(event.decision, `line ${lineNumber}.decision`)
  else throw new Error(`line ${lineNumber}: unknown event kind ${event.kind}`)
}

export function readJournal(journalPath, { recoverTail = false } = {}) {
  if (!fs.existsSync(journalPath)) return { events: [], runs: new Map(), routes: new Map(), lastHash: null }
  const lines = fs.readFileSync(journalPath, 'utf8').split('\n')
  const { events, previousHash } = scanJournal(lines, journalPath, recoverTail)
  const { runs, routes } = reconstructJournal(events)
  return { events, runs, routes, lastHash: previousHash }
}

function scanJournal(lines, journalPath, recoverTail) {
  const events = []
  let previousHash = null
  let validBytes = 0
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineBytes = journalLineBytes(line, index, lines.length)
    if (!line.trim()) {
      validBytes += lineBytes
      continue
    }
    try {
      const event = JSON.parse(line)
      validateEvent(event, previousHash, index + 1)
      events.push(event)
      previousHash = event.hash
      validBytes += lineBytes
    } catch (error) {
      recoverInvalidTail(lines, index, journalPath, recoverTail, validBytes, error)
      break
    }
  }
  return { events, previousHash }
}

function journalLineBytes(line, index, length) {
  return Buffer.byteLength(`${line}${index < length - 1 ? '\n' : ''}`)
}

function recoverInvalidTail(lines, index, journalPath, recoverTail, validBytes, error) {
  if (!recoverTail || !lines.slice(index + 1).every(candidate => !candidate.trim())) throw error
  fs.writeFileSync(`${journalPath}.corrupt.${Date.now()}`, lines.slice(index).join('\n'), {
    encoding: 'utf8',
    mode: 0o600,
  })
  const handle = fs.openSync(journalPath, 'r+')
  try {
    fs.ftruncateSync(handle, validBytes)
    fs.fsyncSync(handle)
  } finally {
    fs.closeSync(handle)
  }
}

function reconstructJournal(events) {
  const runs = new Map()
  const routes = new Map()
  for (const event of events) {
    if (event.kind === 'run.recorded') {
      addRecordedRun(event.run, runs, routes)
    } else if (event.kind === 'run.transition') {
      applyRunTransition(event, runs)
    } else {
      assert(!routes.has(event.decision.decisionId), `duplicate decisionId ${event.decision.decisionId}`)
      routes.set(event.decision.decisionId, structuredClone(event.decision))
    }
  }
  return { runs, routes }
}

function addRecordedRun(run, runs, routes) {
  assert(!runs.has(run.runId), `duplicate runId ${run.runId}`)
  if (!run.routingDecisionId) {
    assert(run.schemaVersion < 5, `run ${run.runId} requires a prior routing decision`)
    runs.set(run.runId, structuredClone(run))
    return
  }
  const decision = routes.get(run.routingDecisionId)
  assert(decision, `run references unknown routing decision ${run.routingDecisionId}`)
  validateRunRoutingLink(run, decision)
  assert(
    ![...runs.values()].some(candidate => candidate.routingDecisionId === run.routingDecisionId),
    `routing decision already linked ${run.routingDecisionId}`,
  )
  runs.set(run.runId, structuredClone(run))
}

export function validateRunRoutingLink(run, decision) {
  assert(decision.taskClass === run.taskClass, `run routing decision task class mismatch`)
  if (!decision.requiresIndependentJudge) return
  assert(
    isEffectiveIndependentJudgeContext(run.judgeContext, run.judgeContextEvidence),
    'run requires an independent judge with effective none or bounded host context',
  )
}

function applyRunTransition(event, runs) {
  const run = runs.get(event.runId)
  assert(run, `transition references unknown run ${event.runId}`)
  Object.assign(run.evolution, event.patch)
  validateRun(run, `transitioned run ${event.runId}`)
}

export function appendEvent(journalPath, event, previousHash) {
  const complete = {
    schemaVersion: 1,
    eventId: crypto.randomUUID(),
    recordedAt: new Date().toISOString(),
    previousHash,
    ...event,
  }
  complete.hash = eventHash(complete)
  const handle = fs.openSync(journalPath, 'a', 0o600)
  try {
    fs.writeSync(handle, `${JSON.stringify(complete)}\n`)
    fs.fsyncSync(handle)
  } finally {
    fs.closeSync(handle)
  }
  return complete
}
