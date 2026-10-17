import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { appendEvent, readJournal, validateRun } from '../lib/swarm-ledger-store.mjs'

const scripts = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cwd = () => fs.mkdtempSync(path.join(os.tmpdir(), 'appraise-telemetry-'))
function execute(dir, script, args) {
  return spawnSync(process.execPath, [path.join(scripts, script), ...args], { cwd: dir, encoding: 'utf8' })
}
function route(dir) {
  const result = execute(dir, 'record-swarm-route.mjs', [
    '--task-class',
    'localized-fix',
    '--route-input',
    '{"consequence":"low","verificationStrength":"strong"}',
    '--rationale',
    'Focused test',
    '--classification-latency-ms',
    '1',
  ])
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout).decision.decisionId
}
function record(dir, decisionId, extra = []) {
  return execute(dir, 'record-swarm-run.mjs', [
    '--task-class',
    'localized-fix',
    '--routing-decision-id',
    decisionId,
    '--accuracy',
    '2',
    '--coverage',
    '2',
    '--routing',
    '2',
    '--efficiency',
    '2',
    '--coordination',
    '2',
    '--solver-context',
    'not-used',
    '--solver-context-evidence',
    'not-used',
    '--judge-context',
    'not-used',
    '--judge-context-evidence',
    'not-used',
    '--evidence',
    'focused test',
    '--optimization',
    'none',
    ...extra,
  ])
}
function telemetry(dir, decisionId, metrics) {
  const file = path.join(dir, 'telemetry.json')
  fs.writeFileSync(
    file,
    JSON.stringify({
      schemaVersion: 1,
      routingDecisionId: decisionId,
      sourceId: 'host-usage:task-1',
      capturedAt: '2026-10-17T00:00:00Z',
      metrics,
    }),
  )
  return file
}

test('unavailable measurements are null with no provenance', () => {
  const dir = cwd()
  const result = record(dir, route(dir))
  assert.equal(result.status, 0, result.stderr)
  const run = JSON.parse(result.stdout).run
  assert.equal(run.schemaVersion, 6)
  assert.equal(run.harnessVersion, 'swarm-record-v6')
  for (const [name, value] of Object.entries(run.metrics)) {
    assert.equal(value, null, name)
    assert.equal(run.measurementProvenance[name], null, name)
  }
})

test('CLI imports scoped aggregate host usage and marks each source', () => {
  const dir = cwd()
  const id = route(dir)
  const file = telemetry(dir, id, {
    durationMs: 30,
    inputTokens: 100,
    outputTokens: 20,
    cacheReadTokens: 60,
    toolOutputBytes: 1024,
    modelUse: [{ model: 'gpt-6-sol', calls: 1 }],
  })
  const result = record(dir, id, ['--host-telemetry-file', file, '--retry-count', '0'])
  assert.equal(result.status, 0, result.stderr)
  const run = JSON.parse(result.stdout).run
  assert.equal(run.metrics.cacheReadTokens, 60)
  assert.equal(run.metrics.cacheWriteTokens, null)
  assert.equal(run.metrics.toolOutputBytes, 1024)
  assert.equal(run.measurementProvenance.inputTokens.source, 'normalized-host-telemetry')
  assert.equal(run.measurementProvenance.inputTokens.scope, 'routing-decision')
  assert.equal(run.measurementProvenance.retryCount.source, 'cli-reported')
  assert.equal(run.measurementProvenance.cacheWriteTokens, null)
  assert.equal(
    readJournal(path.join(dir, '.appraisejs/swarm-events.jsonl')).runs.get(run.runId).metrics.toolOutputBytes,
    1024,
  )
})

test('rejects malformed counts, model use, wrong scope, raw transcript fields, and duplicate sources', () => {
  for (const metrics of [
    { inputTokens: -1 },
    { outputTokens: 1.5 },
    { cacheReadTokens: Number.MAX_SAFE_INTEGER + 1 },
    { modelUse: [{ model: 'gpt-6-sol', calls: -1 }] },
    {
      modelUse: [
        { model: 'gpt-6-sol', calls: 1 },
        { model: 'gpt-6-sol', calls: 2 },
      ],
    },
    { transcript: 'secret' },
  ]) {
    const dir = cwd()
    const id = route(dir)
    const result = record(dir, id, ['--host-telemetry-file', telemetry(dir, id, metrics)])
    assert.notEqual(result.status, 0, JSON.stringify(metrics))
  }
  const dir = cwd()
  const id = route(dir)
  const wrong = telemetry(dir, 'other-route', { inputTokens: 1 })
  assert.notEqual(record(dir, id, ['--host-telemetry-file', wrong]).status, 0)
  const same = telemetry(dir, id, { inputTokens: 1 })
  assert.match(
    record(dir, id, ['--host-telemetry-file', same, '--input-tokens', '2']).stderr,
    /Duplicate metric source/,
  )
  assert.notEqual(record(dir, id, ['--model-use', 'gpt-6-sol:9007199254740992']).status, 0)
})

test('version 5 receipt remains readable in the hash journal', () => {
  const dir = cwd()
  const id = route(dir)
  const generated = record(dir, id)
  assert.equal(generated.status, 0, generated.stderr)
  const legacy = structuredClone(JSON.parse(generated.stdout).run)
  legacy.schemaVersion = 5
  delete legacy.harnessVersion
  delete legacy.measurementProvenance
  for (const key of ['cacheReadTokens', 'cacheWriteTokens', 'toolOutputBytes', 'toolOutputCount'])
    delete legacy.metrics[key]
  legacy.metrics.modelUse = []
  validateRun(legacy)
  const secondId = route(dir)
  legacy.runId = 'legacy-run'
  legacy.routingDecisionId = secondId
  const file = path.join(dir, '.appraisejs/swarm-events.jsonl')
  appendEvent(file, { kind: 'run.recorded', run: legacy }, readJournal(file).lastHash)
  assert.equal(readJournal(file).runs.get('legacy-run').schemaVersion, 5)
})
