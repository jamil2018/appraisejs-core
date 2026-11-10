import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createFixtureAdmission } from './custody-fixture-admission.ts'
import { createServiceOriginalSendCallback } from './custody-service-send-callback.ts'
import { enterServiceIpcFaultWindow } from './custody-service-ipc-window.ts'
import { dispatchServiceComplementAfterCommit, runServiceOwnerMain } from './custody-service-routing.ts'
import { serviceNormalReportDelivered, routeNativeFixtureReply } from './custody-fixture-transport.ts'
function callbackFixture() {
  const retained = [],
    admission = createFixtureAdmission(
      retained,
      () => true,
      () => {},
    ),
    calls = [],
    value = {},
    source = {},
    client = {},
    callback = async tx => {
      calls.push(['callback', tx])
      return value
    }
  const fixture = {
    client,
    source,
    sourceId: 'source',
    permit: { intentId: 'intent' },
    f: { binding: { journeyId: 'journey' } },
    contender: { probe: async (...args) => calls.push(['probe', ...args]) },
  }
  const scope = {
    admission,
    fixture,
    name: 'positive',
    callback,
    ipcFaultCase: false,
    sendWindow: {
      actualSendWindow: false,
      faultTransportReturned: false,
      faultTransportConsumed: false,
      faultOuterScope: undefined,
      faultRestore: undefined,
    },
    beforeOwnership: 1,
    enterIpcFaultWindow: async (...args) => calls.push(['fault', ...args]),
    recordIpcFaultFence: error => calls.push(['fence', error]),
    originalSendWindowObserved: () => true,
    event: (...args) => calls.push(['event', ...args]),
    writeExpectation: row => calls.push(['expectation', row]),
    scalarState: row => row,
    crash: async gate => calls.push(['crash', gate]),
  }
  const read = (name, row) => ({
    findUniqueOrThrow: async args => {
      calls.push([name, args])
      return row
    },
  })
  const tx = {
    qualityJourneyProviderSourceState: read('state', { pendingBatchId: 'batch' }),
    qualityJourneyProviderDispatchIntent: read('intent', {}),
    qualityJourney: read('journey', {}),
  }
  return { retained, admission, calls, value, fixture, scope, tx }
}
test('actual send callback preserves product fulfillment and exact postcallback read/BUSY/report ordering', async () => {
  const x = callbackFixture(),
    callback = createServiceOriginalSendCallback(x.scope)
  assert.equal(await callback(x.tx), x.value)
  assert.deepEqual(
    x.calls.map(row => row[0]),
    ['callback', 'state', 'intent', 'journey', 'probe', 'event'],
  )
  assert.equal(x.calls[0][1], x.tx)
  assert.deepEqual(x.calls[4].slice(1), ['journey', 'source', true])
  assert.equal(x.scope.sendWindow.actualSendWindow, true)
})
test('actual selected fault window precedes every postcallback SQL read and is consumed once', async () => {
  const x = callbackFixture()
  x.scope.ipcFaultCase = true
  x.scope.sendWindow.faultTransportReturned = true
  const outer = {},
    restore = () => {}
  x.scope.sendWindow.faultOuterScope = { callback: x.scope.callback, outer }
  x.scope.sendWindow.faultRestore = restore
  assert.equal(await createServiceOriginalSendCallback(x.scope)(x.tx), x.value)
  assert.equal(x.calls[1][0], 'fault')
  assert.deepEqual(x.calls[1].slice(1), [
    x.scope.callback,
    x.value,
    x.scope.sendWindow.faultOuterScope,
    x.fixture.client,
    x.fixture.source,
    restore,
  ])
  assert.equal(x.scope.sendWindow.faultTransportConsumed, true)
  x.calls.length = 0
  await createServiceOriginalSendCallback(x.scope)(x.tx)
  assert.equal(
    x.calls.some(row => row[0] === 'fault'),
    false,
  )
})
test('fault-window original rejection invokes failure-only fence and never performs later source SQL', async () => {
  const x = callbackFixture(),
    cause = new Error('fault rejection')
  x.scope.ipcFaultCase = true
  x.scope.sendWindow.faultTransportReturned = true
  x.scope.enterIpcFaultWindow = async () => {
    throw cause
  }
  await assert.rejects(createServiceOriginalSendCallback(x.scope)(x.tx), error => error === cause)
  assert.deepEqual(
    x.calls.map(row => row[0]),
    ['callback', 'fence'],
  )
  assert.equal(x.calls[1][1], cause)
})
test('first failure while product callback is pending retains exact fulfillment and fences all observation/SQL/crash work', async () => {
  const x = callbackFixture(),
    cause = new Error('STOP')
  let done
  x.scope.callback = () =>
    new Promise(resolve => {
      done = resolve
    })
  const pending = createServiceOriginalSendCallback(x.scope)(x.tx)
  x.admission.fail(cause)
  done(x.value)
  await assert.rejects(pending, error => error === cause)
  assert.ok(x.retained.includes(x.value))
  assert.deepEqual(x.calls, [])
})
test('pending-death callback retains original selected crash gate after BUSY probe and original expectation', async () => {
  const x = callbackFixture()
  x.scope.name = 'pending-death'
  await createServiceOriginalSendCallback(x.scope)(x.tx)
  assert.deepEqual(
    x.calls.map(row => row[0]),
    ['callback', 'state', 'intent', 'journey', 'probe', 'event', 'expectation', 'crash'],
  )
  assert.equal(x.calls.at(-1)[1], 'PENDING_AFTER_ACTUAL_SEND_BEFORE_OUTER_FULFILLMENT')
})
test('actual held IPC window binds six original refs before publication/send and returns its original unresolved deferred', async () => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'custody-window-inert-')),
    retained = []
  const admission = createFixtureAdmission(
      retained,
      () => true,
      () => {},
    ),
    state = { waiting: false, frame: undefined },
    identity = { case: 'ipc-loss-before-postcallback-sql', pid: 123, nonce: 'inert-only' },
    callback = () => {},
    client = {},
    source = {},
    restore = () => {},
    outer = new Promise(() => {}),
    value = {}
  let sent,
    sendResult = false
  const channel = {
    send(window) {
      assert.equal(this, channel)
      assert.equal(state.waiting, true)
      assert.equal(state.frame.references.callback, callback)
      sent = window
      return sendResult
    },
  }
  try {
    const actual = enterServiceIpcFaultWindow(
      admission,
      state,
      identity,
      workspace,
      path.join(workspace, 'events.jsonl'),
      channel,
      () => 7,
      error => admission.fail(error),
      callback,
      value,
      { callback, outer },
      client,
      source,
      restore,
    )
    assert.equal(actual, state.frame.references.gate.promise)
    assert.equal(state.frame.references.outer, outer)
    assert.ok(retained.includes(value))
    assert.ok(retained.includes(sendResult))
    assert.equal(sent, state.frame.window)
    assert.deepEqual(JSON.parse(readFileSync(path.join(workspace, 'ipc-fault-window.json'))), sent)
    const first = new Error('original disconnect')
    admission.fail(first, 'supervisor-disconnect')
    writeFileSync(
      path.join(workspace, 'ipc-fault-release.json'),
      JSON.stringify({ version: 1, ...identity, windowId: sent.windowId }),
    )
    const timeout = setTimeout(() => {}, 1000)
    try {
      const release = await actual
      assert.equal(release.windowId, sent.windowId)
      assert.equal(admission.unexpectedFailure.error, first)
    } finally {
      clearTimeout(timeout)
    }
  } finally {
    if (state.frame) clearInterval(state.frame.references.gate.snapshot().observer)
    rmSync(workspace, { recursive: true })
  }
})
test('fixed complement routing returns selected exact original promise and leaves wrong-client continuation empty', () => {
  const original = Promise.resolve(),
    calls = [],
    operations = {
      disposed() {
        calls.push('disposed')
        return original
      },
      otherKey() {
        calls.push('B')
        return original
      },
      encodingHole() {
        calls.push('hole')
        return original
      },
    }
  for (const name of [
    'disposed-original-after-writer-close',
    'old-commit-other-key-retirement',
    'unrelated-pre-sql-retirement',
  ])
    assert.equal(dispatchServiceComplementAfterCommit(name, operations), original)
  assert.equal(dispatchServiceComplementAfterCommit('wrong-original-client', operations), undefined)
  assert.deepEqual(calls, ['disposed', 'B', 'hole'])
})
function mainFixture(name) {
  const retained = [],
    admission = createFixtureAdmission(
      retained,
      () => true,
      () => {},
    ),
    calls = [],
    fixture = {},
    trace = {
      bind(value) {
        assert.equal(value, fixture)
        calls.push('bind')
      },
    }
  const operations = {
    complementNames: new Set(['complement']),
    instrumentComplementPersistence() {
      calls.push('instrument')
      return trace
    },
    async createOriginalFixture() {
      calls.push('create')
      return fixture
    },
    async performOriginalSend(value) {
      assert.equal(value, fixture)
      calls.push('send')
    },
    async crash(gate) {
      calls.push(gate)
    },
    async runComplement(value, actual) {
      assert.equal(value, fixture)
      assert.equal(actual, trace)
      calls.push('complement')
    },
    async runOutcomeCase() {
      calls.push('outcome')
    },
    async finishOriginalOwner() {
      calls.push('finish')
    },
  }
  return { calls, admission, operations, run: () => runServiceOwnerMain(name, admission, operations) }
}
test('actual main orchestration preserves complement/paused/crash fixed ordering', async () => {
  const complement = mainFixture('complement')
  await complement.run()
  assert.deepEqual(complement.calls, ['instrument', 'create', 'bind', 'send', 'complement', 'finish'])
  const paused = mainFixture('paused-send')
  await paused.run()
  assert.deepEqual(paused.calls, ['create', 'outcome', 'finish'])
  const death = mainFixture('pre-receipt-death')
  await death.run()
  assert.deepEqual(death.calls, ['create', 'send', 'AFTER_FLUSH_BEFORE_RECEIPT_RESERVATION', 'outcome', 'finish'])
})
test('main original creation fulfillment after failure is retained without binding, send, case or cleanup', async () => {
  const x = mainFixture('complement'),
    cause = new Error('STOP')
  let done
  x.operations.createOriginalFixture = () =>
    new Promise(resolve => {
      done = resolve
    })
  const pending = x.run()
  x.admission.fail(cause)
  done({})
  await assert.rejects(pending, error => error === cause)
  assert.deepEqual(x.calls, ['instrument'])
})
test('current normal report callback remains inert for fault/terminal/failure holds and retains original callback error', () => {
  const x = callbackFixture(),
    errors = []
  serviceNormalReportDelivered(x.admission, true, 'normal', null, error => errors.push(error))
  assert.equal(x.admission.currentPhase, 'owner-initialization')
  const error = new Error('original')
  serviceNormalReportDelivered(x.admission, false, 'normal', error, value => errors.push(value))
  assert.equal(errors[0], error)
  serviceNormalReportDelivered(x.admission, false, 'normal', null, value => errors.push(value))
  assert.equal(x.admission.currentPhase, 'normal-report-delivered:normal')
  x.admission.fail(error)
  serviceNormalReportDelivered(x.admission, false, 'normal', null, value => errors.push(value))
  assert.equal(errors.length, 1)
})
test('actual native reply handler keeps failure/ready/pending associations and passive reporting after failure', () => {
  const x = callbackFixture(),
    calls = [],
    effects = {
      rejectFatal: value => calls.push(['fatal', value]),
      report: value => calls.push(['report', value]),
      retain: value => calls.push(['retain', value]),
      ready: value => calls.push(['ready', value]),
      pending: value => calls.push(['pending', value]),
    }
  const ready = { type: 'ready' }
  routeNativeFixtureReply(x.admission, ready, effects)
  assert.deepEqual(calls, [
    ['report', ready],
    ['ready', ready],
  ])
  x.admission.fail(new Error('STOP'))
  const pending = { type: 'reply' }
  routeNativeFixtureReply(x.admission, pending, effects)
  assert.deepEqual(calls.at(-1), ['pending', pending])
  assert.ok(x.retained.includes(pending))
  const fatal = { type: 'fatal' }
  routeNativeFixtureReply(x.admission, fatal, effects)
  assert.deepEqual(calls.at(-1), ['fatal', fatal])
})

// Bundle only the actual composition adapter with inert helper/database imports. No product module is evaluated.
async function compositionAdapter() {
  const { createRequire } = await import('node:module')
  const { fileURLToPath } = await import('node:url')
  const { build } = createRequire(import.meta.url)('esbuild')
  const built = await build({
    entryPoints: [fileURLToPath(new URL('./custody-service-composition.ts', import.meta.url))],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    plugins: [
      {
        name: 'inert-composition-imports',
        setup(api) {
          api.onResolve({ filter: /^@\// }, args => {
            assert.ok(
              ['@/test/m06-analysis-retained-composition', '@/lib/quality-journey/provider-source-database'].includes(
                args.path,
              ),
            )
            return { path: args.path, namespace: 'inert' }
          })
          api.onLoad({ filter: /.*/, namespace: 'inert' }, args => ({
            contents: args.path.includes('/test/')
              ? 'export const composeRetainedAnalysisAfterOriginalNonstart = (...args) => globalThis.__compositionInert.helper(...args)'
              : 'export const providerSourceDatabaseClient = database => database.client; export const providerSourceDatabaseSnapshot = database => database.snapshot',
          }))
        },
      },
    ],
  })
  return import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].contents).toString('base64'))
}
const actualCompositionAdapter = compositionAdapter()
function compositionFixture() {
  const retained = [],
    calls = [],
    client = {
      qualityJourney: {
        async findUniqueOrThrow() {
          calls.push('final-read')
          return { ownershipVersion: 12 }
        },
      },
    }
  const custody = {
    allocationEntries: 1,
    frameEntries: 1,
    discardedFrames: 1,
    attemptedBytes: 1,
    allocationClearCalls: 0,
    frameClearCalls: 0,
    mayHaveActivated: false,
  }
  const sourceResources = {
    keyByteLength: 2,
    keyNonzeroBytes: 2,
    keyZeroCalls: 0,
    receiptEncodedBytes: 2,
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
  }
  const sourceSnapshot = {
    disposed: false,
    disposeRequested: false,
    held: false,
    retired: false,
    allocations: 1,
    discardedFrames: 1,
    attemptedBytes: 1,
    resources: { keyByteLength: 2, keyNonzeroBytes: 2, receiptBytes: 2, journalOpen: true },
    diagnostics: { custody, source: sourceResources },
  }
  const mint = () => ({
    closed: false,
    engineClosed: false,
    nativeClosed: false,
    closeRequested: false,
    cleanupAdmitted: false,
    holds: 0,
    stopCalls: 0,
    nativeCalls: 0,
  })
  const snapshot = {
    held: false,
    cleanupPending: false,
    retired: false,
    finalCloseRequested: false,
    lookupPending: false,
    canonical: mint(),
    resolver: mint(),
  }
  client.qualityJourneyProviderDispatchIntent = {
    async findUniqueOrThrow() {
      calls.push('B-intent')
      return {
        id: 'B',
        providerRunId: 'B-run',
        status: 'ACKNOWLEDGED',
        reconciledAt: null,
        acknowledgedAt: new Date(1000),
        turnOrdinal: 1,
        sendBoundaryId: 'B-send',
      }
    },
  }
  client.qualityJourneyWorkAttempt = {
    async findMany() {
      calls.push('attempts')
      return [
        { id: 'original-A', attempt: 1, authorizationId: 'auth1' },
        { id: 'B-attempt', attempt: 2, authorizationId: 'auth2' },
      ]
    },
  }
  client.qualityJourneyProviderSlot = {
    async findUniqueOrThrow() {
      calls.push('B-slot')
      return { intentId: 'B', providerRunId: 'B-run', sendBoundaryId: 'B-send' }
    },
  }
  const fixture = {
    client,
    database: { client, snapshot },
    source: { snapshot: () => sourceSnapshot },
    clientDestructionBaseline: structuredClone(snapshot),
    f: { binding: { workItemId: 'original-work', attemptId: 'original-A', journeyId: 'original-journey' } },
  }
  const admission = createFixtureAdmission(
    retained,
    () => true,
    () => {},
  )
  const proof = { conflicted: false, receipt: { physical: { outcome: 'NONSTART' } } }
  let finish
  const gate = new Promise(resolve => {
    finish = resolve
  })
  let deliverySnapshot = { state: 'startup', providerRunId: undefined }
  const actual = Object.freeze({
    snapshot: () => deliverySnapshot,
    start() {
      throw new Error('No second start')
    },
    cancel() {
      throw new Error('No second cancel')
    },
  })
  const helper = async (...args) => {
    calls.push('helper')
    assert.equal(args.length, 4)
    assert.equal(args[0], client)
    assert.equal(args[1], fixture.f.binding)
    assert.equal(args[2], proof)
    assert.deepEqual(Object.keys(args[3]).sort(), ['controller', 'fixture', 'followupAssignmentSecret'])
    assert.ok(retained.some(value => value?.actual === undefined && 'actual' in value))
    args[3].controller.retainDelivery(actual)
    await gate
    deliverySnapshot = {
      state: 'stopped',
      providerRunId: 'B-run',
      cleanup: { status: 'stopped', groupExitObserved: true },
    }
    return {
      a: { id: 'authored-A' },
      b: { id: 'accepted-B' },
      successorRun: {
        id: 'B-run',
        attemptId: 'B-attempt',
        status: 'ACKNOWLEDGED',
        terminalReconciledAt: null,
        turnsReserved: 1,
      },
      originalNonstart: {},
      intentTopology: { baseline: ['old', 'diagnostic'], current: ['old', 'diagnostic', 'B'], added: 'B' },
      followup: {},
      delivery: { phase: 'DELIVERY', result: { status: 'ACCEPTED', supervisor: deliverySnapshot } },
    }
  }
  globalThis.__compositionInert = { helper }
  return {
    fixture,
    retained,
    admission,
    proof,
    sourceSnapshot,
    snapshot,
    calls,
    actual,
    finish,
    run: async () =>
      (await actualCompositionAdapter).composeServiceOriginalNonstart(
        fixture,
        proof,
        { custody, source: sourceResources },
        admission,
        '/inert/authorized-child.mjs',
      ),
  }
}
test('composition retains the exact helper flight and preowned actual delivery before settlement; no repeated start or cancel', async () => {
  const x = compositionFixture()
  const pending = x.run()
  await actualCompositionAdapter
  await Promise.resolve()
  const operation = x.retained.find(value => value?.state === 'PENDING' && value.actual instanceof Promise)
  assert.ok(operation)
  assert.ok(x.retained.includes(operation.actual))
  assert.ok(x.retained.some(value => value?.actual === x.actual))
  assert.deepEqual(x.calls, ['helper'])
  x.finish()
  const evidence = await pending
  assert.equal(operation.state, 'FULFILLED')
  assert.equal(evidence.physicalB, 'UNKNOWN')
  assert.equal(evidence.originalHelperState, 'FULFILLED')
  assert.deepEqual(x.calls, ['helper', 'B-intent', 'B-slot', 'attempts', 'final-read'])
})
test('composition refuses changed original client, cleanup, retirement, hold or destruction without entering helper', async () => {
  for (const mutate of [
    x => {
      x.fixture.database.client = {}
    },
    x => {
      x.sourceSnapshot.disposeRequested = true
    },
    x => {
      x.sourceSnapshot.held = true
    },
    x => {
      x.sourceSnapshot.retired = true
    },
    x => {
      x.snapshot.cleanupPending = true
    },
    x => {
      x.snapshot.lookupPending = true
    },
    x => {
      x.snapshot.canonical.cleanupAdmitted = true
    },
    x => {
      x.snapshot.resolver.holds = 1
    },
    x => {
      x.snapshot.canonical.stopCalls++
    },
  ]) {
    const x = compositionFixture()
    mutate(x)
    await assert.rejects(x.run())
    assert.deepEqual(x.calls, [])
  }
})
test('actual failed or undrained helper result cannot reach owner cleanup; original promise and cell remain retained', async () => {
  const x = compositionFixture(),
    cause = new Error('uncertain helper')
  globalThis.__compositionInert.helper = (...args) => {
    args[3].controller.retainDelivery(x.actual)
    return Promise.reject(cause)
  }
  await assert.rejects(x.run(), error => error === cause)
  assert.ok(x.retained.includes(x.actual))
  assert.ok(x.retained.some(value => value?.state === 'REJECTED' && value.actual instanceof Promise))
  assert.deepEqual(x.calls, [])
})

test('actual undrained B prevents every later canonical read and owner lifecycle action', async () => {
  const x = compositionFixture(),
    original = globalThis.__compositionInert.helper
  globalThis.__compositionInert.helper = async (...args) => {
    const result = await original(...args)
    result.delivery.result.supervisor.cleanup.groupExitObserved = false
    return result
  }
  x.finish()
  await assert.rejects(x.run())
  assert.deepEqual(x.calls, ['helper'])
  assert.ok(x.retained.includes(x.actual))
  assert.equal(x.retained.find(value => value?.deliveries === 1).state, 'FULFILLED')
})

test('fixed recovered profiles retain old row bounds and refuse cross-profile composition topology with inert SQLite/fs/process effects', async () => {
  const { createRequire } = await import('node:module')
  const { transformSync } = createRequire(import.meta.url)('esbuild')
  const { runInNewContext } = await import('node:vm')
  const { createHash } = await import('node:crypto')
  const source = readFileSync(new URL('./custody-inspect-after-exit.mjs', import.meta.url), 'utf8')
  const code = transformSync(source, { format: 'cjs', platform: 'node', target: 'es2017' }).code
  function inspect(profile, runs, intents, observations = 1) {
    const calls = [],
      result = []
    const counts = {
      QualityJourney: 1,
      QualityJourneyProviderSlot: 1,
      QualityJourneyProviderRun: runs,
      QualityJourneyProviderDispatchIntent: intents,
      QualityJourneyProviderSourceState: profile === 'GENUINE_LEGACY_FS' ? 0 : 2,
      QualityJourneyProviderObservation: observations,
      QualityJourneyWorkAttempt: 2,
      QualityJourneyWorkAuthorization: 2,
      QualityJourneyProviderSourceLedgerRecord: 0,
    }
    const db = {
      prepare(sql) {
        return {
          get(maximum) {
            const table = /SELECT 1 FROM "([^"]+)"/.exec(sql)?.[1]
            if (table) {
              calls.push([table, maximum])
              return { count: Math.min(counts[table], maximum) }
            }
            return { count: 0 }
          },
          all() {
            return []
          },
        }
      },
      close() {},
    }
    const modules = {
      'node:sqlite': {
        DatabaseSync: function () {
          return db
        },
      },
      'node:crypto': { createHash },
      'node:path': { default: path, ...path },
      'node:fs': {
        copyFileSync() {},
        mkdirSync() {},
        readFileSync() {
          throw new Error('Unexpected artifact read')
        },
        readdirSync() {
          return []
        },
      },
    }
    runInNewContext(code, {
      require(name) {
        assert.ok(Object.hasOwn(modules, name))
        return modules[name]
      },
      process: {
        pid: 999,
        argv: [
          'node',
          'inert-inspector',
          '/inert/canonical.db',
          '11',
          profile === 'GENUINE_LEGACY_FS' ? 'NONE' : '12',
          profile,
        ],
        kill() {
          throw Object.assign(new Error('inert gone'), { code: 'ESRCH' })
        },
        stdout: {
          write(value) {
            result.push(JSON.parse(value))
          },
        },
      },
    })
    return { calls, result: result[0] }
  }
  assert.equal(inspect('ORIGINAL_C1', 1, 2).result.counts.runs, 1)
  assert.equal(inspect('GENUINE_LEGACY_FS', 1, 1).result.counts.intents, 1)
  assert.equal(inspect('ORIGINAL_COMPOSITION16Z', 2, 3, 6).result.counts.observations, 6)
  assert.throws(() => inspect('ORIGINAL_C1', 2, 3, 6), /exact canonical row\/count bounds/)
  assert.throws(() => inspect('GENUINE_LEGACY_FS', 2, 3, 6), /exact canonical row\/count bounds/)
  assert.throws(() => inspect('ORIGINAL_COMPOSITION16Z', 1, 2), /exact canonical row\/count bounds/)
  assert.throws(() => inspect('ORIGINAL_COMPOSITION16Z', 2, 3, 7), /exact canonical row\/count bounds/)
  assert.throws(() => inspect('arbitrary-profile', 2, 3, 6), /Unknown fixed inspection profile/)
})

import { createServiceOwnerBootstrap } from './custody-owner-bootstrap.ts'
import { serviceControllerResult } from './custody-service-controller-result.ts'
import { preserveServiceOwnedChildOrigin, assertServiceOwnedChildEmittedOrigin } from './custody-owned-child-origin.mjs'
import { fileURLToPath } from 'node:url'

test('actual shared owner bootstrap retains original interval and terminal adapter identity/order for known and retained owners', () => {
  for (const terminalType of ['case-known-closed', 'case-retained']) {
    const retained = [],
      calls = [],
      lifetime = {},
      identity = { case: 'inert', pid: 123, nonce: 'nonce' }
    const fixtureHash = 'a'.repeat(64)
    let actual
    actual = createServiceOwnerBootstrap(
      retained,
      error => calls.push(error),
      identity.case,
      identity.nonce,
      (handoff, delivered) => {
        calls.push('handoff')
        delivered({ ...handoff, sequence: 4 })
      },
      {
        validateFinish(type) {
          assert.equal(type, terminalType)
          calls.push('validate')
        },
        prepareCommit() {
          calls.push('prepare')
          return () => calls.push('commit')
        },
        finish(type) {
          assert.equal(type, terminalType)
          assert.equal(actual.admission.expectedTerminalHandoff, true)
          calls.push('finish')
        },
      },
      { pid: identity.pid, connected: true, send() {} },
      (callback, milliseconds) => {
        assert.equal(milliseconds, 60000)
        calls.push('interval')
        callback()
        return lifetime
      },
    )
    assert.equal(actual.lifetime, lifetime)
    assert.ok(retained.includes(lifetime))
    actual.terminal.register({ type: terminalType, sequence: 2, expectedFixtureSha256: fixtureHash })
    actual.terminal.allowHandoff()
    actual.terminal.acknowledge({
      type: 'terminal-ack',
      ...identity,
      terminalType,
      terminalSequence: 2,
      expectedFixtureSha256: fixtureHash,
    })
    assert.deepEqual(calls, ['interval', 'validate', 'handoff', 'prepare', 'commit', 'finish'])
  }
})
test('actual controller result preserves selected/slot order and exact optional known, retained and uncreated fields without effects', () => {
  const selected = ['known', 'retained', 'uncreated']
  const registry = {
    slots: [
      {
        case: 'known',
        pid: 7,
        specification: { workspace: '/inert/known', nonce: 'k' },
        terminalScope: { terminalType: 'case-known-closed' },
        disposition: 'AUTHENTICATED_TERMINAL',
        assertionsPassed: true,
      },
      {
        case: 'retained',
        pid: 8,
        specification: { workspace: '/inert/retained', nonce: 'r' },
        terminalScope: { terminalType: 'case-retained' },
        disposition: 'AUTHENTICATED_TERMINAL',
        assertionsPassed: true,
      },
      { case: 'uncreated', disposition: 'PREOWNED', assertionsPassed: false },
    ],
  }
  const result = serviceControllerResult(registry, 123, selected)
  assert.equal(result.cases, selected)
  assert.deepEqual(result, {
    version: 1,
    type: 'service-main-controller-success',
    pid: 123,
    cases: selected,
    owners: [
      {
        case: 'known',
        workspace: '/inert/known',
        pid: 7,
        nonce: 'k',
        disposition: 'AUTHENTICATED_TERMINAL',
        terminalType: 'case-known-closed',
        assertionsPassed: true,
      },
      {
        case: 'retained',
        workspace: '/inert/retained',
        pid: 8,
        nonce: 'r',
        disposition: 'AUTHENTICATED_TERMINAL',
        terminalType: 'case-retained',
        assertionsPassed: true,
      },
      {
        case: 'uncreated',
        workspace: undefined,
        pid: undefined,
        nonce: undefined,
        disposition: 'PREOWNED',
        terminalType: null,
        assertionsPassed: false,
      },
    ],
    runtimeQualified: false,
    providerQualified: false,
  })
})
test('exact static owned-child origin adaptation inverts original bytes and validates the emitted launch resource URL including spaces', () => {
  const filename = fileURLToPath(
    new URL('../../../../src/lib/quality-journey/codex-app-server/owned-child.ts', import.meta.url),
  )
  const source = readFileSync(filename, 'utf8')
  const origin = preserveServiceOwnedChildOrigin(filename, source)
  assert.equal(origin.inverse, source)
  assert.equal(origin.receipt.sourceSha256, origin.receipt.inverseSha256)
  assert.equal(origin.receipt.replacement.original, 'import.meta.url')
  assert.match(origin.receipt.originalURL, /Personal%20Projects/)
  assert.equal(
    origin.receipt.supervisor,
    fileURLToPath(new URL('../../../../scripts/owned-process-supervisor.mjs', import.meta.url)),
  )
  const emitted =
    'const supervisorPath = fileURLToPath(new URL("../../../../scripts/owned-process-supervisor.mjs", ' +
    JSON.stringify(origin.receipt.originalURL) +
    '));'
  const proof = assertServiceOwnedChildEmittedOrigin('/inert/output/owner.mjs', emitted, origin.receipt)
  assert.equal(proof.sites.length, 1)
  assert.equal(proof.effectiveSupervisor, origin.receipt.supervisor)
  for (const changed of [
    source.replace('import.meta.url', 'import.meta.resolve'),
    source.replace('import.meta.url', '"import.meta.url"'),
    source + '\nconst other = import.meta.url',
    source.replace('const supervisorPath', 'const changedPath'),
    source.replace('../../../../scripts/owned-process-supervisor.mjs', '../../../../scripts/other.mjs'),
  ])
    assert.throws(() => preserveServiceOwnedChildOrigin(filename, changed))
  assert.throws(() =>
    assertServiceOwnedChildEmittedOrigin(
      '/inert/output/owner.mjs',
      emitted.replace(origin.receipt.originalURL, 'file:///inert/wrong.ts'),
      origin.receipt,
    ),
  )
  assert.throws(() =>
    assertServiceOwnedChildEmittedOrigin('/inert/output/owner.mjs', emitted + emitted, origin.receipt),
  )
})
