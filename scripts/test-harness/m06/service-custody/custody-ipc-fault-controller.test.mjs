// Inert protocol validation only. Importing the controller cannot select its executable branch.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, symlinkSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  verify,
  inspectServiceFaultArtifacts,
  receiveServiceFaultWindow,
  validateWindow,
  validateLatch,
  validateFence,
  validateInvocation,
  validateLiveness,
  readBoundedArtifact,
} from './custody-ipc-fault-controller.mjs'

function fixture() {
  const identity = { pid: 12345, nonce: 'attempt-only', case: 'ipc-loss-before-postcallback-sql' }
  const window = {
    ...identity,
    version: 1,
    type: 'ipc-fault-window',
    phase: 'IPC_FAULT_GATE_PENDING',
    nextFixtureOperation: 'POST_CALLBACK_SOURCE_STATE_READ',
    windowId: 'a'.repeat(64),
    admissionCount: 30,
    referenceIds: { callback: 10, client: 11, gate: 12, outer: 13, restore: 14, source: 15 },
  }
  const receipt = {
    ...identity,
    version: 1,
    type: 'failure-retained',
    classification: 'UNEXPECTED_FIXTURE_FAILURE',
    phase: 'supervisor-disconnect',
    operationPhase: window.phase,
    referenceSummary: { operations: 30, referenceCount: 15 },
  }
  const fence = {
    ...identity,
    version: 1,
    type: 'ipc-fault-fenced',
    windowId: window.windowId,
    site: window.nextFixtureOperation,
    firstCauseIdentityPreserved: true,
    admissionCount: 30,
    failurePhase: receipt.phase,
    referenceIds: window.referenceIds,
  }
  return { identity, window, receipt, fence }
}

test('the exact window, first-cause receipt and fence remain the original objects', () => {
  const { identity, window, receipt, fence } = fixture()
  assert.equal(validateWindow(window, identity), window)
  assert.equal(validateLatch(receipt, window), receipt)
  assert.equal(validateFence(fence, window, receipt), fence)
})

test('a foreign child, nonce or case cannot select the disconnect window', () => {
  const { identity, window } = fixture()
  for (const [key, value] of [
    ['pid', 54321],
    ['nonce', 'another-attempt'],
    ['case', 'another-case'],
  ])
    assert.throws(() => validateWindow({ ...window, [key]: value }, identity))
})

test('window reference metadata cannot omit, alias or invent the required roles', () => {
  const { identity, window } = fixture()
  const missing = { ...window.referenceIds }
  delete missing.gate
  for (const referenceIds of [
    missing,
    { ...window.referenceIds, gate: window.referenceIds.outer },
    { ...window.referenceIds, fabricated: 16 },
    { ...window.referenceIds, outer: 0 },
  ])
    assert.throws(() => validateWindow({ ...window, referenceIds }, identity))
})

test('another first cause or phase cannot authorize gate release', () => {
  const { window, receipt } = fixture()
  for (const changes of [
    { phase: 'timeout' },
    { operationPhase: 'OLDER_FULFILLED_PHASE' },
    { nonce: 'foreign' },
    { classification: 'EXPECTED_RETENTION' },
  ])
    assert.throws(() => validateLatch({ ...receipt, ...changes }, window))
})

test('new admissions or insufficient retained reference bookkeeping refuse release', () => {
  const { window, receipt } = fixture()
  for (const referenceSummary of [
    { operations: 31, referenceCount: 15 },
    { operations: 30, referenceCount: 14 },
    { operations: 30, referenceCount: NaN },
  ])
    assert.throws(() => validateLatch({ ...receipt, referenceSummary }, window))
})

test('a stale gate or a changed first cause cannot pass the continuation fence', () => {
  const { window, receipt, fence } = fixture()
  for (const changes of [
    { windowId: 'b'.repeat(64) },
    { firstCauseIdentityPreserved: false },
    { failurePhase: 'later-error' },
    { admissionCount: 31 },
    { site: 'LATER_SQL' },
    { referenceIds: { ...fence.referenceIds, gate: 99 } },
  ])
    assert.throws(() => validateFence({ ...fence, ...changes }, window, receipt))
})

test('only the actual exact reviewed role and argv are admitted', () => {
  const prefix = ['/owned/node', '/owned/controller.mjs']
  const review = {
    invocation: [...prefix, '--run', '/packet', '/attempt', '/review'],
    supervisorInvocation: [...prefix, '--supervisor', '/packet', '/attempt', '/review'],
  }
  validateInvocation(review.invocation, '--run', review)
  validateInvocation(review.supervisorInvocation, '--supervisor', review)
  for (const actual of [
    [...review.invocation, 'extra'],
    review.supervisorInvocation,
    [...prefix, '--run', '/another-packet', '/attempt', '/review'],
  ])
    assert.throws(() => validateInvocation(actual, '--run', review))
  assert.throws(() => validateInvocation(review.invocation, '--unreviewed', review))
})

test('a full single-PID command display refuses substring and extra-argument matches', () => {
  const created = { pid: 12345, script: '/owned script/owner.mjs', nonce: '11111111-1111-4111-8111-111111111111' }
  created.spawnargs = [
    '/owned/node',
    created.script,
    'ipc-loss-before-postcallback-sql',
    '/owned attempt',
    '/owned/native.mjs',
    created.nonce,
  ]
  const display = '  12345 ' + created.spawnargs.join(' ') + '\n'
  validateLiveness(display, created)
  for (const output of [
    display.replace('owner.mjs', 'owner.mjs.foreign'),
    display.trimEnd() + ' suffix\n',
    display.replace('/owned/node', 'prefix/owned/node'),
    display.replace('12345', '54321'),
    display + display,
  ])
    assert.throws(() => validateLiveness(output, created))
})

test('bounded artifact reads reject oversized, partial and symlink receipts', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'ipc-controller-inert-'))
  const ordinary = path.join(directory, 'ordinary.json')
  writeFileSync(ordinary, '{"version":1}')
  assert.deepEqual(readBoundedArtifact(ordinary, 16), { version: 1 })
  assert.throws(() => readBoundedArtifact(ordinary, 4))
  const partial = path.join(directory, 'partial.json')
  writeFileSync(partial, '{"version":')
  assert.throws(() => readBoundedArtifact(partial))
  const link = path.join(directory, 'link.json')
  symlinkSync(ordinary, link)
  assert.throws(() => readBoundedArtifact(link))
})

function artifactFixture() {
  const f = fixture(),
    directory = mkdtempSync(path.join(tmpdir(), 'custody-fault-routing-inert-'))
  const state = {
    window: undefined,
    receipt: undefined,
    done: false,
    disconnected: false,
    released: false,
    messages: 0,
  }
  const disconnects = []
  const child = {
    pid: f.identity.pid,
    connected: true,
    spawnargs: ['node', '/inert/owner.mjs'],
    disconnect() {
      assert.equal(this, child)
      assert.equal(state.disconnected, true)
      disconnects.push(child)
    },
  }
  return { ...f, directory, state, child, disconnects }
}
test('actual whole authenticated fault-window routing publishes original frame before one exact fake disconnect', () => {
  const f = artifactFixture()
  try {
    writeFileSync(path.join(f.directory, 'ipc-fault-window.json'), JSON.stringify(f.window))
    receiveServiceFaultWindow(f.window, f.state, f.identity, f.directory, f.child)
    assert.equal(f.state.window, f.window)
    assert.equal(f.state.messages, 1)
    assert.equal(f.disconnects.length, 1)
    // The child callback observes the original fixture object; no real ChildProcess exists in this test.
    assert.equal(f.state.disconnected, true)
    assert.deepEqual(JSON.parse(readFileSync(path.join(f.directory, 'supervisor-window.json'))), f.window)
    assert.throws(() => receiveServiceFaultWindow(f.window, f.state, f.identity, f.directory, f.child))
  } finally {
    rmSync(f.directory, { recursive: true })
  }
})
test('fault-window routing rejects foreign/terminal/oversized/exhausted messages before any disconnect', () => {
  const candidates = [
    { type: 'failure-retained' },
    { type: 'case-retained' },
    { type: 'terminal-handoff' },
    { pid: 1 },
    { nonce: 'foreign' },
    { padding: 'x'.repeat(16384) },
  ]
  for (const change of candidates) {
    const f = artifactFixture()
    try {
      assert.throws(() =>
        receiveServiceFaultWindow({ ...f.window, ...change }, f.state, f.identity, f.directory, f.child),
      )
      assert.equal(f.state.disconnected, false)
    } finally {
      rmSync(f.directory, { recursive: true })
    }
  }
  const f = artifactFixture()
  try {
    f.state.messages = 128
    assert.throws(() => receiveServiceFaultWindow(f.window, f.state, f.identity, f.directory, f.child))
    assert.equal(f.state.disconnected, false)
  } finally {
    rmSync(f.directory, { recursive: true })
  }
})
test('actual artifact protocol waits for real evidence then writes exact release before complete validated fence', () => {
  const f = artifactFixture(),
    completed = []
  try {
    inspectServiceFaultArtifacts(f.state, f.identity, f.directory, f.child, value => completed.push(value))
    assert.equal(completed.length, 0)
    f.state.window = f.window
    inspectServiceFaultArtifacts(f.state, f.identity, f.directory, f.child, value => completed.push(value))
    assert.equal(f.state.released, false)
    writeFileSync(path.join(f.directory, 'owner-failure-latch.json'), JSON.stringify(f.receipt))
    inspectServiceFaultArtifacts(f.state, f.identity, f.directory, f.child, value => completed.push(value))
    assert.equal(f.state.released, true)
    assert.equal(f.state.done, false)
    assert.deepEqual(JSON.parse(readFileSync(path.join(f.directory, 'ipc-fault-release.json'))), {
      version: 1,
      ...f.identity,
      windowId: f.window.windowId,
    })
    writeFileSync(path.join(f.directory, 'ipc-fault-fence.json'), JSON.stringify(f.fence))
    inspectServiceFaultArtifacts(f.state, f.identity, f.directory, f.child, value => completed.push(value))
    assert.equal(f.state.done, true)
    assert.equal(completed.length, 1)
    const result = JSON.parse(readFileSync(path.join(f.directory, 'fault-observation.json')))
    assert.deepEqual(result.window, f.window)
    assert.deepEqual(result.receipt, f.receipt)
    assert.deepEqual(result.fence, f.fence)
    inspectServiceFaultArtifacts(f.state, f.identity, f.directory, f.child, value => completed.push(value))
    assert.equal(completed.length, 1)
  } finally {
    rmSync(f.directory, { recursive: true })
  }
})
test('malformed first-cause artifact never releases and a contradictory fence never completes', () => {
  const f = artifactFixture()
  try {
    f.state.window = f.window
    writeFileSync(
      path.join(f.directory, 'owner-failure-latch.json'),
      JSON.stringify({ ...f.receipt, phase: 'foreign' }),
    )
    assert.throws(() =>
      inspectServiceFaultArtifacts(f.state, f.identity, f.directory, f.child, () =>
        assert.fail('forbidden completion'),
      ),
    )
    assert.equal(f.state.released, false)
    writeFileSync(path.join(f.directory, 'owner-failure-latch.json'), JSON.stringify(f.receipt))
    writeFileSync(
      path.join(f.directory, 'ipc-fault-fence.json'),
      JSON.stringify({ ...f.fence, windowId: 'b'.repeat(64) }),
    )
    assert.throws(() =>
      inspectServiceFaultArtifacts(f.state, f.identity, f.directory, f.child, () =>
        assert.fail('forbidden completion'),
      ),
    )
    assert.equal(f.state.released, true)
    assert.equal(f.state.done, false)
  } finally {
    rmSync(f.directory, { recursive: true })
  }
})

function packetFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), 'custody-packet-static-inert-'))
  const packet = directory,
    attempt = path.join(directory, 'unused-attempt'),
    reviewPath = path.join(directory, 'review.json')
  const self = fileURLToPath(new URL('./custody-ipc-fault-controller.mjs', import.meta.url)),
    hash = bytes => createHash('sha256').update(bytes).digest('hex')
  const input = filename => {
    const bytes = readFileSync(filename)
    return { filename, bytes: bytes.length, sha256: hash(bytes) }
  }
  const placeholder = path.join(directory, 'unexecuted-input.mjs')
  writeFileSync(placeholder, '// inert bytes only\n')
  const manifest = {
    controller: input(self),
    executable: input(process.execPath),
    nodeVersion: process.version,
    psExecutable: input('/bin/ps'),
    case: 'ipc-loss-before-postcallback-sql',
    migrations: 93,
    ownerBundle: input(placeholder),
    nativeScript: input(placeholder),
    inputs: [],
  }
  const invocation = [process.execPath, self, '--run', packet, attempt, reviewPath]
  const review = {
    judgment: 'ACCEPT',
    scope: 'EXACT_SERVICE_IPC_FAULT16K_CONTROLLER_AND_INPUTS',
    controllerExecutionAuthorized: true,
    allowedCases: [manifest.case],
    attemptDirectory: attempt,
    invocation,
    supervisorInvocation: [process.execPath, self, '--supervisor', packet, attempt, reviewPath],
  }
  function publish() {
    const bytes = Buffer.from(JSON.stringify(manifest))
    writeFileSync(path.join(packet, 'manifest.json'), bytes)
    review.manifestSha256 = hash(bytes)
    writeFileSync(reviewPath, JSON.stringify(review))
  }
  publish()
  return { directory, packet, attempt, reviewPath, manifest, review, invocation, publish }
}
test('actual static packet verifier accepts exact owned inert files and rejects each authority/input pin without execution', () => {
  const oldArgv = process.argv,
    oldExecArgv = process.execArgv
  const f = packetFixture()
  try {
    process.argv = f.invocation
    process.execArgv = ['--inert-rejected-flag']
    assert.throws(() => verify(f.packet, f.attempt, f.reviewPath, '--run'))
    process.execArgv = []
    assert.deepEqual(verify(f.packet, f.attempt, f.reviewPath, '--run'), f.manifest)
    const mutations = [
      x => {
        x.review.judgment = 'REVISE'
      },
      x => {
        x.review.scope = 'foreign'
      },
      x => {
        x.review.controllerExecutionAuthorized = false
      },
      x => {
        x.review.allowedCases = ['other']
      },
      x => {
        x.review.attemptDirectory = '/foreign'
      },
      x => {
        x.manifest.controller.filename = '/foreign'
      },
      x => {
        x.manifest.migrations = 92
      },
      x => {
        x.manifest.ownerBundle.sha256 = 'f'.repeat(64)
      },
      x => {
        x.manifest.nativeScript.bytes++
      },
    ]
    for (const mutate of mutations) {
      const x = packetFixture()
      try {
        process.argv = x.invocation
        mutate(x)
        x.publish()
        assert.throws(() => verify(x.packet, x.attempt, x.reviewPath, '--run'))
      } finally {
        rmSync(x.directory, { recursive: true })
      }
    }
  } finally {
    process.argv = oldArgv
    process.execArgv = oldExecArgv
    rmSync(f.directory, { recursive: true })
  }
})
