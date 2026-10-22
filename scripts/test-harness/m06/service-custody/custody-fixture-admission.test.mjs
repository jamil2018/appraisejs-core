// Inert lifetime-contract tests only. No owner, Prisma, SQLite, subprocess or product imports.
import assert from 'node:assert/strict'
import test from 'node:test'
import { createFixtureAdmission, createFixtureTerminal } from './custody-fixture-admission.ts'
import {
  assertFixtureTerminalEvidence,
  fixtureTerminalCallbackReceipt,
  encodeFixtureTerminalCallbackReceipt,
  publishFixtureTerminalCallbackReceipt,
  readFixtureTerminalCallbackEvidence,
} from './custody-fixture-terminal-receipt.ts'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

function fixture() {
  const retained = []
  const reports = []
  let connected = true
  const admission = createFixtureAdmission(
    retained,
    () => connected,
    (error, phase) => reports.push({ error, phase }),
  )
  return {
    admission,
    retained,
    reports,
    disconnect: () => {
      connected = false
    },
  }
}
function deferred() {
  let resolve
  const promise = new Promise(done => {
    resolve = done
  })
  return { promise, resolve }
}
const identity = { case: 'inert-guard-contract', pid: 1234, nonce: '00000000-0000-0000-0000-000000000000' }
const result = { ...identity, type: 'case-retained', sequence: 9, expectedFixtureSha256: 'a'.repeat(64) }
const acknowledgement = {
  ...identity,
  type: 'terminal-ack',
  terminalType: result.type,
  terminalSequence: result.sequence,
  expectedFixtureSha256: result.expectedFixtureSha256,
}
const terminalScope = {
  ...identity,
  ownerScript: '/inert/owner-bundle.mjs',
  terminalType: result.type,
  terminalSequence: result.sequence,
  handoffSequence: 12,
  expectedFixtureSha256: result.expectedFixtureSha256,
}
const failureReceipt = {
  ...identity,
  version: 1,
  type: 'failure-retained',
  classification: 'UNEXPECTED_FIXTURE_FAILURE',
  phase: 'supervisor-disconnect',
  operationPhase: 'terminal-handoff-send',
  message: 'Original IPC lost',
  referenceSummary: { operations: 1, referenceCount: 2, retainedCount: 3, recent: [] },
}
function terminalFixture() {
  const f = fixture()
  const sends = []
  const finishes = []
  const commits = []
  let commitError
  const terminal = createFixtureTerminal(
    f.admission,
    identity,
    (value, delivered) => {
      const handoff = f.admission.keepActual('inert-original-sent-handoff', { ...value, sequence: 12 })
      sends.push({ value: handoff, delivered: () => delivered(handoff) })
    },
    {
      validateFinish: type => assert.equal(type, 'case-retained'),
      prepareCommit: handoff => {
        const scope = {
          ...identity,
          ownerScript: '/inert/owner-bundle.mjs',
          terminalType: handoff.terminalType,
          terminalSequence: handoff.terminalSequence,
          handoffSequence: handoff.sequence,
          expectedFixtureSha256: handoff.expectedFixtureSha256,
        }
        const prepared = encodeFixtureTerminalCallbackReceipt(scope)
        f.admission.keepActual('inert-prepared-commit', prepared)
        return () => {
          if (commitError) throw commitError
          commits.push(prepared.receipt)
        }
      },
      finish: type => finishes.push(type),
    },
  )
  return {
    ...f,
    terminal,
    sends,
    finishes,
    commits,
    failPublication: error => {
      commitError = error
    },
  }
}

test('admission invokes once and preserves the exact actual Promise and fulfillment object', async () => {
  const f = fixture(),
    pending = deferred(),
    value = {}
  let calls = 0
  assert.equal(
    f.admission.admitActual('actual-operation', () => {
      calls++
      return pending.promise
    }),
    pending.promise,
  )
  assert.equal(calls, 1)
  assert.ok(f.retained.includes(pending.promise))
  pending.resolve(value)
  assert.equal(f.admission.afterActual('original-await', await pending.promise), value)
  assert.ok(f.retained.includes(value))
})

test('failure while the genuine Promise is pending retains later fulfillment and fences new work', async () => {
  const f = fixture(),
    pending = deferred(),
    cause = new Error('original failure'),
    value = {}
  const actual = f.admission.admitActual('pending-original', () => pending.promise)
  f.admission.fail(cause, 'original-IPC-callback')
  let newCalls = 0
  assert.throws(
    () =>
      f.admission.admitActual('new-cleanup', () => {
        newCalls++
      }),
    error => error === cause,
  )
  pending.resolve(value)
  const fulfilled = await actual
  assert.throws(
    () => f.admission.afterActual('pending-original', fulfilled),
    error => error === cause,
  )
  assert.equal(newCalls, 0)
  assert.ok(f.retained.includes(actual) && f.retained.includes(value))
  assert.equal(f.admission.unexpectedFailure.phase, 'original-IPC-callback')
})

test('the operation over the bound is retained before cap failure and first cause survives', () => {
  const f = fixture()
  for (let n = 0; n < 4096; n++) f.admission.admitActual('bounded-operation', () => ({}))
  const justCreated = {}
  assert.throws(() => f.admission.admitActual('over-bound', () => justCreated), /admission bound exceeded/)
  assert.ok(f.retained.includes(justCreated))
  const first = f.admission.unexpectedFailure
  f.admission.fail(new Error('later callback failure'), 'later')
  assert.equal(f.admission.unexpectedFailure, first)
  assert.equal(first.phase, 'over-bound')
  assert.equal(f.reports.length, 1)
})

test('closed IPC latches first phase, and a reporting exception cannot replace its cause', () => {
  const retained = [],
    reportingError = new Error('report failed')
  const admission = createFixtureAdmission(
    retained,
    () => false,
    () => {
      throw reportingError
    },
  )
  assert.throws(
    () => admission.admitActual('before-factory', () => assert.fail('factory must stay uncalled')),
    /IPC loss/,
  )
  assert.equal(admission.unexpectedFailure.phase, 'before-factory')
  assert.ok(admission.diagnostics().diagnosticFailures.includes(reportingError))
})

test('intentional retirement is separate from an unexpected failure latch', () => {
  const f = fixture()
  const intentionalProductRetirement = true
  assert.equal(intentionalProductRetirement, true)
  const existingObservation = {}
  assert.equal(
    f.admission.admitActual('declared-existing-result-observation', () => existingObservation),
    existingObservation,
  )
  assert.equal(f.admission.unexpectedFailure, undefined)
})

test('preliminary terminal and authenticated ACK do not mark expected disconnect before delivery callback', () => {
  const f = terminalFixture()
  f.terminal.register(result)
  f.terminal.acknowledge(acknowledgement)
  assert.equal(f.sends.length, 0)
  f.terminal.allowHandoff()
  assert.equal(f.sends.length, 1)
  assert.equal(f.admission.expectedTerminalHandoff, false)
  assert.equal(f.finishes.length, 0)
  f.sends[0].delivered()
  assert.equal(f.admission.expectedTerminalHandoff, true)
  assert.deepEqual(f.finishes, ['case-retained'])
  assert.throws(
    () => f.admission.admitActual('new-after-handoff', () => assert.fail('must stay uncalled')),
    /after terminal handoff/,
  )
})

test('unexpected failure before handoff delivery revokes completion and retains its actual receipt', () => {
  const f = terminalFixture()
  f.terminal.register(result)
  f.terminal.allowHandoff()
  f.terminal.acknowledge(acknowledgement)
  const receipt = f.sends[0].value
  f.admission.fail(new Error('handoff send callback failed'), 'handoff-send')
  f.sends[0].delivered()
  assert.equal(f.admission.expectedTerminalHandoff, false)
  assert.equal(f.finishes.length, 0)
  assert.ok(f.retained.includes(receipt))
})

test('IPC lost before handoff callback is guarded before the expected-disconnect marker', () => {
  const f = terminalFixture()
  f.terminal.register(result)
  f.terminal.allowHandoff()
  f.terminal.acknowledge(acknowledgement)
  f.disconnect()
  assert.throws(() => f.sends[0].delivered(), /IPC loss/)
  assert.equal(f.admission.expectedTerminalHandoff, false)
  assert.equal(f.finishes.length, 0)
})

test('coupled supervisor cannot finalize received handoff plus disconnect while owner callback is pending', () => {
  const f = terminalFixture()
  f.terminal.register(result)
  f.terminal.allowHandoff()
  f.terminal.acknowledge(acknowledgement)
  assert.equal(f.sends.length, 1) // the actual produced handoff may already have been received remotely
  f.disconnect()
  f.admission.fail(new Error('Original IPC lost'), 'supervisor-disconnect')
  assert.throws(
    () => assertFixtureTerminalEvidence(f.commits[0], undefined, terminalScope),
    /Missing owner callback-commit/,
  )
  assert.throws(
    () => assertFixtureTerminalEvidence(f.commits[0], failureReceipt, terminalScope),
    /first failure has terminal precedence/,
  )
  f.sends[0].delivered()
  assert.equal(f.commits.length, 0)
  assert.equal(f.finishes.length, 0)
  assert.equal(f.admission.expectedTerminalHandoff, false)
  assert.ok(f.retained.includes(f.sends[0].value))
})

test('actual successful callback commits exact receipt before expected marker and finish', () => {
  const f = terminalFixture()
  f.terminal.register(result)
  f.terminal.allowHandoff()
  f.terminal.acknowledge(acknowledgement)
  assert.equal(f.commits.length, 0)
  f.sends[0].delivered()
  assert.equal(f.commits.length, 1)
  assert.equal(assertFixtureTerminalEvidence(f.commits[0], undefined, terminalScope), f.commits[0])
  assert.equal(f.admission.expectedTerminalHandoff, true)
  assert.deepEqual(f.finishes, ['case-retained'])
})

test('publication exception latches its actual first cause without marker, finish or retry', () => {
  const f = terminalFixture(),
    error = new Error('exclusive receipt failed')
  f.terminal.register(result)
  f.terminal.allowHandoff()
  f.terminal.acknowledge(acknowledgement)
  f.failPublication(error)
  assert.throws(
    () => f.sends[0].delivered(),
    failure => failure === error,
  )
  assert.equal(f.admission.unexpectedFailure.error, error)
  assert.equal(f.admission.expectedTerminalHandoff, false)
  assert.equal(f.commits.length, 0)
  assert.equal(f.finishes.length, 0)
  f.sends[0].delivered()
  assert.equal(f.commits.length, 0)
})

test('foreign, incomplete and contradictory callback evidence never passes the original scope', () => {
  const receipt = fixtureTerminalCallbackReceipt(terminalScope)
  for (const candidate of [
    undefined,
    {},
    { ...receipt, nonce: 'foreign' },
    { ...receipt, ownerScript: '/other/owner.mjs' },
    { ...receipt, handoffSequence: 13 },
    { ...receipt, phase: 'QUEUED' },
    { ...receipt, extra: true },
  ])
    assert.throws(() => assertFixtureTerminalEvidence(candidate, undefined, terminalScope))
})

test('pre-final first failure overrides an otherwise valid commit; malformed/foreign failure also STOPs', () => {
  const receipt = fixtureTerminalCallbackReceipt(terminalScope)
  for (const failure of [failureReceipt, null, {}, { ...failureReceipt, pid: 9999 }])
    assert.throws(() => assertFixtureTerminalEvidence(receipt, failure, terminalScope))
})

test('exclusive inert receipt publication and bounded reader reject duplicate, partial and late-failure evidence', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'custody-inert-terminal-receipt-'))
  try {
    const prepared = encodeFixtureTerminalCallbackReceipt(terminalScope)
    publishFixtureTerminalCallbackReceipt(directory, prepared.encoded)
    assert.deepEqual(readFixtureTerminalCallbackEvidence(directory, terminalScope), prepared.receipt)
    assert.throws(() => publishFixtureTerminalCallbackReceipt(directory, prepared.encoded), { code: 'EEXIST' })
    writeFileSync(path.join(directory, 'owner-failure-latch.json'), JSON.stringify(failureReceipt))
    assert.throws(
      () => readFixtureTerminalCallbackEvidence(directory, terminalScope),
      /first failure has terminal precedence/,
    )
    writeFileSync(path.join(directory, 'owner-failure-latch.json'), '{')
    assert.throws(() => readFixtureTerminalCallbackEvidence(directory, terminalScope), SyntaxError)
  } finally {
    rmSync(directory, { recursive: true })
  }
  const partial = mkdtempSync(path.join(tmpdir(), 'custody-inert-terminal-partial-'))
  try {
    writeFileSync(path.join(partial, 'owner-terminal-callback-commit.json'), '{')
    assert.throws(() => readFixtureTerminalCallbackEvidence(partial, terminalScope), SyntaxError)
  } finally {
    rmSync(partial, { recursive: true })
  }
})

test('foreign ACK rejection latches at the same owner handler boundary and revokes later ACK', () => {
  const f = terminalFixture()
  f.terminal.register(result)
  f.terminal.allowHandoff()
  let cause
  try {
    f.terminal.acknowledge({ ...acknowledgement, nonce: 'foreign' })
  } catch (error) {
    cause = error
    f.admission.fail(error, 'terminal-ack-handler')
  }
  assert.match(String(cause), /does not match/)
  f.terminal.acknowledge(acknowledgement)
  assert.equal(f.sends.length, 0)
  assert.equal(f.admission.expectedTerminalHandoff, false)
})

test('duplicate ACK failure before send delivery revokes an already-published handoff', () => {
  const f = terminalFixture()
  f.terminal.register(result)
  f.terminal.allowHandoff()
  f.terminal.acknowledge(acknowledgement)
  try {
    f.terminal.acknowledge(acknowledgement)
  } catch (error) {
    f.admission.fail(error, 'terminal-ack-handler')
  }
  f.sends[0].delivered()
  assert.equal(f.admission.expectedTerminalHandoff, false)
  assert.equal(f.finishes.length, 0)
})

test('shared retention failure preserves the just-created actual object in independent private ownership', () => {
  const retained = Object.freeze([]),
    value = {}
  const admission = createFixtureAdmission(
    retained,
    () => true,
    () => {},
  )
  assert.throws(() => admission.admitActual('actual-before-retention-error', () => value), TypeError)
  assert.equal(admission.diagnostics().lastActual, value)
  assert.equal(admission.diagnostics().operationReferences[0].value, value)
  assert.equal(admission.unexpectedFailure.phase, 'actual-before-retention-error:retention')
})

test('admission does not inspect or coerce an opaque thenable', () => {
  const f = fixture()
  let reads = 0
  const actual = Object.defineProperty({}, 'then', {
    get() {
      reads++
      throw new Error('then getter must stay unread')
    },
  })
  assert.equal(
    f.admission.admitActual('opaque-original', () => actual),
    actual,
  )
  assert.equal(reads, 0)
})

test('a rejected already-admitted operation cannot turn latch failure into expected refusal', async () => {
  const f = fixture(),
    first = new Error('IPC failure')
  let reject
  const actual = new Promise((resolve, rejected) => {
    reject = rejected
  })
  f.admission.admitActual('actual-pending-rejection', () => actual)
  f.admission.fail(first, 'supervisor-disconnect')
  reject(new Error('later genuine operation rejection'))
  let resumed = false
  await assert.rejects(
    async () => {
      try {
        await actual
      } catch {
        f.admission.assertActive('expected-rejection-continuation')
      }
      resumed = true
    },
    error => error === first,
  )
  assert.equal(resumed, false)
  assert.ok(f.retained.includes(actual))
})

test('actual terminal registration rejects duplicate, wrong family, missing/unsafe sequence and malformed original hash', () => {
  for (const change of [
    value => {
      value.type = 'terminal-handoff'
    },
    value => {
      delete value.sequence
    },
    value => {
      value.sequence = 0
    },
    value => {
      value.sequence = 0.5
    },
    value => {
      value.sequence = Number.MAX_SAFE_INTEGER + 1
    },
    value => {
      value.expectedFixtureSha256 = 'foreign'
    },
    value => {
      delete value.expectedFixtureSha256
    },
  ]) {
    const f = terminalFixture(),
      candidate = { ...result }
    change(candidate)
    assert.throws(() => f.terminal.register(candidate))
    assert.ok(f.retained.includes(candidate))
    assert.equal(f.sends.length, 0)
  }
  const f = terminalFixture()
  f.terminal.register(result)
  assert.throws(() => f.terminal.register(result), /already published/)
  assert.equal(f.sends.length, 0)
})
test('an actually thrown undefined first cause survives later diagnostics and all admissions', () => {
  const f = fixture()
  f.admission.fail(undefined, 'original-undefined')
  assert.equal(f.admission.unexpectedFailure.phase, 'original-undefined')
  assert.equal(f.admission.unexpectedFailure.error, undefined)
  f.admission.fail(new Error('later'), 'later')
  let thrown = false
  try {
    f.admission.assertActive('new')
  } catch (error) {
    thrown = true
    assert.equal(error, undefined)
  }
  assert.equal(thrown, true)
  assert.equal(f.reports.length, 1)
})
