import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { join, resolve } from 'node:path'
import test from 'node:test'
import Ajv from 'ajv'
import { POLICY, digest } from './fixtures/codex-app-server-m02-ta-runtime-r5/policy.mjs'
import {
  prepareTrustedCase,
  prepareTrustedComposition,
} from './fixtures/codex-app-server-m02-ta-runtime-r5/composition.mjs'
import {
  t1InitializeParams,
  t1TurnParams,
  prepareT1,
  runT1,
  R5_REPLACEMENT,
} from './fixtures/codex-app-server-m02-ta-runtime-r5/t1-runner.mjs'
import { verifyPriorAttempt, PRIOR_ROOT } from './fixtures/codex-app-server-m02-ta-runtime-r5/prior-attempt.mjs'
import { createT1ErrorAdapter } from './fixtures/codex-app-server-m02-ta-runtime-r5/t1-error-adapter.mjs'
import { T1_ROOT } from './fixtures/codex-app-server-m02-ta-runtime-r5/journal.mjs'
import { writeT1PreparationReceipt } from './fixtures/codex-app-server-m02-ta-runtime-r5/preparation-receipt.mjs'

const schemaRoot = resolve('.appraisejs/m02-executable-qualification-20261016-01/schemas')
const validator = new Ajv({ allErrors: true })
for (const format of ['int32', 'int64', 'uint', 'uint16', 'uint32', 'uint64'])
  validator.addFormat(format, { type: 'number', validate: Number.isSafeInteger })
function schema(name) {
  return validator.compile(JSON.parse(fs.readFileSync(join(schemaRoot, name), 'utf8')))
}
function valid(name, value) {
  const check = schema(name)
  assert.equal(check(value), true, JSON.stringify(check.errors))
}
const thread = {
  cliVersion: POLICY.executable.version,
  createdAt: 1,
  cwd: POLICY.roots.T1,
  ephemeral: false,
  id: 'thread-1',
  modelProvider: 'm02-scripted',
  preview: '',
  projectId: null,
  sessionId: 'session-1',
  source: 'appServer',
  status: { type: 'idle' },
  turns: [],
  updatedAt: 1,
}
const turn = { id: 'turn-1', items: [], status: 'inProgress' }
const errorParams = variant => ({
  threadId: 'thread-1',
  turnId: 'turn-1',
  willRetry: false,
  error: { message: 'local fixture 503', codexErrorInfo: { [variant]: { httpStatusCode: 503 } } },
})
const frame = params => Buffer.from(`${JSON.stringify({ method: 'error', params })}\n`)
async function driveAdapter(params, state = { captured: true, threadId: 'thread-1', turnId: 'turn-1' }) {
  const accepted = []
  let ambiguous = 0
  const adapter = createT1ErrorAdapter({
    afterCapture: () => state,
    onAccepted: value => accepted.push(value),
    onAmbiguous: () => ambiguous++,
  })
  let rejected = null
  adapter.stream.on('error', () => {})
  await new Promise(resolve =>
    adapter.stream.write(frame(params), error => {
      rejected = error
      resolve()
    }),
  )
  return { accepted, ambiguous, rejected }
}

test('R5 policy is a literal old policy delta for version, executable and p2 root', async () => {
  const old = await fsp.readFile('scripts/tests/fixtures/codex-app-server-m02-ta/policy.mjs', 'utf8')
  const current = await fsp.readFile('scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r5/policy.mjs', 'utf8')
  assert.equal(
    current,
    old
      .replace('M02-TA-P1-T0-v3', 'M02-TA-P2-R5-v1')
      .replace('/private/tmp/appraise-m02-ta-descriptors-p1', '/private/tmp/appraise-m02-ta-descriptors-p2')
      .replace('0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28', POLICY.executable.sha256)
      .replace('0.162.0-alpha.17.2', POLICY.executable.version)
      .replace('a725c3a629e0dd5a8b27612dc23a7172d88073ec89c708bd8ed4359344f9402c', POLICY.executable.schemaDigest),
  )
  assert.equal(POLICY.nativeInference, 0)
  assert.equal(POLICY.permissionGrants, 0)
  assert.equal(POLICY.retries, 0)
  assert.equal(POLICY.deadlineMs.case, 60_000)
  assert.equal(POLICY.deadlineMs.T1, 180_000)
})

test('R5 effect imports resolve locally, with no old policy, launcher, native ports or protocol fallback', async () => {
  const directory = 'scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r5'
  for (const name of ['t1-runner', 'journal', 'launcher', 'composition', 'runtime-effects', 'protocol']) {
    const source = await fsp.readFile(join(directory, `${name}.mjs`), 'utf8')
    assert.doesNotMatch(
      source,
      /\.\.\/codex-app-server-m02-ta\/(?:policy|launcher|composition|runtime-effects|protocol)\.mjs/,
    )
  }
  const native = await fsp.readFile(join(directory, 'runtime-effects.mjs'), 'utf8')
  assert.match(native, /import \{ digest, POLICY \} from '\.\/policy\.mjs'/)
  const runner = await fsp.readFile(join(directory, 't1-runner.mjs'), 'utf8')
  assert.match(runner, /import \{ createTrustedLauncher \} from '\.\/launcher\.mjs'/)
  assert.match(runner, /writeEvidence\(receiptFile\('descriptor-capture\.json'\), result\)\s+capture = result/)
})

test('runtime import closure adds no AJV or unresolved package dependency', async () => {
  const directory = 'scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r5'
  const allowedExternal = new Set([
    '../codex-app-server-m02-b1/framing.mjs',
    '../../../../packages/appraisejs/dist/mcp/trusted-worker-bridge.js',
    '../../../../packages/appraisejs/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js',
  ])
  for (const filename of await fsp.readdir(directory)) {
    if (!filename.endsWith('.mjs')) continue
    const source = await fsp.readFile(join(directory, filename), 'utf8')
    assert.doesNotMatch(source, /(?:from|import\()\s*['"]ajv(?:\/|['"])/)
    for (const match of source.matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1]
      if (specifier.startsWith('node:')) continue
      if (specifier.startsWith('./')) {
        assert.equal(fs.existsSync(join(directory, specifier)), true, `${filename}: ${specifier}`)
        continue
      }
      assert.equal(allowedExternal.has(specifier), true, `${filename}: ${specifier}`)
      assert.equal(fs.existsSync(resolve(directory, specifier)), true, `${filename}: ${specifier}`)
    }
  }
})

test('lost p1 root is absent while exact durable UNKNOWN proof and verdicts remain pinned', () => {
  assert.equal(fs.existsSync(PRIOR_ROOT), false)
  const proof = verifyPriorAttempt()
  assert.equal(proof.classification, 'LOST_RAW_ROOT_AFTER_REVIEW')
  assert.equal(proof.status, 'UNKNOWN')
  assert.equal(proof.originalUnresolvedDecisionDueAt, '2026-10-22T18:54:08.422Z')
  assert.equal(R5_REPLACEMENT.classification, proof.classification)
  assert.equal(
    proof.durablePins['.appraisejs/m02-prior-evidence-recovery-20261016-01/journal-from-historical-tool-output.jsonl'],
    '00784593918012207cd76763ceecb7e5ce1aae91790a7d89a3dda21fad1c30ff',
  )
  assert.equal(
    proof.durablePins['.appraisejs/m02-prior-evidence-recovery-20261016-01/provenance.json'],
    '678cc4bee0802038670ab7c731b1b844e82c69d46d03278761172f556fe929d0',
  )
  assert.equal(
    proof.durablePins['.appraisejs/m02-prior-evidence-recovery-20261016-01/review.json'],
    '053380a1e9929895904f1f0cfb001b1c7584e64980abf8e0e55d206ccc9e649b',
  )
  assert.throws(
    () =>
      verifyPriorAttempt(
        new Proxy(fs, {
          get(target, key) {
            if (key === 'lstatSync')
              return path => (path === PRIOR_ROOT ? { isDirectory: () => true } : fs.lstatSync(path))
            return target[key]
          },
        }),
      ),
    /durable proof changed/,
  )
  assert.throws(
    () =>
      verifyPriorAttempt(
        new Proxy(fs, {
          get(target, key) {
            if (key === 'readFileSync')
              return (path, ...args) =>
                String(path).endsWith('m02-t1-r4-exact-review.json')
                  ? Buffer.from('{}')
                  : fs.readFileSync(path, ...args)
            return target[key]
          },
        }),
      ),
    /durable proof changed/,
  )
})

test('all 318 new schemas and executable metadata are pinned in pure preparation', async () => {
  const prepared = await prepareT1()
  assert.deepEqual(prepared.blockers, [])
  assert.equal(prepared.manifest.root, POLICY.roots.T1)
  assert.equal(prepared.manifest.replacementAttempt.classification, 'LOST_RAW_ROOT_AFTER_REVIEW')
  assert.equal(prepared.manifest.artifacts.filter(item => item.purpose.startsWith('schema:')).length, 318)
  assert.equal(prepared.manifest.artifacts.find(item => item.purpose === 'codex').sha256, POLICY.executable.sha256)
  assert.equal(
    prepared.manifest.artifacts.find(item => item.purpose === 'schema').sha256,
    POLICY.executable.schemaDigest,
  )
  assert.equal(
    prepared.manifest.artifacts.find(item => item.purpose === 'protocol-framing').sha256,
    '40aacec14d421f41c1c1da5dc9bec2d491ca713f0c8e3552f495d60b9eda8a34',
  )
  assert.equal(prepared.manifestDigest, digest(prepared.manifest))
  assert.equal(prepared.qualification, 'OFFLINE_PREPARED_ONLY')
})

test('actual R5 outgoing request parameters validate against new draft-07 schemas', () => {
  const manifest = { phase: 'T1', root: POLICY.roots.T1 }
  const actual = prepareTrustedCase({ manifest, manifestDigest: digest(manifest) }, 'T1', {
    port: 44000,
    mcpExecutable: '/opt/homebrew/Cellar/node/26.11.0/bin/node',
    mcpArgs: ['scoped-worker-entry.mjs'],
  })
  valid('v1/InitializeParams.json', t1InitializeParams())
  valid('v2/ThreadStartParams.json', actual.threadStartParams)
  valid('v2/TurnStartParams.json', t1TurnParams(thread.id))
  assert.equal(actual.config.model_providers['m02-scripted'].request_max_retries, 0)
  assert.equal(actual.config.model_providers['m02-scripted'].stream_max_retries, 0)
  assert.equal(actual.config.approval_policy, 'never')
  assert.equal(actual.config.model, 'gpt-6.1-sol')
})

test('full synthetic responses and lifecycle notifications validate under new schemas', () => {
  valid('v1/InitializeResponse.json', {
    codexHome: `${POLICY.roots.T1}/cases/T1/codex`,
    platformFamily: 'unix',
    platformOs: 'macos',
    userAgent: 'offline-fixture',
  })
  valid('v2/ThreadStartResponse.json', {
    approvalPolicy: 'never',
    approvalsReviewer: 'user',
    cwd: POLICY.roots.T1,
    model: POLICY.model,
    modelProvider: 'm02-scripted',
    sandbox: { type: 'workspaceWrite' },
    thread,
  })
  valid('v2/TurnStartResponse.json', { turn })
  valid('v2/ThreadStartedNotification.json', { thread })
  valid('v2/TurnStartedNotification.json', { threadId: thread.id, turn })
  valid('v2/TurnCompletedNotification.json', { threadId: thread.id, turn: { ...turn, status: 'failed' } })
  for (const variant of ['httpConnectionFailed', 'responseStreamDisconnected', 'responseStreamConnectionFailed'])
    valid('v2/ErrorNotification.json', errorParams(variant))
  const check = schema('v2/ErrorNotification.json')
  assert.equal(check({ ...errorParams('responseStreamConnectionFailed'), willRetry: undefined }), false)
  assert.equal(check({ ...errorParams('responseStreamConnectionFailed'), threadId: undefined }), false)
})

test('R5 adapter accepts only the three captured exact nonretry 503 variants', async () => {
  for (const variant of ['httpConnectionFailed', 'responseStreamDisconnected', 'responseStreamConnectionFailed']) {
    const result = await driveAdapter(errorParams(variant))
    assert.equal(result.rejected, null)
    assert.equal(result.ambiguous, 0)
    assert.equal(result.accepted.length, 1)
    assert.equal(result.accepted[0].httpStatusCode, 503)
  }
  const mutations = [
    [errorParams('responseStreamConnectionFailed'), { captured: false, threadId: 'thread-1', turnId: 'turn-1' }],
    [{ ...errorParams('responseStreamConnectionFailed'), willRetry: true }],
    [{ ...errorParams('responseStreamConnectionFailed'), threadId: 'different' }],
    [{ ...errorParams('responseStreamConnectionFailed'), turnId: 'different' }],
    [
      {
        ...errorParams('responseStreamConnectionFailed'),
        error: { message: 'x', codexErrorInfo: { responseStreamConnectionFailed: { httpStatusCode: 502 } } },
      },
    ],
    [
      {
        ...errorParams('responseStreamConnectionFailed'),
        error: { message: 'x', codexErrorInfo: { responseStreamConnectionFailed: { httpStatusCode: null } } },
      },
    ],
    [
      {
        ...errorParams('responseStreamConnectionFailed'),
        error: { message: 'x', codexErrorInfo: { responseStreamConnectionFailed: {} } },
      },
    ],
    [
      {
        ...errorParams('responseStreamConnectionFailed'),
        error: {
          message: 'x',
          codexErrorInfo: { responseStreamConnectionFailed: { httpStatusCode: 503, extra: true } },
        },
      },
    ],
    [
      {
        ...errorParams('responseStreamConnectionFailed'),
        error: { message: 'x', codexErrorInfo: { responseStreamConnectionFailed: { httpStatusCode: 503 }, other: {} } },
      },
    ],
    [errorParams('newVariant')],
  ]
  for (const [params, state] of mutations) {
    const result = await driveAdapter(params, state)
    assert.ok(result.rejected)
    assert.equal(result.accepted.length, 0)
    assert.ok(result.ambiguous > 0)
  }
})

test('pre-effect gates reject prior/root/artifact drift without constructing runtime ports', async () => {
  const prepared = await prepareT1()
  let constructed = 0
  const make = preflight =>
    runT1({
      prepared,
      approved: async () => true,
      createJournal: () => {
        constructed++
        throw new Error('unexpected runtime journal')
      },
      preflight: {
        prepare: async () => prepared,
        verifyPrior: () => {},
        rootExists: () => false,
        verifyArtifacts: async () => {},
        sanitize: () => {},
        ...preflight,
      },
    })
  await assert.rejects(
    make({
      verifyPrior: () => {
        throw new Error('prior changed')
      },
    }),
    /prior changed/,
  )
  await assert.rejects(make({ rootExists: () => true }), /phase root already exists/)
  await assert.rejects(
    make({
      verifyArtifacts: async () => {
        throw new Error('binary or schema changed')
      },
    }),
    /binary or schema changed/,
  )
  await assert.rejects(
    make({ prepare: async () => ({ ...prepared, manifestDigest: '0'.repeat(64) }) }),
    /inventory differs/,
  )
  assert.equal(constructed, 0)
})

test('schema-valid peer sequence accepts failed terminal only after captured provider error', async () => {
  const { TrustedAppServerPeer } = await import('./fixtures/codex-app-server-m02-ta-runtime-r5/protocol.mjs')
  let fenced = false
  const writes = []
  const journal = {
    snapshot: () => ({ pending: [], fenced }),
    acknowledge: async () => {},
    markUnknown: async () => {
      fenced = true
    },
  }
  const coordinator = { perform: async (_kind, _id, effect) => effect({}) }
  const make = captured =>
    new TrustedAppServerPeer({
      coordinator,
      journal,
      write: async bytes => {
        writes.push(JSON.parse(bytes))
        return bytes.length
      },
      caseId: 'T1',
      verifyCaptureTerminal: () => captured.value,
    })
  const captured = { value: false }
  const peer = make(captured)
  await peer.request('initialize', t1InitializeParams(), 'T1-initialize')
  await peer.feed(
    Buffer.from(
      `${JSON.stringify({ id: 'T1-initialize', result: { codexHome: '/private/tmp/x', platformFamily: 'unix', platformOs: 'macos', userAgent: 'fixture' } })}\n`,
    ),
  )
  const manifest = { phase: 'T1', root: POLICY.roots.T1 }
  const config = prepareTrustedCase({ manifest, manifestDigest: digest(manifest) }, 'T1', {
    port: 44000,
    mcpExecutable: '/opt/homebrew/Cellar/node/26.11.0/bin/node',
  })
  await peer.request('thread/start', config.threadStartParams, 'T1-thread-start')
  const threadResult = {
    approvalPolicy: 'never',
    approvalsReviewer: 'user',
    cwd: POLICY.roots.T1,
    model: POLICY.model,
    modelProvider: 'm02-scripted',
    sandbox: { type: 'workspaceWrite' },
    thread,
  }
  valid('v2/ThreadStartResponse.json', threadResult)
  await peer.feed(Buffer.from(`${JSON.stringify({ id: 'T1-thread-start', result: threadResult })}\n`))
  await peer.request('turn/start', t1TurnParams(thread.id), 'T1-turn-start')
  const turnResult = { turn }
  valid('v2/TurnStartResponse.json', turnResult)
  await peer.feed(Buffer.from(`${JSON.stringify({ id: 'T1-turn-start', result: turnResult })}\n`))
  assert.equal(peer.snapshot().phase, 'turn')
  const terminal = { method: 'turn/completed', params: { threadId: thread.id, turn: { ...turn, status: 'failed' } } }
  valid('v2/TurnCompletedNotification.json', terminal.params)
  await assert.rejects(peer.feed(Buffer.from(`${JSON.stringify(terminal)}\n`)), /UNKNOWN/)
  assert.equal(fenced, true)
  assert.equal(writes.filter(item => item.method === 'turn/start').length, 1)

  // A fresh isolated peer can accept that same terminal once the durable capture flag is true.
  fenced = false
  captured.value = true
  const peer2 = make(captured)
  await peer2.request('initialize', t1InitializeParams(), 'T1-initialize-2')
  await peer2.feed(Buffer.from(`${JSON.stringify({ id: 'T1-initialize-2', result: { userAgent: 'fixture' } })}\n`))
  await peer2.request('thread/start', config.threadStartParams, 'T1-thread-start-2')
  await peer2.feed(Buffer.from(`${JSON.stringify({ id: 'T1-thread-start-2', result: threadResult })}\n`))
  await peer2.request('turn/start', t1TurnParams(thread.id), 'T1-turn-start-2')
  await peer2.feed(Buffer.from(`${JSON.stringify({ id: 'T1-turn-start-2', result: turnResult })}\n`))
  await peer2.feed(Buffer.from(`${JSON.stringify(terminal)}\n`))
  assert.equal(peer2.snapshot().phase, 'capture-stopped')
  assert.equal(writes.filter(item => item.method === 'turn/start').length, 2)
})

test(
  'R5 pinned backend stages into an isolated private temp root with local dependency resolution',
  { timeout: 120_000 },
  async () => {
    const { mkdtemp, mkdir, rm, lstat } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { stageT1Modules, verifyT1ModuleResolution } =
      await import('./fixtures/codex-app-server-m02-ta-runtime-r5/t1-module-stage.mjs')
    const prepared = await prepareT1()
    const root = await fsp.realpath(await mkdtemp(join(tmpdir(), 'appraise-m02-r5-offline-stage-')))
    const supervisor = join(root, 'supervisor')
    const moduleRoot = join(supervisor, 'modules')
    try {
      await mkdir(supervisor, { mode: 0o700 })
      const changed = structuredClone(prepared)
      changed.manifest.artifacts.find(item => item.purpose === 'canonical-backend').sha256 = '0'.repeat(64)
      await assert.rejects(stageT1Modules({ prepared: changed, moduleRoot }), /module source hash drift/)
      await rm(moduleRoot, { recursive: true, force: true })
      const staged = await stageT1Modules({ prepared, moduleRoot })
      assert.ok(staged.copiedFiles > 100)
      assert.equal(await verifyT1ModuleResolution(moduleRoot), true)
      assert.equal((await lstat(staged.bundlePath)).isFile(), true)
      await assert.rejects(lstat(join(moduleRoot, '.env')), { code: 'ENOENT' })
      const source = prepared.manifest.artifacts.find(item => item.purpose === 'canonical-backend')
      assert.equal(
        createHash('sha256')
          .update(await fsp.readFile(staged.bundlePath))
          .digest('hex'),
        source.sha256,
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)

test('schema, metadata and executable byte drift block pure preparation', async () => {
  const pin = resolve('scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r5/schema-pin.json')
  const codex = POLICY.executable.path
  for (const changed of [
    pin,
    codex,
    resolve('.appraisejs/m02-executable-qualification-20261016-01/metadata-result.json'),
    resolve('.appraisejs/m02-executable-qualification-20261016-01/schema-inventory.json'),
  ]) {
    const io = new Proxy(fsp, {
      get(target, key) {
        if (key === 'readFile')
          return (path, ...args) =>
            path === changed ? Promise.resolve(Buffer.from('changed-offline-fixture')) : fsp.readFile(path, ...args)
        return target[key]
      },
    })
    await assert.rejects(
      prepareT1({ io }),
      /schema pin drift|T1 composition blocked|schema metadata pin drift|schema inventory pin drift/,
    )
  }
})

test('duplicate accepted provider error and unknown peer request fence UNKNOWN without resend', async () => {
  const accepted = []
  let ambiguous = 0
  const adapter = createT1ErrorAdapter({
    afterCapture: () => ({ captured: true, threadId: thread.id, turnId: turn.id }),
    onAccepted: value => accepted.push(value),
    onAmbiguous: () => ambiguous++,
  })
  adapter.stream.on('error', () => {})
  await new Promise((resolve, reject) =>
    adapter.stream.write(frame(errorParams('responseStreamConnectionFailed')), error =>
      error ? reject(error) : resolve(),
    ),
  )
  await new Promise(resolve =>
    adapter.stream.write(frame(errorParams('responseStreamConnectionFailed')), error => {
      assert.ok(error)
      resolve()
    }),
  )
  assert.equal(accepted.length, 1)
  assert.ok(ambiguous > 0)
  const { TrustedAppServerPeer } = await import('./fixtures/codex-app-server-m02-ta-runtime-r5/protocol.mjs')
  let fenced = false
  let writes = 0
  const peer = new TrustedAppServerPeer({
    coordinator: { perform: async (_kind, _id, effect) => effect({}) },
    journal: {
      snapshot: () => ({ pending: [], fenced }),
      markUnknown: async () => {
        fenced = true
      },
      acknowledge: async () => {},
    },
    write: async bytes => {
      writes++
      return bytes.length
    },
    caseId: 'T1',
  })
  await assert.rejects(peer.request('thread/resume', {}, 'forbidden'), /UNKNOWN/)
  assert.equal(fenced, true)
  assert.equal(writes, 0)
})

const hash = 'sha256:' + 'a'.repeat(64)
const privateDirectory = (ino = 2) => ({
  dev: 1,
  ino,
  uid: process.getuid(),
  mode: 0o700,
  isDirectory: () => true,
  isFile: () => false,
  isSymbolicLink: () => false,
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
  const base = prepareTrustedComposition({ phase: 'T1', artifacts })
  const manifest = { ...base.manifest, root: T1_ROOT, replacementAttempt: R5_REPLACEMENT }
  const prepared = { ...base, manifest, manifestDigest: digest(manifest) }
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
      verifyPrior: () => {},
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
    writePreparationReceipt: () => {},
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

test('actual R5 stage receipt is fsynced in a private temp supervisor before inert launcher entry', async () => {
  const root = await fsp.realpath(
    await fsp.mkdtemp(join((await import('node:os')).tmpdir(), 'appraise-m02-r5-run-receipt-')),
  )
  try {
    const supervisor = join(root, 'supervisor')
    await fsp.mkdir(supervisor, { mode: 0o700 })
    const fixture = fakeRun()
    fixture.journal.parentStats = [fs.lstatSync(root), fs.lstatSync(supervisor)]
    fixture.dependencies.writePreparationReceipt = input => writeT1PreparationReceipt({ ...input, phaseRoot: root })
    const oldMakeLauncher = fixture.dependencies.makeLauncher
    let beforeLauncher = false
    fixture.dependencies.makeLauncher = input => {
      const receipt = JSON.parse(fs.readFileSync(join(supervisor, 'module-stage.json'), 'utf8'))
      assert.equal(receipt.stagedDigest, 'a'.repeat(64))
      assert.equal(fs.existsSync(join(root, 'cases')), false)
      beforeLauncher = true
      return oldMakeLauncher(input)
    }
    const result = await runT1(fixture.dependencies)
    assert.equal(result.status, 'T1_CAPTURED')
    assert.equal(beforeLauncher, true)
    assert.equal(fixture.evidence().starts, 1)
    assert.equal(fs.existsSync(join(root, 'cases')), false)
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})

test('R5 symlink or missing stage receipt writer fences UNKNOWN, closes journal and never enters launcher', async () => {
  for (const broken of ['symlink', 'writer']) {
    const root = await fsp.realpath(
      await fsp.mkdtemp(join((await import('node:os')).tmpdir(), 'appraise-m02-r5-receipt-fail-')),
    )
    try {
      const supervisor = join(root, 'supervisor')
      await fsp.mkdir(supervisor, { mode: 0o700 })
      const fixture = fakeRun()
      fixture.journal.parentStats = [fs.lstatSync(root), fs.lstatSync(supervisor)]
      if (broken === 'symlink') {
        await fsp.symlink(join(root, 'foreign-target'), join(supervisor, 'module-stage.json'))
        fixture.dependencies.writePreparationReceipt = input => writeT1PreparationReceipt({ ...input, phaseRoot: root })
      } else {
        fixture.dependencies.writePreparationReceipt = () => {
          throw new Error('offline missing writer')
        }
      }
      let launcherCalls = 0
      let closed = false
      fixture.journal.close = () => {
        closed = true
      }
      fixture.dependencies.makeLauncher = () => {
        launcherCalls++
        throw new Error('launcher unreachable')
      }
      await assert.rejects(
        runT1(fixture.dependencies),
        error => error.message === 'T1 preparation UNKNOWN: OWNED_STAGE_RECEIPT_UNCERTAIN',
      )
      assert.equal(launcherCalls, 0)
      assert.equal(fixture.journal.fenced, true)
      assert.equal(closed, true)
      assert.equal(fs.existsSync(join(root, 'cases')), false)
      if (broken === 'symlink') {
        assert.deepEqual(JSON.parse(await fsp.readFile(join(supervisor, 'preparation-error.json'), 'utf8')), {
          schema: 'appraise.m02-ta-t1-preparation-error/v1',
          caseId: 'T1',
          code: 'OWNED_STAGE_RECEIPT_UNCERTAIN',
          status: 'UNKNOWN',
        })
      }
    } finally {
      await fsp.rm(root, { recursive: true, force: true })
    }
  }
})

test('R5 post-journal root identity failure closes UNKNOWN before launcher', async () => {
  const root = await fsp.realpath(
    await fsp.mkdtemp(join((await import('node:os')).tmpdir(), 'appraise-m02-r5-root-fail-')),
  )
  try {
    const supervisor = join(root, 'supervisor')
    await fsp.mkdir(supervisor, { mode: 0o700 })
    const fixture = fakeRun()
    fixture.journal.parentStats = [fs.lstatSync(root), fs.lstatSync(supervisor)]
    fixture.dependencies.writePreparationReceipt = input => writeT1PreparationReceipt({ ...input, phaseRoot: root })
    fixture.dependencies.preflight.rootStat = () => {
      throw new Error('sensitive root detail')
    }
    let launcherCalls = 0
    let closed = false
    fixture.journal.close = () => {
      closed = true
    }
    fixture.dependencies.makeLauncher = () => {
      launcherCalls++
      throw new Error('launcher unreachable')
    }
    await assert.rejects(
      runT1(fixture.dependencies),
      error => error.message === 'T1 preparation UNKNOWN: OWNED_RUNTIME_IO_SETUP_UNCERTAIN',
    )
    assert.equal(launcherCalls, 0)
    assert.equal(fixture.journal.fenced, true)
    assert.equal(closed, true)
    assert.deepEqual(JSON.parse(await fsp.readFile(join(supervisor, 'preparation-error.json'), 'utf8')), {
      schema: 'appraise.m02-ta-t1-preparation-error/v1',
      caseId: 'T1',
      code: 'OWNED_RUNTIME_IO_SETUP_UNCERTAIN',
      status: 'UNKNOWN',
    })
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})

test('failed descriptor receipt write never yields T1 capture acceptance', async () => {
  const fixture = fakeRun()
  let closed = false
  fixture.journal.close = () => {
    closed = true
  }
  fixture.dependencies.writeEvidence = path => {
    if (path.endsWith('/descriptor-capture.json')) throw new Error('offline fsync failure')
  }
  await assert.rejects(runT1(fixture.dependencies))
  assert.equal(fixture.journal.fenced, true)
  assert.equal(closed, true)
  assert.equal(fixture.journal.completed, false)
  assert.equal(fixture.evidence().finishCalled, false)
  assert.equal(fixture.journal.counts.providerRequests, 1)
  assert.equal(fixture.evidence().starts, 1)
  const rejected = await driveAdapter(errorParams('responseStreamConnectionFailed'), {
    captured: false,
    threadId: thread.id,
    turnId: turn.id,
  })
  assert.equal(rejected.accepted.length, 0)
  assert.ok(rejected.rejected)
})
