/** Exact T1 runtime supervisor. Import and --prepare are inert with respect to native effects. */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createTrustedLauncher } from '../codex-app-server-m02-ta/launcher.mjs'
import { prepareTrustedComposition } from '../codex-app-server-m02-ta/composition.mjs'
import { POLICY, digest } from '../codex-app-server-m02-ta/policy.mjs'
import { DurableT1Journal, T1_ROOT } from './journal.mjs'
import { createT1ErrorAdapter } from './t1-error-adapter.mjs'
import { stageT1Modules, T1_MODULES } from './t1-module-stage.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const CASE_ROOT = join(T1_ROOT, 'cases', 'T1')
const SUPERVISOR = join(CASE_ROOT, 'supervisor')
const MANIFEST_DIR = join(REPO, '.appraisejs/m02-ta-t1-build-r3')
const MANIFEST_FILE = join(MANIFEST_DIR, 'manifest.json')
const PROMPT =
  'Inspect the advertised tool descriptors for this synthetic T1 case. Do not call tools or perform actions.'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const compareExact = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const receiptFile = name => join(SUPERVISOR, name)
const shaFile = async path => sha(await fsp.readFile(path))
const expectedTreeRoots = [
  'scripts/tests/fixtures/codex-app-server-m02-ta',
  'scripts/tests/fixtures/codex-app-server-m02-ta-runtime',
  'packages/appraisejs/dist',
  'packages/appraisejs/node_modules',
  'node_modules/@prisma',
  'node_modules/.prisma/client',
  'node_modules/zod',
  'prisma/migrations',
]
const fixedPaths = {
  codex: POLICY.executable.path,
  interpreter: '/opt/homebrew/Cellar/node/26.11.0/bin/node',
  'environment-launcher': '/usr/bin/env',
  supervisor: join(HERE, 't1-runner.mjs'),
  'scoped-mcp-entry': join(HERE, 't1-scoped-entry.mjs'),
  policy: join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta/policy.mjs'),
  'root-package': join(REPO, 'package.json'),
  schema: join(REPO, 'tasks/codex-app-server-journeys/m01/schema-pin.json'),
  'canonical-backend': join(REPO, '.appraisejs/m02-t0-build-r3/canonical-bridge.mjs'),
  'descriptor-collector': join(REPO, 'packages/appraisejs/dist/mcp/native-descriptor-capture.js'),
}

async function treeFiles(directory, io, output) {
  const state = await io.lstat(directory)
  if (!state.isDirectory() || state.isSymbolicLink()) throw new Error('runtime dependency tree identity')
  for (const entry of (await io.readdir(directory, { withFileTypes: true })).sort((a, b) =>
    compareExact(a.name, b.name),
  )) {
    if (entry.name === '.bin' && directory.endsWith('/node_modules')) continue
    const file = join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error('runtime dependency symlink')
    if (entry.isDirectory()) await treeFiles(file, io, output)
    else if (entry.isFile()) output.push(file)
    else throw new Error('runtime dependency special file')
  }
}

/** Hash every file in the conservative T1 runtime closure; no placeholder pins. */
export async function prepareT1({ io = fsp, repo = REPO } = {}) {
  if (repo !== REPO) throw new Error('exact T1 artifact paths required')
  const schema = JSON.parse(await io.readFile(fixedPaths.schema, 'utf8'))
  if (schema.manifestSha256 !== POLICY.executable.schemaDigest) throw new Error('schema evidence drift')
  const paths = new Map(Object.entries(fixedPaths).map(([purpose, path]) => [path, purpose]))
  for (const tree of expectedTreeRoots) {
    const entries = []
    await treeFiles(join(repo, tree), io, entries)
    if (!entries.length) throw new Error('empty runtime dependency tree')
    for (const entry of entries) if (!paths.has(entry)) paths.set(entry, `dependency:${relative(repo, entry)}`)
  }
  const artifacts = []
  for (const [path, purpose] of [...paths].sort(([a], [b]) => compareExact(a, b))) {
    const state = await io.lstat(path)
    if (!state.isFile() || state.isSymbolicLink()) throw new Error('runtime artifact identity')
    artifacts.push({ purpose, path, sha256: sha(await io.readFile(path)) })
  }
  const prepared = prepareTrustedComposition({ phase: 'T1', artifacts })
  if (prepared.blockers.length || prepared.manifest.cases.join() !== 'T1') throw new Error('T1 composition blocked')
  return Object.freeze({
    ...prepared,
    dependencyFiles: artifacts.length,
    qualification: 'OFFLINE_PREPARED_ONLY',
    invocation: [
      fixedPaths['environment-launcher'],
      '-i',
      'PATH=/usr/bin:/bin',
      'LANG=C',
      fixedPaths.interpreter,
      fixedPaths.supervisor,
      '--run',
      MANIFEST_FILE,
      prepared.manifestDigest,
    ],
  })
}

function exactState(stat, expected) {
  return (
    stat.isDirectory() &&
    !stat.isSymbolicLink() &&
    stat.dev === expected.dev &&
    stat.ino === expected.ino &&
    stat.uid === process.getuid() &&
    (stat.mode & 0o777) === 0o700
  )
}

/** One-use adoption of only the root this process just exclusively created for its journal. */
export function t1RootIo({
  rootStat,
  baseFs = fsp,
  spawnChild = spawn,
  server = createServer,
  tuple,
  nativeErrorGate,
} = {}) {
  if (!rootStat || typeof tuple !== 'function') throw new Error('T1 owned-root token and tuple required')
  let rootMkdirConsumed = false
  const fileSystem = new Proxy(baseFs, {
    get(target, key) {
      if (key === 'mkdir')
        return async (path, options) => {
          if (path !== T1_ROOT) return target.mkdir(path, options)
          if (rootMkdirConsumed || options?.recursive || options?.mode !== 0o700)
            throw new Error('T1 root token consumed')
          const current = await target.lstat(path)
          if (!exactState(current, rootStat)) throw new Error('T1 owned root changed')
          rootMkdirConsumed = true
        }
      if (key === 'lstat')
        return async path => {
          const current = await target.lstat(path)
          if (path === T1_ROOT && !exactState(current, rootStat)) throw new Error('T1 owned root changed')
          return current
        }
      return target[key]
    },
  })
  const childObservations = []
  let nativeErrorAdapter = null
  const owned = { child: null, server: null, killCount: 0, serverCloseCount: 0, serverClosed: false }
  return Object.freeze({
    fs: fileSystem,
    createServer(...args) {
      if (owned.server) throw new Error('T1 second listener forbidden')
      const instance = server(...args)
      owned.server = instance
      instance.once('close', () => {
        owned.serverClosed = true
      })
      const close = instance.close.bind(instance)
      instance.close = (...closeArgs) => {
        if (owned.serverCloseCount++) throw new Error('T1 listener close already requested')
        return close(...closeArgs)
      }
      return instance
    },
    tuple,
    fileDigest: async path => sha(await baseFs.readFile(path)),
    spawn(...args) {
      if (owned.child) throw new Error('T1 second Codex child forbidden')
      const child = spawnChild(...args)
      owned.child = child
      if (nativeErrorGate) {
        if (!child.stdout?.pipe) throw new Error('T1 owned stdout unavailable for error classifier')
        nativeErrorAdapter = createT1ErrorAdapter(nativeErrorGate)
        nativeErrorAdapter.stream.on('error', nativeErrorGate.onAmbiguous)
        child.stdout.pipe(nativeErrorAdapter.stream)
        child.stdout = nativeErrorAdapter.stream
      }
      const kill = child.kill.bind(child)
      child.kill = signal => {
        if (owned.killCount++) throw new Error('T1 child signal already requested')
        if (signal !== 'SIGTERM') throw new Error('T1 child signal not reviewed')
        return kill(signal)
      }
      const evidence = { exit: null, close: null }
      evidence.exitPromise = new Promise(resolve =>
        child.once('exit', (code, signal) => {
          evidence.exit = { code, signal }
          resolve(evidence.exit)
        }),
      )
      evidence.closePromise = new Promise(resolve =>
        child.once('close', (code, signal) => {
          evidence.close = { code, signal }
          resolve(evidence.close)
        }),
      )
      childObservations.push(evidence)
      return child
    },
    childObservations,
    nativeError: () => nativeErrorAdapter?.snapshot() ?? null,
    owned,
    rootMkdirConsumed: () => rootMkdirConsumed,
  })
}

export function trackT1Bridge(bridge, { onProfile } = {}) {
  let bootstrap = null
  let bound = null
  return Object.freeze({
    bootstrapConfig(url) {
      const value = bridge.bootstrapConfig(url)
      if (bootstrap) throw new Error('T1 duplicate bootstrap configuration')
      bootstrap = {
        capabilityHash: `sha256:${sha(value.capability)}`,
        bootstrapHash: `sha256:${sha(JSON.stringify(value))}`,
        requestId: null,
      }
      return value
    },
    async handle(request) {
      const action = request?.action
      if (action !== 'bootstrap' && action !== 'bindProfile') throw new Error('T1 canonical action forbidden')
      if (
        (action === 'bootstrap' && (!bootstrap || bootstrap.requestId)) ||
        (action === 'bindProfile' && (!bootstrap?.requestId || bound))
      )
        throw new Error('T1 canonical startup sequence')
      const result = await bridge.handle(request)
      if (result?.ok !== true || result.requestId !== request.requestId) throw new Error('T1 canonical startup failed')
      if (action === 'bootstrap') bootstrap = { ...bootstrap, requestId: request.requestId }
      else {
        const profile = request.payload?.advertisedProfile
        if (!/^sha256:[a-f0-9]{64}$/.test(profile?.profileDigest ?? '')) throw new Error('T1 profile binding missing')
        bound = { requestId: request.requestId, profileDigest: profile.profileDigest }
        onProfile?.(bound)
      }
      return result
    },
    snapshot: () => ({ bootstrap, bound, fenced: bridge.fenced }),
    close: () => bridge.close?.(),
  })
}

export function t1TurnParams(threadId) {
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(threadId ?? '')) throw new Error('actual thread id required')
  return Object.freeze({
    threadId,
    model: POLICY.model,
    effort: POLICY.reasoning,
    input: [{ type: 'text', text: PROMPT, text_elements: [] }],
  })
}

export function t1InitializeParams() {
  return {
    clientInfo: { name: 'appraise_m02_t1', version: '1' },
    capabilities: { experimentalApi: false, explicitGatewayOauth: true, requestAttestation: false },
  }
}

export function sanitizeT1SupervisorEnvironment(env = process.env) {
  if (globalThis.prisma !== undefined) throw new Error('ambient Prisma client present')
  if (process.cwd() !== REPO) throw new Error('T1 supervisor cwd must be the exact repository')
  const keep = { PATH: '/usr/bin:/bin', LANG: 'C' }
  for (const key of Object.keys(env)) delete env[key]
  Object.assign(env, keep, {
    NODE_ENV: 'production',
    DATABASE_URL: `file:${receiptFile('fixture.db')}`,
  })
  return Object.freeze({ databaseUrl: env.DATABASE_URL, ambientKeysRetained: Object.keys(keep) })
}

function writeOwnedJson(path, value, io = fs) {
  if (dirname(path) !== SUPERVISOR || !/^[a-z0-9-]+\.json$/.test(path.slice(SUPERVISOR.length + 1)))
    throw new Error('T1 evidence path mismatch')
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`)
  if (bytes.length > 1024 * 1024) throw new Error('T1 evidence bound')
  const fd = io.openSync(
    path,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
    0o600,
  )
  try {
    io.writeFileSync(fd, bytes)
    io.fsyncSync(fd)
  } finally {
    io.closeSync(fd)
  }
  const directory = io.openSync(SUPERVISOR, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
  try {
    io.fsyncSync(directory)
  } finally {
    io.closeSync(directory)
  }
}

export function normalStopJournal(journal, { write = writeOwnedJson } = {}) {
  let intent = false
  return new Proxy(journal, {
    get(target, key) {
      if (key !== 'recordRecovery') {
        const value = target[key]
        return typeof value === 'function' ? value.bind(target) : value
      }
      return ({ id, action }) => {
        if (target.snapshot().fenced) return target.recordRecovery({ id, action })
        if (
          (action === 'owned-stop-intent' && intent) ||
          (action === 'owned-stop-observed' && !intent) ||
          !['owned-stop-intent', 'owned-stop-observed'].includes(action)
        )
          throw new Error('T1 normal-stop sequence invalid')
        write(receiptFile(action === 'owned-stop-intent' ? 'normal-stop-intent.json' : 'normal-stop-observed.json'), {
          schema: 'appraise.m02-ta-t1-normal-stop/v1',
          caseId: 'T1',
          action,
          id,
          journalSequence: target.snapshot().seq,
          evidenceClass: 'SUPERVISOR_OWNED_HANDLE_RECEIPT',
        })
        if (action === 'owned-stop-intent') intent = true
      }
    },
  })
}

async function waitUntil(read, expected, deadline, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (;;) {
    const value = await read()
    if (expected(value)) return value
    if (Date.now() >= deadline) throw new Error('T1 deadline; UNKNOWN')
    await pause(20)
  }
}

async function withDeadline(effect, deadline, clock = Date.now) {
  let timer
  try {
    return await Promise.race([
      effect,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('T1 operation deadline; UNKNOWN')), Math.max(1, deadline - clock()))
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Cleanup only handles observed by this supervisor when the launcher did not return. */
export async function stopPartialT1({
  io,
  journal,
  approved,
  existingAuthorization,
  manifestDigest,
  deadline,
  clock = Date.now,
}) {
  const owned = io?.owned
  if (!owned || (!owned.child && !owned.server)) return { noOwnedHandles: true }
  if (!journal.snapshot().fenced) throw new Error('partial T1 cleanup requires UNKNOWN fence')
  const authority = existingAuthorization ?? approved({ action: 'owned-stop', manifestDigest })
  if ((await withDeadline(Promise.resolve(authority), deadline, clock)) !== true)
    throw new Error('partial T1 owned-stop authority missing')
  try {
    journal.recordRecovery({ id: 'T1-partial-stop-intent', action: 'owned-stop-intent' })
  } catch {
    // An already-fenced or unusable journal cannot turn an observed owned handle into an orphan.
  }
  if (owned.child && !owned.killCount) owned.child.kill('SIGTERM')
  if (owned.server && !owned.serverCloseCount) {
    const close = new Promise((resolve, reject) => owned.server.close(error => (error ? reject(error) : resolve())))
    await withDeadline(close, deadline, clock)
  } else if (owned.server) {
    await waitUntil(() => owned.serverClosed, Boolean, deadline)
  }
  if (owned.child) {
    const child = io.childObservations[0]
    if (!child) throw new Error('partial T1 child observer missing')
    await waitUntil(() => child.exit, Boolean, deadline)
    await waitUntil(() => child.close, Boolean, deadline)
  }
  journal.recordRecovery({ id: 'T1-partial-stop-observed', action: 'owned-stop-observed' })
  return { childExit: io.childObservations[0]?.exit ?? null, listenerClosed: owned.serverClosed }
}

async function readReceipt(path) {
  const state = await fsp.lstat(path)
  if (
    !state.isFile() ||
    state.isSymbolicLink() ||
    state.uid !== process.getuid() ||
    (state.mode & 0o777) !== 0o600 ||
    state.size > 4096
  )
    throw new Error('T1 child receipt identity')
  return JSON.parse(await fsp.readFile(path, 'utf8'))
}

async function verifyT1Artifacts(prepared) {
  for (const artifact of prepared.manifest.artifacts) {
    const state = await fsp.lstat(artifact.path)
    if (!state.isFile() || state.isSymbolicLink() || (await shaFile(artifact.path)) !== artifact.sha256)
      throw new Error('T1 artifact drift before effects')
  }
}

export function verifyChildReceipt(receipt, event, bridge, startup = null) {
  const bound = bridge.snapshot().bound
  const expectedBootstrap = bridge.snapshot().bootstrap
  return (
    receipt?.schema === 'appraise.m02-ta-t1-child-receipt/v1' &&
    receipt.caseId === 'T1' &&
    receipt.event === event &&
    receipt.evidenceClass === 'TRUSTED_CHILD_SELF_REPORT' &&
    receipt.capabilityHash === expectedBootstrap?.capabilityHash &&
    receipt.bootstrapHash === expectedBootstrap?.bootstrapHash &&
    receipt.profileDigest === bound?.profileDigest &&
    (!startup ||
      (receipt.capabilityHash === startup.capabilityHash &&
        receipt.bootstrapHash === startup.bootstrapHash &&
        receipt.profileDigest === startup.profileDigest))
  )
}

/** Actual effect path, invoked only by an explicit future --run command and exact approval callback. */
export async function runT1({
  prepared,
  approved,
  collectorBundle = fixedPaths['descriptor-collector'],
  bridgeBundle = fixedPaths['canonical-backend'],
  createJournal = () => DurableT1Journal.create(),
  makeLauncher = createTrustedLauncher,
  loadBridge = path => import(pathToFileURL(path).href),
  loadCollector = path => import(pathToFileURL(path).href),
  stageModules = stageT1Modules,
  makeIo,
  clock = Date.now,
  preflight = {
    prepare: prepareT1,
    rootExists: () => fs.existsSync(T1_ROOT),
    verifyArtifacts: verifyT1Artifacts,
    sanitize: sanitizeT1SupervisorEnvironment,
    rootStat: () => fs.lstatSync(T1_ROOT),
  },
  readChildReceipt = readReceipt,
  writeEvidence = writeOwnedJson,
  makeJournalFacade = normalStopJournal,
  caseDeadlineMs = POLICY.deadlineMs.case,
} = {}) {
  if (
    typeof approved !== 'function' ||
    !prepared ||
    prepared.manifestDigest !== digest(prepared.manifest) ||
    prepared.manifest.phase !== 'T1' ||
    prepared.blockers.length ||
    !prepared.manifest.artifacts.some(
      item => item.purpose === 'descriptor-collector' && item.path === collectorBundle,
    ) ||
    !prepared.manifest.artifacts.some(item => item.purpose === 'canonical-backend' && item.path === bridgeBundle) ||
    !Number.isInteger(caseDeadlineMs) ||
    caseDeadlineMs < 1 ||
    caseDeadlineMs > POLICY.deadlineMs.case
  )
    throw new Error('exact T1 reviewed manifest required')
  if ((await approved({ action: 'T1-preflight', manifestDigest: prepared.manifestDigest })) !== true)
    throw new Error('T1 runtime approval absent')
  const exactPrepared = await preflight.prepare()
  if (exactPrepared.manifestDigest !== prepared.manifestDigest)
    throw new Error('T1 manifest inventory differs from current runtime closure')
  if (preflight.rootExists()) throw new Error('T1 phase root already exists; no retry')
  await preflight.verifyArtifacts(prepared)
  preflight.sanitize()
  const journal = createJournal()
  const rootStat = preflight.rootStat()
  const runtimeIo =
    makeIo?.(rootStat) ??
    t1RootIo({
      rootStat,
      nativeErrorGate: {
        afterCapture: () => ({
          captured: capture?.status === 'CAPTURED',
          threadId: started?.peer.snapshot().threadId,
          turnId: started?.peer.snapshot().turnId,
        }),
        onAccepted: value => writeEvidence(receiptFile('provider-error.json'), value),
        onAmbiguous: () => {
          if (!journal.snapshot().fenced) journal.markUnknown('native-provider-error-variant')
        },
      },
      tuple: async () => {
        const plist = await fsp.readFile('/System/Library/CoreServices/SystemVersion.plist', 'utf8')
        return {
          platform: process.platform,
          arch: process.arch,
          osBuild: plist.match(/<key>ProductBuildVersion<\/key>\s*<string>([^<]+)<\/string>/)?.[1],
          nodeExecutable: process.execPath,
          nodeMajor: Number(process.versions.node.split('.')[0]),
        }
      },
    })
  let started = null
  let capture = null
  let startup = null
  let canonical = null
  let canonicalCloseAttempted = false
  let stopStarted = false
  let stopAuthorization = null
  let stopPromise = null
  let deadline = clock() + caseDeadlineMs
  const cleanupReserveMs = Math.min(10_000, Math.max(5, Math.floor(caseDeadlineMs / 4)))
  let dispatchDeadline = deadline - cleanupReserveMs
  const fallbackReserveMs = Math.max(2, Math.floor(cleanupReserveMs / 2))
  try {
    const staged = await withDeadline(
      stageModules({
        prepared,
        sourceBundle: bridgeBundle,
        moduleRoot: T1_MODULES,
        phaseStat: journal.parentStats?.[0],
        supervisorStat: journal.parentStats?.[1],
      }),
      dispatchDeadline,
      clock,
    )
    if (!staged?.bundlePath || !/^([a-f0-9]{64})$/.test(staged.stagedDigest ?? ''))
      throw new Error('T1 staged module provenance missing')
    writeEvidence(receiptFile('module-stage.json'), {
      schema: 'appraise.m02-ta-t1-module-stage/v1',
      sourceBundle: bridgeBundle,
      stagedBundle: staged.bundlePath,
      copiedFiles: staged.copiedFiles,
      stagedDigest: staged.stagedDigest,
      resolutionClass: 'STAGED_MODULES_ONLY',
    })
    const backend = await withDeadline(loadBridge(staged.bundlePath), dispatchDeadline, clock)
    const collectorModule = await withDeadline(loadCollector(collectorBundle), dispatchDeadline, clock)
    if (
      typeof backend.createLazyCanonicalSupervisorBridge !== 'function' ||
      typeof collectorModule.NativeDescriptorCollector !== 'function'
    )
      throw new Error('T1 compiled modules mismatch')
    canonical = trackT1Bridge(
      backend.createLazyCanonicalSupervisorBridge({
        role: 'REQUIREMENT_ANALYZER',
        workspace: SUPERVISOR,
        caseId: 'T1',
        onUnknown: () => {
          if (!journal.snapshot().fenced) journal.markUnknown('canonical-ambiguity')
        },
      }),
    )
    const collector = new collectorModule.NativeDescriptorCollector()
    const launcher = makeLauncher({
      prepared,
      journal: makeJournalFacade(journal),
      authorize: input => {
        if (input.action === 'owned-stop') {
          if (stopStarted) return false
          stopStarted = true
          stopAuthorization = Promise.resolve(approved({ action: input.action, manifestDigest: input.manifestDigest }))
          return stopAuthorization
        }
        return approved({ action: input.action, manifestDigest: input.manifestDigest })
      },
      io: runtimeIo,
      clock,
      verifyMcpStartup: async result => {
        if (
          !result?.thread?.id ||
          !canonical.snapshot().bootstrap ||
          !canonical.snapshot().bound ||
          canonical.snapshot().fenced
        )
          return false
        startup = await waitUntil(
          async () => {
            if (journal.snapshot().fenced) throw new Error('T1 startup fenced')
            return readChildReceipt(receiptFile('mcp-startup.json')).catch(() => null)
          },
          Boolean,
          dispatchDeadline,
        ).catch(() => null)
        return verifyChildReceipt(startup, 'sdk-connect-returned', canonical)
      },
    })
    deadline = clock() + caseDeadlineMs
    dispatchDeadline = deadline - cleanupReserveMs
    started = await withDeadline(
      launcher.startCase({
        caseId: 'T1',
        canonicalBridge: canonical,
        onCaptured: request => {
          const peer = started?.peer.snapshot()
          if (!peer?.threadId || !peer?.turnId) throw new Error('actual T1 peer IDs unavailable')
          const result = collector.capture(request, {
            binarySha256: `sha256:${POLICY.executable.sha256}`,
            platform: `${POLICY.executable.platform}-${POLICY.executable.arch}`,
            configSha256: `sha256:${sha(JSON.stringify(started.config.config))}`,
            schemaSha256: `sha256:${POLICY.executable.schemaDigest}`,
            runId: prepared.manifestDigest,
            requestId: 'T1-listener-request-1',
            threadId: peer.threadId,
            turnId: peer.turnId,
          })
          if (result.status !== 'CAPTURED') throw new Error('actual native descriptor capture incomplete')
          capture = result
          writeEvidence(receiptFile('descriptor-capture.json'), result)
          return result
        },
      }),
      dispatchDeadline,
      clock,
    )
    await withDeadline(
      started.peer.request('initialize', t1InitializeParams(), 'T1-initialize'),
      dispatchDeadline,
      clock,
    )
    await waitUntil(
      () => started.peer.snapshot(),
      state => state.phase === 'ready',
      dispatchDeadline,
    )
    await withDeadline(
      started.peer.request('thread/start', started.config.threadStartParams, 'T1-thread-start'),
      dispatchDeadline,
      clock,
    )
    await waitUntil(
      () => started.peer.snapshot(),
      state => state.phase === 'thread',
      dispatchDeadline,
    )
    const actualThread = started.peer.snapshot().threadId
    await withDeadline(
      started.peer.request('turn/start', t1TurnParams(actualThread), 'T1-turn-start'),
      dispatchDeadline,
      clock,
    )
    await waitUntil(
      () => started.peer.snapshot(),
      state => state.phase === 'capture-stopped',
      dispatchDeadline,
    )
    if (!capture || journal.snapshot().counts.providerRequests !== 1 || journal.snapshot().counts.scopedCalls !== 0)
      throw new Error('T1 capture counters mismatch')
    const nativeError = runtimeIo.nativeError?.()
    if (
      nativeError?.threadId !== actualThread ||
      nativeError?.turnId !== started.peer.snapshot().turnId ||
      nativeError?.httpStatusCode !== 503
    )
      throw new Error('T1 captured-provider 503 notification missing')
    stopPromise = started.stopOwned()
    const stop = await withDeadline(stopPromise, deadline - fallbackReserveMs, clock)
    const child = runtimeIo.childObservations?.[0]
    if (!stop.listenerClosed || !child) throw new Error('T1 owned cleanup unproved')
    const exit = await waitUntil(() => child.exit, Boolean, deadline)
    const close = await waitUntil(() => child.close, Boolean, deadline)
    const mcpExit = await waitUntil(
      () => readChildReceipt(receiptFile('mcp-exit.json')).catch(() => null),
      Boolean,
      deadline,
    )
    if (
      !verifyChildReceipt(mcpExit, 'node-exit-handler', canonical, startup) ||
      mcpExit.exitCode !== 0 ||
      exit.signal !== 'SIGTERM' ||
      close.signal !== 'SIGTERM'
    )
      throw new Error('T1 owned child exit evidence incomplete')
    if (journal.snapshot().pending.length !== 0) throw new Error('T1 pending durable intent')
    canonicalCloseAttempted = true
    await withDeadline(Promise.resolve(canonical.close()), deadline, clock)
    const verifyEvidence = () => {
      const peer = started.peer.snapshot()
      const state = journal.snapshot()
      return (
        capture?.status === 'CAPTURED' &&
        typeof capture.descriptorHash === 'string' &&
        state.counts.providerRequests === 1 &&
        state.counts.scopedCalls === 0 &&
        state.pending.length === 0 &&
        peer.phase === 'capture-stopped' &&
        peer.threadId === actualThread &&
        peer.turnId === capture.provenance?.turnId &&
        runtimeIo.nativeError?.()?.notificationSha256 === nativeError.notificationSha256 &&
        verifyChildReceipt(startup, 'sdk-connect-returned', canonical) &&
        verifyChildReceipt(mcpExit, 'node-exit-handler', canonical, startup) &&
        mcpExit.exitCode === 0 &&
        child.exit === exit &&
        child.close === close &&
        runtimeIo.owned?.serverClosed === true &&
        runtimeIo.owned?.killCount === 1 &&
        runtimeIo.owned?.serverCloseCount === 1
      )
    }
    if (!verifyEvidence()) throw new Error('T1 completion evidence drift')
    await withDeadline(
      started.coordinator.complete({ outcome: 'capture', cleanupKnown: true, verifyEvidence }),
      deadline,
      clock,
    )
    return {
      status: 'T1_CAPTURED',
      manifestDigest: prepared.manifestDigest,
      descriptorHash: capture.descriptorHash,
      threadId: actualThread,
      turnId: started.peer.snapshot().turnId,
      journal: journal.snapshot(),
      retention: journal.snapshot().retention,
      cleanup: {
        codexExit: exit,
        codexClose: close,
        listenerClosed: true,
        mcpExitEvidence: 'TRUSTED_CHILD_SELF_REPORT',
        rawCodexHistoryDeleted: false,
      },
    }
  } catch (error) {
    try {
      if (!journal.snapshot().fenced) journal.markUnknown('T1-runtime-ambiguity')
    } catch {
      /* retain uncertainty */
    }
    if (started && !stopStarted) {
      stopPromise = started.stopOwned()
      await withDeadline(
        stopPromise.catch(() => {}),
        deadline - fallbackReserveMs,
        clock,
      ).catch(() => {})
    }
    if (
      (runtimeIo.owned?.child || runtimeIo.owned?.server) &&
      ((runtimeIo.owned?.child && !runtimeIo.owned.killCount) ||
        (runtimeIo.owned?.server && !runtimeIo.owned.serverCloseCount))
    ) {
      await withDeadline(
        stopPartialT1({
          io: runtimeIo,
          journal,
          approved,
          existingAuthorization: stopAuthorization,
          manifestDigest: prepared.manifestDigest,
          deadline,
          clock,
        }),
        deadline,
        clock,
      ).catch(() => {})
    }
    throw error
  } finally {
    if (canonical && !canonicalCloseAttempted) {
      canonicalCloseAttempted = true
      await withDeadline(Promise.resolve(canonical.close()), deadline, clock).then(
        () => {},
        () => {
          try {
            if (!journal.snapshot().fenced) journal.markUnknown('canonical-close-uncertain')
          } catch {}
        },
      )
    }
    journal.close()
  }
}

function writePreparedManifest(value) {
  fs.mkdirSync(MANIFEST_DIR, { mode: 0o700 })
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`)
  if (bytes.length > 8 * 1024 * 1024) throw new Error('T1 manifest bound')
  const fd = fs.openSync(
    MANIFEST_FILE,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
    0o600,
  )
  try {
    fs.writeFileSync(fd, bytes)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  const directory = fs.openSync(
    MANIFEST_DIR,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  )
  try {
    fs.fsyncSync(directory)
  } finally {
    fs.closeSync(directory)
  }
  return {
    manifestFile: MANIFEST_FILE,
    manifestFileSha256: sha(bytes),
    manifestDigest: value.manifestDigest,
    dependencyFiles: value.dependencyFiles,
    invocation: value.invocation,
  }
}

function readPreparedManifest(path, expectedDigest) {
  if (path !== MANIFEST_FILE || !/^[a-f0-9]{64}$/.test(expectedDigest ?? ''))
    throw new Error('exact T1 manifest argument required')
  const directory = fs.lstatSync(MANIFEST_DIR)
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.uid !== process.getuid() ||
    (directory.mode & 0o777) !== 0o700
  )
    throw new Error('T1 manifest directory identity')
  const state = fs.lstatSync(path)
  if (
    !state.isFile() ||
    state.isSymbolicLink() ||
    state.uid !== process.getuid() ||
    (state.mode & 0o777) !== 0o600 ||
    state.size > 8 * 1024 * 1024
  )
    throw new Error('T1 manifest file identity')
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  let raw
  try {
    const opened = fs.fstatSync(fd)
    if (opened.dev !== state.dev || opened.ino !== state.ino || opened.size !== state.size)
      throw new Error('T1 manifest file replaced')
    raw = fs.readFileSync(fd, 'utf8')
  } finally {
    fs.closeSync(fd)
  }
  const value = JSON.parse(raw)
  if (
    value.manifestDigest !== expectedDigest ||
    digest(value.manifest) !== expectedDigest ||
    value.qualification !== 'OFFLINE_PREPARED_ONLY' ||
    value.manifest.runtimeAuthorized !== false
  )
    throw new Error('T1 manifest digest or qualification mismatch')
  return value
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv[2] === '--prepare' && process.argv.length === 3) {
    prepareT1()
      .then(value => process.stdout.write(`${JSON.stringify(writePreparedManifest(value))}\n`))
      .catch(() => {
        process.stderr.write('T1 preparation blocked.\n')
        process.exitCode = 1
      })
  } else if (process.argv[2] === '--run' && process.argv.length === 5) {
    const exactDigest = process.argv[4]
    const allowed = new Set([
      'T1-preflight',
      'owned-loopback-listener',
      'private-synthetic-bootstrap',
      'codex-child',
      'owned-stdio-send',
      'scripted-provider-request',
      'canonical-ipc-request',
      'owned-stop',
    ])
    Promise.resolve()
      .then(() => readPreparedManifest(process.argv[3], exactDigest))
      .then(prepared =>
        runT1({
          prepared,
          approved: ({ action, manifestDigest }) => manifestDigest === exactDigest && allowed.has(action),
        }),
      )
      .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
      .catch(() => {
        process.stderr.write('T1 stopped UNKNOWN or failed preflight; inspect owned evidence.\n')
        process.exit(1)
      })
  } else {
    process.stderr.write('T1 requires exact --prepare or --run manifest digest invocation.\n')
    process.exitCode = 1
  }
}
