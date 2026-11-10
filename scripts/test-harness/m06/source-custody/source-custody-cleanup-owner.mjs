// Derived from accepted initial-a3: stage import path and lexical this use adapted for repository lint.
// Initial A only: actual known cleanup with one controlled JS outer ACK. Never opens native SQLite.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { Module } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyPacketClient } from './source-custody-client-binding.mjs'
import { registerSourceFailureHandlers } from './source-custody-guard.mjs'
import {
  createCleanupSourceOwnerBootstrap,
  createCleanupSourceKnownClosedHandlers,
} from './source-custody-owner-evidence.mjs'
import { createSourceCleanupForwarders } from './source-custody-passive-forwarding.mjs'
import { assertSourceFactoryRefusal } from './source-custody-case-protocols.mjs'
const [directory, selectedLabel, nonce, faultSelector] = process.argv.slice(2)
const retained = {
  phase: 'START',
  clients: [],
  bindings: [],
  promises: [],
  actualStops: [],
  actualClients: [],
  nativeObjects: [],
  nativeGates: [],
  nativeDescriptors: [],
  controlledAcks: [],
  error: undefined,
}
// Installed before product/client import or any report; failure never removes this anchor.
const lifetime = setInterval(() => void retained, 60000)
const closureState = { knownClosed: false, acknowledged: false }
const bootstrap = createCleanupSourceOwnerBootstrap({
  identity: { pid: process.pid, selectedLabel, nonce, ...(faultSelector ? { faultSelector } : {}) },
  directory,
  retained,
  emitter: process,
})
const { control, runtime } = bootstrap

const failure = control.fail,
  latch = control.fail,
  event = runtime.event
registerSourceFailureHandlers(process, failure)
const closureHandlers = createCleanupSourceKnownClosedHandlers({
  runtime,
  fail: control.fail,
  state: closureState,
  lifetime,
  clearLifetime: clearInterval,
  disconnect: () => process.disconnect(),
})
process.on('disconnect', closureHandlers.disconnected)
process.on('message', closureHandlers.message)

function observe(action) {
  if (runtime.failed) return
  try {
    action()
  } catch (error) {
    failure(error)
  }
}
function deferred() {
  let resolve
  const promise = new Promise(done => {
    resolve = done
  })
  return { promise, resolve }
}
function ownValue(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  assert(descriptor && Object.hasOwn(descriptor, 'value'), 'Expected genuine own data field ' + key)
  return descriptor.value
}
function functionHash(fn) {
  return createHash('sha256').update(Function.prototype.toString.call(fn)).digest('hex')
}
function methodDescriptor(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  assert(descriptor && typeof descriptor.value === 'function', 'Expected genuine method data descriptor ' + key)
  return descriptor
}
function descriptorEvidence(descriptor) {
  return {
    writable: descriptor.writable,
    enumerable: descriptor.enumerable,
    configurable: descriptor.configurable,
    functionName: descriptor.value.name,
    functionHash: functionHash(descriptor.value),
  }
}
function watch(promise) {
  runtime.assertActive()
  const state = { status: 'PENDING' }
  const observer = promise.then(
    () => {
      state.status = 'FULFILLED'
    },
    error => {
      state.status = 'REJECTED'
      latch(error)
    },
  )
  control.observation.capture(observer, control.observation.origin(), 'watch-observer')
  return state
}
async function causalPending(states) {
  runtime.assertActive()
  // Selected ACK is unresolved by construction. These bounded jobs allow resolved-shortcut
  // reactions to run AFTER the other actual client chain has causally completed; no clock proof.
  for (let index = 0; index < 8; index++) {
    await runtime.keep(runtime.begin('AUX_AWAIT_4699', 'auxiliary'), Promise.resolve())
    runtime.assertActive()
  }
  runtime.assertActive()
  for (const state of states)
    assert.equal(state.status, 'PENDING', 'Outer cleanup advertised completion while ACK held')
  runtime.assertActive()
}
const originalLoad = Module._load
Module._load = function (request, ...args) {
  if (['node:sqlite', 'sqlite', 'sqlite3', 'better-sqlite3'].includes(request))
    throw new Error('OWNER_NATIVE_DATABASE_IMPORT_FORBIDDEN')
  return Reflect.apply(originalLoad, this, [request, ...args])
}
try {
  runtime.assertActive()
  assert(path.isAbsolute(directory))
  runtime.assertActive()
  assert(['canonical', 'resolver'].includes(selectedLabel))
  runtime.assertActive()
  assert.deepEqual(process.execArgv, [])
  runtime.assertActive()
  assert.equal(process.env.NODE_ENV, 'test')
  runtime.assertActive()
  assert.equal(process.env.DATABASE_URL, `file:${path.join(directory, 'tested.db')}`)
  runtime.assertActive()
  event('owner-start', {
    execArgv: process.execArgv,
    nodeVersion: process.version,
    selectedLabel,
    schema: 'THREE_ID_ONLY_STUBS_PLUS_ONE_SOURCE_CUSTODY_MIGRATION',
    engineQueryEvents: 'UNAVAILABLE_UNCONFIGURED',
    scope: 'INITIAL_A_HELD_FULFILLED_ONLY',
  })
  runtime.assertActive()
  const stage = bootstrap.beginStage(
    path.dirname(fileURLToPath(import.meta.url)),
    'AUX_AWAIT_5705',
    () => import('./source-custody-cases.ts'),
  )
  const { packet, clientManifest } = stage
  const api = await stage.actual
  runtime.assertActive()
  verifyPacketClient(clientManifest, packet)
  function factory(name) {
    runtime.assertActive()
    assert(!runtime.failed, 'Failure latch forbids successor construction')
    runtime.assertActive()
    const admission = runtime.begin(name.toUpperCase() + '_READY')
    runtime.assertActive()
    const pair = api.createProviderSourcePrismaClient(`file:${path.join(directory, name + '.db')}`)
    control.observation.capture(pair, admission, 'cleanup-factory-pair')
    runtime.keep(admission, pair.ready)
    retained.clients.push(pair.client)
    runtime.assertActive()
    return pair
  }
  runtime.assertActive()
  async function ready(pair) {
    runtime.assertActive()
    const binding = await runtime.keep(runtime.begin('AUX_AWAIT_6167', 'auxiliary'), pair.ready)
    if (bootstrap.fault) {
      bootstrap.fault.window(api.providerSourceDatabaseSnapshot(binding))
      bootstrap.fault.waiter()
      await bootstrap.fault.gate
      bootstrap.fault.entered()
    }
    runtime.assertActive()
    assert(!runtime.failed, 'Failure latch forbids continuing preparation')
    runtime.assertActive()
    retained.bindings.push(binding)
    runtime.assertActive()
    return binding
  }
  runtime.assertActive()
  function rawEngine(client) {
    const raw = client._originalClient
    assert.equal(Object.getPrototypeOf(raw), api.PrismaClient.prototype)
    assert.equal(ownValue(raw, '_originalClient'), raw)
    assert.equal(ownValue(raw, '_appliedParent'), client)
    const engine = ownValue(raw, '_engine')
    assert.equal(client._engine, engine)
    assert.equal(engine.name, 'LibraryEngine')
    return { raw, engine }
  }
  runtime.assertActive()
  function assertClosed(binding) {
    const snapshot = api.providerSourceDatabaseSnapshot(binding)
    assert.equal(snapshot.cleanupPending, false)
    assert.equal(snapshot.retired, false)
    for (const part of [snapshot.canonical, snapshot.resolver]) {
      assert.equal(part.closed, true)
      assert.equal(part.engineClosed, true)
      assert.equal(part.nativeClosed, true)
      assert.equal(part.holds, 0)
      assert.equal(part.stopCalls, 1)
      assert.equal(part.nativeCalls, 1)
    }
    return snapshot
  }
  runtime.assertActive()
  const warmup = factory('warmup')
  runtime.assertActive()
  const warmupReadyAdmission = runtime.begin('AUX_AWAIT_7323', 'auxiliary'),
    warmupPreparing = runtime.keep(warmupReadyAdmission, ready(warmup))
  if (bootstrap.fault) bootstrap.fault.observeReady(warmup)
  const warmupBinding = await warmupPreparing
  runtime.assertActive()
  const warmupEngine = rawEngine(warmup.client).engine
  runtime.assertActive()
  const enginePrototype = Object.getPrototypeOf(warmupEngine)
  runtime.assertActive()
  const stopDescriptor = methodDescriptor(enginePrototype, 'stop')
  runtime.assertActive()
  const rawDescriptor = methodDescriptor(api.PrismaClient.prototype, '$queryRawUnsafe')
  runtime.assertActive()
  const clientDescriptor = methodDescriptor(api.PrismaClient.prototype, '$disconnect')
  runtime.assertActive()
  assert.equal(ownValue(Object.getPrototypeOf(warmup.client._originalClient), 'constructor'), api.PrismaClient)
  runtime.assertActive()
  event('genuine-prototype-descriptors', {
    engineName: warmupEngine.name,
    engineConstructorName: enginePrototype.constructor.name,
    stop: descriptorEvidence(stopDescriptor),
    rawQuery: descriptorEvidence(rawDescriptor),
    clientDisconnect: descriptorEvidence(clientDescriptor),
    generatedClientVersion: warmup.client._clientVersion,
  })
  runtime.assertActive()
  assert(!runtime.failed, 'Failure latch forbids fresh cleanup')
  runtime.assertActive()
  await runtime.keep(runtime.begin('WARMUP_FULL_CLEANUP'), api.disposeProviderSourceDatabase(warmupBinding))
  runtime.assertActive()
  assert(!runtime.failed, 'Failure latch forbids instrumentation after failed cleanup')
  runtime.assertActive()
  event('warmup-known-full-cleanup', { snapshot: assertClosed(warmupBinding) })
  runtime.assertActive()
  let collection = true,
    allowlist,
    selectedEngine,
    selectedClient,
    firstBindingCleanup
  runtime.assertActive()
  const seen = new Map(),
    stopRows = new Map(),
    clientRows = new Map(),
    reached = deferred(),
    ack = deferred()
  runtime.assertActive()
  runtime.retain('cleanupReached', reached)
  runtime.retain('cleanupAck', ack)
  retained.controlledAcks.push(ack.promise)
  runtime.assertActive()
  runtime.keep(runtime.begin('ACK_CREATED_NOT_RELEASED', 'auxiliary'), ack.promise)
  runtime.assertActive()
  const originalQuery = rawDescriptor.value,
    originalStop = stopDescriptor.value,
    originalClientDisconnect = clientDescriptor.value
  runtime.assertActive()
  const { queryEntry, clientDisconnectEntry, controlledStop } = createSourceCleanupForwarders({
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
    get collection() {
      return collection
    },
    get allowlist() {
      return allowlist
    },
    get selectedEngine() {
      return selectedEngine
    },
  })
  runtime.assertActive()
  Object.defineProperty(api.PrismaClient.prototype, '$queryRawUnsafe', { ...rawDescriptor, value: queryEntry })
  runtime.assertActive()
  Object.defineProperty(enginePrototype, 'stop', { ...stopDescriptor, value: controlledStop })
  runtime.assertActive()
  Object.defineProperty(api.PrismaClient.prototype, '$disconnect', {
    ...clientDescriptor,
    value: clientDisconnectEntry,
  })
  runtime.assertActive()
  event('ordinary-wrappers-installed-before-tested-mint', {
    queryWrapperHash: functionHash(queryEntry),
    stopWrapperHash: functionHash(controlledStop),
    clientWrapperHash: functionHash(clientDisconnectEntry),
    receiverPreserving: 'Reflect.apply(unbound,this,args)',
  })
  runtime.assertActive()
  const tested = factory('tested')
  runtime.assertActive()
  const testedBinding = await runtime.keep(runtime.begin('AUX_AWAIT_13253', 'auxiliary'), ready(tested))
  runtime.assertActive()
  collection = false
  runtime.assertActive()
  assert.equal(seen.size, 2, 'Exactly canonical plus private resolver preparation receivers required')
  runtime.assertActive()
  const canonicalEngine = rawEngine(tested.client).engine
  runtime.assertActive()
  assert.equal(seen.get(canonicalEngine)?.client, tested.client)
  runtime.assertActive()
  const otherEntries = [...seen].filter(([engine]) => engine !== canonicalEngine)
  runtime.assertActive()
  assert.equal(otherEntries.length, 1)
  runtime.assertActive()
  const [resolverEngine, resolverEntry] = otherEntries[0]
  runtime.assertActive()
  assert.notEqual(resolverEntry.client, tested.client)
  runtime.assertActive()
  assert.equal(resolverEngine.library.QueryEngine, canonicalEngine.library.QueryEngine)
  runtime.assertActive()
  assert.equal(resolverEngine.QueryEngineConstructor, canonicalEngine.QueryEngineConstructor)
  runtime.assertActive()
  assert.equal(typeof canonicalEngine.library.QueryEngine, 'function')
  runtime.assertActive()
  allowlist = new Set([canonicalEngine, resolverEngine])
  runtime.assertActive()
  retained.clients.push(resolverEntry.client)
  runtime.assertActive()
  selectedEngine = selectedLabel === 'canonical' ? canonicalEngine : resolverEngine
  runtime.assertActive()
  selectedClient = seen.get(selectedEngine).client
  runtime.assertActive()
  const unselectedEngine = selectedLabel === 'canonical' ? resolverEngine : canonicalEngine
  runtime.assertActive()
  const unselectedClient = seen.get(unselectedEngine).client
  runtime.assertActive()
  // Genuine stop clears engine.engine. Keep both original objects/gates BEFORE any cleanup/report.
  const canonicalNative = canonicalEngine.engine,
    resolverNative = resolverEngine.engine
  runtime.assertActive()
  retained.nativeObjects.push(canonicalNative, resolverNative)
  runtime.assertActive()
  const canonicalNativeDescriptor = methodDescriptor(canonicalNative, 'disconnect'),
    resolverNativeDescriptor = methodDescriptor(resolverNative, 'disconnect')
  runtime.assertActive()
  retained.nativeGates.push(canonicalNativeDescriptor.value, resolverNativeDescriptor.value)
  runtime.assertActive()
  retained.nativeDescriptors.push(canonicalNativeDescriptor, resolverNativeDescriptor)
  runtime.assertActive()
  for (const descriptor of [canonicalNativeDescriptor, resolverNativeDescriptor]) {
    runtime.assertActive()
    assert.equal(descriptor.configurable, false, 'Owned native gate must remain immutable')
    runtime.assertActive()
    assert.equal(descriptor.writable, false, 'Owned native gate must remain immutable')
    runtime.assertActive()
  }
  runtime.assertActive()
  const selectedNative = selectedLabel === 'canonical' ? canonicalNative : resolverNative
  runtime.assertActive()
  const selectedNativeDescriptor = selectedLabel === 'canonical' ? canonicalNativeDescriptor : resolverNativeDescriptor
  runtime.assertActive()
  const selectedNativeGate = selectedNativeDescriptor.value
  runtime.assertActive()
  const provenance = api.providerSourceDatabaseSnapshot(testedBinding)
  runtime.assertActive()
  event('owned-native-gate-descriptors', {
    canonical: descriptorEvidence(canonicalNativeDescriptor),
    resolver: descriptorEvidence(resolverNativeDescriptor),
    underlyingNativeMethod: 'CAPTURED_PRIVATELY_BY_PRODUCT_NOT_EXPOSED_BY_FIXTURE',
    nativeBinaryDigest: provenance.library.digest,
  })
  runtime.assertActive()
  event('exact-tested-allowlist-frozen', {
    receiverCount: allowlist.size,
    canonicalAndResolverDistinct: true,
    sameQueryEngineConstructor: true,
    library: provenance.library,
    selectedLabel,
  })
  runtime.assertActive()
  assert.equal(provenance.canonical.closed, false)
  runtime.assertActive()
  assert.equal(provenance.resolver.closed, false)
  runtime.assertActive()
  assert(!runtime.failed, 'Failure latch forbids fresh cleanup admission')
  runtime.assertActive()
  let firstClientCleanup
  runtime.assertActive()
  if (selectedLabel === 'canonical')
    firstClientCleanup = runtime.keep(runtime.begin('FIRST_CANONICAL_FACADE_DISCONNECT'), tested.client.$disconnect())
  else
    firstBindingCleanup = runtime.keep(
      runtime.begin('FIRST_BINDING_DISPOSE_RESOLVER_SELECTED'),
      api.disposeProviderSourceDatabase(testedBinding),
    )
  runtime.assertActive()
  retained.activeClientPromise = firstClientCleanup
  runtime.assertActive()
  retained.activeBindingPromise = firstBindingCleanup
  runtime.assertActive()
  await runtime.keep(runtime.begin('AWAIT_SELECTED_REAL_STOP_FULFILLMENT', 'auxiliary'), reached.promise)
  runtime.assertActive()
  assert.equal(stopRows.get(selectedEngine).actualFulfilled, true)
  runtime.assertActive()
  assert(stopRows.get(selectedEngine).actual)
  runtime.assertActive()
  assert(stopRows.get(selectedEngine).controlled)
  runtime.assertActive()
  let held = api.providerSourceDatabaseSnapshot(testedBinding)
  runtime.assertActive()
  assert.equal(held[selectedLabel].nativeClosed, true)
  runtime.assertActive()
  assert.equal(held[selectedLabel].engineClosed, false)
  runtime.assertActive()
  assert.equal(held[selectedLabel].closed, false)
  runtime.assertActive()
  assert(!runtime.failed, 'Failure latch forbids later cleanup admission')
  runtime.assertActive()
  if (!firstBindingCleanup)
    firstBindingCleanup = runtime.keep(
      runtime.begin('FIRST_BINDING_DISPOSE_AFTER_SELECTED_STOP_FULFILLED'),
      api.disposeProviderSourceDatabase(testedBinding),
    )
  runtime.assertActive()
  retained.activeBindingPromise = firstBindingCleanup
  runtime.assertActive()
  // Causally finish the OTHER client's genuine chain so it cannot mask the old shortcut.
  await runtime.keep(runtime.begin('UNSELECTED_FULL_CLEANUP'), unselectedClient.$disconnect())
  runtime.assertActive()
  assert(!runtime.failed, 'Failure latch forbids repeated cleanup probes')
  runtime.assertActive()
  assert.equal(stopRows.get(unselectedEngine).actualFulfilled, true)
  runtime.assertActive()
  const otherSnapshot = api.providerSourceDatabaseSnapshot(testedBinding)
  runtime.assertActive()
  const otherLabel = selectedLabel === 'canonical' ? 'resolver' : 'canonical'
  runtime.assertActive()
  assert.equal(otherSnapshot[otherLabel].closed, true)
  runtime.assertActive()
  const repeatedClient = runtime.keep(runtime.begin('REPEATED_SELECTED_FACADE'), selectedClient.$disconnect())
  runtime.assertActive()
  assert.equal(
    runtime.keep(runtime.begin('CACHED_RETURN_22004', 'auxiliary'), selectedClient.$disconnect()),
    repeatedClient,
    'Product facade must cache full client Promise',
  )
  runtime.assertActive()
  if (firstClientCleanup) assert.equal(repeatedClient, firstClientCleanup)
  runtime.assertActive()
  assert.equal(
    runtime.keep(runtime.begin('CACHED_RETURN_22239', 'auxiliary'), api.disposeProviderSourceDatabase(testedBinding)),
    firstBindingCleanup,
    'Product binding must cache full binding Promise',
  )
  runtime.assertActive()
  const repeatedEngine = runtime.keep(runtime.begin('REPEATED_SELECTED_OWNED_ENGINE_GATE'), selectedEngine.stop())
  runtime.assertActive()
  retained.activeClientPromise = repeatedClient
  runtime.assertActive()
  retained.activeEnginePromise = repeatedEngine
  runtime.assertActive()
  assert.equal(
    runtime.keep(runtime.begin('CACHED_RETURN_22704', 'auxiliary'), selectedEngine.stop()),
    repeatedEngine,
    'Product engine must cache actual layer Promise',
  )
  runtime.assertActive()
  // Invoke only the captured immutable product gate on its original native object, never engine.engine.
  assert.deepEqual(methodDescriptor(selectedNative, 'disconnect'), selectedNativeDescriptor)
  runtime.assertActive()
  const repeatedNative = runtime.keep(
    runtime.begin('REPEATED_SELECTED_OWNED_NATIVE_GATE'),
    Reflect.apply(selectedNativeGate, selectedNative, []),
  )
  runtime.assertActive()
  assert.equal(
    runtime.keep(
      runtime.begin('CACHED_RETURN_23241', 'auxiliary'),
      Reflect.apply(selectedNativeGate, selectedNative, []),
    ),
    repeatedNative,
    'Product native must cache native layer Promise',
  )
  runtime.assertActive()
  await runtime.keep(runtime.begin('AUX_AWAIT_19203', 'auxiliary'), repeatedNative) // Its known native completion grants no whole-binding completion.
  runtime.assertActive()
  assert(!runtime.failed, 'Failure latch forbids subsequent probes')
  runtime.assertActive()
  const states = [
    watch(repeatedClient),
    watch(firstBindingCleanup),
    watch(repeatedEngine),
    watch(clientRows.get(selectedClient)),
  ]
  runtime.assertActive()
  await runtime.keep(runtime.begin('AUX_AWAIT_19514', 'auxiliary'), causalPending(states))
  runtime.assertActive()
  held = api.providerSourceDatabaseSnapshot(testedBinding)
  runtime.assertActive()
  assert.equal(held.cleanupPending, true)
  runtime.assertActive()
  assert.equal(held.retired, false)
  runtime.assertActive()
  assert.equal(held[selectedLabel].closed, false)
  runtime.assertActive()
  for (const part of [held.canonical, held.resolver]) {
    runtime.assertActive()
    assert.equal(part.stopCalls, 1)
    runtime.assertActive()
    assert.equal(part.nativeCalls, 1)
    runtime.assertActive()
  }
  runtime.assertActive()
  assert.equal(stopRows.size, 2)
  runtime.assertActive()
  assert.equal(clientRows.size, 2)
  runtime.assertActive()
  const receiverCount = seen.size
  runtime.assertActive()
  assertSourceFactoryRefusal(runtime, () =>
    api.createProviderSourcePrismaClient(`file:${path.join(directory, 'postcontrol.db')}`),
  )
  runtime.assertActive()
  assert.equal(seen.size, receiverCount)
  runtime.assertActive()
  event('ACK-held-causal-pending-assertions', {
    states: states.map(value => value.status),
    snapshot: held,
    boundedMicrotaskObservations: 8,
    directNativeResult: 'GENUINELY_FULFILLED_NATIVE_LAYER_ONLY',
    factoryRefused: true,
    originalStopCalls: stopRows.size,
    originalClientCalls: clientRows.size,
  })
  runtime.assertActive()
  assert(!runtime.failed, 'Failure latch forbids ACK release')
  runtime.assertActive()
  ack.resolve()
  runtime.assertActive()
  await runtime.keep(runtime.begin('AWAIT_FULL_BINDING_AFTER_ACK_RELEASE'), firstBindingCleanup)
  runtime.assertActive()
  const closed = assertClosed(testedBinding)
  runtime.assertActive()
  assert.equal(stopRows.get(selectedEngine).actualFulfilled, true)
  runtime.assertActive()
  event('tested-known-full-cleanup', {
    snapshot: closed,
    selectedActualAndControlledReferencesDistinct:
      stopRows.get(selectedEngine).actual !== stopRows.get(selectedEngine).controlled,
  })
  runtime.assertActive()
  const unselectedNative = selectedLabel === 'canonical' ? resolverNative : canonicalNative
  runtime.assertActive()
  const unselectedNativeGate = (selectedLabel === 'canonical' ? resolverNativeDescriptor : canonicalNativeDescriptor)
    .value
  runtime.assertActive()
  const oldOtherClient = runtime.keep(runtime.begin('CLOSED_OTHER_CLIENT_CACHE'), unselectedClient.$disconnect())
  runtime.assertActive()
  const oldOtherEngine = runtime.keep(runtime.begin('CLOSED_OTHER_ENGINE_CACHE'), unselectedEngine.stop())
  runtime.assertActive()
  const oldOtherNative = runtime.keep(
    runtime.begin('CLOSED_OTHER_NATIVE_CACHE'),
    Reflect.apply(unselectedNativeGate, unselectedNative, []),
  )
  runtime.assertActive()
  const postcontrol = factory('postcontrol')
  runtime.assertActive()
  const postcontrolBinding = await runtime.keep(runtime.begin('AUX_AWAIT_21551', 'auxiliary'), ready(postcontrol))
  runtime.assertActive()
  assert(!runtime.failed, 'Failure latch forbids postcontrol cleanup')
  runtime.assertActive()
  runtime.assertActive()
  const postcontrolCleanup = runtime.keep(
    runtime.begin('POSTCONTROL_FULL_CLEANUP'),
    api.disposeProviderSourceDatabase(postcontrolBinding),
  )
  runtime.assertActive()
  // B owns the closing lane. Repeating A's already-published gates must make no new admission.
  const successorPending = api.providerSourceDatabaseSnapshot(postcontrolBinding)
  runtime.assertActive()
  assert.equal(successorPending.cleanupPending, true)
  runtime.assertActive()
  const oldBefore = api.providerSourceDatabaseSnapshot(testedBinding)
  runtime.assertActive()
  assert.equal(
    runtime.keep(runtime.begin('CACHED_RETURN_27568', 'auxiliary'), selectedClient.$disconnect()),
    repeatedClient,
  )
  runtime.assertActive()
  assert.equal(runtime.keep(runtime.begin('CACHED_RETURN_27654', 'auxiliary'), selectedEngine.stop()), repeatedEngine)
  runtime.assertActive()
  assert.equal(
    runtime.keep(
      runtime.begin('CACHED_RETURN_27733', 'auxiliary'),
      Reflect.apply(selectedNativeGate, selectedNative, []),
    ),
    repeatedNative,
  )
  runtime.assertActive()
  assert.equal(
    runtime.keep(runtime.begin('CACHED_RETURN_27844', 'auxiliary'), unselectedClient.$disconnect()),
    oldOtherClient,
  )
  runtime.assertActive()
  assert.equal(runtime.keep(runtime.begin('CACHED_RETURN_27932', 'auxiliary'), unselectedEngine.stop()), oldOtherEngine)
  runtime.assertActive()
  assert.equal(
    runtime.keep(
      runtime.begin('CACHED_RETURN_28013', 'auxiliary'),
      Reflect.apply(unselectedNativeGate, unselectedNative, []),
    ),
    oldOtherNative,
  )
  runtime.assertActive()
  assert.deepEqual(api.providerSourceDatabaseSnapshot(testedBinding), oldBefore)
  runtime.assertActive()
  assert.deepEqual(api.providerSourceDatabaseSnapshot(postcontrolBinding), successorPending)
  runtime.assertActive()
  event('closed-original-cached-promises-during-successor-cleanup', {
    original: oldBefore,
    successor: successorPending,
    identicalLayerPromises: true,
    noAwaitBetweenSuccessorSnapshotAndRepeatedGates: true,
  })
  runtime.assertActive()
  await runtime.keep(runtime.begin('AUX_AWAIT_22921', 'auxiliary'), postcontrolCleanup)
  runtime.assertActive()
  const postClosed = assertClosed(postcontrolBinding)
  runtime.assertActive()
  verifyPacketClient(clientManifest, packet)
  // Cleanup completion is already known. Restoring test-only prototype methods adds no SQL/cleanup.
  assert(!runtime.failed, 'Failure latch forbids restoration/positive report')
  runtime.assertActive()
  Object.defineProperty(enginePrototype, 'stop', stopDescriptor)
  runtime.assertActive()
  Object.defineProperty(api.PrismaClient.prototype, '$queryRawUnsafe', rawDescriptor)
  runtime.assertActive()
  Object.defineProperty(api.PrismaClient.prototype, '$disconnect', clientDescriptor)
  runtime.assertActive()
  closureState.knownClosed = true
  runtime.assertActive()
  runtime.assertActive()
  const result = {
    status: 'KNOWN_CLOSED_INITIAL_A_ONLY',
    pid: process.pid,
    selectedLabel,
    nonce,
    schema: 'THREE_ID_ONLY_STUBS_PLUS_ONE_SOURCE_CUSTODY_MIGRATION',
    held,
    closed,
    postClosed,
    warmupKnownClosed: true,
    originalStopCalls: stopRows.size,
    originalClientCalls: clientRows.size,
    engineQueryEvents: 'UNAVAILABLE_UNCONFIGURED',
    canonicalRelease: false,
    rejectionCoverage: false,
  }
  runtime.assertActive()
  event('known-closure-result', result)
  runtime.assertActive()
  writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n')
  runtime.assertActive()
  assert(process.connected, 'Missing known-closure IPC channel')
  runtime.assertActive()
  process.send(result, error => {
    if (error) failure(error)
  })
  runtime.assertActive()
} catch (error) {
  failure(error)
  bootstrap.fault?.stopped(error)
}
