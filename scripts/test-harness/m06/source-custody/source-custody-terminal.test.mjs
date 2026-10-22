// Real terminal helpers, deferred fake transport events, and actual local JSON publication only.
// No owner/client/product/DB import or launch.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import vm from 'node:vm'
import ts from 'typescript'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createSourceCaseRuntime,
  createSourceFailureReporter,
  createSourceRetainedOwner,
  createSourceRetainedSupervisor,
  assertSourceKnownClosedExit,
} from './source-custody-guard.mjs'
const commitName = 'owner-retention-callback-commit.json'
function harness(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'source-terminal-inert-'))
  t.after(() => rmSync(directory, { recursive: true }))
  const identity = { nonce: 'unit-original-attempt', pid: 303, selected: 'flush-rejection' }
  const messages = [],
    ownerCallbacks = [],
    acks = [],
    ackCallbacks = [],
    failures = [],
    order = []
  let connected = true,
    disconnectError,
    publications = 0,
    control
  const report = createSourceFailureReporter({
    identity,
    write: result =>
      writeFileSync(path.join(directory, 'failure-latched.json'), JSON.stringify(result), { flag: 'wx' }),
    connected: () => false,
    send() {
      throw new Error('No real IPC in unit test')
    },
    sendFailure() {},
  })
  control = createSourceCaseRuntime({ connected: () => connected, report() {}, failed: report })
  const supervisor = createSourceRetainedSupervisor({
    identity,
    directory,
    send(message, callback) {
      acks.push(message)
      ackCallbacks.push(callback)
    },
    failure(error) {
      failures.push(error)
    },
  })
  let owner
  function eof() {
    connected = false
    owner.disconnected()
    supervisor.observeDisconnect()
  }
  owner = createSourceRetainedOwner({
    runtime: control.runtime,
    fail: control.fail,
    identity,
    directory,
    send(message, callback) {
      messages.push(message)
      ownerCallbacks.push(callback)
    },
    disconnect() {
      assert(existsSync(path.join(directory, commitName)), 'Commit publication must precede intended disconnect')
      order.push('disconnect-after-marker')
      if (disconnectError) throw disconnectError
      eof()
    },
  })
  const result = {
    status: 'EXPECTED_RETENTION_LIVENESS_UNVERIFIED',
    ...identity,
    result: { retained: true, facts: 'inert' },
  }
  function throughFinal() {
    owner.start(result)
    supervisor.receive(messages[0])
    owner.receive(acks[0])
    supervisor.receive(messages[1])
  }
  function publish() {
    publications++
    writeFileSync(path.join(directory, 'unit-supervisor-result.json'), 'bounded-success', { flag: 'wx' })
  }
  return {
    identity,
    directory,
    messages,
    ownerCallbacks,
    acks,
    ackCallbacks,
    failures,
    owner,
    supervisor,
    control,
    result,
    throughFinal,
    eof,
    publish,
    order,
    publications: () => publications,
    marker: () => existsSync(path.join(directory, commitName)),
    setDisconnectError(error) {
      disconnectError = error
    },
  }
}
test('actual coupled helpers require successful final callback marker, disconnect and final reconciliation', async t => {
  const h = harness(t)
  h.throughFinal()
  assert.equal(h.marker(), false)
  assert.equal(h.supervisor.state, 'HANDOFF_RECEIVED')
  await Promise.resolve() // Final message was delivered before its actual recorded send callback.
  h.ownerCallbacks[1]()
  assert.equal(h.owner.state, 'DISCONNECTED')
  assert.equal(h.control.runtime.failed, false)
  assert.equal(h.publications(), 0)
  assert.deepEqual(h.order, ['disconnect-after-marker'])
  const result = h.supervisor.complete(h.publish)
  assert.deepEqual(result, h.result)
  assert.equal(h.publications(), 1)
  assert.equal(h.supervisor.state, 'COMPLETED')
  assert.throws(() => h.supervisor.complete(h.publish))
  assert.equal(h.publications(), 1)
})
test('final message then early EOF before callback cannot create marker or positive classification', async t => {
  const h = harness(t)
  h.throughFinal()
  h.eof()
  const first = h.control.state.error
  assert.equal(h.marker(), false)
  assert.throws(() => h.supervisor.complete(h.publish))
  await Promise.resolve()
  h.ownerCallbacks[1]()
  assert.equal(h.marker(), false)
  assert.equal(h.publications(), 0)
  assert.equal(h.control.state.error, first)
})
const callbackFailureScenarios = {
  'callback-error': (h, first) => first,
  disconnected(h) {
    h.eof()
  },
  'prior-failed'(h, first) {
    h.control.fail(first)
  },
}
for (const [mode, prepare] of Object.entries(callbackFailureScenarios))
  test('callback marker authority refuses ' + mode, t => {
    const h = harness(t),
      first = new Error(mode)
    h.throughFinal()
    h.ownerCallbacks[1](prepare(h, first))
    const latched = h.control.state.error
    h.ownerCallbacks[0](new Error('later preliminary callback error'))
    assert.equal(h.control.state.error, latched)
    assert.equal(h.marker(), false)
    assert.throws(() => h.supervisor.complete(h.publish))
    assert.equal(h.publications(), 0)
  })
test('wrong, duplicate and out-of-state ACKs never reach final callback commit', t => {
  const mutations = [
    ack => ({ ...ack, nonce: 'wrong' }),
    ack => ({ ...ack, pid: 999 }),
    ack => ({ ...ack, selected: 'foreign-client' }),
    ack => ({ ...ack, resultDigest: 'wrong' }),
    ack => ({ ...ack, type: 'ACK_KNOWN_CLOSED' }),
    ack => ({ ...ack, extra: true }),
  ]
  for (const mutate of mutations) {
    const h = harness(t)
    h.owner.start(h.result)
    h.supervisor.receive(h.messages[0])
    h.owner.receive(mutate(h.acks[0]))
    assert.equal(h.control.runtime.failed, true)
    assert.equal(h.messages.length, 1)
    assert.equal(h.marker(), false)
  }
  const early = harness(t)
  early.owner.receive({ type: 'ACK_EXPECTED_RETENTION' })
  assert.equal(early.control.runtime.failed, true)
  const duplicate = harness(t)
  duplicate.throughFinal()
  duplicate.owner.receive(duplicate.acks[0])
  duplicate.ownerCallbacks[1]()
  assert.equal(duplicate.control.runtime.failed, true)
  assert.equal(duplicate.marker(), false)
})
const retainedEnvelopeMutations = {
  nonce: value => ({ ...value, nonce: 'stale' }),
  pid: value => ({ ...value, pid: 404 }),
  selected: value => ({ ...value, selected: 'other' }),
  digest: value => ({ ...value, resultDigest: 'bad' }),
  bytes: value => ({ ...value, resultBytes: value.resultBytes + ' ' }),
  extra: value => ({ ...value, extra: true }),
}
for (const [name, mutate] of Object.entries(retainedEnvelopeMutations))
  for (const final of [false, true])
    test('supervisor refuses ' + (final ? 'handoff ' : 'preliminary ') + name, t => {
      const h = harness(t)
      h.owner.start(h.result)
      if (final) {
        h.supervisor.receive(h.messages[0])
        h.owner.receive(h.acks[0])
      }
      h.supervisor.receive(mutate(h.messages[final ? 1 : 0]))
      assert.equal(h.supervisor.failed, true)
      assert.throws(() => h.supervisor.complete(h.publish))
      assert.equal(h.publications(), 0)
    })
test('handoff retains the exact immutable bytes admitted in the preliminary message', t => {
  const immutable = harness(t)
  immutable.owner.start(immutable.result)
  const bytes = immutable.messages[0].resultBytes
  immutable.result.result.facts = 'mutated-after-admission'
  immutable.supervisor.receive(immutable.messages[0])
  immutable.owner.receive(immutable.acks[0])
  assert.equal(immutable.messages[1].resultBytes, bytes)
})
const markerMutations = {
  missing() {},
  malformed: filename => writeFileSync(filename, '{'),
  extra: (filename, receipt) => writeFileSync(filename, JSON.stringify({ ...receipt, extra: true })),
  duplicateNonce: (filename, receipt) =>
    writeFileSync(filename, '{"nonce":"stale",' + JSON.stringify(receipt).slice(1)),
  nonce: (filename, receipt) => writeFileSync(filename, JSON.stringify({ ...receipt, nonce: 'stale' })),
  pid: (filename, receipt) => writeFileSync(filename, JSON.stringify({ ...receipt, pid: 909 })),
  selected: (filename, receipt) => writeFileSync(filename, JSON.stringify({ ...receipt, selected: 'other' })),
  digest: (filename, receipt) => writeFileSync(filename, JSON.stringify({ ...receipt, resultDigest: 'wrong' })),
  callback: (filename, receipt) =>
    writeFileSync(filename, JSON.stringify({ ...receipt, successCallbackObserved: false })),
  oversized: filename => writeFileSync(filename, ' '.repeat(4097)),
  directory: filename => mkdirSync(filename),
}
for (const [name, mutate] of Object.entries(markerMutations))
  test('terminal callback marker refuses ' + name, t => {
    const h = harness(t)
    h.throughFinal()
    h.ownerCallbacks[1]()
    const filename = path.join(h.directory, commitName),
      receipt = JSON.parse(readFileSync(filename, 'utf8'))
    rmSync(filename)
    mutate(filename, receipt)
    assert.throws(() => h.supervisor.complete(h.publish))
    assert.equal(h.supervisor.failed, true)
    assert.equal(h.publications(), 0)
  })
const markerWriteFailures = {
  'preexisting-marker': h => writeFileSync(path.join(h.directory, commitName), '{}'),
  'write-error': h => mkdirSync(path.join(h.directory, commitName)),
  'disconnect-error': (h, error) => h.setDisconnectError(error),
}
for (const [mode, prepare] of Object.entries(markerWriteFailures))
  test('owner first cause survives marker failure ' + mode, t => {
    const h = harness(t),
      error = new Error('disconnect fault')
    h.throughFinal()
    prepare(h, error)
    h.ownerCallbacks[1]()
    const first = h.control.state.error
    assert.equal(h.control.runtime.failed, true)
    if (mode === 'disconnect-error') assert.equal(first, error)
    h.control.fail(new Error('later file/IPC fault'))
    assert.equal(h.control.state.error, first)
    h.eof()
    assert.throws(() => h.supervisor.complete(h.publish))
    assert.equal(h.publications(), 0)
  })
const terminalFailureEvidence = {
  notification: (h, file) => h.supervisor.receive(JSON.parse(readFileSync(file, 'utf8'))),
  durable() {},
  malformed: (h, file) => writeFileSync(file, '{'),
  oversized: (h, file) => writeFileSync(file, ' '.repeat(16385)),
  mismatch(h, file) {
    const failure = JSON.parse(readFileSync(file, 'utf8'))
    failure.nonce = 'wrong'
    writeFileSync(file, JSON.stringify(failure))
  },
  'read-error'(h, file) {
    rmSync(file)
    mkdirSync(file)
  },
}
for (const [mode, mutate] of Object.entries(terminalFailureEvidence))
  test('first-failure evidence wins over callback marker: ' + mode, t => {
    const h = harness(t)
    h.throughFinal()
    h.ownerCallbacks[1]()
    assert.equal(h.marker(), true)
    h.control.fail(new Error('owner first failure after marker'))
    mutate(h, path.join(h.directory, 'failure-latched.json'))
    assert.throws(() => h.supervisor.complete(h.publish))
    assert.equal(h.publications(), 0)
  })
test('ACK error and result-publication failure make supervisor failure terminal', t => {
  const ack = harness(t),
    first = new Error('ACK failed')
  ack.owner.start(ack.result)
  ack.supervisor.receive(ack.messages[0])
  ack.ackCallbacks[0](first)
  ack.supervisor.abort(new Error('later error'))
  assert.equal(ack.supervisor.firstFailure, first)
  assert.throws(() => ack.supervisor.complete(ack.publish))
  const publication = harness(t),
    writeError = new Error('supervisor result write failed')
  publication.throughFinal()
  publication.ownerCallbacks[1]()
  assert.throws(
    () =>
      publication.supervisor.complete(() => {
        throw writeError
      }),
    error => error === writeError,
  )
  assert.equal(publication.supervisor.firstFailure, writeError)
  assert.throws(
    () => publication.supervisor.complete(publication.publish),
    error => error === writeError,
  )
  assert.equal(publication.publications(), 0)
})
test('actual known-closed exit predicate requires original known state and exit0 without a signal', () => {
  assert.doesNotThrow(() => assertSourceKnownClosedExit(true, 0, null))
  for (const tuple of [
    [false, 0, null],
    [true, 1, null],
    [true, 0, 'SIGTERM'],
  ])
    assert.throws(() => assertSourceKnownClosedExit(...tuple))
})

test('a pre-existing matching commit cannot override the exclusive-write first failure', t => {
  const h = harness(t)
  h.throughFinal()
  const { nonce, pid, selected, resultDigest } = h.messages[1]
  writeFileSync(
    path.join(h.directory, commitName),
    JSON.stringify({
      version: 1,
      type: 'OWNER_RETENTION_CALLBACK_COMMIT',
      nonce,
      pid,
      selected,
      resultDigest,
      successCallbackObserved: true,
    }),
  )
  h.ownerCallbacks[1]()
  assert.equal(h.control.state.error.code, 'EEXIST')
  h.eof()
  assert.throws(() => h.supervisor.complete(h.publish), /Observed owner first failure/)
  assert.equal(h.publications(), 0)
})

const controllerText = readFileSync(new URL('./source-custody-controller.mjs', import.meta.url), 'utf8')
const controllerSyntax = ts.createSourceFile('source-controller.mjs', controllerText, ts.ScriptTarget.Latest, true)
const observerText = controllerSyntax.statements
  .find(statement => ts.isFunctionDeclaration(statement) && statement.name.text === 'observeOwner')
  .getText(controllerSyntax)
function extractedObserver(t, selected = 'flush-rejection') {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'source-observer-inert-'))
  t.after(() => rmSync(directory, { recursive: true }))
  const child = new EventEmitter(),
    nonce = 'observer-original',
    callbacks = [],
    acks = []
  child.pid = 505
  child.send = (message, callback) => {
    acks.push(message)
    callbacks.push(callback)
  }
  let detaches = 0,
    timerClears = 0
  const fakeProcess = {}
  const observe = vm.runInNewContext('(' + observerText + ')', {
    assert,
    Buffer,
    createSourceRetainedSupervisor,
    assertSourceKnownClosedExit,
    cases: { 'flush-rejection': { retained: true }, storage: {} },
    write(dir, name, value) {
      writeFileSync(path.join(dir, name), JSON.stringify(value), { flag: 'wx' })
    },
    setTimeout() {
      return 'inert-timer'
    },
    clearTimeout() {
      timerClears++
    },
    detach() {
      detaches++
    },
    controllerProcess: fakeProcess,
  })
  return {
    child,
    nonce,
    directory,
    callbacks,
    acks,
    fakeProcess,
    observation: observe(child, directory, selected, nonce),
    detaches: () => detaches,
    timerClears: () => timerClears,
  }
}
function coupledExtractedOwner(h) {
  const identity = { nonce: h.nonce, pid: h.child.pid, selected: 'flush-rejection' }
  let connected = true
  const control = createSourceCaseRuntime({ connected: () => connected, report() {} })
  const callbacks = [],
    messages = []
  function eof() {
    connected = false
    owner.disconnected()
    h.child.emit('disconnect')
  }
  const owner = createSourceRetainedOwner({
    identity,
    directory: h.directory,
    runtime: control.runtime,
    fail: control.fail,
    send(message, callback) {
      messages.push(message)
      callbacks.push(callback)
    },
    disconnect: eof,
  })
  owner.start({ status: 'EXPECTED_RETENTION_LIVENESS_UNVERIFIED', ...identity, result: { retained: true } })
  h.child.emit('message', messages[0])
  assert.equal(h.detaches(), 0)
  owner.receive(h.acks[0])
  h.child.emit('message', messages[1])
  assert.equal(h.detaches(), 0)
  return { owner, callbacks, control, eof }
}
test('actual extracted observer waits through handoff/disconnect for final marker reconciliation before publication', async t => {
  const h = extractedObserver(t),
    wire = coupledExtractedOwner(h)
  wire.callbacks[1]()
  const ready = await h.observation
  assert.equal(ready.retained, true)
  assert.equal(h.detaches(), 0)
  const resultFile = path.join(h.directory, 'unit-observer-supervisor-result.json')
  assert.equal(existsSync(resultFile), false)
  ready.finalize(() => writeFileSync(resultFile, 'bounded-result', { flag: 'wx' }))
  assert.equal(h.detaches(), 1)
  assert.equal(h.timerClears(), 1)
  h.child.emit('error', new Error('later actual observation'))
  assert.equal(h.fakeProcess.exitCode, 1)
  assert.equal(existsSync(path.join(h.directory, 'owner-late-observation-failure.json')), true)
})
test('actual extracted observer rejects early EOF readiness without callback marker and latches pre-publication file failure', async t => {
  const early = extractedObserver(t),
    wire = coupledExtractedOwner(early)
  wire.eof()
  const ready = await early.observation
  let publications = 0
  assert.throws(
    () =>
      ready.finalize(() => {
        publications++
      }),
    error => error.code === 'ENOENT',
  )
  wire.callbacks[1]()
  assert.equal(publications, 0)
  assert.equal(existsSync(path.join(early.directory, commitName)), false)
  assert.equal(early.fakeProcess.exitCode, 1)
  const report = extractedObserver(t),
    good = coupledExtractedOwner(report)
  good.callbacks[1]()
  const prepared = await report.observation
  writeFileSync(path.join(report.directory, 'owner-status.json'), 'unexpected pre-existing evidence')
  let first
  try {
    prepared.finalize(() => {
      publications++
    })
  } catch (error) {
    first = error
  }
  assert.equal(first.code, 'EEXIST')
  report.child.emit('error', new Error('later fault'))
  assert.throws(
    () =>
      prepared.finalize(() => {
        publications++
      }),
    error => error === first,
  )
  assert.equal(publications, 0)
  assert.equal(report.fakeProcess.exitCode, 1)
})
test('actual extracted observer preserves known-closed requirement for original owner exit0', async t => {
  const h = extractedObserver(t, 'storage')
  let settled = false
  const pending = h.observation.then(value => {
    settled = true
    return value
  })
  h.child.emit('message', { status: 'KNOWN_CLOSED_SOURCE_CASE', pid: h.child.pid, nonce: h.nonce, selected: 'storage' })
  assert.equal(h.acks[0].type, 'ACK_KNOWN_CLOSED')
  h.child.emit('disconnect')
  await Promise.resolve()
  assert.equal(settled, false)
  h.child.emit('exit', 0, null)
  const outcome = await pending
  assert.equal(outcome.retained, false)
  const bad = extractedObserver(t, 'storage')
  const rejected = assert.rejects(bad.observation, /Unexpected owner death/)
  bad.child.emit('exit', 0, null)
  await rejected
})

test('duplicate protocol messages/disconnect and preliminary send error cannot recover into completion', t => {
  const duplicate = harness(t)
  duplicate.owner.start(duplicate.result)
  duplicate.supervisor.receive(duplicate.messages[0])
  duplicate.supervisor.receive(duplicate.messages[0])
  assert.equal(duplicate.supervisor.failed, true)
  assert.throws(() => duplicate.supervisor.complete(duplicate.publish))
  const final = harness(t)
  final.throughFinal()
  final.supervisor.receive(final.messages[1])
  assert.equal(final.supervisor.failed, true)
  const eof = harness(t)
  eof.throughFinal()
  eof.ownerCallbacks[1]()
  eof.supervisor.observeDisconnect()
  assert.equal(eof.supervisor.failed, true)
  assert.throws(() => eof.supervisor.complete(eof.publish))
  const preliminary = harness(t),
    first = new Error('preliminary send failed')
  preliminary.owner.start(preliminary.result)
  preliminary.ownerCallbacks[0](first)
  preliminary.control.fail(new Error('later'))
  assert.equal(preliminary.control.state.error, first)
  assert.equal(preliminary.marker(), false)
})
