import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { parseProjectToml, validateTomlBasicString } from '../lib/toml-validator.mjs'

const scriptsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const recordScript = path.join(scriptsDir, 'record-swarm-run.mjs')
const evolveScript = path.join(scriptsDir, 'update-swarm-evolution.mjs')
const ledgerScript = path.join(scriptsDir, 'swarm-ledger.mjs')
const temporaryDirectory = () => fs.mkdtempSync(path.join(os.tmpdir(), 'appraise-swarm-'))

function recordArgs(overrides = {}) {
  const values = {
    'task-class': 'harness-configuration',
    accuracy: '2',
    coverage: '2',
    routing: '2',
    efficiency: '2',
    coordination: '2',
    'solver-context': 'not-used',
    'solver-context-evidence': 'not-used',
    'judge-context': 'none',
    'judge-context-evidence': 'receipt:fork_turns:none',
    evidence: 'test evidence',
    optimization: 'none required',
    ...overrides,
  }
  return [
    recordScript,
    ...Object.entries(values).flatMap(([name, value]) =>
      Array.isArray(value) ? value.flatMap(item => [`--${name}`, item]) : [`--${name}`, value],
    ),
  ]
}

function run(cwd, args) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

function fail(cwd, args, pattern) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, pattern)
}

function evolve(cwd, runId, action, fields = {}) {
  return run(cwd, [
    evolveScript,
    '--run-id',
    runId,
    '--action',
    action,
    ...Object.entries(fields).flatMap(([name, value]) => [`--${name}`, value]),
  ])
}

test('strict CLI rejects unknown, duplicate, and blank fields', () => {
  const cwd = temporaryDirectory()
  fail(cwd, [...recordArgs(), '--unknown', 'x'], /Unknown argument/)
  fail(cwd, [...recordArgs(), '--accuracy', '1'], /Duplicate argument/)
  fail(cwd, recordArgs({ evidence: ' ' }), /Blank value/)
})

test('non-perfect, critical, and unverified-context signals create structured notes', () => {
  const cwd = temporaryDirectory()
  const result = run(
    cwd,
    recordArgs({
      accuracy: '1',
      'judge-context': 'bounded',
      'judge-context-evidence': 'unknown',
      observation: ['authorization|critical|authority failure|probe|unsafe action|deny action'],
    }),
  ).run
  assert.equal(result.status, 'failed')
  assert.ok(result.criticalOverride.includes('authorization'))
  assert.ok(result.triggers.includes('context-boundary-unverified'))
  assert.ok(result.evolution.observations.every(item => item.evidence && item.impact && item.proposedOptions))
})

test('host provenance metadata and ordered transitions are required', () => {
  const cwd = temporaryDirectory()
  const origin = run(
    cwd,
    recordArgs({
      observation: ['usability|minor|friction|manual probe|operator cost|simplify CLI'],
    }),
  ).run
  fail(cwd, [evolveScript, '--run-id', origin.runId, '--action', 'notify'], /delivery-receipt/)
  evolve(cwd, origin.runId, 'notify', { 'delivery-receipt': 'host-delivery:1' })
  fail(cwd, [evolveScript, '--run-id', origin.runId, '--action', 'guide', '--guidance', 'fix'], /authority-source/)
  evolve(cwd, origin.runId, 'guide', {
    guidance: 'fix the issue',
    'authority-source': 'host-conversation',
    'thread-id': 'thread-1',
    'message-id': 'message-1',
  })
  evolve(cwd, origin.runId, 'ready', { update: 'implemented fix', verification: 'tests passed' })
  const reevaluation = run(cwd, recordArgs()).run
  const completed = evolve(cwd, origin.runId, 'complete', {
    'reevaluation-run-id': reevaluation.runId,
  })
  assert.equal(completed.evolution.phase, 'verified')
})

test('older, reused, or tampered reevaluations cannot complete evolution', () => {
  const cwd = temporaryDirectory()
  const older = run(cwd, recordArgs()).run
  const origin = run(cwd, recordArgs({ observation: ['validation|material|gap|probe|false pass|fix ordering'] })).run
  evolve(cwd, origin.runId, 'notify', { 'delivery-receipt': 'delivery' })
  evolve(cwd, origin.runId, 'guide', {
    guidance: 'fix ordering',
    'authority-source': 'host-conversation',
    'thread-id': 'thread',
    'message-id': 'message',
  })
  evolve(cwd, origin.runId, 'ready', { update: 'fixed', verification: 'passed' })
  fail(
    cwd,
    [evolveScript, '--run-id', origin.runId, '--action', 'complete', '--reevaluation-run-id', older.runId],
    /clean, later/,
  )
  const journal = path.join(cwd, '.appraisejs', 'swarm-events.jsonl')
  const lines = fs.readFileSync(journal, 'utf8').trim().split('\n')
  const recorded = JSON.parse(lines[0])
  recorded.run.evidence = ' '
  fs.writeFileSync(journal, `${JSON.stringify(recorded)}\n${lines.slice(1).join('\n')}\n`)
  fail(cwd, [ledgerScript, 'status'], /invalid event hash|blank evidence/)
})

test('journal recovery quarantines a malformed tail', () => {
  const cwd = temporaryDirectory()
  run(cwd, recordArgs())
  const journal = path.join(cwd, '.appraisejs', 'swarm-events.jsonl')
  fs.appendFileSync(journal, '{"broken":')
  fail(cwd, [ledgerScript, 'status'], /Unexpected end of JSON input/)
  const recovered = run(cwd, [ledgerScript, 'recover'])
  assert.equal(recovered.recovered, true)
  assert.ok(fs.readdirSync(path.dirname(journal)).some(file => file.includes('.corrupt.')))
})

test('legacy migration imports only complete valid records', () => {
  const sourceCwd = temporaryDirectory()
  const valid = run(sourceCwd, recordArgs()).run
  const cwd = temporaryDirectory()
  const source = path.join(cwd, 'legacy.jsonl')
  fs.writeFileSync(source, `${JSON.stringify(valid)}\n{"score":10}\n`)
  const migrated = run(cwd, [ledgerScript, 'migrate', '--source', source])
  assert.deepEqual(migrated.imported, [valid.runId])
  assert.equal(migrated.skipped.length, 1)
  assert.equal(run(cwd, [ledgerScript, 'status']).runCount, 1)
})

test('ledger list, show, status, and structured metrics work', () => {
  const cwd = temporaryDirectory()
  const recorded = run(
    cwd,
    recordArgs({
      'duration-ms': '120',
      'input-tokens': '1000',
      'output-tokens': '200',
      'agent-count': '2',
      'retry-count': '0',
      'reroute-count': '0',
      'model-use': ['gpt-5.6-sol:1', 'gpt-5.6-terra:1'],
    }),
  ).run
  assert.equal(run(cwd, [ledgerScript, 'list']).length, 1)
  assert.equal(run(cwd, [ledgerScript, 'show', '--run-id', recorded.runId]).metrics.durationMs, 120)
  assert.equal(run(cwd, [ledgerScript, 'status']).runCount, 1)
})

test('longitudinal findings are persisted', () => {
  const cwd = temporaryDirectory()
  run(cwd, recordArgs({ accuracy: '1' }))
  run(cwd, recordArgs({ accuracy: '1' }))
  const third = run(cwd, recordArgs()).run
  assert.equal(third.evolution.notificationRequired, true)
  assert.ok(third.evolution.observations.some(item => item.summary === 'Longitudinal evolution trigger'))
})

test('concurrent recorders preserve every event', async () => {
  const cwd = temporaryDirectory()
  await Promise.all(
    Array.from(
      { length: 12 },
      () =>
        new Promise((resolve, reject) => {
          const child = spawn(process.execPath, recordArgs(), { cwd, stdio: ['ignore', 'ignore', 'pipe'] })
          let stderr = ''
          child.stderr.on('data', chunk => (stderr += chunk))
          child.on('error', reject)
          child.on('exit', code => (code === 0 ? resolve() : reject(new Error(stderr))))
        }),
    ),
  )
  assert.equal(run(cwd, [ledgerScript, 'status']).runCount, 12)
})

test('concurrent record and evolution operations preserve valid transitions', async () => {
  const cwd = temporaryDirectory()
  const origins = [
    run(cwd, recordArgs({ observation: ['validation|minor|one|probe|cost|fix'] })).run,
    run(cwd, recordArgs({ observation: ['validation|minor|two|probe|cost|fix'] })).run,
  ]
  await Promise.all(
    origins.map(
      (origin, index) =>
        new Promise((resolve, reject) => {
          const child = spawn(
            process.execPath,
            [evolveScript, '--run-id', origin.runId, '--action', 'notify', '--delivery-receipt', `delivery-${index}`],
            { cwd, stdio: ['ignore', 'ignore', 'pipe'] },
          )
          let stderr = ''
          child.stderr.on('data', chunk => (stderr += chunk))
          child.on('error', reject)
          child.on('exit', code => (code === 0 ? resolve() : reject(new Error(stderr))))
        }),
    ),
  )
  const recordChild = new Promise((resolve, reject) => {
    const child = spawn(process.execPath, recordArgs(), { cwd, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', chunk => (stderr += chunk))
    child.on('error', reject)
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(stderr))))
  })
  const guideChild = new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        evolveScript,
        '--run-id',
        origins[0].runId,
        '--action',
        'guide',
        '--guidance',
        'fix',
        '--authority-source',
        'host-conversation',
        '--thread-id',
        'thread',
        '--message-id',
        'message',
      ],
      { cwd, stdio: ['ignore', 'ignore', 'pipe'] },
    )
    let stderr = ''
    child.stderr.on('data', chunk => (stderr += chunk))
    child.on('error', reject)
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(stderr))))
  })
  await Promise.all([recordChild, guideChild])
  assert.equal(run(cwd, [ledgerScript, 'status']).runCount, 3)
  assert.equal(run(cwd, [ledgerScript, 'show', '--run-id', origins[0].runId]).evolution.phase, 'guidance_received')
})

// One table-driven test intentionally exercises every supported stale-lock filesystem shape.
// fallow-ignore-next-line complexity
test('stale directory and file lock shapes recover', () => {
  for (const shape of ['dead-owner', 'ownerless', 'null-owner', 'regular-file']) {
    const cwd = temporaryDirectory()
    const lockPath = path.join(cwd, '.appraisejs', 'swarm-events.jsonl.lock')
    fs.mkdirSync(path.dirname(lockPath), { recursive: true })
    if (shape === 'regular-file') fs.writeFileSync(lockPath, 'stale')
    else {
      fs.mkdirSync(lockPath)
      if (shape === 'dead-owner') {
        fs.writeFileSync(
          path.join(lockPath, 'owner.json'),
          JSON.stringify({ pid: 99999999, token: 'old', acquiredAt: '2000-01-01T00:00:00.000Z' }),
        )
      } else if (shape === 'null-owner') fs.writeFileSync(path.join(lockPath, 'owner.json'), 'null')
    }
    const old = new Date('2000-01-01T00:00:00.000Z')
    fs.utimesSync(lockPath, old, old)
    assert.equal(run(cwd, recordArgs()).run.score, 10)
  }
})

test('PID-reused stale locks recover and symbolic-link locks are refused', () => {
  const cwd = temporaryDirectory()
  const lockPath = path.join(cwd, '.appraisejs', 'swarm-events.jsonl.lock')
  fs.mkdirSync(lockPath, { recursive: true })
  fs.writeFileSync(
    path.join(lockPath, 'owner.json'),
    JSON.stringify({ pid: process.pid, token: 'reused', acquiredAt: '2000-01-01T00:00:00.000Z' }),
  )
  assert.equal(run(cwd, recordArgs()).run.score, 10)

  const symlinkCwd = temporaryDirectory()
  const victim = path.join(symlinkCwd, 'victim')
  const symlinkLock = path.join(symlinkCwd, '.appraisejs', 'swarm-events.jsonl.lock')
  fs.mkdirSync(victim)
  fs.mkdirSync(path.dirname(symlinkLock), { recursive: true })
  fs.symlinkSync(victim, symlinkLock)
  fail(symlinkCwd, recordArgs(), /Refusing symbolic-link swarm lock/)
  assert.equal(fs.existsSync(victim), true)
})

test('repository TOML validation rejects malformed integers and escapes', () => {
  assert.throws(() => parseProjectToml('[agents]\ncount = 03\n'), /invalid TOML integer/)
  assert.throws(() => parseProjectToml('[agents]\nname = "bad\\\\/escape"\n'), /invalid TOML/)
  assert.throws(() => validateTomlBasicString('bad\\q', '.codex/agents/judge.toml', 1), /invalid TOML string escape/)
  assert.throws(() => parseProjectToml('[agents]\nenabled = true\n[agents]\nenabled = false\n'), /duplicate TOML table/)
})
