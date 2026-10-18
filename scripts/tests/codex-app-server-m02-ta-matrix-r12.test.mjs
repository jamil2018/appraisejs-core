import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  buildMatrixCanonicalBytes,
  HISTORICAL_BUNDLE,
  HISTORICAL_SHA,
} from './fixtures/codex-app-server-m02-ta-matrix-r12/canonical-build.mjs'
import {
  dispatchMatrixEntrypoint,
  reviewedHostEnvironment,
} from './fixtures/codex-app-server-m02-ta-matrix-r12/entrypoint.mjs'
import { prepareR12MatrixManifest } from './fixtures/codex-app-server-m02-ta-matrix-r12/manifest.mjs'
import { stageMatrixModules } from './fixtures/codex-app-server-m02-ta-matrix-r12/matrix-stage.mjs'
import { prepareTrustedCase } from './fixtures/codex-app-server-m02-ta-matrix-r12/composition.mjs'
import { verifyPriorT2Unknown } from './fixtures/codex-app-server-m02-ta-matrix-r12/prior-evidence.mjs'
import {
  POLICY,
  POLICY_DIGEST,
  JOURNAL_BASE_POLICY_DIGEST,
  PRIOR_ROOT,
  ROOT,
  digest,
} from './fixtures/codex-app-server-m02-ta-matrix-r12/policy.mjs'
import {
  startupErrorClass,
  writeStartupFailure,
} from './fixtures/codex-app-server-m02-ta-matrix-r12/startup-failure.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const HERE = join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r12')
const ENTRY = join(HERE, 'entrypoint.mjs')
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r12/manifest.json')
const NODE = '/opt/homebrew/Cellar/node/26.11.0/bin/node'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

test('prior R11 UNKNOWN and current p1 bytes remain preserved; p2 is absent', async () => {
  const prior = await verifyPriorT2Unknown()
  assert.equal(prior.status, 'PRIOR_T2_UNKNOWN_PRESERVED')
  assert.equal(prior.priorRoot, PRIOR_ROOT)
  assert.equal(prior.consumed.listenerStarts, 1)
  assert.equal(prior.consumed.controlWrites, 1)
  assert.equal(prior.consumed.codexStarts, 0)
  await assert.rejects(fs.lstat(ROOT), { code: 'ENOENT' })
})

test('R10 canonical backend has exactly one reversible p1 to p2 relocation', async () => {
  const old = await fs.readFile(HISTORICAL_BUNDLE)
  const next = await buildMatrixCanonicalBytes()
  assert.equal(sha(old), HISTORICAL_SHA)
  assert.equal(old.toString('utf8').split(PRIOR_ROOT).length, 2)
  assert.equal(next.bytes.toString('utf8').split(ROOT).length, 2)
  assert.equal(sha(Buffer.from(next.bytes.toString('utf8').replace(ROOT, PRIOR_ROOT))), HISTORICAL_SHA)
  assert.equal(next.relocation.count, 1)
  await assert.rejects(buildMatrixCanonicalBytes({ readFile: async () => Buffer.from('drift') }), /drift/)
})

test('R12 manifest preserves all R10 pins and adds exact new authority and cumulative budgets', async () => {
  const prepared = await prepareR12MatrixManifest()
  const manifest = prepared.manifest
  assert.equal(manifest.root, ROOT)
  assert.equal(manifest.policyDigest, digest(POLICY))
  assert.equal(manifest.policyDigest, POLICY_DIGEST)
  assert.equal(manifest.amendedPolicyDigest, POLICY_DIGEST)
  assert.equal(manifest.basePolicyDigest, JOURNAL_BASE_POLICY_DIGEST)
  assert.equal(manifest.journalBasePolicyDigest, JOURNAL_BASE_POLICY_DIGEST)
  assert.notEqual(manifest.policyDigest, manifest.journalBasePolicyDigest)
  assert.equal(manifest.cases.length, 24)
  assert.equal(manifest.rootAmendment.from, PRIOR_ROOT)
  assert.equal(manifest.rootAmendment.to, ROOT)
  assert.equal(manifest.recoveryBudget.oldT2Unknown.listenerStarts, 1)
  assert.equal(manifest.recoveryBudget.newT2Maximum.listenerStarts, 24)
  assert.deepEqual(manifest.recoveryBudget.cumulativeWholeCampaignCeilings, {
    listenerStarts: 28,
    controlWrites: 109,
    sourceCapacity: 66,
  })
  assert.equal(manifest.runtimeAuthorized, false)
  assert.equal(manifest.installedCodeModeHost.uid, 502)
  assert.equal(manifest.installedCodeModeHost.processImageAttested, false)
  assert.equal(manifest.artifacts.filter(item => item.purpose === 'matrix-canonical-backend').length, 1)
  assert.equal(manifest.artifacts.filter(item => item.purpose === 'scoped-mcp-entry').length, 1)
  const entrySha = sha(await fs.readFile(ENTRY))
  assert.ok(manifest.artifacts.some(item => item.path === ENTRY && item.sha256 === entrySha))
  assert.ok(manifest.artifacts.some(item => item.path === join(HERE, 'startup-failure.mjs')))
  const paths = new Set(manifest.artifacts.map(item => item.path))
  for (const file of (await fs.readdir(HERE)).filter(name => name.endsWith('.mjs'))) {
    const source = await fs.readFile(join(HERE, file), 'utf8')
    for (const relative of [...source.matchAll(/from ['"](\.\.?\/[^'"]+)['"]/g)].map(match => match[1]))
      assert.ok(paths.has(resolve(HERE, relative)), `${file}: import not pinned ${relative}`)
  }
})

test('R12 production canonical bytes stage in disposable p2-shaped layout and resolve dependencies', async () => {
  const prepared = await prepareR12MatrixManifest()
  const phaseRoot = await fs.mkdtemp('/private/tmp/appraise-m02-matrix-r12-stage-')
  const stageRoot = join(phaseRoot, 'supervisor')
  const previousDirectory = process.cwd()
  try {
    const staged = await stageMatrixModules({
      prepared,
      stageRoot,
      phaseRoot,
      offlineCanonicalBytes: prepared.canonicalBytes,
    })
    assert.equal(sha(await fs.readFile(staged.bundlePath)), prepared.canonicalSha256)
    assert.ok(staged.copiedFiles > 4700)
    assert.ok((await fs.readFile(join(staged.moduleRoot, 'appraise-package.json'))).length > 0)
    process.chdir(stageRoot)
    const canonical = await import(pathToFileURL(staged.bundlePath).href)
    const fixture = await canonical.createCanonicalAcceptanceFixture('REQUIREMENT_ANALYZER')
    try {
      assert.ok(fixture.client)
      assert.ok(fixture.close)
    } finally {
      await fixture.close()
    }
    const scoped = prepared.manifest.artifacts.find(item => item.purpose === 'scoped-mcp-entry')
    const configured = prepareTrustedCase(prepared, 'B01', { port: 23456, mcpExecutable: scoped.path })
    assert.equal(configured.cwd, join(ROOT, 'cases/B01/workspace'))
    assert.equal(configured.config.features.code_mode_host, true)
  } finally {
    process.chdir(previousDirectory)
    await fs.rm(phaseRoot, { recursive: true, force: true })
  }
})

test('all effect-bearing R12 copies bind p2 and no old p1 literal or R10 local path remains', async () => {
  const effectFiles = [
    'composition',
    'case-receipts',
    'child-evidence',
    'scoped-entry',
    'scoped-worker-entry',
    'protocol-p00',
    'launcher',
    'matrix-runner',
    'matrix-stage',
    'entrypoint',
  ]
  for (const name of effectFiles) {
    const source = await fs.readFile(join(HERE, `${name}.mjs`), 'utf8')
    assert.ok(!source.includes('/private/tmp/appraise-m02-ta-matrix-p1'), name)
    for (const relative of [...source.matchAll(/from ['"](\.\/[^'"]+)['"]/g)].map(match => match[1]))
      assert.ok((await fs.lstat(resolve(HERE, relative))).isFile(), `${name}: ${relative}`)
  }
  assert.equal(POLICY.roots.T2, ROOT)
})

test('startup witness stores only fixed stage/error class and fsyncs before return', () => {
  const actions = []
  const fake = {
    lstatSync: () => ({ isDirectory: () => true, isSymbolicLink: () => false, uid: process.getuid(), mode: 0o700 }),
    openSync: (path, flags, mode) => {
      actions.push(['open', path, flags, mode])
      return actions.length
    },
    writeFileSync: (fd, bytes) => {
      actions.push(['write', fd, bytes.toString('utf8')])
    },
    fsyncSync: fd => actions.push(['fsync', fd]),
    closeSync: fd => actions.push(['close', fd]),
  }
  const secret = new Error('secret path /tmp/token authUrl')
  secret.code = 'EACCES'
  const witness = writeStartupFailure({ stage: 'FIRST_CASE_START', error: secret, io: fake })
  assert.equal(witness.errorClass, 'EACCES')
  const serialized = actions.find(item => item[0] === 'write')[2]
  assert.ok(serialized.includes('FIRST_CASE_START'))
  assert.ok(!serialized.includes('secret') && !serialized.includes('authUrl'))
  assert.equal(actions.filter(item => item[0] === 'fsync').length, 2)
  assert.equal(startupErrorClass(new Error('arbitrary')), 'OTHER_ERROR')
  assert.throws(() => writeStartupFailure({ stage: 'NATIVE_RETRY', error: secret, io: fake }))
})

test('R12 command rejects absent decision or file-pin drift before addon or runner', async () => {
  const prepared = { ...(await prepareR12MatrixManifest()), manifestFileSha256: 'c'.repeat(64) }
  const sourceSha256 = sha(await fs.readFile(ENTRY))
  const reviewSha = 'a'.repeat(64),
    decisionSha = 'b'.repeat(64)
  const prefix = [
    '/usr/bin/env',
    '-i',
    'PATH=/usr/bin:/bin',
    'LANG=C',
    NODE,
    ENTRY,
    '--run',
    MANIFEST,
    prepared.manifestDigest,
    prepared.manifestFileSha256,
  ]
  const review = {
    receipt: {
      schema: 'appraise.m02-ta-t2-r12-exact-review/v1',
      reviewer: '/root/r6_exact_review',
      verdict: 'ACCEPT_ONE_FIXED_T2_R12_INVOCATION',
      runtimeVerdict: 'NOT_RUN',
      exactInvocationPrefix: prefix,
      entrypointSha256: sourceSha256,
      recoveryProposalSha256: prepared.manifest.recoveryProposalSha256,
      manifest: {
        path: MANIFEST,
        fileSha256: prepared.manifestFileSha256,
        manifestDigest: prepared.manifestDigest,
        phase: 'T2',
        root: ROOT,
        cases: prepared.manifest.cases,
      },
    },
    sha256: reviewSha,
  }
  const decision = {
    receipt: {
      schema: 'appraise.m02-ta-t2-r12-recovery-user-decision/v1',
      verdict: 'APPROVE_ONE_FIXED_T2_R12_RECOVERY',
      scope: 'ONE_NEW_FULL_T2_P2_INVOCATION_NO_RESUME',
      evidenceClass: 'VISIBLE_HOST_CONVERSATION_DECISION_TRANSCRIBED_NOT_CRYPTOGRAPHIC_ATTESTATION',
      manifestDigest: prepared.manifestDigest,
      manifestFileSha256: prepared.manifestFileSha256,
      exactReviewSha256: reviewSha,
      proposal: { path: prepared.manifest.recoveryProposalPath, sha256: prepared.manifest.recoveryProposalSha256 },
      exactInvocationPrefix: [...prefix, reviewSha],
      priorT2UnknownPreserved: true,
      cumulativeWholeCampaignCeilings: { listenerStarts: 28, controlWrites: 109, sourceCapacity: 66 },
    },
    sha256: decisionSha,
  }
  let hostChecks = 0,
    addonLoads = 0,
    runs = 0
  const ports = {
    environment: { PATH: '/usr/bin:/bin', LANG: 'C' },
    execPath: NODE,
    programPath: ENTRY,
    verify: async () => prepared,
    sourceSha256: async () => sourceSha256,
    readReview: async () => review,
    readDecision: async () => decision,
    verifyHostFile: async () => {
      hostChecks++
    },
    verifyPrior: async () => {},
    loadAddon: async () => {
      addonLoads++
      return { identity() {}, listDirectChildren() {}, directChildMetadata() {} }
    },
    run: async () => {
      runs++
      return { status: 'OFFLINE_FAKE_ONLY' }
    },
  }
  const args = ['--run', MANIFEST, prepared.manifestDigest, prepared.manifestFileSha256, reviewSha, decisionSha]
  const noDecision = {
    ...ports,
    readDecision: async () => {
      throw new Error('missing user decision')
    },
  }
  await assert.rejects(dispatchMatrixEntrypoint(args, noDecision), /missing user decision/)
  assert.equal(hostChecks + addonLoads + runs, 0)
  const badDecision = {
    ...ports,
    readDecision: async () => ({ ...decision, receipt: { ...decision.receipt, scope: 'OLD_P1' } }),
  }
  await assert.rejects(dispatchMatrixEntrypoint(args, badDecision), /explicit R12 user decision/)
  assert.equal(hostChecks + addonLoads + runs, 0)
  const badHost = {
    ...ports,
    verifyHostFile: async () => {
      hostChecks++
      throw new Error('wrong installed owner')
    },
  }
  await assert.rejects(dispatchMatrixEntrypoint(args, badHost), /wrong installed owner/)
  assert.equal(addonLoads + runs, 0)
  const result = await dispatchMatrixEntrypoint(args, ports)
  assert.equal(result.status, 'OFFLINE_FAKE_ONLY')
  assert.equal(addonLoads, 1)
  assert.equal(runs, 1)
})

test('reviewed macOS environment exception stays bounded', () => {
  assert.equal(reviewedHostEnvironment({ PATH: '/usr/bin:/bin', LANG: 'C' }), true)
  assert.equal(
    reviewedHostEnvironment({ PATH: '/usr/bin:/bin', LANG: 'C', __CF_USER_TEXT_ENCODING: '0x1:0x2:0x3' }),
    true,
  )
  assert.equal(reviewedHostEnvironment({ PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/tmp' }), false)
})
