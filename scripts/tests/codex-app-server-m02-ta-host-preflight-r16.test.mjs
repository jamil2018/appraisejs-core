import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { PREFLIGHT } from './fixtures/codex-app-server-m02-ta-host-preflight-r14/policy.mjs'
import { runHostPreflight } from './fixtures/codex-app-server-m02-ta-host-preflight-r14/runner.mjs'
import {
  R16_ROOT,
  createHostPreflightFilesystemIo,
  productionHostPreflightIo,
} from './fixtures/codex-app-server-m02-ta-host-preflight-r16/filesystem-io.mjs'
import {
  MANIFEST,
  PROPOSAL,
  PROPOSAL_SHA,
  prepareHostPreflightManifest,
} from './fixtures/codex-app-server-m02-ta-host-preflight-r16/preparation.mjs'
import {
  assertExactApproval,
  dispatchHostPreflight,
  runFixedPreflight,
} from './fixtures/codex-app-server-m02-ta-host-preflight-r16/entrypoint.mjs'

async function withDisposableRoot(run) {
  const base = await mkdtemp(join(tmpdir(), 'appraise-r16-'))
  const priorUmask = process.umask()
  try {
    await run(join(base, 'preflight'))
  } finally {
    process.umask(priorUmask)
    await rm(base, { recursive: true, force: true })
  }
}

function observedFs(events, fault = {}) {
  return new Proxy(fs, {
    get(target, key) {
      if (key === 'mkdirSync')
        return (path, options) => {
          events.push({ kind: 'mkdir', path })
          if (fault.mkdirPath === path) throw Object.assign(new Error('private path'), { code: 'EIO' })
          return target.mkdirSync(path, options)
        }
      if (key === 'openSync')
        return (path, flags, mode) => {
          events.push({ kind: 'open', path, flags })
          return target.openSync(path, flags, mode)
        }
      if (key === 'fsyncSync')
        return fd => {
          events.push({ kind: 'fsync' })
          return target.fsyncSync(fd)
        }
      if (key === 'readFileSync')
        return fd => {
          events.push({ kind: 'read' })
          return target.readFileSync(fd)
        }
      return Reflect.get(target, key)
    },
  })
}

function disposableIo(root, events, fault) {
  const fsOps = observedFs(events, fault)
  const io = createHostPreflightFilesystemIo({
    root,
    fsOps,
    readPlist: async () => `<key>ProductBuildVersion</key><string>${PREFLIGHT.osBuild}</string>`,
    makeListener: () => ({
      bind: async () => {
        events.push({ kind: 'bind' })
        return 49152
      },
      close: async () => {
        events.push({ kind: 'close' })
      },
      bestEffortClose: async () => true,
      assertHealthy: () => {},
      unref: () => {},
    }),
  })
  return io
}

test('production adapter is fixed to p2 and inert until its ports are called', () => {
  assert.equal(R16_ROOT, '/private/tmp/appraise-m02-ta-host-preflight-p2')
  assert.equal(productionHostPreflightIo.makeListener instanceof Function, true)
  assert.notEqual(R16_ROOT, PREFLIGHT.root)
})

test('actual filesystem adapter completes all eight directories and three files with fake listener', async () => {
  await withDisposableRoot(async root => {
    const events = []
    const io = disposableIo(root, events)
    const phases = []
    const result = await runHostPreflight({
      io,
      deadline: Date.now() + 10_000,
      verifyAuthorization: async phase => {
        phases.push(phase)
        return true
      },
    })
    assert.equal(result.status, 'OBSERVED_PERMISSION_CHECK_ONLY')
    assert.equal(result.schema, 'appraise.m02-ta-host-preflight-r14-result/v1')
    assert.equal(result.directoriesCreated, 8)
    assert.deepEqual(phases, ['INITIAL', 'PRE_BIND'])
    for (const relative of PREFLIGHT.directories) {
      const path = relative === '.' ? root : join(root, relative)
      const stat = fs.lstatSync(path)
      assert.ok(stat.isDirectory() && !stat.isSymbolicLink())
      assert.equal(stat.mode & 0o777, 0o700)
    }
    const marker = join(root, 'cases/B01/workspace/synthetic.txt')
    const intent = join(root, 'listener-intent.json')
    const resultPath = join(root, 'result.json')
    assert.equal(fs.readFileSync(marker, 'utf8'), PREFLIGHT.syntheticBytes)
    assert.equal(JSON.parse(fs.readFileSync(intent)).schema, 'appraise.m02-ta-host-preflight-r14-intent/v1')
    assert.equal(JSON.parse(fs.readFileSync(resultPath)).status, 'CANDIDATE_OBSERVATION_PENDING_FINAL_DEADLINE')
    for (const file of [marker, intent, resultPath]) {
      const stat = fs.lstatSync(file)
      assert.ok(stat.isFile() && !stat.isSymbolicLink())
      assert.equal(stat.mode & 0o777, 0o600)
      assert.equal(stat.nlink, 1)
    }
    assert.deepEqual(
      events.filter(event => event.kind === 'mkdir').map(event => event.path),
      PREFLIGHT.directories.map(relative => (relative === '.' ? root : join(root, relative))),
    )
    assert.ok(events.filter(event => event.kind === 'fsync').length >= 22)
    assert.ok(
      events.filter(event => event.kind === 'open').every(event => (event.flags & fs.constants.O_NOFOLLOW) !== 0),
    )
    assert.ok(events.findIndex(event => event.kind === 'read') < events.findIndex(event => event.kind === 'bind'))
    assert.ok(events.findIndex(event => event.kind === 'bind') < events.findIndex(event => event.kind === 'close'))
    assert.equal(events.filter(event => event.kind === 'bind').length, 1)
    await assert.rejects(io.createRoot(), error => error.code === 'EEXIST')
  })
})

test('symlinked or mode-changed parent and replaced root fence before child creation', async () => {
  for (const tamper of ['symlink', 'mode', 'replace-root']) {
    await withDisposableRoot(async root => {
      const events = []
      const io = disposableIo(root, events)
      await io.createRoot()
      await io.createDirectory('cases', 1)
      if (tamper === 'symlink') {
        fs.renameSync(join(root, 'cases'), join(root, 'cases-old'))
        fs.symlinkSync(join(root, 'cases-old'), join(root, 'cases'))
      } else if (tamper === 'mode') {
        fs.chmodSync(join(root, 'cases'), 0o755)
      } else {
        fs.renameSync(root, `${root}-old`)
        fs.mkdirSync(root, { mode: 0o700 })
      }
      await assert.rejects(io.createDirectory('cases/B01', 2), /identity|replaced/)
      assert.equal(fs.existsSync(join(root, 'cases/B01')), false)
      assert.equal(events.filter(event => event.kind === 'bind').length, 0)
    })
  }
})

test('partial directory failure retains UNKNOWN before marker, intent, or listener', async () => {
  await withDisposableRoot(async root => {
    const events = []
    const failedPath = join(root, 'cases/B01/workspace')
    const io = disposableIo(root, events, { mkdirPath: failedPath })
    const result = await runHostPreflight({ io, verifyAuthorization: async () => true })
    assert.equal(result.status, 'UNKNOWN')
    assert.deepEqual(result.failure, { stage: 'DIRECTORY_CREATE', errno: 'EIO', operationIndex: 5 })
    assert.equal(result.directoriesCreated, 5)
    assert.equal(result.intentWritten, false)
    assert.equal(result.listenerOpenObserved, false)
    assert.equal(fs.existsSync(join(root, 'listener-intent.json')), false)
    assert.equal(fs.existsSync(join(root, 'cases/B01/workspace/synthetic.txt')), false)
    assert.equal(JSON.parse(fs.readFileSync(join(root, 'result.json'))).status, 'UNKNOWN')
    assert.equal(events.filter(event => event.kind === 'bind').length, 0)
  })
})

test('pre-bind approval drift occurs only after durable intent and never binds', async () => {
  await withDisposableRoot(async root => {
    const events = []
    const io = disposableIo(root, events)
    const result = await runHostPreflight({
      io,
      verifyAuthorization: async phase => {
        if (phase === 'PRE_BIND') throw new Error('private review drift')
        return true
      },
    })
    assert.equal(result.status, 'UNKNOWN')
    assert.equal(result.intentWritten, true)
    assert.equal(result.listenerOpenObserved, false)
    assert.equal(fs.existsSync(join(root, 'listener-intent.json')), true)
    assert.equal(events.filter(event => event.kind === 'bind').length, 0)
  })
})

test('R16 fixed invocation always injects the p2 IO, never the R14 default p1 adapter', async () => {
  await assert.rejects(dispatchHostPreflight([]), /inert default/)
  let calls = 0
  const sentinel = { status: 'UNKNOWN' }
  const result = await runFixedPreflight({
    deadline: 10_000,
    now: () => 0,
    verifyAuthorization: async () => true,
    run: async options => {
      calls++
      assert.equal(options.io, productionHostPreflightIo)
      assert.notEqual(options.io, undefined)
      return sentinel
    },
  })
  assert.equal(result, sentinel)
  assert.equal(calls, 1)
})

test('pure R16 derivation rehashes 6413 prior pins and the retained R15 UNKNOWN, without p2 effects', async () => {
  const beforeP2 = fs.existsSync(R16_ROOT)
  const derived = await prepareHostPreflightManifest()
  assert.equal(derived.runtimeEligible, false)
  assert.equal(derived.manifest.version, 'appraise.m02-ta-host-preflight-r16/v1')
  assert.equal(derived.manifest.root, R16_ROOT)
  assert.equal(derived.manifest.policy.root, R16_ROOT)
  assert.equal(derived.manifest.prior.r13ArtifactCount, 6413)
  assert.equal(derived.manifest.prior.r15Outcome, 'UNKNOWN')
  assert.equal(derived.manifest.prior.r15Root.dev, 16777230)
  assert.equal(derived.manifest.prior.r15Root.ino, 68970680)
  assert.equal(derived.manifest.prior.r15Evidence.length, 7)
  assert.equal(derived.manifest.sources.length, 4)
  assert.deepEqual(derived.manifest.proposal, { path: PROPOSAL, sha256: PROPOSAL_SHA })
  assert.equal(derived.manifest.reusedResultSchema, 'appraise.m02-ta-host-preflight-r14-result/v1')
  assert.equal(fs.existsSync(R16_ROOT), beforeP2)
})

test('R16 exact command review and fresh user decision bind p2, not consumed p1', () => {
  const entry = fileURLToPath(
    new URL('./fixtures/codex-app-server-m02-ta-host-preflight-r16/entrypoint.mjs', import.meta.url),
  )
  const digest = 'a'.repeat(64),
    manifestSha = 'b'.repeat(64),
    reviewSha = 'c'.repeat(64),
    decisionSha = 'd'.repeat(64)
  const base = [
    '/usr/bin/env',
    '-i',
    'PATH=/usr/bin:/bin',
    'LANG=C',
    PREFLIGHT.node,
    entry,
    '--run',
    MANIFEST,
    digest,
    manifestSha,
  ]
  const prepared = {
    manifestDigest: digest,
    manifestFileSha256: manifestSha,
    manifest: {
      version: 'appraise.m02-ta-host-preflight-r16/v1',
      root: R16_ROOT,
      policy: { ...PREFLIGHT, version: 'appraise.m02-ta-host-preflight-r16/v1', root: R16_ROOT },
      reusedResultSchema: 'appraise.m02-ta-host-preflight-r14-result/v1',
      sources: [{ path: entry, sha256: digest }],
    },
  }
  const review = {
    sha256: reviewSha,
    value: {
      schema: 'appraise.m02-ta-host-preflight-r16-exact-review/v1',
      verdict: 'ACCEPT_ONE_FIXED_R16_HOST_PREFLIGHT_INVOCATION',
      runtimeVerdict: 'NOT_RUN',
      manifest: { path: MANIFEST, manifestDigest: digest, fileSha256: manifestSha },
      proposal: { path: PROPOSAL, sha256: PROPOSAL_SHA },
      root: R16_ROOT,
      requiredHostExecutionPermission: 'exec_command sandbox_permissions=require_escalated',
      sourceEnforcementOfSandboxMode: 'UNATTESTED',
      exactInvocationPrefix: base,
    },
  }
  const decision = {
    sha256: decisionSha,
    value: {
      schema: 'appraise.m02-ta-host-preflight-r16-user-decision/v1',
      decision: 'APPROVE_ONE_FIXED_R16_HOST_PREFLIGHT',
      evidenceClass: 'VISIBLE_HOST_CONVERSATION_DECISION_TRANSCRIBED_NOT_CRYPTOGRAPHIC_ATTESTATION',
      manifestDigest: digest,
      manifestFileSha256: manifestSha,
      exactReviewSha256: reviewSha,
      proposal: { path: PROPOSAL, sha256: PROPOSAL_SHA },
      requiredHostExecutionPermission: 'exec_command sandbox_permissions=require_escalated',
      noAutomaticT2Followon: true,
      exactInvocationPrefix: [...base, reviewSha],
    },
  }
  const args = {
    prepared,
    review,
    decision,
    requested: [digest, manifestSha, reviewSha, decisionSha],
    sourceSha256: digest,
  }
  assert.doesNotThrow(() => assertExactApproval(args))
  assert.throws(
    () => assertExactApproval({ ...args, review: { ...review, value: { ...review.value, root: PREFLIGHT.root } } }),
    /absent/,
  )
  assert.throws(
    () =>
      assertExactApproval({
        ...args,
        decision: { ...decision, value: { ...decision.value, noAutomaticT2Followon: false } },
      }),
    /absent/,
  )
})
