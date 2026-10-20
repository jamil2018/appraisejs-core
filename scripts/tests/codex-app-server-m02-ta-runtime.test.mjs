import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { POLICY } from './fixtures/codex-app-server-m02-ta/policy.mjs'
import { prepareTrustedComposition } from './fixtures/codex-app-server-m02-ta/composition.mjs'
import { TrustedAppServerPeer } from './fixtures/codex-app-server-m02-ta/protocol.mjs'
import { T1_ROOT, retentionClocks, retentionFromInit } from './fixtures/codex-app-server-m02-ta-runtime/journal.mjs'
import {
  t1RootIo,
  trackT1Bridge,
  verifyChildReceipt,
  t1InitializeParams,
  t1TurnParams,
  normalStopJournal,
  runT1,
  prepareT1,
} from './fixtures/codex-app-server-m02-ta-runtime/t1-runner.mjs'
import { t1ReceiptContext, writeT1ChildReceipt } from './fixtures/codex-app-server-m02-ta-runtime/t1-scoped-entry.mjs'
import { createT1ErrorAdapter } from './fixtures/codex-app-server-m02-ta-runtime/t1-error-adapter.mjs'
import {
  stageT1Modules,
  verifyT1ModuleResolution,
} from './fixtures/codex-app-server-m02-ta-runtime/t1-module-stage.mjs'

const hash = 'sha256:' + 'a'.repeat(64)
const supervisor = `${T1_ROOT}/cases/T1/supervisor`
const bootstrapPath = `${T1_ROOT}/cases/T1/codex/mcp-bootstrap.json`
const privateDirectory = (ino = 2) => ({
  dev: 1,
  ino,
  uid: process.getuid(),
  mode: 0o700,
  isDirectory: () => true,
  isFile: () => false,
  isSymbolicLink: () => false,
})

test('T1 retention clocks bind the earliest conservative intent to seven days and raw history to 24 hours', () => {
  assert.deepEqual(retentionClocks('2026-10-16T00:00:00.000Z'), {
    earliestPossibleProviderIntentAt: '2026-10-16T00:00:00.000Z',
    unresolvedDecisionDueAt: '2026-10-23T00:00:00.000Z',
    terminalHistoryDeleteWithinHours: 24,
  })
  assert.throws(() => retentionClocks('not-a-clock'), /retention clock/)
  const init = { type: 'init', retention: retentionClocks('2026-10-16T00:00:00.000Z') }
  assert.deepEqual(retentionFromInit(init), init.retention)
  init.retention = { ...init.retention, unresolvedDecisionDueAt: '2026-10-24T00:00:00.000Z' }
  assert.throws(() => retentionFromInit(init), /retention changed/)
  assert.throws(() => retentionFromInit({ type: 'init' }), /retention missing/)
})

test(
  'staged pinned backend and Prisma resolve outside repo and import without reading any .env contents',
  { timeout: 120_000 },
  async () => {
    const prepared = await prepareT1()
    const temp = await fsp.realpath(await fsp.mkdtemp(join(tmpdir(), 'appraise-m02-t1-stage-test-')))
    const moduleRoot = join(temp, 'supervisor', 'modules')
    const repoEnv = resolve(process.cwd(), '.env')
    const formerUrl = process.env.DATABASE_URL
    const formerNodeEnv = process.env.NODE_ENV
    const originalRead = fs.readFileSync
    const originalOpen = fs.openSync
    const originalExists = fs.existsSync
    const originalAsyncRead = fsp.readFile
    const originalAsyncOpen = fsp.open
    let envReadAttempts = 0
    let client
    try {
      await fsp.mkdir(join(temp, 'supervisor'), { mode: 0o700 })
      const modified = structuredClone(prepared)
      modified.manifest.artifacts.find(item => item.purpose === 'canonical-backend').sha256 = '0'.repeat(64)
      await assert.rejects(stageT1Modules({ prepared: modified, moduleRoot }), /module source hash drift/)
      await fsp.rm(moduleRoot, { recursive: true, force: true })
      const incomplete = structuredClone(prepared)
      incomplete.manifest.artifacts = incomplete.manifest.artifacts.filter(
        item => !item.path.endsWith('/.prisma/client/index.js'),
      )
      await assert.rejects(stageT1Modules({ prepared: incomplete, moduleRoot }), /required module pin missing/)
      await fsp.symlink(join(temp, 'foreign-modules'), moduleRoot)
      await assert.rejects(stageT1Modules({ prepared, moduleRoot }), /EEXIST/)
      await fsp.unlink(moduleRoot)
      const staged = await stageT1Modules({ prepared, moduleRoot })
      assert.ok(staged.copiedFiles > 100)
      assert.equal(
        createHash('sha256')
          .update(await fsp.readFile(staged.bundlePath))
          .digest('hex'),
        prepared.manifest.artifacts.find(item => item.purpose === 'canonical-backend').sha256,
      )
      await assert.rejects(
        verifyT1ModuleResolution(moduleRoot, { requireFactory: () => ({ resolve: () => '/wrong/module.js' }) }),
        /resolution mismatch/,
      )
      const stageRequire = createRequire(staged.bundlePath)
      assert.equal(stageRequire.resolve('@prisma/client').startsWith(`${moduleRoot}/`), true)
      assert.equal(stageRequire.resolve('zod').startsWith(`${moduleRoot}/`), true)
      process.env.DATABASE_URL = `file:${join(temp, 'fixture.db')}`
      process.env.NODE_ENV = 'production'
      fs.readFileSync = function (path, ...args) {
        if (typeof path === 'string' && path.endsWith('/.env')) {
          envReadAttempts++
          throw new Error('guarded .env read')
        }
        return originalRead.call(this, path, ...args)
      }
      fs.openSync = function (path, ...args) {
        if (typeof path === 'string' && path.endsWith('/.env')) {
          envReadAttempts++
          throw new Error('guarded .env open')
        }
        return originalOpen.call(this, path, ...args)
      }
      fs.existsSync = function (path, ...args) {
        if (typeof path === 'string' && resolve(path) === repoEnv) {
          envReadAttempts++
          throw new Error('guarded repository .env access')
        }
        return originalExists.call(this, path, ...args)
      }
      fsp.readFile = async function (path, ...args) {
        if (typeof path === 'string' && path.endsWith('/.env')) {
          envReadAttempts++
          throw new Error('guarded async .env read')
        }
        return originalAsyncRead.call(this, path, ...args)
      }
      fsp.open = async function (path, ...args) {
        if (typeof path === 'string' && path.endsWith('/.env')) {
          envReadAttempts++
          throw new Error('guarded async .env open')
        }
        return originalAsyncOpen.call(this, path, ...args)
      }
      const backend = await import(pathToFileURL(staged.bundlePath).href)
      assert.equal(typeof backend.createLazyCanonicalSupervisorBridge, 'function')
      const bridge = backend.createLazyCanonicalSupervisorBridge({
        role: 'REQUIREMENT_ANALYZER',
        workspace: join(temp, 'cases/T1/supervisor'),
        caseId: 'T1',
        onUnknown: () => {},
      })
      assert.equal(bridge.bootstrapConfig('http://127.0.0.1:44000/m02/canonical').caseId, 'T1')
      await bridge.close()
      const { PrismaClient } = stageRequire('@prisma/client')
      client = new PrismaClient({ datasources: { db: { url: `file:${join(temp, 'fixture.db')}` } } })
      const rows = await client.$queryRawUnsafe('SELECT 1 AS ok')
      assert.equal(Number(rows[0].ok), 1)
      assert.equal(envReadAttempts, 0)
    } finally {
      if (client) await client.$disconnect()
      fs.readFileSync = originalRead
      fs.openSync = originalOpen
      fs.existsSync = originalExists
      fsp.readFile = originalAsyncRead
      fsp.open = originalAsyncOpen
      if (formerUrl === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = formerUrl
      if (formerNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = formerNodeEnv
      await fsp.rm(temp, { recursive: true, force: true })
    }
  },
)

test('T1 protocol inputs use one actual thread and the fixed harmless request', () => {
  assert.deepEqual(t1InitializeParams().capabilities, {
    experimentalApi: false,
    explicitGatewayOauth: true,
    requestAttestation: false,
  })
  const params = t1TurnParams('actual-thread-1')
  assert.equal(params.threadId, 'actual-thread-1')
  assert.equal(params.model, POLICY.model)
  assert.equal(params.effort, POLICY.reasoning)
  assert.equal(params.input.length, 1)
  assert.equal(params.input[0].type, 'text')
  assert.equal(params.input[0].text.includes('Do not call tools'), true)
  assert.throws(() => t1TurnParams(''), /actual thread/)
})

const providerError = (overrides = {}) => ({
  method: 'error',
  params: {
    threadId: 'actual-thread-1',
    turnId: 'actual-turn-1',
    willRetry: false,
    error: { message: 'local fixture 503', codexErrorInfo: { httpConnectionFailed: { httpStatusCode: 503 } } },
    ...overrides,
  },
})

async function adapterOutput(frames, state = { captured: true, threadId: 'actual-thread-1', turnId: 'actual-turn-1' }) {
  let ambiguous = 0
  const accepted = []
  const adapter = createT1ErrorAdapter({
    afterCapture: () => state,
    onAccepted: receipt => accepted.push(receipt),
    onAmbiguous: () => ambiguous++,
  })
  const source = Readable.from([Buffer.from(frames.map(frame => `${JSON.stringify(frame)}\n`).join(''))])
  source.pipe(adapter.stream)
  const output = []
  for await (const chunk of adapter.stream) output.push(chunk)
  return { accepted, ambiguous, output }
}

test('one correlated captured 503 is sanitized before the unchanged peer receives failed terminal', async () => {
  let fenced = false
  const journal = {
    snapshot: () => ({ pending: [], fenced }),
    acknowledge: async () => {},
    markUnknown: async () => {
      fenced = true
    },
  }
  const peer = new TrustedAppServerPeer({
    coordinator: { perform: async (_kind, _id, effect) => effect({}) },
    journal,
    write: async bytes => bytes.length,
    caseId: 'T1',
    threadStartParams: {},
    verifyCaptureTerminal: () => true,
  })
  await peer.request('initialize', {}, 'init-1')
  await peer.feed(Buffer.from('{"id":"init-1","result":{"userAgent":"fixture"}}\n'))
  await peer.request('thread/start', {}, 'thread-1')
  await peer.feed(Buffer.from('{"id":"thread-1","result":{"thread":{"id":"actual-thread-1"}}}\n'))
  await peer.request('turn/start', { threadId: 'actual-thread-1' }, 'turn-1')
  await peer.feed(Buffer.from('{"id":"turn-1","result":{"turn":{"id":"actual-turn-1"}}}\n'))
  const result = await adapterOutput([
    providerError(),
    {
      method: 'turn/completed',
      params: { threadId: 'actual-thread-1', turn: { id: 'actual-turn-1', status: 'failed' } },
    },
  ])
  for (const chunk of result.output) await peer.feed(chunk)
  assert.equal(result.accepted.length, 1)
  assert.equal(result.accepted[0].httpStatusCode, 503)
  assert.equal(JSON.stringify(result.accepted[0]).includes('local fixture'), false)
  assert.equal(peer.snapshot().phase, 'capture-stopped')
  assert.equal(fenced, false)
})

test('foreign, retrying, duplicate and precapture provider errors fail closed', async () => {
  for (const [frames, state] of [
    [[providerError({ threadId: 'foreign' })]],
    [[providerError({ willRetry: true })]],
    [[providerError(), providerError()]],
    [[{ ...providerError(), id: null }]],
    [[providerError()], { captured: false, threadId: 'actual-thread-1', turnId: 'actual-turn-1' }],
  ]) {
    await assert.rejects(adapterOutput(frames, state), /UNKNOWN/)
  }
})

test('one-use root token refuses replacement, repeated mkdir and unrelated adoption', async () => {
  let current = privateDirectory()
  const calls = []
  const baseFs = {
    lstat: async () => current,
    mkdir: async path => {
      calls.push(path)
    },
    readFile: async () => Buffer.from('fixture'),
  }
  const io = t1RootIo({ rootStat: current, baseFs, tuple: async () => ({}) })
  await io.fs.mkdir(T1_ROOT, { mode: 0o700 })
  assert.equal(io.rootMkdirConsumed(), true)
  assert.deepEqual(calls, [])
  await assert.rejects(io.fs.mkdir(T1_ROOT, { mode: 0o700 }), /consumed/)
  await io.fs.mkdir(`${T1_ROOT}/cases`, { mode: 0o700 })
  assert.deepEqual(calls, [`${T1_ROOT}/cases`])
  current = privateDirectory(3)
  await assert.rejects(io.fs.lstat(T1_ROOT), /changed/)
  const fresh = t1RootIo({ rootStat: privateDirectory(), baseFs, tuple: async () => ({}) })
  await assert.rejects(fresh.fs.mkdir(T1_ROOT, { mode: 0o700 }), /changed/)
})

test('bridge startup binds only supervisor-minted capability and exact profile', async () => {
  const capability = 'a'.repeat(43)
  const raw = {
    bootstrapConfig: url => ({ schema: 'appraise.m02-ta-bridge-bootstrap/v1', caseId: 'T1', capability, url }),
    handle: async request => ({ ok: true, requestId: request.requestId }),
    fenced: false,
  }
  const bridge = trackT1Bridge(raw)
  bridge.bootstrapConfig('http://127.0.0.1:44000/m02/canonical')
  await bridge.handle({ action: 'bootstrap', requestId: 'bootstrap-1', payload: {} })
  await bridge.handle({
    action: 'bindProfile',
    requestId: 'profile-1',
    payload: { advertisedProfile: { profileDigest: hash } },
  })
  const expected = bridge.snapshot().bootstrap
  const receipt = {
    schema: 'appraise.m02-ta-t1-child-receipt/v1',
    caseId: 'T1',
    event: 'sdk-connect-returned',
    evidenceClass: 'TRUSTED_CHILD_SELF_REPORT',
    capabilityHash: expected.capabilityHash,
    bootstrapHash: expected.bootstrapHash,
    profileDigest: hash,
  }
  assert.equal(verifyChildReceipt(receipt, 'sdk-connect-returned', bridge), true)
  assert.equal(
    verifyChildReceipt(
      { ...receipt, capabilityHash: 'sha256:' + 'b'.repeat(64), bootstrapHash: 'sha256:' + 'b'.repeat(64) },
      'sdk-connect-returned',
      bridge,
    ),
    false,
  )
  assert.equal(
    verifyChildReceipt({ ...receipt, profileDigest: 'sha256:' + 'b'.repeat(64) }, 'sdk-connect-returned', bridge),
    false,
  )
  assert.equal(
    verifyChildReceipt({ ...receipt, event: 'node-exit-handler', exitCode: 0 }, 'node-exit-handler', bridge, receipt),
    true,
  )
  await assert.rejects(bridge.handle({ action: 'bootstrap', requestId: 'again', payload: {} }), /sequence/)
  assert.throws(() => bridge.bootstrapConfig('http://127.0.0.1:44000/m02/canonical'), /duplicate/)
})

test('child receipt accepts only exact bootstrap path and owned ancestor identity', () => {
  const capability = 'a'.repeat(43)
  const context = t1ReceiptContext(bootstrapPath, {
    schema: 'appraise.m02-ta-bridge-bootstrap/v1',
    caseId: 'T1',
    capability,
    url: 'http://127.0.0.1:44000/m02/canonical',
  })
  assert.equal(context.caseId, 'T1')
  assert.equal(context.capabilityHash.startsWith('sha256:'), true)
  assert.throws(() => t1ReceiptContext('/tmp/foreign', {}), /identity/)
  const opened = []
  let state = privateDirectory()
  const fakeIo = {
    lstatSync: () => state,
    openSync: path => {
      opened.push(path)
      return 7
    },
    writeFileSync: () => {},
    fsyncSync: () => {},
    closeSync: () => {},
  }
  writeT1ChildReceipt(`${supervisor}/mcp-startup.json`, { caseId: 'T1' }, fakeIo, state)
  assert.deepEqual(opened, [`${supervisor}/mcp-startup.json`, supervisor])
  state = privateDirectory(3)
  assert.throws(
    () => writeT1ChildReceipt(`${supervisor}/mcp-exit.json`, { caseId: 'T1' }, fakeIo, privateDirectory()),
    /ancestor/,
  )
})

test('clean stop receipt is separate; UNKNOWN delegates to accepted journal', () => {
  const writes = []
  const journal = {
    fenced: false,
    seq: 3,
    snapshot() {
      return { fenced: this.fenced, seq: this.seq }
    },
    recordRecovery(value) {
      writes.push(['recovery', value])
    },
  }
  const facade = normalStopJournal(journal, { write: (path, value) => writes.push([path, value]) })
  facade.recordRecovery({ id: 'T1-stop', action: 'owned-stop-intent' })
  facade.recordRecovery({ id: 'T1-stopped', action: 'owned-stop-observed' })
  assert.equal(writes.length, 2)
  assert.equal(writes[0][0], `${supervisor}/normal-stop-intent.json`)
  assert.equal(writes[1][0], `${supervisor}/normal-stop-observed.json`)
  journal.fenced = true
  facade.recordRecovery({ id: 'T1-recovery', action: 'owned-stop-intent' })
  assert.deepEqual(writes[2], ['recovery', { id: 'T1-recovery', action: 'owned-stop-intent' }])
})

function fakeRun({ foreignStartup = false, hangingStop = false } = {}) {
  const artifacts = [
    'codex',
    'interpreter',
    'supervisor',
    'scoped-mcp-entry',
    'policy',
    'schema',
    'canonical-backend',
    'descriptor-collector',
  ].map((purpose, index) => ({
    purpose,
    path: purpose === 'codex' ? POLICY.executable.path : `/synthetic/${purpose}`,
    sha256: purpose === 'codex' ? POLICY.executable.sha256 : String(index + 1).padStart(64, '0'),
  }))
  const prepared = prepareTrustedComposition({ phase: 'T1', artifacts })
  const journal = {
    fenced: false,
    counts: { providerRequests: 0, scopedCalls: 0 },
    completed: false,
    snapshot() {
      return { fenced: this.fenced, counts: this.counts, pending: [], seq: 3 }
    },
    markUnknown() {
      this.fenced = true
    },
    close() {},
  }
  const capability = 'a'.repeat(43)
  const config = {
    schema: 'appraise.m02-ta-bridge-bootstrap/v1',
    caseId: 'T1',
    capability,
    url: 'http://127.0.0.1:44000/m02/canonical',
  }
  const profileDigest = hash
  const capabilityHash = `sha256:${createHash('sha256').update(capability).digest('hex')}`
  const bootstrapHash = `sha256:${createHash('sha256').update(JSON.stringify(config)).digest('hex')}`
  const receipt = event => ({
    schema: 'appraise.m02-ta-t1-child-receipt/v1',
    caseId: 'T1',
    event,
    evidenceClass: 'TRUSTED_CHILD_SELF_REPORT',
    capabilityHash: foreignStartup ? 'sha256:' + 'b'.repeat(64) : capabilityHash,
    bootstrapHash: foreignStartup ? 'sha256:' + 'b'.repeat(64) : bootstrapHash,
    profileDigest,
    ...(event === 'node-exit-handler' ? { exitCode: 0 } : {}),
  })
  const io = {
    childObservations: [{ exit: { code: null, signal: 'SIGTERM' }, close: { code: null, signal: 'SIGTERM' } }],
    owned: { serverClosed: true, killCount: 1, serverCloseCount: 1 },
    nativeError: () => ({
      threadId: 'actual-thread-1',
      turnId: 'actual-turn-1',
      httpStatusCode: 503,
      notificationSha256: hash,
    }),
  }
  let capturedContext,
    finishCalled = false,
    starts = 0,
    evidenceWrites = 0
  const dependencies = {
    prepared,
    approved: () => true,
    collectorBundle: '/synthetic/descriptor-collector',
    bridgeBundle: '/synthetic/canonical-backend',
    createJournal: () => journal,
    preflight: {
      prepare: async () => prepared,
      rootExists: () => false,
      verifyArtifacts: async () => {},
      sanitize: () => {},
      rootStat: () => privateDirectory(),
    },
    makeIo: () => io,
    makeJournalFacade: value => value,
    readChildReceipt: async path =>
      receipt(path.endsWith('mcp-startup.json') ? 'sdk-connect-returned' : 'node-exit-handler'),
    writeEvidence: () => {
      evidenceWrites++
    },
    loadBridge: async () => ({
      createLazyCanonicalSupervisorBridge: () => ({
        bootstrapConfig: () => config,
        handle: async request => ({ ok: true, requestId: request.requestId }),
        fenced: false,
        close: async () => {},
      }),
    }),
    stageModules: async () => ({
      bundlePath: '/synthetic/canonical-backend',
      copiedFiles: 4,
      stagedDigest: 'a'.repeat(64),
    }),
    loadCollector: async () => ({
      NativeDescriptorCollector: class {
        capture(_request, context) {
          capturedContext = context
          return { status: 'CAPTURED', descriptorHash: hash, provenance: { turnId: context.turnId } }
        }
      },
    }),
    makeLauncher: ({ verifyMcpStartup, journal: suppliedJournal }) => ({
      async startCase({ onCaptured, canonicalBridge }) {
        starts++
        canonicalBridge.bootstrapConfig(config.url)
        const state = { phase: 'new', threadId: null, turnId: null }
        const peer = {
          snapshot: () => ({ ...state }),
          async request(method, params) {
            if (method === 'initialize') state.phase = 'ready'
            else if (method === 'thread/start') {
              await canonicalBridge.handle({ action: 'bootstrap', requestId: 'bootstrap-1', payload: {} })
              await canonicalBridge.handle({
                action: 'bindProfile',
                requestId: 'profile-1',
                payload: { advertisedProfile: { profileDigest } },
              })
              if (!(await verifyMcpStartup({ thread: { id: 'actual-thread-1' } }))) {
                suppliedJournal.markUnknown()
                throw new Error('MCP startup UNKNOWN')
              }
              state.threadId = 'actual-thread-1'
              state.phase = 'thread'
            } else if (method === 'turn/start') {
              assert.equal(params.threadId, 'actual-thread-1')
              state.turnId = 'actual-turn-1'
              state.phase = 'turn'
              journal.counts.providerRequests++
              await onCaptured({ method: 'POST', path: '/v1/responses', headers: {}, body: Buffer.from('{}') })
              state.phase = 'capture-stopped'
            }
          },
        }
        return {
          peer,
          config: { config: {}, threadStartParams: {} },
          coordinator: {
            complete: async input => {
              assert.equal(input.cleanupKnown, true)
              assert.equal(input.verifyEvidence(), true)
              finishCalled = true
              journal.completed = true
            },
          },
          stopOwned: () => (hangingStop ? new Promise(() => {}) : Promise.resolve({ listenerClosed: true })),
        }
      },
    }),
  }
  return { dependencies, journal, evidence: () => ({ capturedContext, finishCalled, starts, evidenceWrites }) }
}

test('fake T1 sequence captures one request, correlates actual IDs and finishes after owned cleanup', async () => {
  const fixture = fakeRun()
  const result = await runT1(fixture.dependencies)
  assert.equal(result.status, 'T1_CAPTURED')
  assert.equal(result.threadId, 'actual-thread-1')
  assert.equal(result.turnId, 'actual-turn-1')
  assert.equal(fixture.journal.completed, true)
  assert.equal(fixture.evidence().capturedContext.threadId, 'actual-thread-1')
  assert.equal(fixture.evidence().capturedContext.turnId, 'actual-turn-1')
  assert.equal(fixture.evidence().evidenceWrites, 2)
  assert.equal(fixture.evidence().starts, 1)
})

test('foreign self-consistent startup receipt fences without a turn or retry', async () => {
  const fixture = fakeRun({ foreignStartup: true })
  await assert.rejects(runT1(fixture.dependencies), /MCP startup UNKNOWN/)
  assert.equal(fixture.journal.fenced, true)
  assert.equal(fixture.journal.counts.providerRequests, 0)
  assert.equal(fixture.evidence().starts, 1)
})

test('hanging owned stop consumes deadline and leaves UNKNOWN without completion or second stop', async () => {
  const fixture = fakeRun({ hangingStop: true })
  fixture.dependencies.caseDeadlineMs = 25
  await assert.rejects(runT1(fixture.dependencies), /operation deadline/)
  assert.equal(fixture.journal.fenced, true)
  assert.equal(fixture.journal.completed, false)
  assert.equal(fixture.evidence().starts, 1)
})

test('partial launcher timeout signals only the observed child and closes its listener once', async () => {
  const fixture = fakeRun()
  fixture.dependencies.caseDeadlineMs = 25
  const recovery = []
  fixture.journal.recordRecovery = value => recovery.push(value)
  let signals = 0
  let closes = 0
  const child = new EventEmitter()
  child.kill = signal => {
    assert.equal(signal, 'SIGTERM')
    signals++
    queueMicrotask(() => {
      child.emit('exit', null, 'SIGTERM')
      child.emit('close', null, 'SIGTERM')
    })
    return true
  }
  const server = new EventEmitter()
  server.close = callback => {
    closes++
    queueMicrotask(() => {
      server.emit('close')
      callback()
    })
  }
  fixture.dependencies.makeIo = rootStat =>
    t1RootIo({
      rootStat,
      baseFs: { lstat: async () => rootStat, mkdir: async () => {}, readFile: async () => Buffer.from('fixture') },
      spawnChild: () => child,
      server: () => server,
      tuple: async () => ({}),
    })
  fixture.dependencies.makeLauncher = ({ io }) => ({
    startCase: () => {
      io.createServer(() => {})
      io.spawn('/synthetic/codex', ['app-server'])
      return new Promise(() => {})
    },
  })
  await assert.rejects(runT1(fixture.dependencies), /operation deadline/)
  assert.equal(fixture.journal.fenced, true)
  assert.equal(fixture.journal.completed, false)
  assert.equal(signals, 1)
  assert.equal(closes, 1)
  assert.deepEqual(
    recovery.map(item => item.action),
    ['owned-stop-intent', 'owned-stop-observed'],
  )
})

test('partial timeout completes missing owned stop after an authorization attempt stalled before SIGTERM', async () => {
  const fixture = fakeRun()
  fixture.dependencies.caseDeadlineMs = 35
  const recovery = []
  fixture.journal.recordRecovery = value => recovery.push(value)
  let signals = 0
  let closes = 0
  let approvals = 0
  const child = new EventEmitter()
  child.kill = () => {
    signals++
    queueMicrotask(() => {
      child.emit('exit', null, 'SIGTERM')
      child.emit('close', null, 'SIGTERM')
    })
    return true
  }
  const server = new EventEmitter()
  server.close = callback => {
    closes++
    queueMicrotask(() => {
      server.emit('close')
      callback()
    })
  }
  fixture.dependencies.approved = async ({ action }) => {
    if (action === 'owned-stop') approvals++
    return true
  }
  fixture.dependencies.makeIo = rootStat =>
    t1RootIo({
      rootStat,
      baseFs: { lstat: async () => rootStat, mkdir: async () => {}, readFile: async () => Buffer.from('fixture') },
      spawnChild: () => child,
      server: () => server,
      tuple: async () => ({}),
    })
  fixture.dependencies.makeLauncher = ({ io, authorize }) => ({
    async startCase() {
      io.createServer(() => {})
      io.spawn('/synthetic/codex', ['app-server'])
      await authorize({ action: 'owned-stop', manifestDigest: fixture.dependencies.prepared.manifestDigest })
      return new Promise(() => {})
    },
  })
  await assert.rejects(runT1(fixture.dependencies), /operation deadline/)
  assert.equal(fixture.journal.fenced, true)
  assert.equal(approvals, 1)
  assert.equal(signals, 1)
  assert.equal(closes, 1)
  assert.equal(recovery.at(-1).action, 'owned-stop-observed')
})
