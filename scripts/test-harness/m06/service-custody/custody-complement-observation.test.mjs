import assert from 'node:assert/strict'
import test from 'node:test'
import { createFixtureAdmission } from './custody-fixture-admission.ts'
import {
  observeComplementAction,
  countComplementPersistence,
  forwardComplementRaw,
  forwardComplementTransaction,
  forwardComplementDisconnect,
  assertComplementHeldBaseline,
} from './custody-complement-observation.ts'
function fixture() {
  const retained = [],
    reports = [],
    admission = createFixtureAdmission(
      retained,
      () => true,
      (error, phase) => reports.push({ error, phase }),
    )
  const observation = {
    receivers: new Map(),
    transactions: new WeakSet(),
    entries: 0,
    barriers: 0,
    discoveryComplete: false,
  }
  const count = (receiver, method, args) =>
    countComplementPersistence(admission, observation, 'inert', receiver, method, args)
  return { retained, reports, admission, observation, count }
}
test('actual raw forwarding preserves receiver, arguments, exact lazy return and original throw before observation', () => {
  const x = fixture(),
    receiver = {},
    args = ['sql', {}]
  let reads = 0
  const value = {
    get then() {
      reads++
      throw new Error('must not assimilate')
    },
  }
  const original = function (...actual) {
    assert.equal(this, receiver)
    assert.deepEqual(actual, args)
    return value
  }
  assert.equal(forwardComplementRaw(x.admission, x.count, receiver, '$queryRawUnsafe', original, args), value)
  assert.equal(reads, 0)
  assert.equal(x.observation.receivers.get(receiver).raw, 1)
  assert.ok(x.retained.includes(value))
  const cause = new Error('original')
  assert.throws(
    () =>
      forwardComplementRaw(
        x.admission,
        x.count,
        receiver,
        '$executeRawUnsafe',
        () => {
          throw cause
        },
        args,
      ),
    error => error === cause,
  )
  assert.equal(x.observation.entries, 1)
})
test('actual persistence observations fail once at overflow/unknown receiver and become passive after failure', () => {
  const x = fixture(),
    receiver = {}
  x.observation.entries = 2048
  x.count(receiver, '$transaction')
  const first = x.admission.unexpectedFailure
  assert.equal(first.phase, '16h:passive-persistence-observation')
  const exact = {}
  assert.equal(
    forwardComplementRaw(x.admission, x.count, receiver, '$queryRawUnsafe', () => exact, []),
    exact,
  )
  assert.equal(x.observation.entries, 2049)
  assert.equal(x.reports.length, 1)
  const y = fixture()
  y.observation.discoveryComplete = true
  y.count(receiver, '$transaction')
  assert.match(y.admission.unexpectedFailure.error.message, /Unknown receiver/)
  let called = 0
  observeComplementAction(y.admission, () => called++)
  assert.equal(called, 0)
})
test('actual transaction callback and outer preserve distinct exact objects, callback receiver and transaction barrier origin', () => {
  const x = fixture(),
    receiver = {},
    tx = {},
    callbackThis = {},
    callbackResult = {},
    outer = {},
    extra = {}
  let delivered
  const original = function (callback, ...args) {
    assert.equal(this, receiver)
    assert.deepEqual(args, [extra])
    delivered = callback
    return outer
  }
  const action = function (...args) {
    assert.equal(this, callbackThis)
    assert.deepEqual(args, [tx, extra])
    return callbackResult
  }
  assert.equal(
    forwardComplementTransaction(x.admission, x.observation, x.count, receiver, original, action, [extra]),
    outer,
  )
  assert.equal(delivered.call(callbackThis, tx, extra), callbackResult)
  assert.ok(x.retained.includes(callbackResult))
  assert.ok(x.retained.includes(outer))
  x.count(tx, '$executeRawUnsafe', ['UPDATE "QualityJourneyProviderSourceState" x'])
  assert.equal(x.observation.barriers, 1)
  assert.equal(x.observation.receivers.size, 1)
  const first = new Error('STOP')
  x.admission.fail(first)
  assert.equal(delivered.call(callbackThis, tx, extra), callbackResult)
  assert.equal(x.admission.unexpectedFailure.error, first)
  const list = []
  let forwarded
  assert.equal(
    forwardComplementTransaction(
      x.admission,
      x.observation,
      x.count,
      receiver,
      function (value) {
        forwarded = value
        return outer
      },
      list,
      [],
    ),
    outer,
  )
  assert.equal(forwarded, list)
})
test('transaction callback exceptions remain the original exception after observation and register no replacement result', () => {
  const x = fixture(),
    receiver = {},
    cause = new Error('callback'),
    tx = {}
  assert.throws(
    () =>
      forwardComplementTransaction(
        x.admission,
        x.observation,
        x.count,
        receiver,
        callback => callback(tx),
        () => {
          throw cause
        },
        [],
      ),
    error => error === cause,
  )
  assert.equal(x.observation.transactions.has(tx), true)
  assert.equal(x.observation.entries, 0)
})
function cleanupFixture() {
  const x = fixture(),
    client = {},
    before = {
      custody: {
        allocationEntries: 1,
        frameEntries: 2,
        discardedFrames: 3,
        attemptedBytes: 4,
        allocationClearCalls: 0,
        frameClearCalls: 0,
        mayHaveActivated: true,
      },
      source: {
        keyByteLength: 32,
        keyNonzeroBytes: 30,
        keyZeroCalls: 0,
        receiptEncodedBytes: 7,
        receiptReleaseCalls: 0,
        issuedProofPresent: true,
        issuedExclusionPresent: true,
        liveProofContainsIssued: true,
        issuedProofMatchesOriginal: true,
        issuedExclusionMatchesOriginal: true,
        liveProofMapReplaceCalls: 0,
        issuedClearCalls: 0,
        replayTombstoneContainsOriginal: false,
        journalOpen: true,
        journalDisposeCalls: 0,
      },
    }
  const diagnostics = structuredClone(before)
  for (const field of [
    'keyZeroCalls',
    'receiptReleaseCalls',
    'liveProofMapReplaceCalls',
    'issuedClearCalls',
    'journalDisposeCalls',
  ])
    diagnostics.source[field]++
  for (const field of [
    'issuedProofPresent',
    'issuedExclusionPresent',
    'liveProofContainsIssued',
    'issuedProofMatchesOriginal',
    'issuedExclusionMatchesOriginal',
    'journalOpen',
  ])
    diagnostics.source[field] = false
  diagnostics.source.replayTombstoneContainsOriginal = true
  diagnostics.source.keyNonzeroBytes = 0
  diagnostics.source.receiptEncodedBytes = 0
  for (const field of ['allocationEntries', 'frameEntries', 'discardedFrames', 'attemptedBytes'])
    diagnostics.custody[field] = 0
  diagnostics.custody.allocationClearCalls++
  diagnostics.custody.frameClearCalls++
  const snapshot = {
    disposed: true,
    held: false,
    allocations: 0,
    discardedFrames: 0,
    attemptedBytes: 0,
    resources: { keyByteLength: 32, keyNonzeroBytes: 0, receiptBytes: 0, journalOpen: false },
    diagnostics,
  }
  const cause = new Error('controlled cleanup'),
    state = {
      target: { client, source: { snapshot: () => snapshot } },
      cleanupThrow: true,
      controlledCalls: 0,
      sourceAtCleanup: undefined,
      cleanupError: cause,
      cleanupBefore: before,
    }
  return { ...x, client, state, snapshot, cause }
}
test('controlled finalizer verifies actual source destruction before exact rejection and becomes transparent after first failure', () => {
  const x = cleanupFixture()
  let originals = 0
  const value = {}
  const original = function (...args) {
    assert.equal(this, x.client)
    assert.deepEqual(args, ['original'])
    originals++
    return value
  }
  assert.throws(
    () => forwardComplementDisconnect(x.admission, x.state, x.count, x.client, original, ['original']),
    error => error === x.cause,
  )
  assert.equal(originals, 0)
  assert.equal(x.state.controlledCalls, 1)
  assert.equal(x.state.sourceAtCleanup, x.snapshot)
  const first = new Error('STOP')
  x.admission.fail(first)
  assert.equal(forwardComplementDisconnect(x.admission, x.state, x.count, x.client, original, ['original']), value)
  assert.equal(originals, 1)
  assert.equal(x.state.controlledCalls, 1)
  assert.equal(x.admission.unexpectedFailure.error, first)
})
test('failed source-cleanup observation retains actual snapshot and forwards original disconnect without controlled replacement', () => {
  const x = cleanupFixture()
  x.snapshot.held = true
  const exact = {}
  assert.equal(
    forwardComplementDisconnect(x.admission, x.state, x.count, x.client, () => exact, []),
    exact,
  )
  assert.equal(x.state.sourceAtCleanup, x.snapshot)
  assert.equal(x.admission.unexpectedFailure.phase, '16h:passive-persistence-observation')
})
test('complete held/retired baseline proof preserves exact original snapshot and refuses each missing hold', () => {
  const baseline = { source: { held: true, retired: true }, database: { held: true, retired: true } }
  assert.equal(assertComplementHeldBaseline(baseline), baseline)
  for (const owner of ['source', 'database'])
    for (const flag of ['held', 'retired']) {
      const bad = structuredClone(baseline)
      bad[owner][flag] = false
      assert.throws(() => assertComplementHeldBaseline(bad))
    }
})
