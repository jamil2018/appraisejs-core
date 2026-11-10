// Actual inert fixture transports; no owner/client/process launch.
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createFixtureAdmission, retainFixtureActual, installFixtureFirstFailure } from './custody-fixture-admission.ts'
import {
  sendFixtureTerminalHandoff,
  fixtureRetainedFailureReport,
  persistFixtureRetainedFailure,
  notifyFixtureRetainedFailure,
  disconnectFixtureRetainedOwner,
} from './custody-fixture-transport.ts'

function withDirectory(action) {
  const directory = mkdtempSync(path.join(tmpdir(), 'custody-transport-inert-'))
  try {
    return action(directory)
  } finally {
    rmSync(directory, { recursive: true })
  }
}
function transport(directory) {
  const retained = [],
    reports = [],
    sends = [],
    channel = {
      connected: true,
      send(value, callback) {
        assert.equal(this, channel)
        sends.push({ value, callback })
        return false
      },
    }
  const admission = createFixtureAdmission(
    retained,
    () => channel.connected,
    (error, phase) => reports.push({ error, phase }),
  )
  const failures = [],
    delivered = [],
    events = path.join(directory, 'events.jsonl')
  let sequence = 8
  const value = {
    type: 'terminal-handoff',
    case: 'inert',
    pid: 123,
    nonce: 'inert',
    terminalType: 'case-retained',
    terminalSequence: 7,
    expectedFixtureSha256: 'a'.repeat(64),
  }
  const send = () =>
    sendFixtureTerminalHandoff(
      admission,
      channel,
      () => events,
      () => ++sequence,
      error => {
        failures.push(error)
        admission.fail(error)
      },
      value,
      actual => delivered.push(actual),
    )
  return { retained, reports, sends, channel, admission, failures, delivered, events, value, send }
}

test('actual handoff appends exact frame, preserves send result and delivers the same original object synchronously', () =>
  withDirectory(directory => {
    const x = transport(directory)
    assert.equal(x.send(), undefined)
    assert.equal(x.sends.length, 1)
    const actual = x.sends[0].value
    assert.equal(actual.sequence, 9)
    assert.equal(x.delivered.length, 0)
    assert.equal(readFileSync(x.events, 'utf8'), JSON.stringify(actual) + '\n')
    assert.ok(x.retained.includes(false))
    assert.ok(x.retained.includes(actual))
    x.sends[0].callback(null)
    assert.equal(x.delivered[0], actual)
  }))
test('actual handoff callback errors and post-send first failure never deliver or replace original cause', () =>
  withDirectory(directory => {
    const x = transport(directory),
      cause = new Error('send callback')
    x.send()
    x.sends[0].callback(cause)
    assert.equal(x.admission.unexpectedFailure.error, cause)
    assert.deepEqual(x.failures, [cause])
    assert.equal(x.delivered.length, 0)
    const y = transport(directory)
    y.send()
    const first = new Error('original')
    y.admission.fail(first, 'original-phase')
    y.sends[0].callback(null)
    assert.equal(y.delivered.length, 0)
    assert.equal(y.admission.unexpectedFailure.error, first)
  }))
test('handoff validates original connection after append and never consumes an opaque delivered return', () =>
  withDirectory(directory => {
    const x = transport(directory)
    let read = 0
    Object.defineProperty(x.channel, 'send', {
      get() {
        read++
        return undefined
      },
    })
    assert.throws(x.send, /IPC unavailable/)
    assert.equal(read, 1)
    assert.ok(readFileSync(x.events).length > 0)
    const y = transport(directory)
    y.value.extra = 'x'.repeat(4096)
    assert.throws(y.send)
    assert.equal(y.sends.length, 0)
  }))
test('first cause and last actual are pinned before throwing retention arrays and secondary reporting', () => {
  const state = { firstFailure: undefined, lastActual: undefined, referenceSequence: 0 },
    cause = new Error('references'),
    secondary = new Error('retained'),
    diagnostics = []
  const references = []
  references.push = () => {
    assert.equal(state.lastActual, actual)
    throw cause
  }
  const retained = []
  retained.push = () => {
    assert.equal(state.lastActual, actual)
    throw secondary
  }
  const actual = {
    then() {
      throw new Error('opaque return must remain unconsumed')
    },
  }
  const fail = (error, label) =>
    installFixtureFirstFailure(
      state,
      retained,
      diagnostics,
      () => {
        assert.equal(state.firstFailure.error, cause)
        throw secondary
      },
      error,
      label,
      'actual-phase',
    )
  assert.equal(retainFixtureActual(state, references, retained, fail, 'original', actual), actual)
  assert.equal(state.firstFailure.error, cause)
  assert.equal(state.firstFailure.operationPhase, 'actual-phase')
  assert.deepEqual(diagnostics, [secondary, secondary])
  fail(undefined, 'later')
  assert.equal(state.firstFailure.error, cause)
  assert.equal(diagnostics[2], undefined)
})
test('current and legacy failure frames keep sequence presence and formatter failure precedence', () => {
  const identity = { case: 'inert', pid: 123, nonce: 'inert' },
    failures = []
  let sequence = 4
  const current = fixtureRetainedFailureReport(
    identity,
    'cause',
    () => ++sequence,
    error => failures.push(error),
  )
  const legacy = fixtureRetainedFailureReport(identity, 'cause', undefined, error => failures.push(error))
  assert.equal(current.sequence, 5)
  assert.equal(Object.hasOwn(legacy, 'sequence'), false)
  const error = new Error('formatter'),
    opaque = {
      toString() {
        throw error
      },
    }
  assert.equal(
    fixtureRetainedFailureReport(
      identity,
      opaque,
      () => ++sequence,
      f => failures.push(f),
    ).message,
    'UNKNOWN',
  )
  assert.equal(sequence, 6)
  assert.deepEqual(failures, [error])
})
test('shared failure persistence, original channel receiver and independent secondary diagnostics', () =>
  withDirectory(directory => {
    const value = { type: 'failure-retained' },
      failures = [],
      events = path.join(directory, 'events.jsonl')
    persistFixtureRetainedFailure(
      directory,
      () => events,
      value,
      error => failures.push(error),
    )
    assert.equal(
      readFileSync(path.join(directory, 'owner-failure-latch.json'), 'utf8'),
      JSON.stringify(value, null, 2) + '\n',
    )
    assert.equal(readFileSync(events, 'utf8'), JSON.stringify(value) + '\n')
    const cause = new Error('callback'),
      disconnectError = new Error('disconnect')
    let disconnects = 0
    const channel = {
      connected: true,
      send(frame, callback) {
        assert.equal(this, channel)
        assert.equal(frame, value)
        callback(cause)
      },
      disconnect() {
        assert.equal(this, channel)
        disconnects++
        throw disconnectError
      },
    }
    notifyFixtureRetainedFailure(channel, value, error => failures.push(error))
    disconnectFixtureRetainedOwner(channel, error => failures.push(error))
    assert.deepEqual(failures, [cause, disconnectError])
    assert.equal(disconnects, 1)
    const cyclic = {}
    cyclic.self = cyclic
    persistFixtureRetainedFailure(
      directory,
      () => events,
      cyclic,
      error => failures.push(error),
    )
    assert.equal(failures.length, 4)
  }))

test('fallible legacy path construction remains after original admission/retention and inside independent failure-report catch', () =>
  withDirectory(directory => {
    const x = transport(directory),
      cause = new Error('original path'),
      next = () => 9
    assert.throws(
      () =>
        sendFixtureTerminalHandoff(
          x.admission,
          x.channel,
          () => {
            assert.equal(x.admission.currentPhase, 'terminal-handoff-send')
            assert.equal(x.admission.diagnostics().operationReferences.at(-1).label, 'terminal-handoff-message')
            throw cause
          },
          next,
          () => {},
          x.value,
          () => assert.fail('no delivery'),
        ),
      error => error === cause,
    )
    const diagnostics = []
    persistFixtureRetainedFailure(
      directory,
      () => {
        assert.equal(
          JSON.parse(readFileSync(path.join(directory, 'owner-failure-latch.json'))).type,
          'failure-retained',
        )
        throw cause
      },
      { type: 'failure-retained' },
      error => diagnostics.push(error),
    )
    assert.deepEqual(diagnostics, [cause])
    x.admission.fail(cause, 'original')
    assert.throws(
      () =>
        sendFixtureTerminalHandoff(
          x.admission,
          x.channel,
          () => assert.fail('no path after FAILED'),
          next,
          () => {},
          x.value,
          () => {},
        ),
      error => error === cause,
    )
  }))
