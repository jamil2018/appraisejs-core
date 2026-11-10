import { encodeServiceTerminalAck } from '../fixture-terminal-codecs.mjs'
// Inert actual-function control-flow tests only. Never imports/executes an owner, product, Prisma, SQLite or IPC.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { assertActivationRetainedOutcome as validate } from './custody-activation-proof.ts'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const require = createRequire(path.join(root, 'package.json'))
const ts = require('typescript')
const harness = path.join(root, 'scripts/test-harness/m06/service-custody')
const { createFixtureAdmission } = await import(pathToFileURL(path.join(harness, 'custody-fixture-admission.ts')))
const { originalSourceResources } = await import(
  pathToFileURL(path.join(harness, 'custody-source-resource-diagnostics.ts'))
)
const { fixtureDateTime } = await import(pathToFileURL(path.join(harness, 'custody-fixture-datetime.ts')))
const ownerFile = path.join(harness, 'custody-service-owner.ts')
const matrixFile = path.join(harness, 'custody-service-matrix.ts')
function actualDeclaration(filename, name) {
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.ES2017, true)
  const matches = source.statements.filter(node => node.name?.text === name)
  assert.equal(matches.length, 1)
  return matches[0].getText(source).replace(/^export\s+/, '')
}
function compile(text) {
  const result = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.ESNext },
  })
  return result.outputText
}
const ErrorClass = new Function(
  compile(
    actualDeclaration(
      path.join(root, 'src/lib/quality-journey/codex-app-server/outcome-source-contract.ts'),
      'OutcomeSourceUnknownError',
    ),
  ) + '\nreturn OutcomeSourceUnknownError',
)()

const definitions = [
  'assertClientDestructionStable',
  'assertRetained',
  'sealOriginalProof',
  'assertActivationUnrequestedDatabase',
  'runActivationRefusal',
  'finishOriginalOwner',
]
  .map(name => actualDeclaration(ownerFile, name))
  .join('\n')
const identity = {
  sourceId: 'inert-source',
  journeyId: 'inert-journey',
  targetProjectId: 'inert-project',
  runId: 'inert-run',
  intentId: 'inert-intent',
  sendBoundaryId: 'inert-boundary',
  providerNamespace: 'synthetic:inert',
  configurationDigest: 'inert-config',
  claimEpoch: 1,
}
const expected = {
  case: 'activation-unknown',
  pid: 12345,
  nonce: 'inert-nonce',
  identity,
  originalTemporal: { reservedAt: 1700000000000 },
}
function mint() {
  return {
    closed: false,
    engineClosed: false,
    nativeClosed: false,
    closeRequested: false,
    cleanupAdmitted: false,
    layers: { client: 'UNREQUESTED', engine: 'UNREQUESTED', native: 'UNREQUESTED' },
    holds: 0,
    stopCalls: 0,
    nativeCalls: 0,
  }
}
function fixture(options = {}) {
  const calls = { dispose: 0, nativeClose: 0, dbCleanup: 0, sourceCleanup: 0, proofIssued: 0, canonical: 0, handoff: 0 }
  const database = {
    held: false,
    retired: false,
    cleanupPending: false,
    finalCloseRequested: false,
    lookupPending: false,
    canonical: mint(),
    resolver: mint(),
    library: { path: '/inert/library.node', digest: 'a'.repeat(64) },
  }
  const resources = {
    keyByteLength: 32,
    keyNonzeroBytes: 29,
    keyZeroCalls: 0,
    receiptEncodedBytes: 0,
    receiptReleaseCalls: 0,
    issuedProofPresent: false,
    issuedExclusionPresent: false,
    liveProofContainsIssued: false,
    issuedProofMatchesOriginal: false,
    issuedExclusionMatchesOriginal: false,
    liveProofMapReplaceCalls: 0,
    issuedClearCalls: 0,
    replayTombstoneContainsOriginal: false,
    journalOpen: true,
    journalDisposeCalls: 0,
  }
  const custody = {
    allocationEntries: 1,
    frameEntries: 1,
    discardedFrames: 1,
    attemptedBytes: 7,
    allocationClearCalls: 0,
    frameClearCalls: 0,
    mayHaveActivated: false,
  }
  const state = { state: 'PREACTIVATION', disposed: false, disposeRequested: false, held: false, retired: false }
  let closeReject
  const pendingClose = options.pending
    ? new Promise((_, reject) => {
        closeReject = reject
      })
    : undefined
  const source = {
    reserveActivation() {
      custody.mayHaveActivated = true
      state.state = 'UNKNOWN'
      throw new ErrorClass(options.activationReason ?? 'source_observation_admission_closed')
    },
    close() {
      state.held = true
      state.retired = true
      database.held = true
      database.retired = true
      database.canonical.holds++
      database.resolver.holds++
      return pendingClose ?? Promise.reject(new ErrorClass(options.closeReason ?? 'journal_unavailable'))
    },
    snapshot() {
      return structuredClone({
        ...state,
        allocations: custody.allocationEntries,
        attemptedBytes: custody.attemptedBytes,
        discardedFrames: custody.discardedFrames,
        resources: {
          keyByteLength: 32,
          keyNonzeroBytes: resources.keyNonzeroBytes,
          receiptBytes: 0,
          journalOpen: true,
        },
        diagnostics: { custody, source: resources },
      })
    },
    dispose() {
      calls.dispose++
      state.disposeRequested = true
      if (options.destroyOnDispose) resources.keyNonzeroBytes = 0
    },
    transport: {
      sealSender() {
        throw new Error('Proof-helper advanced after failed close')
      },
    },
    issueNonstart() {
      calls.proofIssued++
      throw new Error('No proof may be issued')
    },
  }
  const slot = {
    id: 'HUB',
    providerRunId: identity.runId,
    intentId: identity.intentId,
    sendBoundaryId: identity.sendBoundaryId,
    reservedAt: new Date(expected.originalTemporal.reservedAt),
    version: 1,
  }
  const run = {
    id: identity.runId,
    journeyId: identity.journeyId,
    targetProjectId: identity.targetProjectId,
    providerNamespace: identity.providerNamespace,
    configurationDigest: identity.configurationDigest,
    status: options.runStatus ?? 'UNKNOWN',
    turnsReserved: 1,
  }
  const intent = {
    id: identity.intentId,
    providerRunId: identity.runId,
    providerNamespace: identity.providerNamespace,
    sendBoundaryId: identity.sendBoundaryId,
    claimEpoch: 1,
    status: 'UNKNOWN',
  }
  const client = {
    qualityJourneyProviderObservation: {
      count: async () => {
        calls.canonical++
        return 0
      },
    },
    qualityJourneyProviderRun: {
      findUniqueOrThrow: async () => {
        calls.canonical++
        return structuredClone(run)
      },
    },
    qualityJourneyProviderDispatchIntent: {
      findUniqueOrThrow: async () => {
        calls.canonical++
        return structuredClone(intent)
      },
    },
  }
  const f = {
    source,
    client,
    database,
    sourceId: identity.sourceId,
    armed: { run: { id: identity.runId } },
    permit: { intentId: identity.intentId },
    slot: async () => {
      calls.canonical++
      return slot
    },
    contender: {
      close: async () => {
        calls.nativeClose++
      },
    },
    clientDestructionBaseline: structuredClone(database),
  }
  return {
    fixture: f,
    calls,
    source,
    database,
    resources,
    rejectClose: () => closeReject(new ErrorClass('journal_unavailable')),
  }
}
function execution(options) {
  const data = fixture(options)
  const retained = [],
    events = []
  const admission = createFixtureAdmission(
    retained,
    () => true,
    () => {},
  )
  const deps = { data, expected, events, admission, retained }
  const body = `
    const { data, expected:expectedFixture, events, admission, retained } = deps;
    const { assertActive:assertFixtureActive, admitActual, afterActual } = admission;
    const { source, database } = data;
    const name=expectedFixture.case, nonce=expectedFixture.nonce, process={pid:expectedFixture.pid};
    const databasePath='/inert/canonical.db', expectedFixtureSha256='a'.repeat(64);
    let retired=false, completed=false, activationRetention, complementRetention;
    const providerSourceDatabaseSnapshot=()=>structuredClone(database);
    const disposeProviderSourceDatabase=()=>{data.calls.dbCleanup++;throw new Error('Forbidden DB cleanup')};
    const disposeOriginalSource=()=>{data.calls.sourceCleanup++;throw new Error('Forbidden source cleanup')};
    const event=(type,value)=>events.push({sequence:events.length+1,type,case:name,pid:process.pid,nonce,...value});
    const terminal={allowHandoff(){assertFixtureActive('inert-test-handoff');data.calls.handoff++}};
    ${compile(definitions)}
    return {run:()=>runActivationRefusal(data.fixture),finish:()=>finishOriginalOwner(data.fixture),state:()=>({retired,completed,activationRetention}),admission,retained,events};`
  return {
    ...new Function('assert', 'originalSourceResources', 'OutcomeSourceUnknownError', 'fixtureDateTime', 'deps', body)(
      assert,
      originalSourceResources,
      ErrorClass,
      fixtureDateTime,
      deps,
    ),
    data,
  }
}
test('actual owner activation disposition retains and selects expected terminal without DB cleanup', async () => {
  const x = execution()
  await x.run()
  assert.equal(x.state().retired, true)
  assert.equal(x.data.calls.dispose, 1)
  assert.ok(
    x.retained.some(value => value instanceof Promise),
    'Actual public helper/close promises retained',
  )
  await x.finish()
  assert.equal(x.events.length, 1)
  validate(x.events[0], expected)
  assert.deepEqual(x.data.calls, {
    dispose: 1,
    nativeClose: 1,
    dbCleanup: 0,
    sourceCleanup: 0,
    proofIssued: 0,
    canonical: 4,
    handoff: 1,
  })
})
test('wrong original activation/close reason and resource/canonical assertion failures never select terminal', async () => {
  for (const options of [
    { activationReason: 'wrong' },
    { closeReason: 'wrong' },
    { destroyOnDispose: true },
    { runStatus: 'COMPLETED' },
  ]) {
    const x = execution(options)
    await assert.rejects(x.run())
    assert.equal(x.state().retired, false)
    assert.equal(x.events.length, 0)
    assert.equal(x.data.calls.dbCleanup, 0)
    assert.equal(x.data.calls.handoff, 0)
  }
})
test('actual firstfailure while public proof-helper promise pending blocks disposal and every canonical read', async () => {
  const x = execution({ pending: true })
  const actual = x.run()
  const first = new Error('inert actual IPC-loss cause')
  x.admission.fail(first, 'supervisor-disconnect')
  x.data.rejectClose()
  await assert.rejects(actual, error => error === first)
  assert.equal(x.state().retired, false)
  assert.equal(x.data.calls.dispose, 0)
  assert.equal(x.data.calls.canonical, 0)
  assert.equal(x.data.calls.dbCleanup, 0)
  assert.equal(x.admission.unexpectedFailure.error, first)
  assert.equal(x.data.database.held, true)
})
test('actual matrix validator refuses malformed identity/refusal/resource/cleanup/canonical evidence', async () => {
  const x = execution()
  await x.run()
  await x.finish()
  const good = x.events[0]
  validate(good, expected)
  const mutations = [
    v => {
      delete v.activation
    },
    v => {
      v.type = 'case-known-closed'
    },
    v => {
      v.activation.nonce = 'wrong'
    },
    v => {
      v.activation.identity.sourceId = 'foreign'
    },
    v => {
      v.activation.activationReason = 'wrong'
    },
    v => {
      v.activation.closeReason = 'wrong'
    },
    v => {
      v.activation.afterClose.held = false
    },
    v => {
      v.activation.afterDispose.disposeRequested = false
    },
    v => {
      v.activation.afterDispose.diagnostics.source.keyZeroCalls++
    },
    v => {
      v.activation.databaseAfterClose.canonical.layers.client = 'PENDING'
    },
    v => {
      v.activation.databaseAfterDispose.resolver.holds = 0
    },
    v => {
      v.activation.databaseAfterDispose.canonical.stopCalls++
    },
    v => {
      v.activation.canonical.run.status = 'COMPLETED'
    },
    v => {
      v.activation.canonical.run.turnsReserved = 0
    },
    v => {
      v.activation.canonical.intent.id = 'foreign'
    },
    v => {
      v.activation.canonical.slot.version = 2
    },
    v => {
      v.activation.canonical.slot.reservedAt = null
    },
    v => {
      v.activation.canonical.observations = 1
    },
  ]
  for (const mutate of mutations) {
    const value = structuredClone(good)
    mutate(value)
    assert.throws(() => validate(value, expected))
  }
})
test('firstfailure after retention selection prevents native close and normal terminal publication', async () => {
  const x = execution()
  await x.run()
  const first = new Error('inert IPC failure before retained finish')
  x.admission.fail(first, 'supervisor-disconnect')
  await assert.rejects(x.finish(), error => error === first)
  assert.equal(x.events.length, 0)
  assert.equal(x.data.calls.nativeClose, 0)
  assert.equal(x.data.calls.handoff, 0)
  assert.equal(x.data.calls.dbCleanup, 0)
  assert.equal(x.data.database.held, true)
})
function actualNestedDeclaration(filename, name) {
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.ES2017, true),
    matches = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.equal(matches.length, 1)
  return matches[0].getText(source)
}
function terminalAcceptance(customExpected = expected) {
  const bytes = Buffer.from(JSON.stringify(customExpected)),
    calls = { reads: 0, writes: 0, ack: 0, existenceProbe: 0 },
    retained = []
  const generated = compile(actualNestedDeclaration(matrixFile, 'acceptTerminalOutcome'))
  const actual = new Function(
    'assert',
    'path',
    'createHash',
    'assertActivationRetainedOutcome',
    'encodeServiceTerminalAck',
    'deps',
    `
    const {bytes,calls,retained}=deps;
    const name='activation-unknown',workspace='/inert',nonce='inert-nonce';let terminal,stopped,settled=false,crashAdmission=true,terminalAckStarted=false,terminalAckDelivered=false; const messageState={nonce:'inert-nonce',acceptingMessages:true};
    const expectedFixtureSha256=createHash('sha256').update(bytes).digest('hex'),nativePid=23456,killConsumed=false;
    const ambiguous=new Set(['activation-unknown']),retainedComplements={},retainedSupervisorReferences=retained;
    const assertMatrixNotStopped=()=>{if(stopped)throw stopped};
    const readFileSync=()=>{calls.reads++;return bytes};const writeFileSync=()=>{calls.writes++};
    const process={kill(){calls.existenceProbe++}};const child={pid:12345,send(value){calls.ack++;return true}};
    const assertComplementRetainedOutcome=()=>{throw new Error('Unexpected complement')};
    const retainFailure=error=>{stopped=error};const finishAuthenticatedTerminal=()=>{};
    ${generated}
    return {accept:acceptTerminalOutcome,state:()=>({terminal,terminalAckStarted,acceptingMessages:messageState.acceptingMessages,crashAdmission})};
  `,
  )(assert, path, require('node:crypto').createHash, validate, encodeServiceTerminalAck, { bytes, calls, retained })
  return { ...actual, calls }
}
test('actual nested supervisor rejects known-closed or malformed activation before terminal state and ACK', async () => {
  const x = execution()
  await x.run()
  await x.finish()
  const good = x.events[0]
  for (const mutate of [
    v => {
      v.type = 'case-known-closed'
    },
    v => {
      delete v.activation
    },
    v => {
      v.activation.canonical.run.turnsReserved = 2
    },
  ]) {
    const supervisor = terminalAcceptance(),
      value = structuredClone(good)
    mutate(value)
    assert.throws(() => supervisor.accept(value))
    assert.equal(supervisor.calls.ack, 0)
    assert.equal(supervisor.calls.writes, 0)
    assert.equal(supervisor.state().terminal, undefined)
    assert.equal(supervisor.state().acceptingMessages, true)
  }
  const supervisor = terminalAcceptance()
  supervisor.accept(good)
  assert.equal(supervisor.calls.ack, 1)
  assert.equal(supervisor.state().terminal, good)
  assert.equal(supervisor.state().terminalAckStarted, true)
})
// Extract the actual changed initializer; no handwritten normalization mirror.
const ownerSource = ts.createSourceFile(ownerFile, readFileSync(ownerFile, 'utf8'), ts.ScriptTarget.ES2017, true)
const activationFunction = ownerSource.statements.find(
  n => ts.isFunctionDeclaration(n) && n.name?.text === 'runActivationRefusal',
)
const evidenceDeclarations = []
function findEvidence(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ownerSource) === 'evidence') evidenceDeclarations.push(node)
  ts.forEachChild(node, findEvidence)
}
findEvidence(activationFunction)
assert.equal(evidenceDeclarations.length, 1)
const actualConstructorText = evidenceDeclarations[0].initializer.getText(ownerSource)
const constructActualDiagnostic = new Function(
  'fixtureDateTime',
  'scope',
  `
  const {name,process,nonce,identity,activationError,closeError,baseline,afterClose,afterDispose,
    databaseBaseline,databaseAfterClose,databaseAfterDispose,run,intent,occupiedSlot,observations}=scope;
  return (${actualConstructorText});
`,
)
function reconstructActual(good, occupiedSlot) {
  const a = good.activation
  return constructActualDiagnostic(fixtureDateTime, {
    ...a,
    name: a.case,
    process: { pid: a.pid },
    activationError: new ErrorClass(a.activationReason),
    closeError: new ErrorClass(a.closeReason),
    run: a.canonical.run,
    intent: a.canonical.intent,
    occupiedSlot,
    observations: a.canonical.observations,
  })
}
const preciseMilliseconds = 1792665154882
const wireExpected = { ...expected, originalTemporal: { reservedAt: preciseMilliseconds } }
async function validCurrentRetained() {
  const x = execution()
  await x.run()
  await x.finish()
  return x.events[0]
}
function constructMessage(good, slot) {
  return { ...good, activation: reconstructActual(good, slot) }
}
test('actual constructor preserves original Date/slot, JSON roundtrip carries exact numeric wiretime and actual supervisor accepts', async () => {
  const good = await validCurrentRetained(),
    originalDate = new Date(preciseMilliseconds)
  const originalSlot = { ...good.activation.canonical.slot, reservedAt: originalDate },
    sameReference = originalSlot
  const message = constructMessage(good, originalSlot),
    copy = message.activation.canonical.slot
  assert.equal(originalSlot, sameReference)
  assert.equal(originalSlot.reservedAt, originalDate)
  assert.equal(originalDate.getTime(), preciseMilliseconds)
  assert.notEqual(copy, originalSlot)
  assert.equal(copy.reservedAt, preciseMilliseconds)
  assert.equal(typeof copy.reservedAt, 'number')
  const { reservedAt: ignoredOriginal, ...originalFields } = originalSlot,
    { reservedAt: ignoredCopy, ...copyFields } = copy
  assert.equal(ignoredOriginal, originalDate)
  assert.equal(ignoredCopy, preciseMilliseconds)
  assert.deepEqual(copyFields, originalFields)
  const wire = JSON.parse(JSON.stringify(message))
  assert.equal(wire.activation.canonical.slot.reservedAt, preciseMilliseconds)
  validate(wire, wireExpected)
  const supervisor = terminalAcceptance(wireExpected)
  supervisor.accept(wire)
  assert.equal(supervisor.calls.ack, 1)
  assert.equal(supervisor.state().terminal, wire)
})
test('actual constructor accepts strict numeric milliseconds without mutation and rejects string/unsafe/invalid Date boundaries', async () => {
  const good = await validCurrentRetained(),
    slot = { ...good.activation.canonical.slot, reservedAt: preciseMilliseconds }
  const wire = JSON.parse(JSON.stringify(constructMessage(good, slot)))
  assert.equal(slot.reservedAt, preciseMilliseconds)
  validate(wire, wireExpected)
  for (const bad of [
    '2026-10-22T10:32:34.882Z',
    String(preciseMilliseconds),
    Number.MAX_SAFE_INTEGER + 1,
    NaN,
    Infinity,
    -1,
    0.5,
    new Date(NaN),
  ]) {
    const original = { ...slot, reservedAt: bad }
    assert.throws(() => constructMessage(good, original))
    assert.equal(original.reservedAt, bad, 'The actual constructor must not mutate rejected input')
  }
})
test('null is retained as null by strict helper but complete wire predicate and actual supervisor refuse it without ACK', async () => {
  const good = await validCurrentRetained(),
    original = { ...good.activation.canonical.slot, reservedAt: null }
  const message = constructMessage(good, original)
  assert.equal(message.activation.canonical.slot.reservedAt, null)
  assert.equal(original.reservedAt, null)
  const wire = JSON.parse(JSON.stringify(message))
  assert.throws(() => validate(wire, wireExpected))
  const supervisor = terminalAcceptance(wireExpected)
  assert.throws(() => supervisor.accept(wire))
  assert.equal(supervisor.calls.ack, 0)
  assert.equal(supervisor.calls.writes, 0)
  assert.equal(supervisor.state().terminal, undefined)
})
test('actual supervisor rejects malformed wire DateTime and terminal before state/ACK', async () => {
  const good = await validCurrentRetained(),
    message = constructMessage(good, { ...good.activation.canonical.slot, reservedAt: new Date(preciseMilliseconds) })
  const wire = JSON.parse(JSON.stringify(message))
  for (const mutate of [
    v => {
      v.activation.canonical.slot.reservedAt = '2026-10-22T10:32:34.882Z'
    },
    v => {
      v.activation.canonical.slot.reservedAt = Number.MAX_SAFE_INTEGER + 1
    },
    v => {
      v.activation.canonical.slot.reservedAt = -1
    },
    v => {
      v.activation.canonical.slot.reservedAt = 0.5
    },
    v => {
      v.type = 'case-known-closed'
    },
  ]) {
    const bad = structuredClone(wire)
    mutate(bad)
    const supervisor = terminalAcceptance(wireExpected)
    assert.throws(() => supervisor.accept(bad))
    assert.equal(supervisor.calls.ack, 0)
    assert.equal(supervisor.calls.writes, 0)
    assert.equal(supervisor.state().terminal, undefined)
  }
})
