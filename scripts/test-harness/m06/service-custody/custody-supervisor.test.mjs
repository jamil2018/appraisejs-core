// Actual inert supervisor responsibilities. No child or database execution.
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  decideServiceTerminalClosure,
  publishServiceTerminalDecision,
  reportServiceSupervisorStop,
} from './custody-supervisor-terminal.ts'
import { routeServiceOwnerMessage, classifyServiceCase } from './custody-supervisor-routing.ts'
import { encodeFixtureTerminalCallbackReceipt } from './custody-fixture-terminal-receipt.ts'

const identity = {
  case: 'inert',
  pid: 1234,
  nonce: '00000000-0000-0000-0000-000000000000',
  ownerScript: '/inert/owner-bundle.mjs',
  expectedFixtureSha256: 'a'.repeat(64),
  nativePid: 2345,
}
function terminalState(type = 'case-retained') {
  const terminal = { type, sequence: 3 },
    terminalHandoff = { type: 'terminal-handoff', sequence: 4 }
  return {
    settled: false,
    terminalAckDelivered: true,
    terminalHandoff,
    ownerDisconnected: true,
    terminal,
    knownExit: undefined,
  }
}
function withDirectory(action) {
  const workspace = mkdtempSync(path.join(tmpdir(), 'custody-supervisor-inert-'))
  try {
    return action(workspace)
  } finally {
    rmSync(workspace, { recursive: true })
  }
}
function writeCommit(workspace, state) {
  const { encoded } = encodeFixtureTerminalCallbackReceipt({
    case: identity.case,
    pid: identity.pid,
    nonce: identity.nonce,
    ownerScript: identity.ownerScript,
    expectedFixtureSha256: identity.expectedFixtureSha256,
    terminalType: state.terminal.type,
    terminalSequence: state.terminal.sequence,
    handoffSequence: state.terminalHandoff.sequence,
  })
  writeFileSync(path.join(workspace, 'owner-terminal-callback-commit.json'), encoded)
}
function terminalEffects(workspace) {
  const calls = [],
    retained = [],
    child = {
      unref() {
        assert.equal(this, child)
        calls.push('unref')
      },
      stdout: {
        destroy() {
          calls.push('stdout')
        },
      },
      stderr: {
        destroy() {
          calls.push('stderr')
        },
      },
    }
  return {
    calls,
    retained,
    child,
    workspace,
    assertActive() {
      calls.push('active')
    },
    assertRetainedCase(name) {
      assert.equal(name, identity.case)
      calls.push('retained-case')
    },
    complete() {
      calls.push('complete')
    },
  }
}

test('complete terminal descriptor retains exact original refs and refuses every missing custody prerequisite', () => {
  const state = terminalState(),
    decision = decideServiceTerminalClosure(state, identity, () => {})
  assert.equal(decision.terminal, state.terminal)
  assert.equal(decision.handoff, state.terminalHandoff)
  assert.ok(Object.isFrozen(decision))
  assert.ok(Object.isFrozen(decision.identity))
  for (const mutation of [
    { settled: true },
    { terminalAckDelivered: false },
    { terminalHandoff: undefined },
    { ownerDisconnected: false },
  ]) {
    let active = 0
    assert.equal(
      decideServiceTerminalClosure({ ...state, ...mutation }, identity, () => active++),
      undefined,
    )
    assert.equal(active, 0)
  }
  const closed = terminalState('case-known-closed')
  assert.equal(
    decideServiceTerminalClosure(closed, identity, () => {}),
    undefined,
  )
  assert.throws(() =>
    decideServiceTerminalClosure(
      { ...state, terminal: { type: 'foreign' }, knownExit: { code: 0, signal: null } },
      identity,
      () => {},
    ),
  )
  const cause = new Error('first STOP')
  assert.throws(
    () =>
      decideServiceTerminalClosure(state, identity, () => {
        throw cause
      }),
    error => error === cause,
  )
})
test('actual retained publication requires callback commit and rechecks STOP before detach/resolve', () =>
  withDirectory(workspace => {
    const state = terminalState(),
      decision = decideServiceTerminalClosure(state, identity, () => {}),
      effects = terminalEffects(workspace)
    assert.throws(() => publishServiceTerminalDecision(decision, effects), /Missing owner callback/)
    assert.deepEqual(effects.calls, [])
    writeCommit(workspace, state)
    publishServiceTerminalDecision(decision, effects)
    assert.deepEqual(effects.calls, ['active', 'retained-case', 'unref', 'stdout', 'stderr', 'complete'])
    const record = JSON.parse(readFileSync(path.join(workspace, 'retained-owner.json')))
    assert.equal(record.callbackCommit.handoffSequence, 4)
    const stopped = terminalEffects(workspace),
      cause = new Error('STOP before publication')
    stopped.assertActive = () => {
      throw cause
    }
    assert.throws(
      () => publishServiceTerminalDecision(decision, stopped),
      error => error === cause,
    )
    assert.equal(stopped.retained.length, 1)
    assert.deepEqual(stopped.calls, [])
  }))
test('actual final failure reread refuses contradictory evidence without positive publication or effects', () =>
  withDirectory(workspace => {
    const state = terminalState()
    writeCommit(workspace, state)
    writeFileSync(
      path.join(workspace, 'owner-failure-latch.json'),
      JSON.stringify({
        ...identity,
        version: 1,
        type: 'failure-retained',
        classification: 'UNEXPECTED_FIXTURE_FAILURE',
        phase: 'original-phase',
        operationPhase: 'actual-phase',
        message: 'first',
        referenceSummary: {},
      }),
    )
    const effects = terminalEffects(workspace),
      decision = decideServiceTerminalClosure(state, identity, () => {})
    assert.throws(() => publishServiceTerminalDecision(decision, effects), /first failure/)
    assert.deepEqual(effects.calls, [])
    assert.equal(effects.retained.length, 0)
  }))
test('known-closed terminal requires genuine exact zero/null exit and never detaches as retained', () =>
  withDirectory(workspace => {
    const state = { ...terminalState('case-known-closed'), knownExit: { code: 0, signal: null } }
    writeCommit(workspace, state)
    const decision = decideServiceTerminalClosure(state, identity, () => {}),
      effects = terminalEffects(workspace)
    publishServiceTerminalDecision(decision, effects)
    assert.deepEqual(effects.calls, ['active', 'complete'])
    for (const exit of [
      { code: 1, signal: null },
      { code: 0, signal: 'SIGKILL' },
    ]) {
      const rejected = terminalEffects(workspace)
      assert.throws(() => publishServiceTerminalDecision({ ...decision, knownExit: exit }, rejected))
      assert.deepEqual(rejected.calls, ['active'])
    }
  }))
function routing() {
  const state = {
      pid: 1234,
      case: 'inert',
      nonce: identity.nonce,
      ownerStarted: false,
      databasePath: '/inert/canonical.db',
      lastOwnerSequence: 0,
      acceptingMessages: true,
    },
    calls = []
  const effects = {
    append: value => calls.push(['append', value]),
    failure: value => calls.push(['failure', value]),
    handoff: value => calls.push(['handoff', value]),
    nativeReady: value => calls.push(['native', value]),
    bindExpected: value => calls.push(['bind', value]),
    crash: value => calls.push(['crash', value]),
    terminal: value => calls.push(['terminal', value]),
  }
  const start = {
    type: 'owner-start',
    databasePath: '/inert/canonical.db',
    pid: 1234,
    case: 'inert',
    nonce: identity.nonce,
    sequence: 1,
  }
  return {
    state,
    calls,
    effects,
    start,
    send(value) {
      routeServiceOwnerMessage(value, state, effects)
    },
  }
}
test('whole authenticated envelope routes original refs in order and failure precedes sequence check', () => {
  const x = routing()
  x.send(x.start)
  assert.equal(x.state.nonce, identity.nonce)
  assert.equal(x.state.lastOwnerSequence, 1)
  assert.deepEqual(
    x.calls.map(([name]) => name),
    ['append', 'native', 'bind'],
  )
  assert.equal(x.calls[1][1], x.start)
  const terminal = { ...x.start, type: 'case-retained', sequence: 2 }
  x.send(terminal)
  assert.equal(x.calls.at(-1)[0], 'terminal')
  assert.equal(x.calls.at(-1)[1], terminal)
  x.send({ ...x.start, type: 'failure-retained', message: 'first', sequence: undefined })
  assert.equal(x.calls.at(-1)[0], 'failure')
  assert.equal(x.state.lastOwnerSequence, 2)
  const crash = { ...x.start, type: 'crash-ready', sequence: 3 }
  x.send(crash)
  assert.equal(x.calls.at(-1)[0], 'crash')
})
test('whole message admission refuses malformed, foreign, duplicate and out-of-state envelopes', () => {
  for (const bad of [
    undefined,
    {},
    { type: 'owner-start', pid: 2 },
    { type: 'owner-start', pid: 1234, case: 'foreign' },
    { type: 'owner-start', pid: 1234, case: 'inert', nonce: 'bad' },
  ])
    assert.throws(() => routing().send(bad))
  const x = routing()
  x.send(x.start)
  assert.throws(() => x.send(x.start))
  assert.throws(() => x.send({ ...x.start, type: 'event', sequence: 1 }))
  assert.throws(() => x.send({ ...x.start, type: 'event', nonce: 'foreign', sequence: 2 }))
  x.state.acceptingMessages = false
  const handoff = { ...x.start, type: 'terminal-handoff', sequence: 3 }
  x.send(handoff)
  assert.equal(x.calls.at(-1)[0], 'handoff')
  assert.equal(x.calls.at(-1)[1], handoff)
  assert.throws(() => x.send({ ...handoff, type: 'event', sequence: 4 }))
  assert.throws(() => routing().send({ ...x.start, padding: 'x'.repeat(128 * 1024) }))
})
test('STOP evidence retains original references before reporting and preserves errors across all independent effects', () =>
  withDirectory(workspace => {
    const calls = [],
      diagnostics = [],
      retained = [],
      cause = {
        toString() {
          assert.equal(retained[1], cause)
          calls.push('format')
          throw new Error('formatter')
        },
      },
      child = {
        pid: 1234,
        connected: true,
        disconnect() {
          calls.push('disconnect')
          throw new Error('disconnect')
        },
        unref() {
          calls.push('unref')
          throw new Error('unref')
        },
        stdout: {
          destroy() {
            calls.push('stdout')
            throw new Error('stdout')
          },
        },
        stderr: {
          destroy() {
            calls.push('stderr')
            throw new Error('stderr')
          },
        },
      }
    const deadline = setTimeout(() => {}, 1000),
      terminal = {},
      handoff = {}
    let rejection
    const scope = {
      child,
      terminal,
      handoff,
      diagnostics,
      retained,
      alreadySettled: false,
      deadline,
      workspace,
      nativePid: 2345,
      nonce: identity.nonce,
      case: 'inert',
      reject(error) {
        rejection = error
      },
    }
    reportServiceSupervisorStop(cause, scope)
    assert.equal(rejection, cause)
    assert.deepEqual(retained, [child, cause, terminal, handoff, diagnostics])
    assert.deepEqual(calls, ['format', 'disconnect', 'unref', 'stdout', 'stderr'])
    assert.equal(diagnostics.length, 5)
    reportServiceSupervisorStop(cause, { ...scope, alreadySettled: true })
    assert.equal(retained.length, 10)
    assert.equal(calls.length, 5)
  }))
test('case families do not admit retained complements or ambiguous owners to exited inspection', () => {
  const ambiguous = new Set(['activation-unknown']),
    complements = { retired: 'classification' }
  assert.equal(classifyServiceCase('activation-unknown', ambiguous, complements), 'retained-ambiguous')
  assert.equal(classifyServiceCase('retired', ambiguous, complements), 'retained-complement')
  assert.equal(classifyServiceCase('positive', ambiguous, complements), 'exited-recovery')
})

// 16y: actual preallocated SERVICE registry and installed matcher implementation. No owner/client effects.
import {
  createServiceSupervisorRegistry,
  reserveServiceOwnerSlot,
  launchServiceOwner,
  failServiceSupervisor,
  markServiceCaseAssertionsPassed,
  releaseServiceSupervisorRegistry,
} from './custody-service-supervision.ts'
import { serviceOwnerNonce, createServiceOwnerLifetime } from './custody-owner-bootstrap.ts'
import { assertServiceParentIdentity, awaitServiceParentIdentity } from './custody-service-parent-identity.ts'
import { createServiceMatrixExpect } from './custody-service-expect.ts'
import { createServiceMatrix, freshRemainingServiceCases, serviceCases } from './custody-service-matrix.ts'

function supervisionFixture() {
  const calls = [],
    child = {
      pid: 321,
      spawnargs: ['/inert/node', '/inert/owner.mjs', 'inert', '/inert/case', '/inert/native.mjs', identity.nonce],
    },
    effects = {
      fork(script, args, options) {
        calls.push(['fork', script, args, options])
        return child
      },
      setInterval(callback, delay) {
        calls.push(['interval', callback, delay])
        return { original: true }
      },
      clearInterval(value) {
        calls.push(['clear', value])
      },
      writeFileSync(...args) {
        calls.push(['write', ...args])
      },
    }
  const registry = createServiceSupervisorRegistry(['inert'], effects),
    specification = {
      executable: '/inert/node',
      script: '/inert/owner.mjs',
      args: ['inert', '/inert/case', '/inert/native.mjs', identity.nonce],
      cwd: '/inert',
      environment: { PATH: '/inert', DATABASE_URL: 'file:/inert/case/canonical.db' },
      case: 'inert',
      workspace: '/inert/case',
      nativeScript: '/inert/native.mjs',
      nonce: identity.nonce,
    }
  const slot = reserveServiceOwnerSlot(registry, specification)
  return { calls, child, effects, registry, specification, slot }
}
test('actual SERVICE original child occupies its preallocated slot before throwing pid/spawnargs/publication effects', () => {
  for (const stage of ['pid', 'spawnargs', 'write']) {
    const x = supervisionFixture(),
      cause = new Error(stage)
    const throwAfterCapture = () => {
      assert.equal(x.slot.child, x.child)
      throw cause
    }
    if (stage === 'write') x.effects.writeFileSync = throwAfterCapture
    else Object.defineProperty(x.child, stage, { get: throwAfterCapture })
    assert.throws(
      () => launchServiceOwner(x.registry, x.slot, 123, x.effects),
      error => error === cause,
    )
    assert.equal(x.registry.failed, true)
    assert.equal(x.registry.firstError, cause)
    assert.equal(x.slot.child, x.child)
    assert.equal(x.slot.launchFailed, true)
    assert.throws(
      () => releaseServiceSupervisorRegistry(x.registry, () => assert.fail('no finalization'), x.effects),
      error => error === cause,
    )
    assert.equal(
      x.calls.some(row => row[0] === 'clear'),
      false,
    )
    assert.equal(x.calls.filter(row => row[0] === 'fork').length, 1)
  }
})
test('actual undefined first launch cause survives secondary reporting and forbids successor/release', () => {
  const x = supervisionFixture()
  x.effects.fork = () => {
    throw undefined
  }
  let caught = false
  try {
    launchServiceOwner(x.registry, x.slot, 123, x.effects)
  } catch (error) {
    caught = true
    assert.equal(error, undefined)
  }
  assert.equal(caught, true)
  assert.equal(x.registry.failed, true)
  failServiceSupervisor(x.registry, x.slot, 'later', new Error('later'))
  assert.equal(x.registry.firstError, undefined)
  assert.equal(x.registry.firstStage, 'FORK')
  assert.throws(
    () => reserveServiceOwnerSlot(x.registry, x.specification),
    error => error === undefined,
  )
  assert.equal(
    x.calls.some(row => row[0] === 'clear'),
    false,
  )
})
test('actual successful main registry cannot release before complete original disposition, assertions and final failure checks', () => {
  const x = supervisionFixture()
  assert.equal(launchServiceOwner(x.registry, x.slot, 123, x.effects), x.child)
  assert.equal(x.slot.identityPublished, true)
  const record = JSON.parse(x.calls.find(row => row[0] === 'write')[2])
  assert.deepEqual(record.expectedArgv, x.child.spawnargs)
  assert.equal(record.nonce, identity.nonce)
  assert.throws(() => markServiceCaseAssertionsPassed(x.registry, x.slot, {}))
  x.slot.disposition = 'AUTHENTICATED_TERMINAL'
  markServiceCaseAssertionsPassed(x.registry, x.slot, { original: true })
  let rechecked = false
  releaseServiceSupervisorRegistry(
    x.registry,
    slot => {
      assert.equal(slot, x.slot)
      assert.equal(
        x.calls.some(row => row[0] === 'clear'),
        false,
      )
      rechecked = true
    },
    x.effects,
  )
  assert.equal(rechecked, true)
  assert.equal(x.registry.released, true)
  assert.equal(x.calls.filter(row => row[0] === 'clear').length, 1)
  const y = supervisionFixture()
  launchServiceOwner(y.registry, y.slot, 123, y.effects)
  y.slot.disposition = 'AUTHENTICATED_TERMINAL'
  markServiceCaseAssertionsPassed(y.registry, y.slot, {})
  const cause = new Error('final failure')
  assert.throws(
    () =>
      releaseServiceSupervisorRegistry(
        y.registry,
        () => {
          throw cause
        },
        y.effects,
      ),
    error => error === cause,
  )
  assert.equal(
    y.calls.some(row => row[0] === 'clear'),
    false,
  )
})
test('actual failed supervisor STOP retains child IPC/streams and rejects original cause without detach', () =>
  withDirectory(workspace => {
    const calls = [],
      cause = new Error('original'),
      child = {
        get pid() {
          throw cause
        },
        get connected() {
          assert.fail('must not inspect IPC for failed launch')
        },
        disconnect() {
          assert.fail('detach')
        },
        unref() {
          assert.fail('unref')
        },
        get stdout() {
          assert.fail('stream')
        },
        get stderr() {
          assert.fail('stream')
        },
      }
    const deadline = setTimeout(() => {}, 1000),
      retained = [],
      diagnostics = []
    reportServiceSupervisorStop(cause, {
      child,
      terminal: undefined,
      handoff: undefined,
      diagnostics,
      retained,
      alreadySettled: false,
      retainResources: true,
      deadline,
      workspace,
      nativePid: undefined,
      nonce: identity.nonce,
      case: 'inert',
      reject: value => calls.push(value),
    })
    assert.equal(retained[0], child)
    assert.equal(calls[0], cause)
    assert.equal(diagnostics[0], cause)
  }))
test('current, legacy and original fault vectors require the exact same preowned canonical argv5 nonce', () => {
  for (const script of ['owner-bundle.mjs', 'legacy-owner-bundle.mjs'])
    assert.equal(serviceOwnerNonce(['/node', script, 'case', '/workspace', '/native', identity.nonce]), identity.nonce)
  for (const tail of [undefined, 'INERT', identity.nonce.toUpperCase(), identity.nonce + '-suffix']) {
    if (tail === identity.nonce) continue
    const argv = ['/node', '/owner', 'case', '/workspace', '/native']
    if (tail !== undefined) argv.push(tail)
    assert.throws(() => serviceOwnerNonce(argv))
  }
  assert.throws(() => serviceOwnerNonce(['/node', '/owner', 'case', '/workspace', '/native', identity.nonce, 'extra']))
  const retained = [],
    intervals = []
  const boot = createServiceOwnerLifetime(
    retained,
    () => true,
    () => {},
    (callback, delay) => {
      intervals.push({ callback, delay })
      return { original: true }
    },
  )
  assert.equal(intervals.length, 1)
  assert.equal(intervals[0].delay, 60000)
  assert.equal(boot.admission.currentPhase, 'owner-initialization')
})
test('actual pre-owner rendezvous has no deadline and no child admission before exact original OS identity', async () => {
  const x = supervisionFixture(),
    expected = {
      pid: 123,
      executable: '/inert/node',
      argv: ['/inert/node', '/inert/controller.mjs'],
      cwd: '/inert',
      identityFilename: '/inert/supervisor-identity.json',
    }
  let value, releasePause
  const pending = awaitServiceParentIdentity(x.registry, expected.identityFilename, expected, {
    read: () => value,
    pause: () =>
      new Promise(resolve => {
        releasePause = resolve
      }),
  })
  assert.equal(x.calls.filter(row => row[0] === 'fork').length, 0)
  assert.equal(x.calls.filter(row => row[0] === 'clear').length, 0)
  value = { version: 1, type: 'service-os-parent-identity', ...expected }
  releasePause()
  await pending
  for (const change of [
    v => {
      v.pid++
    },
    v => {
      v.argv.push('extra')
    },
    v => {
      v.identityFilename = '/foreign'
    },
    v => {
      v.extra = true
    },
    v => {
      v.executable = '/foreign'
    },
  ]) {
    const bad = structuredClone(value)
    change(bad)
    assert.throws(() => assertServiceParentIdentity(bad, expected))
  }
  const y = supervisionFixture()
  await assert.rejects(
    awaitServiceParentIdentity(y.registry, expected.identityFilename, expected, {
      read: () => ({ ...value, pid: 999 }),
      pause: () => assert.fail('no retry of malformed identity'),
    }),
  )
  assert.equal(y.registry.failed, true)
})
const installedMatrixExpect = createServiceMatrixExpect()
const matrixMatcherPairs = [
  ['toBe', () => installedMatrixExpect(1).toBe(1), () => installedMatrixExpect(1).toBe(2)],
  ['not.toBe', () => installedMatrixExpect(1).not.toBe(2), () => installedMatrixExpect(1).not.toBe(1)],
  ['toBeNull', () => installedMatrixExpect(null).toBeNull(), () => installedMatrixExpect(1).toBeNull()],
  ['not.toBeNull', () => installedMatrixExpect(1).not.toBeNull(), () => installedMatrixExpect(null).not.toBeNull()],
  [
    'toBeUndefined',
    () => installedMatrixExpect(undefined).toBeUndefined(),
    () => installedMatrixExpect(null).toBeUndefined(),
  ],
  ['toHaveLength', () => installedMatrixExpect([1]).toHaveLength(1), () => installedMatrixExpect([]).toHaveLength(1)],
  [
    'toBeGreaterThan',
    () => installedMatrixExpect(2).toBeGreaterThan(1),
    () => installedMatrixExpect(1).toBeGreaterThan(1),
  ],
  [
    'toBeGreaterThanOrEqual',
    () => installedMatrixExpect(1).toBeGreaterThanOrEqual(1),
    () => installedMatrixExpect(0).toBeGreaterThanOrEqual(1),
  ],
  [
    'toBeLessThanOrEqual',
    () => installedMatrixExpect(1).toBeLessThanOrEqual(1),
    () => installedMatrixExpect(2).toBeLessThanOrEqual(1),
  ],
  [
    'toMatch',
    () => installedMatrixExpect('original').toMatch(/^original$/),
    () => installedMatrixExpect('foreign').toMatch(/^original$/),
  ],
  [
    'toEqual',
    () => installedMatrixExpect({ a: [1] }).toEqual({ a: [1] }),
    () => installedMatrixExpect({ a: [2] }).toEqual({ a: [1] }),
  ],
  [
    'toMatchObject',
    () => installedMatrixExpect({ a: 1, b: 2 }).toMatchObject({ a: 1 }),
    () => installedMatrixExpect({ a: 2 }).toMatchObject({ a: 1 }),
  ],
  [
    'any(Number)',
    () => installedMatrixExpect({ n: 1 }).toEqual({ n: installedMatrixExpect.any(Number) }),
    () => installedMatrixExpect({ n: '1' }).toEqual({ n: installedMatrixExpect.any(Number) }),
  ],
  [
    'any(String)',
    () => installedMatrixExpect('id').toEqual(installedMatrixExpect.any(String)),
    () => installedMatrixExpect(1).toEqual(installedMatrixExpect.any(String)),
  ],
]
for (const [name, positive, negative] of matrixMatcherPairs)
  test(`installed actual matrix matcher ${name} accepts and rejects`, () => {
    positive()
    assert.throws(negative)
  })

test('fresh controller selection is exactly remaining17 and excludes the original9 history', () => {
  assert.equal(freshRemainingServiceCases.length, 17)
  assert.equal(new Set(freshRemainingServiceCases).size, 17)
  assert.deepEqual(
    serviceCases.filter(name => !freshRemainingServiceCases.includes(name)),
    [
      'positive',
      'late-writer',
      'lost-reply',
      'callback-throw',
      'timeout',
      'early-revoke',
      'paused-send',
      'pre-hold-dispose',
      'negative-inputs',
    ],
  )
})

// These inert values exercise the original extracted assertion bodies. They are not authority proof.
const inertProofs = Object.freeze({
  canonicalContractJson: value => JSON.stringify(value),
  assertCommittedProviderSourceReplay: () => assert.fail('not a committed authority case'),
  assertProviderReceiptCanonicalIdentity: () => assert.fail('not a committed authority case'),
  providerReconciliationRequestHash: () => assert.fail('not a committed authority case'),
})
function inertMatrix(effects = {}) {
  const calls = []
  const matrix = createServiceMatrix(installedMatrixExpect, ['legacy-fs-valid-fresh-refusal'], inertProofs, {
    fs: {},
    fork: () => assert.fail('no real owner'),
    execFileSync: () => assert.fail('no real process'),
    randomUUID: () => identity.nonce,
    process: {
      pid: 123,
      execPath: '/inert/node',
      env: {},
      cwd: () => '/inert',
      kill: () => assert.fail('no process lookup'),
    },
    setInterval: (_, delay) => {
      calls.push(['interval', delay])
      return 'original-main-anchor'
    },
    clearInterval: value => calls.push(['clear', value]),
    setTimeout: () => assert.fail('no deadline before fork'),
    clearTimeout: () => {},
    ...effects,
  })
  return { matrix, calls }
}
function legacyInertRecovery() {
  const originalRun = { status: 'ARMED', terminalReconciledAt: null, terminalRetentionAt: null }
  const originalIntent = { status: 'ARMED', acknowledgedAt: null, invalidatedAt: null, reconciledAt: null }
  const expected = {
    profile: 'GENUINE_LEGACY_FS',
    identity: {
      runId: 'run',
      journeyId: 'journey',
      targetProjectId: 'project',
      providerNamespace: 'namespace',
      configurationDigest: 'configuration',
      intentId: 'intent',
      sendBoundaryId: 'send',
      claimEpoch: 1,
    },
    originalRun,
    originalIntent,
    originalTemporal: { run: {}, intent: {}, reservedAt: 10 },
    turnsReserved: 1,
    frozenTurnCap: 3,
    canonicalGateEntries: 0,
  }
  const result = {
    ownerGone: true,
    profile: 'GENUINE_LEGACY_FS',
    counts: { journeys: 1, slots: 1, runs: 1, intents: 1, sources: 0, observations: 0, ledger: 0 },
    state: [],
    ledger: [],
    observations: [],
    hub: { id: 'HUB', providerRunId: 'run', intentId: 'intent', sendBoundaryId: 'send', version: 1, reservedAt: 10 },
    runs: [
      {
        ...originalRun,
        id: 'run',
        journeyId: 'journey',
        targetProjectId: 'project',
        providerNamespace: 'namespace',
        configurationDigest: 'configuration',
        turnsReserved: 1,
      },
    ],
    intents: [
      {
        ...originalIntent,
        id: 'intent',
        providerRunId: 'run',
        sendBoundaryId: 'send',
        providerNamespace: 'namespace',
        claimEpoch: 1,
      },
    ],
    integrity: [{ integrity_check: 'ok' }],
    foreignKeys: [],
  }
  return { expected, result }
}
test('actual extracted legacy and exited-owner assertions accept and reject inert representative rows', () => {
  const { matrix } = inertMatrix()
  const { expected, result } = legacyInertRecovery()
  matrix.assertions.assertLegacyRecovered('legacy-fs-valid-fresh-refusal', result, expected)
  matrix.assertions.assertExitedOwnerRecovery('legacy-fs-valid-fresh-refusal', result, true, expected)
  for (const change of [
    value => {
      value.ownerGone = false
    },
    value => {
      value.counts.sources = 1
    },
    value => {
      value.hub.providerRunId = 'foreign'
    },
    value => {
      value.intents[0].claimEpoch = 2
    },
    value => {
      value.runs[0].terminalRetentionAt = 20
    },
    value => {
      value.integrity[0].integrity_check = 'corrupt'
    },
  ]) {
    const bad = structuredClone(result)
    change(bad)
    assert.throws(() =>
      matrix.assertions.assertExitedOwnerRecovery('legacy-fs-valid-fresh-refusal', bad, true, expected),
    )
  }
})
test('actual extracted current occupied-source assertions accept and reject inert representative rows', () => {
  const { matrix } = inertMatrix()
  const { expected, result } = legacyInertRecovery()
  Object.assign(expected.identity, {
    sourceId: 'source',
    sourceIncarnation: 'incarnation',
    identityJson: '{}',
    protocolDigest: 'protocol',
    qualificationDigest: 'qualification',
  })
  Object.assign(expected, {
    control: { sourceId: 'control-source', intentId: 'control-intent', ordinal: 2, providerNamespace: 'namespace' },
    controlSource: { sourceId: 'control-source' },
    occupiedJourneyVersion: 1,
    postCommitControls: 0,
  })
  const state = {
    sourceId: 'source',
    sourceIncarnation: 'incarnation',
    providerRunId: 'run',
    intentId: 'intent',
    providerNamespace: 'namespace',
    identityJson: '{}',
    protocolDigest: 'protocol',
    qualificationDigest: 'qualification',
    sequence: 1,
    byteCount: 10,
    committedObservationId: null,
    committedRequestHash: null,
  }
  for (const field of [
    'pendingBatchId',
    'pendingBatchStartHead',
    'pendingBatchRecordAllowance',
    'pendingBatchByteAllowance',
    'pendingBatchRequestDigest',
  ])
    state[field] = null
  expected.occupiedSource = structuredClone(state)
  Object.assign(result.counts, { intents: 2, sources: 2, ledger: 1 })
  result.state = [state, { sourceId: 'control-source' }]
  result.ledger = [{ sourceId: 'source', count: 1, first: 1, last: 1, byteCount: 10 }]
  result.journeys = [{ id: 'journey', targetProjectId: 'project', ownershipVersion: 1 }]
  Object.assign(result.runs[0], { threadId: null })
  Object.assign(expected.originalRun, { threadId: null })
  Object.assign(result.intents[0], { turnOrdinal: 1, threadId: null, turnId: null })
  Object.assign(expected.originalIntent, { threadId: null, turnId: null })
  result.intents.push({
    id: 'control-intent',
    providerRunId: 'run',
    turnOrdinal: 2,
    providerNamespace: 'namespace',
    sendBoundaryId: null,
    status: 'PENDING',
    claimEpoch: 0,
    claimOwner: null,
    acknowledgedAt: null,
    reconciledAt: null,
  })
  matrix.assertions.assertRecovered('pre-hold-dispose', result, expected)
  for (const change of [
    value => {
      value.state[0].sourceIncarnation = 'foreign'
    },
    value => {
      value.state[0].pendingBatchId = 'unexpected'
    },
    value => {
      value.intents[1].claimOwner = 'foreign'
    },
    value => {
      value.journeys[0].ownershipVersion = 2
    },
    value => {
      value.ledger[0].byteCount = 11
    },
    value => {
      value.hub.version = 2
    },
  ]) {
    const bad = structuredClone(result)
    change(bad)
    assert.throws(() => matrix.assertions.assertRecovered('pre-hold-dispose', bad, expected))
  }
})
test('actual matrix initialization failure retains original anchor and undefined first cause without a fork', () => {
  let forks = 0
  const { matrix, calls } = inertMatrix({
    fs: {
      mkdirSync: () => {
        throw undefined
      },
    },
    fork: () => {
      forks++
      assert.fail('no owner before manifest success')
    },
  })
  let caught = false
  try {
    matrix.initializeManifest()
  } catch (error) {
    caught = true
    assert.equal(error, undefined)
  }
  assert.equal(caught, true)
  assert.equal(matrix.diagnostics().failed, true)
  assert.equal(matrix.diagnostics().firstStage, 'MANIFEST_INITIALIZATION')
  matrix.fail(new Error('secondary'))
  assert.equal(matrix.diagnostics().firstError, undefined)
  assert.throws(() => matrix.releaseAfterFinalAssertions())
  assert.deepEqual(calls, [['interval', 60000]])
  assert.equal(forks, 0)
})

import * as inertFs from 'node:fs'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('actual whole matrix case uses preowned nonce, callback proof, original assertions and final release with inert child', async () => {
  const root = inertFs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'))
  const artifactRoot = path.join(root, '.appraisejs/custody-service-tests')
  inertFs.mkdirSync(artifactRoot, { recursive: true })
  const directory = inertFs.mkdtempSync(path.join(artifactRoot, 'inert-whole-matrix-'))
  const calls = []
  let matrix, child, specification
  try {
    const bundle = path.join(directory, 'owner-bundle.mjs')
    const legacyBundle = path.join(directory, 'legacy-owner-bundle.mjs')
    inertFs.writeFileSync(bundle, '// inert bytes only; never executed\n')
    inertFs.writeFileSync(legacyBundle, '// inert legacy bytes only; never executed\n')
    const harness = path.join(root, 'scripts/test-harness/m06/service-custody')
    const nativeScript = path.join(harness, 'custody-native-contender.mjs')
    const inspectorScript = path.join(harness, 'custody-inspect-after-exit.mjs')
    const hash = filename => createHash('sha256').update(inertFs.readFileSync(filename)).digest('hex')
    const inputs = [
      path.join(root, 'src/services/coordinator/quality-journey-provider-run-service.ts'),
      ...[
        'custody-service-owner.ts',
        'custody-native-contender.mjs',
        'custody-inspect-after-exit.mjs',
        'custody-service-matrix.ts',
        'custody-supervisor-routing.ts',
        'custody-supervisor-terminal.ts',
        'custody-service-supervision.ts',
        'custody-service-parent-identity.ts',
        'custody-service-expect.ts',
        'custody-owner-bootstrap.ts',
      ].map(name => path.join(harness, name)),
    ].map(filename => ({ filename, sha256: hash(filename) }))
    const manifest = {
      version: 1,
      root,
      bundle,
      bundleSha256: hash(bundle),
      legacyBundle,
      legacyBundleSha256: hash(legacyBundle),
      generated: '/inert/not-imported-client.js',
      nativeScript,
      inspectorScript,
      inputs,
    }
    inertFs.writeFileSync(path.join(directory, 'owner-manifest.json'), JSON.stringify(manifest))
    const { expected, result } = legacyInertRecovery()
    const fixture = inertMatrix({
      fs: {
        ...inertFs,
        mkdtempSync: prefix =>
          inertFs.mkdtempSync(prefix.includes('verify-build-') ? path.join(directory, 'verify-') : prefix),
      },
      process: {
        pid: 123,
        execPath: '/inert/node',
        argv: ['/inert/node', '/inert/controller'],
        env: {
          PATH: '/inert',
          CUSTODY_SERVICE_OWNER_BUNDLE: bundle,
          CUSTODY_SERVICE_EVIDENCE: path.join(directory, 'cases'),
        },
        cwd: () => root,
        kill: () => assert.fail('no process lookup'),
      },
      execFileSync: (_executable, argv) => {
        if (argv[0].endsWith('build-custody-service-owner.mjs')) {
          calls.push('static-builder-effect')
          inertFs.writeFileSync(path.join(argv[1], 'owner-manifest.json'), JSON.stringify(manifest))
          return Buffer.from('')
        }
        assert.equal(argv[0], inspectorScript)
        calls.push('inspector-effect')
        return JSON.stringify(result)
      },
      fork: (script, args, options) => {
        specification = matrix.diagnostics().slots[0].specification
        assert.equal(specification.script, script)
        assert.deepEqual(specification.args, args)
        assert.equal(args[3], identity.nonce)
        child = new EventEmitter()
        child.pid = 1234
        child.spawnargs = [options.execPath, script, ...args]
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.unref = () => assert.fail('closed child must not be detached')
        child.kill = () => assert.fail('no crash in this case')
        const scope = {
          case: args[0],
          pid: child.pid,
          nonce: args[3],
          ownerScript: script,
          terminalType: 'case-known-closed',
          terminalSequence: 2,
          handoffSequence: 3,
        }
        Object.assign(expected, {
          version: 1,
          case: args[0],
          pid: child.pid,
          nonce: args[3],
          databasePath: path.join(args[1], 'canonical.db'),
        })
        const expectedFile = path.join(args[1], 'expected-fixture.json')
        inertFs.writeFileSync(expectedFile, JSON.stringify(expected))
        scope.expectedFixtureSha256 = hash(expectedFile)
        child.send = (ack, callback) => {
          calls.push('actual-ack')
          assert.equal(ack.nonce, args[3])
          const { encoded } = encodeFixtureTerminalCallbackReceipt(scope)
          inertFs.writeFileSync(path.join(args[1], 'owner-terminal-callback-commit.json'), encoded, { flag: 'wx' })
          callback(null)
          child.emit('message', {
            type: 'terminal-handoff',
            case: args[0],
            pid: child.pid,
            nonce: args[3],
            sequence: 3,
            terminalSequence: 2,
            terminalType: 'case-known-closed',
            expectedFixtureSha256: scope.expectedFixtureSha256,
          })
          child.emit('disconnect')
          child.emit('exit', 0, null)
          return true
        }
        queueMicrotask(() => {
          assert.equal(matrix.diagnostics().slots[0].child, child)
          assert.equal(matrix.diagnostics().slots[0].identityPublished, true)
          child.emit('message', {
            type: 'owner-start',
            case: args[0],
            pid: child.pid,
            nonce: args[3],
            databasePath: expected.databasePath,
            sequence: 1,
          })
          child.emit('message', {
            type: 'case-known-closed',
            case: args[0],
            pid: child.pid,
            nonce: args[3],
            sequence: 2,
            expectedFixtureSha256: scope.expectedFixtureSha256,
          })
        })
        return child
      },
      setTimeout: (_fn, delay) => {
        assert.equal(matrix.diagnostics().slots[0].child, child)
        assert.equal(delay, 60000)
        calls.push('original-deadline-after-fork')
        return 'original-case-deadline'
      },
      clearTimeout: value => {
        assert.equal(value, 'original-case-deadline')
        calls.push('case-deadline-clear')
      },
    })
    matrix = fixture.matrix
    matrix.initializeManifest()
    await matrix.runSelectedCase('legacy-fs-valid-fresh-refusal')
    const slot = matrix.diagnostics().slots[0]
    assert.equal(slot.assertionsPassed, true)
    assert.equal(slot.terminalScope.ownerScript, legacyBundle)
    assert.equal(Object.hasOwn(slot.terminalScope, 'nativePid'), false)
    assert.equal(matrix.diagnostics().released, false)
    matrix.releaseAfterFinalAssertions()
    assert.equal(matrix.diagnostics().released, true)
    assert.deepEqual(fixture.calls, [
      ['interval', 60000],
      ['clear', 'original-main-anchor'],
    ])
    assert.deepEqual(calls, [
      'static-builder-effect',
      'original-deadline-after-fork',
      'actual-ack',
      'case-deadline-clear',
      'inspector-effect',
    ])
  } finally {
    inertFs.rmSync(directory, { recursive: true })
  }
})
test('actual Python driver inert suite uses fake Popen and command effects only', () => {
  const filename = fileURLToPath(new URL('./custody-service-fresh-driver.test.py', import.meta.url))
  const result = spawnSync('/Library/Frameworks/Python.framework/Versions/3.14/bin/python3.14', [filename], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: '1' },
  })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stderr, /Ran 6 tests/)
})
