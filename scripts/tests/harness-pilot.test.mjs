import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { evaluatePilot, pilotManifestDigest, validatePilotManifest } from '../lib/harness-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'config/development-harness/native-pilot.json'), 'utf8'))
const digest = pilotManifestDigest(manifest)
const runs = () =>
  manifest.tasks.flatMap(task =>
    [1, 2].flatMap(repetition =>
      manifest.arms.map(arm => ({
        taskId: task.id,
        manifestDigest: digest,
        repetition,
        arm: arm.id,
        baseCommit: manifest.baseCommit,
        model: arm.model,
        workflow: arm.workflow,
        effort: manifest.execution.effort,
        status: 'complete',
        executionVerified: true,
        correctness: 'pass',
        requiredReview: 'pass',
        totalTokens: arm.id === 'baseline' ? 1000 : 880,
        elapsedMs: arm.id === 'baseline' ? 1000 : 1040,
        setupMs: 5,
        failures: 0,
        retries: 0,
        manualCorrections: 0,
      })),
    ),
  )
const evaluate = records => evaluatePilot(manifest, { schemaVersion: 1, runs: records })

test('frozen manifest has the required balanced arms and task mix', () => {
  assert.equal(validatePilotManifest(manifest).tasks.length, 8)
  assert.equal(manifest.baseCommit, 'ac758ceaa12330f969b166e6be1d18f7b3dc98c9')
  assert.equal(manifest.execution.effort, 'medium')
})

test('complete paired records qualify only on the stated median threshold', () => {
  const report = evaluate(runs())
  assert.equal(report.expectedRuns, 48)
  assert.equal(report.comparisons[0].status, 'qualifies')
  assert.equal(report.comparisons[0].completePairs, 16)
  assert.equal(report.comparisons[0].metrics.totalTokens.improvementPercent, 12)
  assert.equal(report.comparisons[0].metrics.elapsedMs.improvementPercent, -4)
  assert.equal(report.comparisons[0].pairedDeltas.length, 16)
  assert.equal(report.comparisons[0].pairedDeltas[0].totalTokens.absoluteReduction, 120)
})

test('missing, duplicate, failed, unknown telemetry, and zero denominator block qualification', () => {
  const scenarios = [
    records => records.pop(),
    records => records.push({ ...records[0] }),
    records => {
      records[0].status = 'failed'
    },
    records => {
      records[0].totalTokens = null
    },
    records => {
      records[0].totalTokens = 0
    },
  ]
  for (const change of scenarios) {
    const records = runs()
    change(records)
    assert.equal(
      evaluate(records).comparisons.some(result => result.status === 'unknown'),
      true,
    )
  }
})

test('correctness and required review failures disqualify, even when other pairs are incomplete', () => {
  for (const field of ['correctness', 'requiredReview']) {
    const records = runs()
    records.find(run => run.arm === 'model')[field] = 'fail'
    records.pop()
    assert.equal(evaluate(records).comparisons[0].status, 'does-not-qualify')
  }
})

test('unmatched conditions and malformed measurements fail closed', () => {
  for (const change of [
    run => {
      run.manifestDigest = '0'.repeat(64)
    },
    run => {
      run.baseCommit = 'other'
    },
    run => {
      run.model = 'gpt-6.1-sol'
    },
    run => {
      run.effort = 'high'
    },
    run => {
      run.retries = -1
    },
    run => {
      run.elapsedMs = 1.5
    },
    run => {
      run.setupMs = 2000
    },
  ]) {
    const records = runs()
    change(records[0])
    assert.throws(() => evaluate(records), /conditions|Invalid|include setup/)
  }
})

test('failed and incomplete runs retain observed operational cost and unknown coverage', () => {
  const records = runs()
  const model = records.filter(run => run.arm === 'model')
  model[0].status = 'failed'
  model[0].failures = 2
  model[0].retries = 1
  model[0].manualCorrections = 3
  model[0].setupMs = 25
  model[1].status = 'incomplete'
  model[1].failures = null
  model[1].retries = null
  model[1].manualCorrections = null
  model[1].setupMs = null
  const result = evaluate(records).comparisons[0]
  assert.equal(result.status, 'unknown')
  assert.equal(result.runOutcomes.failed, 1)
  assert.equal(result.runOutcomes.incomplete, 1)
  assert.equal(result.operationalCounts.failures.observedTotal, 2)
  assert.equal(result.operationalCounts.failures.unknownRuns, 1)
  assert.equal(result.operationalCounts.retries.observedTotal, 1)
  assert.equal(result.operationalCounts.manualCorrections.observedTotal, 3)
  assert.equal(result.setupMs.observedTotal, 95)
  assert.equal(result.setupMs.unknownRuns, 1)
})

test('threshold requires at least 10 percent gain', () => {
  const insufficient = runs()
  for (const run of insufficient) if (run.arm !== 'baseline') run.totalTokens = 910
  assert.equal(evaluate(insufficient).comparisons[0].status, 'does-not-qualify')
})

test('threshold limits other metric regression to 5 percent', () => {
  const regression = runs()
  for (const run of regression) if (run.arm !== 'baseline') run.elapsedMs = 1060
  assert.equal(evaluate(regression).comparisons[0].status, 'does-not-qualify')
})

test('report CLI reads aggregate results and returns the same comparison', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appraise-pilot-'))
  const file = path.join(dir, 'results.json')
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, runs: runs() }))
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/harness-pilot.mjs'), '--results', file], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).comparisons[0].status, 'qualifies')
})

test('baseline failures remain audited and requested execution cannot qualify', () => {
  const records = runs()
  records[0].status = 'failed'
  records[0].failures = 2
  records[0].retries = 1
  const report = evaluate(records).comparisons[0]
  assert.equal(report.baselineAudit.operationalCounts.failures.observedTotal, 2)
  assert.equal(report.baselineAudit.runs[0].status, 'failed')
  const unverified = runs()
  delete unverified[0].executionVerified
  assert.equal(evaluate(unverified).comparisons[0].status, 'unknown')
})
