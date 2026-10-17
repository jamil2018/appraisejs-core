import crypto from 'node:crypto'

const ARM_IDS = ['baseline', 'model', 'workflow']
const CATEGORIES = { discovery: 2, 'localized-fix': 2, ui: 1, 'cross-module': 2, 'consequential-review': 1 }

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b)
  const center = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[center] : (sorted[center - 1] + sorted[center]) / 2
}

function nonemptyStrings(value) {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item.trim())
}

function matchingFields(value, expected) {
  return Object.entries(expected).every(([key, expectedValue]) => value[key] === expectedValue)
}

function validateArms(arms) {
  assert(Array.isArray(arms) && arms.length === 3, 'Pilot requires three arms')
  assert(arms.map(arm => arm.id).join(',') === ARM_IDS.join(','), 'Pilot arm order is invalid')
  assert(arms.map(arm => arm.model).join(',') === 'gpt-6-sol,gpt-6.1-sol,gpt-6-sol', 'Pilot model pins are invalid')
  assert(
    arms[0].workflow === arms[1].workflow && arms[2].workflow === 'optimized-guidance-only',
    'Pilot workflow separation is invalid',
  )
}

function validateTask(task) {
  assert(typeof task.id === 'string' && /^[a-z][a-z0-9-]+$/.test(task.id), 'Pilot task ID is invalid')
  assert(nonemptyStrings([task.prompt]), 'Pilot task prompt is incomplete')
  assert(nonemptyStrings(task.paths), 'Pilot task paths are incomplete')
  assert(nonemptyStrings(task.acceptance), 'Pilot task acceptance is incomplete')
}

function validateTasks(tasks) {
  assert(Array.isArray(tasks) && tasks.length === 8, 'Pilot requires eight tasks')
  tasks.forEach(validateTask)
  assert(new Set(tasks.map(task => task.id)).size === tasks.length, 'Duplicate pilot task ID')
  assert(
    Object.entries(CATEGORIES).every(
      ([category, total]) => tasks.filter(task => task.category === category).length === total,
    ),
    'Pilot category mix is invalid',
  )
}

export function validatePilotManifest(manifest) {
  assert(manifest?.schemaVersion === 1, 'Pilot manifest requires schemaVersion 1')
  assert(/^[a-f0-9]{40}$/.test(manifest.baseCommit), 'Pilot manifest requires a full base commit')
  assert(manifest.repetitions === 2, 'Pilot requires two repetitions')
  validateArms(manifest.arms)
  validateTasks(manifest.tasks)
  assert(manifest.execution?.effort === 'medium', 'Pilot effort must stay medium')
  assert(
    matchingFields(manifest.thresholds, {
      minimumMedianImprovementPercent: 10,
      maximumOtherMetricRegressionPercent: 5,
      requiredCorrectnessRegressionCount: 0,
      requiredReviewRegressionCount: 0,
    }),
    'Pilot thresholds are invalid',
  )
  return manifest
}

export function pilotManifestDigest(manifest) {
  validatePilotManifest(manifest)
  return crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
}

const measurements = ['totalTokens', 'elapsedMs', 'setupMs', 'failures', 'retries', 'manualCorrections']

function validateMeasurements(run) {
  for (const name of measurements) assert(run[name] === null || count(run[name]), `Invalid ${name}`)
  const times = [run.elapsedMs, run.setupMs]
  if (times.includes(null)) return
  assert(run.elapsedMs >= run.setupMs, 'elapsedMs must include setupMs')
}

function validateRunConditions(run, manifest, digest) {
  assert(
    manifest.tasks.some(task => task.id === run.taskId),
    `Unknown pilot task: ${run.taskId}`,
  )
  assert([1, 2].includes(run.repetition), 'Invalid repetition')
  const arm = manifest.arms.find(item => item.id === run.arm)
  assert(arm, `Unknown pilot arm: ${run.arm}`)
  assert(
    matchingFields(run, {
      manifestDigest: digest,
      baseCommit: manifest.baseCommit,
      model: arm.model,
      workflow: arm.workflow,
      effort: manifest.execution.effort,
    }),
    'Pilot run conditions do not match frozen manifest',
  )
}

function validateRunShape(run, manifest, digest) {
  assert(run && typeof run === 'object' && !Array.isArray(run), 'Invalid pilot run')
  validateRunConditions(run, manifest, digest)
  assert(['complete', 'failed', 'incomplete'].includes(run.status), 'Invalid pilot status')
  assert(
    [run.correctness, run.requiredReview].every(value => ['pass', 'fail', 'unknown'].includes(value)),
    'Invalid quality status',
  )
  validateMeasurements(run)
}

function pairKey(taskId, repetition) {
  return `${taskId}#${repetition}`
}

function observedAggregate(runs, name) {
  const known = runs.filter(run => run[name] !== null)
  return {
    observedTotal: known.length ? known.reduce((sum, run) => sum + run[name], 0) : null,
    measuredRuns: known.length,
    unknownRuns: runs.length - known.length,
  }
}

function expectedPairs(manifest, records, armId) {
  return manifest.tasks.flatMap(task =>
    [1, 2].map(repetition => {
      const key = pairKey(task.id, repetition)
      return { key, baseline: records.get(`${key}#baseline`), candidate: records.get(`${key}#${armId}`) }
    }),
  )
}

const pairChecks = [
  ['failed-or-incomplete-run', runs => runs.some(run => run.status !== 'complete')],
  ['unverified-execution', runs => runs.some(run => run.executionVerified !== true)],
  ['unknown-quality', runs => runs.some(run => [run.correctness, run.requiredReview].includes('unknown'))],
  ['quality-failure', runs => runs.some(run => [run.correctness, run.requiredReview].includes('fail'))],
  ['missing-measurement', runs => runs.some(run => measurements.some(name => run[name] === null))],
  ['zero-baseline-denominator', runs => [runs[0].totalTokens, runs[0].elapsedMs].includes(0)],
]

function pairIssue(pair, duplicateKeys, armId) {
  if ([pair.baseline, pair.candidate].includes(undefined)) return 'missing-run'
  if ([`${pair.key}#baseline`, `${pair.key}#${armId}`].some(key => duplicateKeys.has(key))) return 'duplicate-run'
  const failed = pairChecks.find(([, check]) => check([pair.baseline, pair.candidate]))
  return failed ? failed[0] : null
}

function classifyPairs(manifest, records, armId, duplicateKeys) {
  const issues = []
  const pairs = []
  for (const pair of expectedPairs(manifest, records, armId)) {
    const reason = pairIssue(pair, duplicateKeys, armId)
    if (reason) issues.push({ pair: pair.key, reason })
    else pairs.push(pair)
  }
  return { issues, pairs }
}

function qualificationStatus(issues, complete, qualifies) {
  if (issues.some(issue => issue.reason === 'quality-failure')) return 'does-not-qualify'
  if (!complete) return 'unknown'
  return qualifies ? 'qualifies' : 'does-not-qualify'
}

function meetsThreshold(metrics, threshold) {
  return (
    Object.values(metrics).some(metric => metric.improvementPercent >= threshold.minimumMedianImprovementPercent) &&
    Object.values(metrics).every(metric => metric.improvementPercent >= -threshold.maximumOtherMetricRegressionPercent)
  )
}

function compareArm(manifest, records, allRuns, armId, duplicateKeys) {
  const { issues, pairs } = classifyPairs(manifest, records, armId, duplicateKeys)
  const metrics = pairs.length
    ? Object.fromEntries(
        ['totalTokens', 'elapsedMs'].map(name => {
          const baselineMedian = median(pairs.map(pair => pair.baseline[name]))
          const candidateMedian = median(pairs.map(pair => pair.candidate[name]))
          return [
            name,
            {
              baselineMedian,
              candidateMedian,
              improvementPercent: ((baselineMedian - candidateMedian) / baselineMedian) * 100,
            },
          ]
        }),
      )
    : null
  const complete = issues.length === 0
  const qualifies = complete && meetsThreshold(metrics, manifest.thresholds)
  const armRuns = allRuns.filter(run => run.arm === armId)
  return {
    arm: armId,
    status: qualificationStatus(issues, complete, qualifies),
    completePairs: pairs.length,
    requiredPairs: manifest.tasks.length * manifest.repetitions,
    issues,
    metrics,
    pairedDeltas: pairs.map(pair => ({
      pair: pair.key,
      ...Object.fromEntries(
        ['totalTokens', 'elapsedMs'].map(name => [
          name,
          {
            baseline: pair.baseline[name],
            candidate: pair.candidate[name],
            absoluteReduction: pair.baseline[name] - pair.candidate[name],
            improvementPercent: ((pair.baseline[name] - pair.candidate[name]) / pair.baseline[name]) * 100,
          },
        ]),
      ),
    })),
    baselineAudit: auditRuns(allRuns.filter(run => run.arm === 'baseline')),
    candidateAudit: auditRuns(armRuns),
    receivedRuns: armRuns.length,
    runOutcomes: Object.fromEntries(
      ['complete', 'failed', 'incomplete'].map(status => [status, armRuns.filter(run => run.status === status).length]),
    ),
    operationalCounts: Object.fromEntries(
      ['failures', 'retries', 'manualCorrections'].map(name => [name, observedAggregate(armRuns, name)]),
    ),
    setupMs: observedAggregate(armRuns, 'setupMs'),
  }
}

function auditRuns(runs) {
  return {
    runs: runs.map(run => ({
      taskId: run.taskId,
      repetition: run.repetition,
      status: run.status,
      correctness: run.correctness,
      requiredReview: run.requiredReview,
      executionVerified: run.executionVerified === true,
      elapsedMs: run.elapsedMs,
      setupMs: run.setupMs,
      totalTokens: run.totalTokens,
      failures: run.failures,
      retries: run.retries,
      manualCorrections: run.manualCorrections,
    })),
    operationalCounts: Object.fromEntries(
      ['failures', 'retries', 'manualCorrections', 'setupMs'].map(name => [name, observedAggregate(runs, name)]),
    ),
  }
}

export function evaluatePilot(manifestInput, recordInput) {
  const manifest = validatePilotManifest(manifestInput)
  assert(
    recordInput?.schemaVersion === 1 && Array.isArray(recordInput.runs),
    'Pilot results require schemaVersion 1 and runs array',
  )
  const digest = pilotManifestDigest(manifest)
  const { records, duplicates } = indexRuns(recordInput.runs, manifest, digest)
  return {
    schemaVersion: 1,
    baseCommit: manifest.baseCommit,
    manifestDigest: digest,
    elapsedMsDefinition: 'wall-clock total including setupMs',
    evidenceTrust: 'Caller-supplied measurements and review assertions; independent receipts required.',
    promotionAuthorized: false,
    receivedRuns: recordInput.runs.length,
    expectedRuns: manifest.tasks.length * manifest.repetitions * manifest.arms.length,
    comparisons: ['model', 'workflow'].map(arm => compareArm(manifest, records, recordInput.runs, arm, duplicates)),
  }
}

function indexRuns(runs, manifest, digest) {
  const records = new Map()
  const duplicates = new Set()
  for (const run of runs) {
    validateRunShape(run, manifest, digest)
    const key = `${pairKey(run.taskId, run.repetition)}#${run.arm}`
    if (records.has(key)) duplicates.add(key)
    else records.set(key, run)
  }
  return { records, duplicates }
}
