// Actual forwarding implementations and fixed fake originals; no client, native or owner imports.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSourceCaseRuntime } from './source-custody-guard.mjs'
import {
  forwardSourceRaw,
  forwardSourceTransaction,
  forwardSourceClientFinalizer,
  createSourceCleanupForwarders,
  createSourcePersistenceEvidence,
} from './source-custody-passive-forwarding.mjs'
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function fixture(options = {}) {
  const control = createSourceCaseRuntime({ connected: () => true, report() {}, ...options })
  const observed = [],
    context = {
      runtime: control.runtime,
      passive: control.observation,
      transactions: new WeakMap(),
      faultHooks: undefined,
      fault: undefined,
      observe(action) {
        if (control.runtime.failed) return
        try {
          action()
        } catch (error) {
          control.fail(error)
        }
      },
      entry: (...args) => observed.push(args),
    }
  return { control, context, observed }
}
for (const state of ['active', 'failed', 'no-origin', 'overflow']) {
  test('actual raw ' + state + ' preserves exact return/receiver/args and never reads a lazy then', () => {
    const h = fixture(state === 'overflow' ? { budget: { passive: 0, admissions: 2, references: 2 } } : {})
    const origin = state === 'no-origin' ? undefined : h.control.runtime.begin('RAW')
    const first = new Error('prior')
    if (state === 'failed') h.control.fail(first)
    const receiver = {},
      args = ['sql', 7],
      actual = {
        get then() {
          assert.fail('LAZY_CONSUMED')
        },
      }
    assert.equal(
      forwardSourceRaw(
        h.context,
        function (...values) {
          assert.equal(this, receiver)
          assert.deepEqual(values, args)
          return actual
        },
        receiver,
        '$queryRawUnsafe',
        args,
      ),
      actual,
    )
    if (state === 'no-origin' || state === 'overflow') {
      assert.equal(h.control.state.orphan, actual)
      assert(h.control.state.failed)
      assert.equal(h.observed.length, 0)
    } else {
      assert.equal(h.control.state.passive[0], actual)
      assert.equal(h.control.state.passiveOrigins[0], origin)
      assert.equal(h.observed.length, state === 'failed' ? 0 : 1)
    }
    if (state === 'failed') assert.equal(h.control.state.error, first)
  })
}
test('actual raw tx receiver registration determines original origin and original exception remains unwrapped', () => {
  const h = fixture(),
    current = h.control.runtime.begin('CURRENT'),
    txOrigin = { id: 20, phase: 'TX', kind: 'actual' },
    tx = {},
    actual = {}
  h.context.transactions.set(tx, txOrigin)
  assert.equal(
    forwardSourceRaw(h.context, () => actual, tx, '$executeRawUnsafe', []),
    actual,
  )
  assert.equal(h.control.state.passiveOrigins[0], txOrigin)
  assert.equal(h.control.state.current, current)
  const first = new Error('original')
  assert.throws(
    () =>
      forwardSourceRaw(
        h.context,
        () => {
          throw first
        },
        tx,
        '$executeRawUnsafe',
        [],
      ),
    error => error === first,
  )
  assert.equal(h.control.state.passiveCount, 1)
})
test('actual transaction callback keeps exact this/tx/extra args, callback and outer captures before admission reporting', () => {
  const h = fixture(),
    origin = h.control.runtime.begin('TX'),
    receiver = {},
    callbackThis = {},
    tx = {},
    extra = {},
    callbackActual = {},
    outer = {},
    args = ['settings']
  let admissions = 0
  const returned = forwardSourceTransaction(
    h.context,
    function (callback, ...rest) {
      assert.equal(this, receiver)
      assert.deepEqual(rest, args)
      assert.equal(callback.call(callbackThis, tx, extra), callbackActual)
      return outer
    },
    receiver,
    function (...callbackArgs) {
      assert.equal(this, callbackThis)
      assert.deepEqual(callbackArgs, [tx, extra])
      assert.equal(h.context.transactions.get(tx), origin)
      return callbackActual
    },
    args,
    () => {
      assert.equal(h.control.state.passive[0], callbackActual)
      assert.equal(h.control.state.passive[1], outer)
      admissions++
    },
  )
  assert.equal(returned, outer)
  assert.equal(admissions, 1)
  assert.equal(h.control.state.passiveSites[0], 'transaction-callback')
  assert.equal(h.control.state.passiveSites[1], 'transaction-outer')
})
test('actual transaction callback exceptions remain original and do not manufacture a callback/outer return', () => {
  const h = fixture(),
    first = new Error('callback'),
    tx = {}
  h.control.runtime.begin('TX')
  assert.throws(
    () =>
      forwardSourceTransaction(
        h.context,
        callback => callback(tx),
        {},
        () => {
          throw first
        },
        [],
        () => assert.fail('admission after throw'),
      ),
    error => error === first,
  )
  assert.equal(h.control.state.passiveCount, 0)
  assert(h.context.transactions.has(tx))
})
test('armed transaction controlled rejection is transparent after failure with same original fulfillment value', async () => {
  const h = fixture(),
    original = deferred(),
    tx = {},
    value = {}
  h.control.runtime.begin('CONTROLLED')
  h.context.fault = 'CONTROLLED'
  const hooks = [],
    callbackThis = {}
  h.context.faultHooks = {
    callbackFulfilled: v => hooks.push(['callback', v]),
    suppressed: v => hooks.push(['suppressed', v]),
    controlled: (...values) => hooks.push(['controlled', ...values]),
    outer: original => hooks.push(['outer', original]),
  }
  const returned = forwardSourceTransaction(
    h.context,
    callback => callback.call(callbackThis, tx),
    {},
    function () {
      assert.equal(this, callbackThis)
      return original.promise
    },
    [],
    () => {},
  )
  assert.notEqual(returned, original.promise)
  assert.equal(h.context.fault, undefined)
  h.control.fail(new Error('first'))
  original.resolve(value)
  assert.equal(await returned, value)
  assert.equal(hooks.find(row => row[0] === 'callback')[1], value)
  assert.equal(hooks.find(row => row[0] === 'suppressed')[1], value)
  assert.equal(h.control.state.passive[0], original.promise)
  assert.equal(h.control.state.passive[1], returned)
})
for (const reason of ['no-target', 'wrong-receiver', 'failed']) {
  test('actual finalizer ' + reason + ' remains transparent and unconsumed', () => {
    const h = fixture(),
      receiver = {},
      actual = {
        get then() {
          assert.fail('unexpected consumer')
        },
      },
      state = { calls: 0, atThrow: undefined }
    h.control.runtime.begin('FINALIZER')
    if (reason === 'failed') h.control.fail(new Error('prior'))
    const target =
      reason === 'no-target'
        ? {}
        : {
            fixture: {
              client: reason === 'wrong-receiver' ? {} : receiver,
              source: {
                snapshot() {
                  assert.fail('transparent snapshot')
                },
              },
            },
          }
    assert.equal(
      forwardSourceClientFinalizer(
        h.control.runtime,
        function (...args) {
          assert.equal(this, receiver)
          assert.deepEqual(args, [1])
          return actual
        },
        receiver,
        [1],
        target,
        state,
        false,
        new Error('controlled'),
      ),
      actual,
    )
    assert.equal(state.calls, 0)
    assert.equal(h.control.state.passive[0], actual)
  })
}
function finalizerFixture() {
  const h = fixture(),
    receiver = {},
    snapshot = {
      disposed: true,
      held: false,
      resources: { keyNonzeroBytes: 0 },
      diagnostics: { custody: { allocationEntries: 0 } },
    },
    state = { calls: 0, atThrow: undefined }
  h.control.runtime.begin('FINALIZER')
  return {
    ...h,
    receiver,
    snapshot,
    state,
    target: { fixture: { client: receiver, source: { snapshot: () => snapshot } } },
  }
}
test('actual synchronous finalizer fault sees full source handoff before original client cleanup can start', () => {
  const h = finalizerFixture(),
    first = new Error('controlled')
  assert.throws(
    () =>
      forwardSourceClientFinalizer(
        h.control.runtime,
        () => assert.fail('sync fault original cleanup'),
        h.receiver,
        [],
        h.target,
        h.state,
        false,
        first,
      ),
    error => error === first,
  )
  assert.equal(h.state.atThrow, h.snapshot)
  assert.equal(h.state.calls, 1)
  assert.equal(h.control.state.passive[0], h.snapshot)
})
test('actual asynchronous finalizer captures original then controlled result and suppresses armed fault after failure', async () => {
  const h = finalizerFixture(),
    original = deferred(),
    value = {},
    first = new Error('controlled')
  const returned = forwardSourceClientFinalizer(
    h.control.runtime,
    () => original.promise,
    h.receiver,
    [],
    h.target,
    h.state,
    true,
    first,
  )
  assert.notEqual(returned, original.promise)
  assert.equal(h.control.state.passive[1], original.promise)
  assert.equal(h.control.state.passive[2], returned)
  h.control.fail(new Error('prior'))
  original.resolve(value)
  assert.equal(await returned, value)
})
test('actual finalizer proof failure latches first then forwards original without adding a consumer', () => {
  const h = finalizerFixture(),
    actual = {
      get then() {
        assert.fail('failed proof lazy consumed')
      },
    }
  h.snapshot.held = true
  assert.equal(
    forwardSourceClientFinalizer(
      h.control.runtime,
      () => actual,
      h.receiver,
      [],
      h.target,
      h.state,
      false,
      new Error('controlled'),
    ),
    actual,
  )
  assert(h.control.state.failed)
  assert.equal(h.control.state.passive[1], actual)
})
function cleanupFixture() {
  const h = fixture(),
    original = deferred(),
    selected = {},
    raw = {},
    client = {},
    retained = { actualClients: [], actualStops: [], controlledAcks: [] },
    ack = deferred(),
    reached = deferred(),
    events = []
  h.control.runtime.begin('CLEANUP')
  const context = {
    control: h.control,
    runtime: h.control.runtime,
    observe: h.context.observe,
    rawEngine: receiver => {
      assert.equal(receiver, client)
      return { raw, engine: selected }
    },
    enginePrototype: Object.getPrototypeOf(selected),
    seen: new Map(),
    stopRows: new Map(),
    clientRows: new Map(),
    event: (...args) => events.push(args),
    retained,
    ack,
    reached,
    failure: h.control.fail,
    latch: h.control.fail,
    selectedLabel: 'canonical',
    collection: true,
    allowlist: new Set([selected]),
    selectedEngine: selected,
    originalQuery(...args) {
      assert.equal(this, client)
      assert.deepEqual(args, ['sql'])
      return original.promise
    },
    originalStop(...args) {
      assert.equal(this, selected)
      assert.deepEqual(args, [])
      return original.promise
    },
    originalClientDisconnect(...args) {
      assert.equal(this, client)
      assert.deepEqual(args, [])
      return original.promise
    },
  }
  return {
    ...h,
    context,
    original,
    selected,
    raw,
    client,
    retained,
    ack,
    reached,
    events,
    wrappers: createSourceCleanupForwarders(context),
  }
}
test('actual cleanup query/client wrappers return original values after capture and retain original receivers', () => {
  const h = cleanupFixture()
  assert.equal(h.wrappers.queryEntry.call(h.client, 'sql'), h.original.promise)
  assert.equal(h.context.seen.get(h.selected).client, h.client)
  assert.equal(h.wrappers.clientDisconnectEntry.call(h.client), h.original.promise)
  assert.equal(h.context.clientRows.get(h.client), h.original.promise)
  assert.equal(h.retained.actualClients[0], h.original.promise)
  assert.equal(h.control.state.passive[0], h.original.promise)
})
test('actual selected cleanup stop keeps original/controlled identities and releases only through existing ACK', async () => {
  const h = cleanupFixture(),
    value = {},
    controlled = h.wrappers.controlledStop.call(h.selected)
  assert.notEqual(controlled, h.original.promise)
  assert.equal(h.context.stopRows.get(h.selected).actual, h.original.promise)
  assert.equal(h.context.stopRows.get(h.selected).controlled, controlled)
  assert.equal(h.retained.actualStops[0], h.original.promise)
  assert.equal(h.retained.controlledAcks[0], controlled)
  h.original.resolve(value)
  await h.reached.promise
  let settled = false
  controlled.then(() => {
    settled = true
  })
  await Promise.resolve()
  assert.equal(settled, false)
  h.ack.resolve()
  assert.equal(await controlled, value)
})
test('actual already-armed cleanup ACK stays held after failure with no reached action/new selected consumer', async () => {
  const h = cleanupFixture(),
    controlled = h.wrappers.controlledStop.call(h.selected),
    first = new Error('prior')
  h.control.fail(first)
  h.original.resolve('original')
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(h.context.stopRows.get(h.selected).actualFulfilled, true)
  assert.equal(h.control.state.passiveSites.includes('selected-ack-value'), false)
  let settled = false
  controlled.then(() => {
    settled = true
  })
  await Promise.resolve()
  assert.equal(settled, false)
  h.ack.resolve('still original held gate')
  assert.equal(await controlled, 'still original held gate')
  assert.equal(h.control.state.error, first)
})
test('actual cleanup stop entering after failure returns exact original without arming a new ACK consumer', () => {
  const h = cleanupFixture()
  h.control.fail(new Error('prior'))
  assert.equal(h.wrappers.controlledStop.call(h.selected), h.original.promise)
  assert.equal(h.context.stopRows.size, 0)
  assert.equal(h.retained.controlledAcks.length, 0)
  assert.equal(h.control.state.passive[0], h.original.promise)
})

test('actual source persistence evidence binds writer barrier receivers, bounded reporting and ledger reads', () => {
  const h = fixture(),
    transactions = new WeakMap(),
    capture = { active: false },
    tx = {},
    root = {}
  const evidence = createSourcePersistenceEvidence(h.control.runtime, transactions, capture)
  assert.throws(() =>
    evidence.entry(root, '$executeRawUnsafe', ['UPDATE QualityJourneyProviderRun SET id=id WHERE id=?']),
  )
  transactions.set(tx, h.control.runtime.begin('ACTUAL_TX'))
  evidence.entry(tx, '$executeRawUnsafe', ['UPDATE QualityJourneyProviderRun SET id=id WHERE id=?'])
  evidence.entry(tx, '$queryRawUnsafe', ['SELECT sequence,previousHead,head,kind,dataJson,byteCount FROM ledger'])
  evidence.admit(() => {})
  assert.deepEqual(evidence.counts(), { entries: 2, admissions: 1, rowReads: 1 })
  capture.active = true
  assert.throws(() => evidence.entry(tx, '$queryRawUnsafe', ['sql']))
  assert.throws(() => evidence.admit(() => {}))
  capture.active = false
  assert.throws(() => evidence.admit([]))
  const first = new Error('report')
  evidence.observe(() => {
    throw first
  })
  assert.equal(h.control.state.error, first)
  evidence.observe(() => assert.fail('failed source observation must remain passive'))
})
