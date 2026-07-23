import crypto from 'node:crypto'
import fs from 'node:fs'

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

// This is the complete persisted-run schema boundary and is covered by adversarial ledger tests.
// fallow-ignore-next-line complexity
export function validateRun(run, label = 'run') {
  assert(run && typeof run === 'object', `${label}: expected object`)
  assert(nonBlank(run.runId), `${label}: blank runId`)
  assert(Number.isFinite(Date.parse(run.recordedAt)), `${label}: invalid recordedAt`)
  assert(nonBlank(run.taskClass), `${label}: blank taskClass`)
  assert(run.dimensions && Object.keys(run.dimensions).length === 5, `${label}: invalid dimensions`)
  for (const value of Object.values(run.dimensions)) {
    assert(Number.isInteger(value) && value >= 0 && value <= 2, `${label}: invalid dimension score`)
  }
  const calculatedScore = Object.values(run.dimensions).reduce((total, value) => total + value, 0)
  assert(run.score === calculatedScore, `${label}: inconsistent score`)
  const hasCriticalObservation = run.evolution?.observations?.some(observation => observation.severity === 'critical')
  assert(
    !hasCriticalObservation || nonBlank(run.criticalOverride),
    `${label}: critical observation requires critical override`,
  )
  const expectedStatus = run.criticalOverride
    ? 'failed'
    : run.score >= 9
      ? 'healthy'
      : run.score >= 7
        ? 'acceptable'
        : run.score >= 5
          ? 'optimization_indicated'
          : 'failed'
  assert(run.status === expectedStatus, `${label}: inconsistent status`)
  assert(Array.isArray(run.weakestDimensions), `${label}: invalid weakestDimensions`)
  const minimum = Math.min(...Object.values(run.dimensions))
  const expectedWeakest = Object.entries(run.dimensions)
    .filter(([, value]) => minimum < 2 && value === minimum)
    .map(([name]) => name)
  assert(
    JSON.stringify(run.weakestDimensions) === JSON.stringify(expectedWeakest),
    `${label}: inconsistent weakestDimensions`,
  )
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
  assert(run.evolution && phases.has(run.evolution.phase), `${label}: invalid evolution phase`)
  assert(Array.isArray(run.evolution.observations), `${label}: invalid observations`)
  run.evolution.observations.forEach((observation, index) =>
    validateObservation(observation, `${label}.observations[${index}]`),
  )
  assert(typeof run.evolution.notificationRequired === 'boolean', `${label}: invalid notification flag`)
  if (run.metrics !== undefined) {
    assert(run.metrics && typeof run.metrics === 'object', `${label}: invalid metrics`)
    for (const field of ['durationMs', 'inputTokens', 'outputTokens', 'agentCount', 'retryCount', 'rerouteCount']) {
      assert(
        run.metrics[field] === null || (Number.isInteger(run.metrics[field]) && run.metrics[field] >= 0),
        `${label}: invalid metric ${field}`,
      )
    }
    assert(Array.isArray(run.metrics.modelUse), `${label}: invalid modelUse`)
  }
}

function eventHash(event) {
  const unsigned = { ...event }
  delete unsigned.hash
  return crypto.createHash('sha256').update(JSON.stringify(unsigned)).digest('hex')
}

// Event validation deliberately keeps the complete discriminated-union contract at one boundary.
// fallow-ignore-next-line complexity
function validateEvent(event, previousHash, lineNumber) {
  assert(event?.schemaVersion === 1, `line ${lineNumber}: invalid event schema`)
  assert(nonBlank(event.eventId), `line ${lineNumber}: blank eventId`)
  assert(nonBlank(event.kind), `line ${lineNumber}: blank event kind`)
  assert(Number.isFinite(Date.parse(event.recordedAt)), `line ${lineNumber}: invalid event time`)
  assert(event.previousHash === previousHash, `line ${lineNumber}: broken hash chain`)
  assert(event.hash === eventHash(event), `line ${lineNumber}: invalid event hash`)
  if (event.kind === 'run.recorded') validateRun(event.run, `line ${lineNumber}.run`)
  else if (event.kind === 'run.transition') {
    assert(nonBlank(event.runId), `line ${lineNumber}: blank transition runId`)
    assert(nonBlank(event.action), `line ${lineNumber}: blank transition action`)
    assert(event.patch && typeof event.patch === 'object', `line ${lineNumber}: invalid transition patch`)
  } else {
    throw new Error(`line ${lineNumber}: unknown event kind ${event.kind}`)
  }
}

// Journal parsing and tail recovery share byte-offset state and must remain one atomic scan.
// fallow-ignore-next-line complexity
export function readJournal(journalPath, { recoverTail = false } = {}) {
  if (!fs.existsSync(journalPath)) return { events: [], runs: new Map(), lastHash: null }
  const contents = fs.readFileSync(journalPath, 'utf8')
  const lines = contents.split('\n')
  const events = []
  let previousHash = null
  let validBytes = 0
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineBytes = Buffer.byteLength(`${line}${index < lines.length - 1 ? '\n' : ''}`)
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
      const isTail = lines.slice(index + 1).every(candidate => !candidate.trim())
      if (!recoverTail || !isTail) throw error
      const quarantinePath = `${journalPath}.corrupt.${Date.now()}`
      fs.writeFileSync(quarantinePath, lines.slice(index).join('\n'), { encoding: 'utf8', mode: 0o600 })
      const handle = fs.openSync(journalPath, 'r+')
      try {
        fs.ftruncateSync(handle, validBytes)
        fs.fsyncSync(handle)
      } finally {
        fs.closeSync(handle)
      }
      break
    }
  }
  const runs = new Map()
  for (const event of events) {
    if (event.kind === 'run.recorded') {
      assert(!runs.has(event.run.runId), `duplicate runId ${event.run.runId}`)
      runs.set(event.run.runId, structuredClone(event.run))
    } else {
      const run = runs.get(event.runId)
      assert(run, `transition references unknown run ${event.runId}`)
      Object.assign(run.evolution, event.patch)
      validateRun(run, `transitioned run ${event.runId}`)
    }
  }
  return { events, runs, lastHash: previousHash }
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
