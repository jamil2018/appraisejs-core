import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { hashFiles, matchesPattern, readValidationRegistry } from './lib/harness-validation.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const patterns = readValidationRegistry(root).prerequisites[0].inputPatterns
const baseCommit = JSON.parse(readFileSync(path.join(root, 'config/development-harness/native-pilot.json'))).baseCommit

function frozenLegacyHash() {
  const excerpt = legacyFingerprintExcerpt(readFrozenFingerprintSource())
  const implementation = runInNewContext(`${excerpt}\nhashFiles`, {
    createHash,
    existsSync,
    lstatSync,
    matchesPattern,
    path,
    readdirSync,
    readFileSync,
    realpathSync,
  })
  return { implementation, sourceSha256: createHash('sha256').update(excerpt).digest('hex') }
}

function readFrozenFingerprintSource() {
  const result = spawnSync('git', ['show', `${baseCommit}:scripts/lib/harness-validation.mjs`], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout
}

function legacyFingerprintExcerpt(source) {
  const start = source.indexOf('function hashFiles(')
  const end = source.indexOf('export function executeValidationPlan(', start)
  if (start < 0) throw new Error('Frozen baseline hashFiles source is unavailable.')
  if (end < 0) throw new Error('Frozen baseline walkFiles source is unavailable.')
  return source.slice(start, end)
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}

function measure(run, count) {
  const samplesMs = []
  const cpuSamplesMs = []
  let digest
  for (let index = 0; index < count; index += 1) {
    const started = performance.now()
    const cpuStart = process.cpuUsage()
    digest = run()
    samplesMs.push(Number((performance.now() - started).toFixed(2)))
    const cpu = process.cpuUsage(cpuStart)
    cpuSamplesMs.push(Number(((cpu.user + cpu.system) / 1000).toFixed(2)))
  }
  return { medianMs: median(samplesMs), samplesMs, medianCpuMs: median(cpuSamplesMs), cpuSamplesMs, digest }
}

const count = 12
const frozen = frozenLegacyHash()
const baseline = measure(() => frozen.implementation(root, patterns), count)
const candidate = measure(() => hashFiles(root, patterns), count)
if (baseline.digest !== candidate.digest) throw new Error('Fingerprint digest changed during traversal optimization.')
const elapsedImprovementPercent = Number(
  (((baseline.medianMs - candidate.medianMs) / baseline.medianMs) * 100).toFixed(2),
)
const cpuImprovementPercent = Number(
  (((baseline.medianCpuMs - candidate.medianCpuMs) / baseline.medianCpuMs) * 100).toFixed(2),
)
const result = {
  kind: 'fingerprint-microbenchmark',
  provenance:
    'Legacy algorithm extracted from the pinned base-commit Git blob; local current-worktree wall-clock samples. This is not an end-to-end development pilot.',
  baselineCommit: baseCommit,
  baselineSourceSha256: frozen.sourceSha256,
  inputPatterns: patterns,
  samplesPerArm: count,
  baseline,
  candidate,
  elapsedImprovementPercent,
  cpuImprovementPercent,
  digestEqual: true,
  retentionCriterionMet: elapsedImprovementPercent >= 10 && cpuImprovementPercent >= -5,
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
