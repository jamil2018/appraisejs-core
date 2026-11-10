// Actual fault helper with inert event transport and synthetic text files only; no native/client/owner imports.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import vm from 'node:vm'
import ts from 'typescript'
import { createSourceCaseRuntime, createSourceFailureReporter } from './source-custody-guard.mjs'
import {
  createSourceIpcFault,
  injectSourceIpcFault,
  readSourceFaultJson,
  sourceIpcFaultCause,
  sourceIpcFaultReportError,
  validateSourceFaultObservation,
} from './source-custody-ipc-fault.mjs'
import * as sourceForwarding from './source-custody-passive-forwarding.mjs'
import { observeSourceIpcFaultOwner } from './source-custody-fault-controller.mjs'

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const unrequested = {
  cleanupPending: false,
  finalCloseRequested: false,
  canonical: { closeRequested: false, cleanupAdmitted: false },
  resolver: { closeRequested: false, cleanupAdmitted: false },
}
function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()), 'source-fault-inert-'))
  t.after(() => fs.rmSync(directory, { recursive: true }))
  const emitter = new EventEmitter(),
    identity =
      options.selector === 'ipc-reserve-controlled'
        ? { pid: process.pid, nonce: 'inert-nonce', selected: options.selector, faultSelector: options.selector }
        : { pid: process.pid, nonce: 'inert-nonce', selectedLabel: 'canonical', faultSelector: 'ipc-cleanup-ready' }
  let connected = true,
    reporter,
    fault,
    disconnects = 0
  emitter.pid = process.pid
  emitter.exitCode = null
  emitter.signalCode = null
  Object.defineProperty(emitter, 'connected', { get: () => connected })
  const control = createSourceCaseRuntime({
    connected: () => connected,
    report() {},
    failed: state => reporter(state),
    ...(options.budget ? { budget: options.budget } : {}),
  })
  emitter.on('disconnect', () => {
    if (!control.runtime.failed) control.fail(new Error('existing owner disconnect first'))
  })
  options.beforeListener?.(emitter, control)
  reporter = createSourceFailureReporter({
    identity,
    connected: () => connected,
    send() {},
    sendFailure: control.fail,
    write(value) {
      if (options.writeFailure) throw new Error('write failed before durable receipt')
      fs.writeFileSync(
        path.join(directory, 'failure-latched.json'),
        options.noncanonical ? JSON.stringify(value, null, 2) : JSON.stringify(value) + '\n',
        { flag: 'wx' },
      )
      fault.reportError()
      throw new Error(sourceIpcFaultReportError)
    },
  })
  fault = createSourceIpcFault({
    control,
    identity,
    directory,
    emitter,
    connected: () => connected,
    disconnect() {
      disconnects++
      if (options.throwDisconnect) throw new Error('disconnect threw')
      if (!options.remainConnected) connected = false
      if (options.earlyEvent) emitter.emit('disconnect')
      else
        queueMicrotask(() => {
          emitter.emit('disconnect')
          if (options.duplicateEvent) emitter.emit('disconnect')
        })
    },
    read(name) {
      const data = readSourceFaultJson(directory, name)
      if (name === 'failure-latched.json') options.corrupt?.(data.value)
      return data
    },
  })
  return { directory, identity, emitter, control, fault, disconnects: () => disconnects }
}
function readyFlow(h) {
  const root = deferred(),
    admission = h.control.runtime.begin('WARMUP_READY'),
    pair = { ready: root.promise, client: {} }
  h.control.runtime.keep(admission, pair.ready)
  let forbidden = 0
  const continuation = (async () => {
    await pair.ready
    h.fault.window(unrequested)
    h.fault.waiter()
    await h.fault.gate
    h.fault.entered()
    h.control.runtime.assertActive()
    forbidden++
  })()
  h.fault.observeReady(pair) // Registered AFTER the real helper starts its original await, while ACTIVE.
  const stopped = continuation.catch(error => h.fault.stopped(error))
  return { root, admission, pair, stopped, forbidden: () => forbidden }
}
test('actual ready reaction ordering validates durable first cause before one release and fences fixture', async t => {
  const h = fixture(t),
    flow = readyFlow(h)
  flow.root.resolve({ genuineSyntheticValue: true })
  await flow.stopped
  assert.equal(h.disconnects(), 1)
  assert.equal(flow.forbidden(), 0)
  assert.equal(h.control.state.decisive, flow.admission)
  assert.equal(h.control.state.decisive.original, flow.pair.ready)
  assert.equal(h.control.state.error.message, sourceIpcFaultCause)
  const armed = readSourceFaultJson(h.directory, 'fault-armed.json').value,
    receipt = readSourceFaultJson(h.directory, 'failure-latched.json'),
    observation = readSourceFaultJson(h.directory, 'fault-observations.json').value
  validateSourceFaultObservation(observation, h.identity, armed, receipt)
  assert(observation.rows.reportError < observation.rows.actualEvent)
  assert(observation.rows.receipt < observation.rows.release)
  assert(!fs.existsSync(path.join(h.directory, 'owner-retention-callback-commit.json')))
})
const corruptions = [
  ['pid', value => value.pid++],
  ['nonce', value => (value.nonce += 'wrong')],
  ['selector', value => (value.faultSelector = 'ipc-reserve-controlled')],
  ['phase', value => (value.phase = 'OTHER')],
  ['admission', value => value.admission++],
  ['cause', value => (value.error = 'later error')],
  ['unfilled', value => (value.originalCaptured = false)],
  ['extra', value => (value.unreviewed = true)],
]
for (const [name, corrupt] of corruptions)
  test('receipt ' + name + ' mismatch leaves original gate pending', async t => {
    const h = fixture(t, { corrupt }),
      flow = readyFlow(h)
    flow.root.resolve({})
    for (let n = 0; n < 5; n++) await Promise.resolve()
    assert.equal(h.fault.rows.release, 0)
    assert.equal(flow.forbidden(), 0)
    assert.equal(h.control.state.error.message, sourceIpcFaultCause)
  })
for (const options of [
  { writeFailure: true },
  { noncanonical: true },
  { earlyEvent: true },
  { throwDisconnect: true },
  { remainConnected: true },
]) {
  test('missing/canonical/event/disconnect defect refuses release ' + JSON.stringify(options), async t => {
    const h = fixture(t, options),
      flow = readyFlow(h)
    flow.root.resolve({})
    for (let n = 0; n < 5; n++) await Promise.resolve()
    assert.equal(h.fault.rows.release, 0)
    assert.equal(flow.forbidden(), 0)
    assert.equal(h.disconnects(), 1)
  })
}
test('actual inert passive-cap overflow after the latch retains orphan and fixed first cause; no native budget shrink', async t => {
  let overflow
  const h = fixture(t, {
      budget: { passive: 1, admissions: 32, references: 8 },
      beforeListener(emitter, control) {
        emitter.on('disconnect', () => {
          const admission = control.state.current
          control.observation.capture({}, admission, 'inert-first-slot')
          overflow = { exactOverflowOriginal: true }
          control.observation.capture(overflow, admission, 'inert-overflow-slot')
        })
      },
    }),
    flow = readyFlow(h)
  flow.root.resolve({})
  for (let n = 0; n < 5; n++) await Promise.resolve()
  assert.equal(h.control.state.orphan, overflow)
  assert.equal(h.control.state.incomplete, true)
  assert.equal(h.control.state.error.message, sourceIpcFaultCause)
  assert.equal(h.fault.rows.release, 0)
})

function inertInstrumentation() {
  class FakeClient {
    $queryRawUnsafe(...args) {
      return this.raw(...args)
    }
    $executeRawUnsafe(...args) {
      return this.raw(...args)
    }
    $transaction(...args) {
      return this.transaction(...args)
    }
  }
  const source = fs.readFileSync(new URL('./source-custody-instrumentation.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (name === '@prisma/client') return { PrismaClient: FakeClient }
      if (name === './source-custody-passive-forwarding.mjs') return sourceForwarding
      assert.equal(name, 'node:assert/strict')
      return assert
    },
  })
  return { FakeClient, instrument: exports.instrumentSourcePersistence }
}
test('actual armed wrapper captures filled originals, forwards post-FAILED lazy raw returns and suppresses its existing error', async t => {
  const h = fixture(t, { selector: 'ipc-reserve-controlled' }),
    { FakeClient, instrument } = inertInstrumentation()
  const client = new FakeClient(),
    tx = new FakeClient(),
    start = deferred(),
    seen = [],
    callbackThis = {},
    extra = {}
  const callbackValue = {},
    rootValue = {}
  let consumers = 0,
    callbackReturn,
    outerOriginal,
    callbackCalls = 0,
    productContinuation = 0,
    forbidden = 0
  tx.raw = function (...args) {
    const original = {
      then(resolve, reject) {
        consumers++
        return Promise.resolve('original raw value').then(resolve, reject)
      },
    }
    seen.push({ receiver: this, args, original })
    return original
  }
  client.transaction = function (action) {
    outerOriginal = (async () => {
      await start.promise
      callbackReturn = action.call(callbackThis, tx, extra)
      return callbackReturn
    })()
    return outerOriginal
  }
  const trace = instrument(h.control.runtime, h.fault)
  h.fault.window(unrequested)
  const admission = h.control.runtime.begin('IPC_RESERVE_CONTROLLED')
  h.fault.arm(admission)
  trace.rejectNextOuter(admission.phase)
  const root = (async () => {
    await client.$transaction(async function (actualTx, actualExtra) {
      callbackCalls++
      assert.equal(this, callbackThis)
      assert.equal(actualTx, tx)
      assert.equal(actualExtra, extra)
      await actualTx.$queryRawUnsafe('settings')
      assert(h.control.runtime.failed)
      productContinuation++
      for (let n = 0; n < 6; n++) await actualTx.$executeRawUnsafe('genuine inert continuation', n)
      return callbackValue
    })
    return rootValue
  })()
  h.control.runtime.keep(admission, root)
  h.fault.rootReturned(root)
  h.fault.waiter()
  const driver = (async () => {
    await h.fault.gate
    h.fault.entered()
    h.control.runtime.assertActive()
    forbidden++
  })()
  const stopped = driver.catch(error => h.fault.stopped(error))
  assert.equal(consumers, 0)
  start.resolve()
  await stopped
  await root
  for (let n = 0; n < 3; n++) await Promise.resolve()
  assert.equal(callbackCalls, 1)
  assert.equal(productContinuation, 1)
  assert.equal(forbidden, 0)
  assert.equal(consumers, 7, 'Only the seven genuine product awaits consumed lazy raw values')
  assert.equal(callbackReturn, h.fault.refs.controlled)
  assert.notEqual(h.fault.refs.callback, callbackReturn)
  assert.equal(h.fault.refs.outer, outerOriginal)
  assert.equal(h.fault.refs.root, root)
  assert.equal(h.fault.refs.callbackValue, callbackValue)
  assert.equal(h.fault.refs.controlledValue, callbackValue)
  assert.equal(h.fault.refs.rootValue, rootValue)
  for (const row of seen) {
    assert.equal(row.receiver, tx)
    assert(h.control.state.passive.includes(row.original))
  }
  const observed = readSourceFaultJson(h.directory, 'fault-observations.json').value
  validateSourceFaultObservation(
    observed,
    h.identity,
    readSourceFaultJson(h.directory, 'fault-armed.json').value,
    readSourceFaultJson(h.directory, 'failure-latched.json'),
  )
  assert.equal(observed.postFailureRaw.length, 6)
})
test('actual fault supervisor readiness requires disconnect plus evidence, and finalization rechecks late owner failure', async t => {
  const h = fixture(t),
    flow = readyFlow(h)
  const outcomePromise = observeSourceIpcFaultOwner(h.emitter, h.directory, 'ipc-cleanup-ready', h.identity.nonce)
  flow.root.resolve({})
  await flow.stopped
  const outcome = await outcomePromise
  h.emitter.emit('exit', 0, null)
  let publications = 0
  assert.throws(() => outcome.finalize(() => publications++), /revoked/)
  assert.equal(publications, 0)
})
test('actual fault supervisor publishes distinct fault outcome only after final evidence check', async t => {
  const h = fixture(t),
    flow = readyFlow(h)
  const outcomePromise = observeSourceIpcFaultOwner(h.emitter, h.directory, 'ipc-cleanup-ready', h.identity.nonce)
  flow.root.resolve({})
  await flow.stopped
  const outcome = await outcomePromise
  let publications = 0
  outcome.finalize(() => publications++)
  assert.equal(publications, 1)
  assert.throws(() => outcome.finalize(() => publications++))
})
test('duplicate actual event revokes completion without recovering fixture progress or first cause', async t => {
  const h = fixture(t, { duplicateEvent: true }),
    flow = readyFlow(h)
  flow.root.resolve({})
  await flow.stopped
  assert(h.fault.rows.invalid)
  assert.equal(flow.forbidden(), 0)
  assert.equal(h.control.state.error.message, sourceIpcFaultCause)
  assert(!fs.existsSync(path.join(h.directory, 'fault-observations.json')))
})
test('genuine callback rejection after the armed hook stays the original rejection and cannot produce fault success', async t => {
  const h = fixture(t, { selector: 'ipc-reserve-controlled' }),
    { FakeClient, instrument } = inertInstrumentation()
  const client = new FakeClient(),
    start = deferred(),
    originalError = new Error('genuine product rejection')
  client.transaction = async action => {
    await start.promise
    return action({})
  }
  const trace = instrument(h.control.runtime, h.fault)
  h.fault.window(unrequested)
  const admission = h.control.runtime.begin('IPC_RESERVE_CONTROLLED')
  h.fault.arm(admission)
  trace.rejectNextOuter(admission.phase)
  const root = (async () =>
    client.$transaction(async () => {
      await Promise.resolve()
      throw originalError
    }))()
  h.control.runtime.keep(admission, root)
  h.fault.rootReturned(root)
  h.fault.waiter()
  const driver = (async () => {
    await h.fault.gate
    h.fault.entered()
    h.control.runtime.assertActive()
  })()
  const stopped = driver.catch(error => h.fault.stopped(error))
  start.resolve()
  await stopped
  await assert.rejects(root, error => error === originalError)
  await assert.rejects(h.fault.refs.controlled, error => error === originalError)
  for (let n = 0; n < 3; n++) await Promise.resolve()
  assert(h.fault.rows.invalid)
  assert.equal(h.control.state.error.message, sourceIpcFaultCause)
  assert(!fs.existsSync(path.join(h.directory, 'fault-observations.json')))
})

function injectionFixture(selector = 'ipc-cleanup-ready') {
  const root = {},
    admission = { filled: true, original: root },
    cause = new Error(sourceIpcFaultCause),
    trace = []
  let live = true
  const state = {
    failed: false,
    current: admission,
    admissionCount: 13,
    references: new Map([['original', root]]),
    error: undefined,
  }
  const rows = {
    order: 0,
    invoked: 0,
    lost: 0,
    invalid: undefined,
    waiter: 1,
    cleanupUnrequested: true,
    observerRegistrations: selector === 'ipc-cleanup-ready' ? 2 : 4,
  }
  const refs = { admission, root }
  const control = {
    fail(error) {
      assert.equal(this, control)
      trace.push(['fail', error])
      assert(rows.lost > rows.invoked)
      state.failed = true
      state.error = error
    },
  }
  const connected = function () {
    assert.equal(this, undefined)
    trace.push(['connected', live])
    return live
  }
  const disconnect = function () {
    assert.equal(this, undefined)
    trace.push(['disconnect'])
    assert.equal(rows.invoked, 1)
    assert.equal(state.failed, false)
    live = false
  }
  return { context: Object.freeze({ control, state, selector, rows, refs, cause, connected, disconnect }), trace }
}
for (const selector of ['ipc-cleanup-ready', 'ipc-reserve-controlled']) {
  test(
    'actual complete injection effect preserves original receivers/association/counters/disconnect/first-cause order ' +
      selector,
    () => {
      const h = injectionFixture(selector),
        c = h.context
      assert.equal(injectSourceIpcFault(c), undefined)
      assert.deepEqual(h.trace, [['connected', true], ['disconnect'], ['connected', false], ['fail', c.cause]])
      assert.equal(c.rows.observersAtFault, selector === 'ipc-cleanup-ready' ? 2 : 4)
      assert.equal(c.rows.admissionsAtFault, 13)
      assert.equal(c.rows.namedReferencesAtFault, 1)
      assert.equal(c.rows.invoked, 1)
      assert.equal(c.rows.lost, 2)
      assert.equal(c.state.error, c.cause)
      assert.equal(c.refs.admission.original, c.refs.root)
      assert.throws(() => injectSourceIpcFault(c), /One active pre-waited fault only/)
      assert.equal(h.trace.filter(row => row[0] === 'disconnect').length, 1)
    },
  )
}
for (const mutate of [
  c => {
    c.rows.invoked = 1
  },
  c => {
    c.rows.invalid = 'invalid'
  },
  c => {
    c.state.failed = true
  },
  c => {
    c.rows.waiter = 0
  },
  c => {
    c.rows.cleanupUnrequested = false
  },
  c => {
    c.refs.admission.filled = false
  },
  c => {
    c.refs.admission.original = {}
  },
  c => {
    c.state.current = {}
  },
  c => {
    c.rows.observerRegistrations = 3
  },
]) {
  test(
    'actual injection full effect refuses invalid original preconditions before disconnect ' + mutate.toString(),
    () => {
      const h = injectionFixture()
      mutate(h.context)
      assert.throws(() => injectSourceIpcFault(h.context))
      assert.equal(h.trace.filter(row => row[0] === 'disconnect' || row[0] === 'fail').length, 0)
    },
  )
}
for (const failure of ['throw', 'still-connected', 'wrong-first-cause']) {
  test('actual injection effect does not replace original disconnect/latch failure ' + failure, () => {
    const h = injectionFixture(),
      c = h.context,
      original = new Error('original disconnect'),
      context = { ...c }
    if (failure === 'throw')
      context.disconnect = function () {
        assert.equal(this, undefined)
        throw original
      }
    if (failure === 'still-connected') context.disconnect = () => {}
    if (failure === 'wrong-first-cause')
      context.control = {
        fail() {
          c.state.error = new Error('foreign')
        },
      }
    const error = (() => {
      try {
        injectSourceIpcFault(context)
      } catch (error) {
        return error
      }
    })()
    assert(error)
    if (failure === 'throw') assert.equal(error, original)
    assert.equal(c.rows.invoked, 1)
    assert.equal(c.rows.lost, failure === 'wrong-first-cause' ? 2 : 0)
  })
}
