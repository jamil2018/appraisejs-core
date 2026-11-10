// Actual passive forwarding responsibilities. No product/client imports or work at import.
import assert from 'node:assert/strict'

export function forwardSourceRaw(context, original, receiver, name, args) {
  const { runtime, passive, transactions, faultHooks, observe, entry } = context
  const failedAtEntry = runtime.failed
  const origin = transactions.has(receiver) ? transactions.get(receiver) : passive.origin()
  const actual = Reflect.apply(original, receiver, args)
  passive.capture(actual, origin, name)
  faultHooks?.raw(actual, origin, receiver, name, failedAtEntry)
  observe(() => entry(receiver, name, args))
  return actual
}
export function forwardSourceTransaction(context, originalTransaction, receiver, action, args, admit) {
  const { passive, transactions, faultHooks, observe } = context
  const origin = passive.origin(),
    phase = origin?.phase
  const inject = passive.eligible() && context.fault === phase
  if (inject) context.fault = undefined
  function callback(...callbackArgs) {
    const tx = callbackArgs[0]
    if (typeof tx === 'object' && tx !== null) transactions.set(tx, origin)
    const actual = Reflect.apply(action, this, callbackArgs)
    passive.capture(actual, origin, 'transaction-callback')
    if (!inject || !passive.eligible()) return actual
    // The existing controlled consumer only; no consumer is added to lazy raw values.
    const controlled = actual.then(value => {
      faultHooks?.callbackFulfilled(value, origin)
      if (!passive.eligible()) {
        faultHooks?.suppressed(value, origin)
        return value
      }
      throw new Error('CONTROLLED_CALLBACK_REJECTION:' + phase)
    })
    passive.capture(controlled, origin, 'controlled-transaction-callback')
    faultHooks?.controlled(actual, controlled, origin, tx)
    return controlled
  }
  const actual = Reflect.apply(originalTransaction, receiver, [
    typeof action === 'function' ? callback : action,
    ...args,
  ])
  passive.capture(actual, origin, 'transaction-outer')
  faultHooks?.outer(actual, origin)
  observe(admit)
  return actual
}
export function forwardSourceClientFinalizer(
  runtime,
  original,
  receiver,
  args,
  target,
  state,
  asynchronous,
  controlledError,
) {
  const passive = runtime.observation,
    origin = passive.origin()
  const current = target.fixture
  if (!current || receiver !== current.client || !passive.eligible()) {
    const actual = Reflect.apply(original, receiver, args)
    passive.capture(actual, origin, 'client-finalizer-transparent')
    return actual
  }
  try {
    state.calls++
    state.atThrow = current.source.snapshot()
    passive.capture(state.atThrow, origin, 'source-at-finalizer')
    if (passive.eligible()) {
      assert.equal(state.atThrow.disposed, true)
      assert.equal(state.atThrow.held, false)
      assert.equal(state.atThrow.resources.keyNonzeroBytes, 0)
      assert.equal(state.atThrow.diagnostics.custody.allocationEntries, 0)
    }
  } catch (error) {
    passive.fail(error)
  }
  if (!asynchronous && passive.eligible()) throw controlledError
  const actual = Reflect.apply(original, receiver, args)
  passive.capture(actual, origin, 'actual-client-cleanup')
  if (!passive.eligible()) return actual
  const controlled = actual.then(value => {
    if (!passive.eligible()) return value
    throw controlledError
  })
  passive.capture(controlled, origin, 'controlled-client-rejection')
  return controlled
}

export function createSourceCleanupForwarders(context) {
  const {
    control,
    runtime,
    observe,
    rawEngine,
    enginePrototype,
    seen,
    stopRows,
    clientRows,
    event,
    retained,
    ack,
    reached,
    failure,
    latch,
    selectedLabel,
    originalQuery,
    originalStop,
    originalClientDisconnect,
  } = context
  function queryEntry(...args) {
    const origin = control.observation.origin()
    const actual = Reflect.apply(originalQuery, this, args)
    control.observation.capture(actual, origin, 'cleanup-query')
    observe(() => {
      if (!context.collection) return
      assert(seen.size <= 2, 'Receiver collection cap')
      const { raw, engine } = rawEngine(this)
      assert.equal(Object.getPrototypeOf(engine), enginePrototype)
      const previous = seen.get(engine)
      if (previous) assert.equal(previous.client, this)
      else {
        assert(seen.size < 2, 'Extra factory preparation receiver')
        seen.set(engine, { client: this, raw })
      }
      event('DIRECT RAW METHOD-ENTRY', {
        receiver: seen.size === 1 && seen.keys().next().value === engine ? 'PREPARATION_FIRST' : 'PREPARATION_SECOND',
        method: '$queryRawUnsafe',
        sqlReported: false,
      })
    })
    return actual
  }
  function clientDisconnectEntry(...args) {
    const origin = control.observation.origin()
    const actual = Reflect.apply(originalClientDisconnect, this, args)
    control.observation.capture(actual, origin, 'cleanup-client-disconnect')
    observe(() => {
      const engine = rawEngine(this).engine
      if (!context.allowlist?.has(engine)) {
        assert.equal(runtime.phase, 'POSTCONTROL_FULL_CLEANUP')
        return
      }
      assert(!clientRows.has(this), 'Genuine client disconnect invoked twice; fixture does not memoize it')
      clientRows.set(this, actual)
      retained.actualClients.push(actual)
      event('genuine-client-disconnect-entry', {
        receiver: engine === context.selectedEngine ? selectedLabel : 'unselected',
        actualPromiseRetained: true,
      })
    })
    return actual
  }
  function controlledStop(...args) {
    const origin = control.observation.origin()
    const actual = Reflect.apply(originalStop, this, args)
    control.observation.capture(actual, origin, 'cleanup-stop')
    if (!control.observation.eligible()) return actual
    let row
    observe(() => {
      assert(context.allowlist, 'Stop before this allowlist closed')
      if (!context.allowlist.has(this)) {
        assert.equal(runtime.phase, 'POSTCONTROL_FULL_CLEANUP')
        return
      }
      assert(!stopRows.has(this), 'Genuine stop invoked twice; fixture does not memoize it')
      row = {
        actual,
        actualFulfilled: false,
        controlled: undefined,
        label: this === context.selectedEngine ? selectedLabel : 'unselected',
      }
      stopRows.set(this, row)
      retained.actualStops.push(actual)
      event('genuine-stop-entry', { receiver: row.label, actualPromiseRetained: true })
    })
    if (!row || !control.observation.eligible()) return actual
    if (this !== context.selectedEngine) {
      const observer = actual.then(
        () => {
          row.actualFulfilled = true
          observe(() => event('genuine-original-stop-fulfilled', { receiver: row.label, controlledAck: false }))
        },
        error => {
          latch(error)
          throw error
        },
      )
      control.observation.capture(observer, origin, 'unselected-stop-observer')
      const caught = observer.catch(failure)
      control.observation.capture(caught, origin, 'unselected-stop-catch')
      return actual
    }
    const controlled = actual.then(value => {
      row.actualFulfilled = true
      // A previously armed ACK remains held after failure. No new observer/chain/reached action.
      if (!control.observation.eligible()) return ack.promise
      observe(() =>
        event('genuine-original-stop-fulfilled', { receiver: row.label, controlledAck: 'HELD_JS_OUTER_ACK_ONLY' }),
      )
      if (!control.observation.eligible()) return ack.promise
      reached.resolve()
      const released = ack.promise.then(() => value)
      control.observation.capture(released, origin, 'selected-ack-value')
      return released
    })
    control.observation.capture(controlled, origin, 'selected-controlled-ack')
    row.controlled = controlled
    retained.controlledAcks.push(controlled)
    const caught = controlled.catch(failure)
    control.observation.capture(caught, origin, 'selected-ack-catch')
    return controlled
  }
  return { queryEntry, clientDisconnectEntry, controlledStop }
}
export function createSourcePersistenceEvidence(runtime, transactions, capture) {
  const passive = runtime.observation
  let entries = 0,
    admissions = 0,
    rowReads = 0
  function observe(action) {
    if (runtime.failed) return
    try {
      action()
    } catch (error) {
      passive.fail(error)
    }
  }
  function entry(receiver, method, args) {
    assert(!capture.active, 'Persistence method entry on original synchronous capture stack')
    if (args[0] === 'UPDATE QualityJourneyProviderRun SET id=id WHERE id=?')
      assert(transactions.has(receiver), 'First writer barrier must use an actual original callback tx receiver')
    entries++
    if (
      method === '$queryRawUnsafe' &&
      String(args[0]).startsWith('SELECT sequence,previousHead,head,kind,dataJson,byteCount')
    )
      rowReads++
    if (entries <= 24)
      runtime.event('DIRECT RAW METHOD-ENTRY', { method, genuineCallbackTx: transactions.has(receiver) })
  }
  function admit(action) {
    assert(!capture.active, 'Transaction admission on original synchronous capture stack')
    assert.equal(typeof action, 'function', 'Fixture uses genuine callback transactions')
    admissions++
  }
  return { observe, entry, admit, counts: () => ({ entries, admissions, rowReads }) }
}
