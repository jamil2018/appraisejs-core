// Pure harness tests: no product, generated client, database, owner or provider imports.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import {
  createSourceCaseRuntime,
  createSourceFailureReporter,
  registerSourceFailureHandlers,
} from './source-custody-guard.mjs'
import { createCleanupSourceKnownClosedHandlers } from './source-custody-owner-evidence.mjs'
import { assertSourceFactoryRefusal } from './source-custody-case-protocols.mjs'
function fixture(options = {}) {
  return createSourceCaseRuntime({ connected: () => true, report() {}, ...options })
}
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
test('begin fences expression evaluation; keep records the exact late original before throwing', () => {
  const control = fixture(),
    first = new Error('first'),
    admission = control.runtime.begin('REAL_PHASE')
  const actual = deferred().promise
  control.fail(first)
  assert.throws(() => control.runtime.keep(admission, actual))
  assert.equal(control.state.decisive, admission)
  assert.equal(admission.original, actual)
  let calls = 0
  assert.throws(() => control.runtime.keep(control.runtime.begin('FORBIDDEN'), ++calls))
  assert.equal(calls, 0)
  control.fail(new Error('later'))
  assert.equal(control.state.error, first)
})
test('auxiliary imports/observers cannot replace the decisive phase or original', () => {
  const { runtime, state, fail } = fixture(),
    actual = deferred().promise,
    helper = deferred().promise
  const admission = runtime.begin('FLUSH')
  assert.equal(runtime.keep(admission, actual), actual)
  runtime.keep(runtime.begin('HELPER', 'auxiliary'), helper)
  fail(new Error('fault'))
  assert.equal(state.decisive, admission)
  assert.equal(state.decisive.original, actual)
})
test('normal report failure retains original and freezes cause despite passive overflow', () => {
  const first = new Error('report'),
    control = fixture({
      report() {
        throw first
      },
      budget: { passive: 1, admissions: 2, references: 1 },
    })
  const admission = control.runtime.begin('RESERVE'),
    actual = deferred().promise
  control.runtime.keep(admission, actual)
  assert.throws(() => control.runtime.event('bad-report'))
  control.observation.capture(actual, admission, 'late')
  const orphan = deferred().promise
  assert.doesNotThrow(() => control.observation.capture(orphan, admission, 'overflow'))
  assert.equal(control.state.orphan, orphan)
  assert.equal(control.state.error, first)
  assert.equal(control.state.decisive.original, actual)
  assert.equal(control.state.incomplete, true)
})
test('a lost required channel fences fulfillment and rejection continuations without consuming the original', async () => {
  for (const reject of [false, true]) {
    let connected = true,
      subsequentActions = 0
    const { runtime, state } = fixture({ connected: () => connected }),
      original = deferred()
    runtime.keep(runtime.begin('ORIGINAL'), original.promise)
    connected = false
    if (reject) original.reject(new Error('ordinary-original-error'))
    else original.resolve('actual-value')
    try {
      await original.promise
      runtime.assertActive()
      subsequentActions++
    } catch {
      assert.throws(() => runtime.assertActive())
    }
    assert.equal(state.failed, true)
    assert.equal(subsequentActions, 0)
    assert.equal(state.decisive.original, original.promise)
  }
})
// Bundle only the instrumentation against a deliberately inert fake class, never @prisma/client.
const bundle = await build({
  stdin: {
    contents: readFileSync(new URL('./source-custody-instrumentation.ts', import.meta.url), 'utf8'),
    resolveDir: fileURLToPath(new URL('.', import.meta.url)),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [
    {
      name: 'inert-prisma-unit-double',
      setup(api) {
        api.onResolve({ filter: /^@prisma\/client$/ }, () => ({ path: 'fake', namespace: 'inert' }))
        api.onLoad({ filter: /.*/, namespace: 'inert' }, () => ({
          contents: `export class PrismaClient { $queryRawUnsafe(...args) { return this.raw(...args) } $executeRawUnsafe(...args) { return this.raw(...args) } $transaction(action, ...args) { return this.transaction(action, ...args) } }`,
        }))
      },
    },
  ],
})
const moduleUrl =
  'data:text/javascript;base64,' +
  Buffer.from(bundle.outputFiles[0].text + '\nexport { PrismaClient };').toString('base64')
const { instrumentSourcePersistence, PrismaClient } = await import(moduleUrl)
const inertDescriptors = Object.getOwnPropertyDescriptors(PrismaClient.prototype)
function restoreInertPrototype() {
  Object.defineProperties(PrismaClient.prototype, inertDescriptors)
}
test('passive wrappers preserve raw identity/receiver/args after failure and add no lazy consumer', () => {
  const control = fixture(),
    client = new PrismaClient(),
    raw = {
      then() {
        throw new Error('LAZY_ACTIVATED')
      },
    },
    args = ['sql', 42]
  client.raw = function (...actualArgs) {
    assert.equal(this, client)
    assert.deepEqual(actualArgs, args)
    return raw
  }
  const origin = control.runtime.begin('FACTORY')
  const trace = instrumentSourcePersistence(control.runtime)
  control.fail(new Error('disconnect'))
  assert.equal(client.$queryRawUnsafe(...args), raw)
  assert.equal(control.state.passive[0], raw)
  assert.equal(control.state.passiveOrigins[0], origin)
  // Restore manually only in this inert test; a real failed owner cannot restore.
  assert.throws(() => trace.restore())
  restoreInertPrototype()
})
test('an armed callback rejection becomes passive forwarding after failure, retaining actual callback/outer', async () => {
  const control = fixture(),
    client = new PrismaClient(),
    result = deferred(),
    tx = {},
    receiver = {}
  client.transaction = function (callback) {
    assert.equal(this, client)
    return callback.call(receiver, tx)
  }
  const trace = instrumentSourcePersistence(control.runtime)
  const origin = control.runtime.begin('SEND_FLUSH')
  trace.rejectNextOuter('SEND_FLUSH')
  const returned = client.$transaction(function (actualTx) {
    assert.equal(this, receiver)
    assert.equal(actualTx, tx)
    return result.promise
  })
  assert.notEqual(returned, result.promise)
  control.fail(new Error('disconnect'))
  result.resolve('genuine-fulfillment')
  assert.equal(await returned, 'genuine-fulfillment')
  assert(control.state.passive.includes(result.promise))
  assert(control.state.passive.includes(returned))
  assert.equal(control.state.decisive, origin)
  restoreInertPrototype()
})

test('failure evidence isolates throwing writes and IPC, and reports the first cause once', () => {
  const first = new Error('first'),
    second = new Error('write'),
    results = [],
    handlers = []
  let writes = 0,
    sends = 0
  let control
  const report = createSourceFailureReporter({
    identity: { pid: 7, nonce: 'unit' },
    write(result) {
      writes++
      results.push(result)
      throw second
    },
    connected: () => true,
    send(result) {
      sends++
      results.push(result)
      throw new Error('IPC')
    },
    sendFailure(error) {
      control.fail(error)
    },
  })
  control = fixture({ failed: report })
  registerSourceFailureHandlers(
    {
      on(name, handler) {
        handlers.push([name, handler])
      },
    },
    control.fail,
  )
  const original = deferred().promise
  control.runtime.keep(control.runtime.begin('ACTUAL'), original)
  assert.doesNotThrow(() => control.fail(first))
  control.fail(second)
  assert.equal(writes, 1)
  assert.equal(sends, 1)
  assert.equal(results[0].error, 'first')
  assert.equal(results[0].originalCaptured, true)
  assert.equal(control.state.error, first)
  assert.equal(handlers.length, 3)
  assert(handlers.every(([, handler]) => handler === control.fail))
})

// Exercise the actual exported known-closed handlers directly.
function knownClosedHarness(knownClosed = true) {
  const fakeProcess = new EventEmitter()
  fakeProcess.connected = true
  let clears = 0,
    disconnects = 0
  const control = fixture({ connected: () => fakeProcess.connected })
  fakeProcess.disconnect = () => {
    disconnects++
    fakeProcess.connected = false
    fakeProcess.emit('disconnect')
  }
  const handlers = createCleanupSourceKnownClosedHandlers({
    runtime: control.runtime,
    fail: control.fail,
    state: { knownClosed, acknowledged: false },
    lifetime: 'inert-anchor',
    clearLifetime() {
      clears++
    },
    disconnect: () => fakeProcess.disconnect(),
  })
  fakeProcess.on('disconnect', handlers.disconnected)
  fakeProcess.on('message', handlers.message)
  return { fakeProcess, control, clears: () => clears, disconnects: () => disconnects }
}
test('actual cleanup known-closed ACK handlers intentionally disconnect without channel-guard false failure', () => {
  const h = knownClosedHarness()
  h.fakeProcess.emit('message', { type: 'ACK_KNOWN_CLOSED' })
  assert.equal(h.disconnects(), 1)
  assert.equal(h.clears(), 1)
  assert.equal(h.control.runtime.failed, false)
})
test('actual cleanup handlers preserve anchor and first cause on unexpected disconnect/prior failure/wrong ACK', () => {
  const unexpected = knownClosedHarness()
  unexpected.fakeProcess.connected = false
  unexpected.fakeProcess.emit('disconnect')
  assert.equal(unexpected.clears(), 0)
  assert.equal(unexpected.control.runtime.failed, true)
  const prior = knownClosedHarness(),
    first = new Error('original-first-cause')
  prior.control.fail(first)
  prior.fakeProcess.emit('disconnect')
  prior.fakeProcess.emit('message', { type: 'ACK_KNOWN_CLOSED' })
  assert.equal(prior.clears(), 0)
  assert.equal(prior.disconnects(), 0)
  assert.equal(prior.control.state.error, first)
  const wrong = knownClosedHarness(false)
  wrong.fakeProcess.emit('message', { type: 'ACK_KNOWN_CLOSED' })
  assert.equal(wrong.control.runtime.failed, true)
  assert.equal(wrong.disconnects(), 0)
  assert.equal(wrong.clears(), 0)
  const duplicate = knownClosedHarness()
  duplicate.fakeProcess.emit('message', { type: 'ACK_KNOWN_CLOSED' })
  duplicate.fakeProcess.emit('message', { type: 'ACK_KNOWN_CLOSED' })
  assert.equal(duplicate.disconnects(), 1)
  assert.equal(duplicate.clears(), 1)
  assert.equal(duplicate.control.runtime.failed, true)
  const during = knownClosedHarness(),
    disconnectFault = new Error('failure during disconnect')
  during.fakeProcess.disconnect = () => {
    during.fakeProcess.connected = false
    during.control.fail(disconnectFault)
    during.fakeProcess.emit('disconnect')
  }
  during.fakeProcess.emit('message', { type: 'ACK_KNOWN_CLOSED' })
  assert.equal(during.clears(), 0)
  assert.equal(during.control.state.error, disconnectFault)
})
test('actual cleanup negative factory callback retains unexpected original pair as auxiliary before assertion failure', () => {
  const control = fixture(),
    current = control.runtime.begin('OUTSTANDING_ACTUAL'),
    actual = deferred().promise
  control.runtime.keep(current, actual)
  const pair = {
    client: { original: true },
    ready: {
      then() {
        throw new Error('READY_CONSUMED')
      },
    },
  }
  let calls = 0
  const callback = () =>
    assertSourceFactoryRefusal(control.runtime, () => {
      calls++
      return pair
    })
  assert.throws(callback, assert.AssertionError)
  assert.equal(calls, 1)
  const retainedPair = control.state.admissions.find(record => record?.original === pair)
  assert.equal(retainedPair.kind, 'auxiliary')
  assert.equal(retainedPair.original.client, pair.client)
  assert.equal(retainedPair.original.ready, pair.ready)
  assert.equal(control.state.current, current)
  assert.equal(current.original, actual)
  control.fail(new Error('later failure'))
  assert.throws(callback)
  assert.equal(calls, 1)
})
