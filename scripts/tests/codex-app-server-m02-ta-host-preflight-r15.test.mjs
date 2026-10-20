import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { PREFLIGHT } from './fixtures/codex-app-server-m02-ta-host-preflight-r14/policy.mjs'
import { runHostPreflight } from './fixtures/codex-app-server-m02-ta-host-preflight-r14/runner.mjs'
import {
  MANIFEST,
  PROPOSAL,
  PROPOSAL_SHA,
  prepareHostPreflightManifest,
  stableRead,
  verifyAcceptedR13ArtifactPins,
  verifyPriorArtifactBytes,
} from './fixtures/codex-app-server-m02-ta-host-preflight-r15/preparation.mjs'
import {
  assertExactApproval,
  dispatchHostPreflight,
} from './fixtures/codex-app-server-m02-ta-host-preflight-r15/entrypoint.mjs'

const EMPTY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const sha = character => character.repeat(64)

test('real read-only R13 closure accepts precisely the 16 empty files with matching pins', async () => {
  const verified = await verifyAcceptedR13ArtifactPins()
  assert.equal(verified.artifactCount, 6413)
  assert.equal(verified.emptyPinnedArtifacts, 16)
  assert.equal(verified.reviewVerdict, 'ACCEPT_ACTUAL_R13_UNKNOWN_EVIDENCE_NO_T2_QUALIFICATION')
  assert.doesNotThrow(() => verifyPriorArtifactBytes(Buffer.alloc(0), EMPTY_SHA, 1503))
  assert.throws(
    () => verifyPriorArtifactBytes(Buffer.alloc(0), sha('a'), 1503),
    error => error.safeReceipt?.stage === 'PIN_READ' && error.safeReceipt?.operationIndex === 1503,
  )
  assert.throws(
    () => verifyPriorArtifactBytes(Buffer.from('x'), EMPTY_SHA, 1504),
    error => error.safeReceipt?.pinClass === 'R13_ARTIFACT',
  )
})

test('private JSON and other ordinary pins remain nonempty; empty allowance requires explicit prior pin', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'appraise-r15-reader-'))
  try {
    const file = join(directory, 'private.json')
    await writeFile(file, '', { mode: 0o600 })
    await assert.rejects(stableRead(file, { privateFile: true, owned: true }), /identity changed/)
    assert.equal((await stableRead(file, { min: 0, privateFile: true, owned: true })).length, 0)
    await writeFile(file, '{}', { mode: 0o600 })
    await assert.rejects(stableRead(file, { max: 1, privateFile: true, owned: true }), /identity changed/)
    assert.equal((await stableRead(file, { privateFile: true, owned: true })).toString(), '{}')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('pure R15 derivation pins accepted R14 runtime, exact proposal, and full prior closure', async () => {
  const derived = await prepareHostPreflightManifest()
  assert.equal(derived.runtimeEligible, false)
  assert.equal(derived.manifest.version, 'appraise.m02-ta-host-preflight-r15/v1')
  assert.equal(derived.manifest.prior.acceptedArtifactReaderAmendment.emptyPinnedArtifacts, 16)
  assert.equal(derived.manifest.prior.acceptedArtifactReaderAmendment.onlyExpectedEmptySha256, EMPTY_SHA)
  assert.deepEqual(derived.manifest.proposal, { path: PROPOSAL, sha256: PROPOSAL_SHA })
  assert.equal(derived.manifest.acceptedR14.length, 6)
  assert.equal(derived.manifest.reusedRuntimeResultSchema, 'appraise.m02-ta-host-preflight-r14-result/v1')
  assert.equal(derived.manifest.policy.root, PREFLIGHT.root)
  assert.equal(derived.manifest.sources.length, 3)
})

test('R15 default command is inert; the imported R14 core runs only through fake ports', async () => {
  await assert.rejects(dispatchHostPreflight([]), /inert default/)
  const files = new Map()
  const events = []
  const io = {
    now: () => 0,
    readPlist: async () => `<key>ProductBuildVersion</key><string>${PREFLIGHT.osBuild}</string>`,
    createRoot: async () => ({ dev: 1, ino: 2 }),
    createDirectory: async relative => events.push(`directory:${relative}`),
    write: async (name, bytes) => {
      files.set(name, bytes)
      events.push(`write:${name}`)
    },
    read: async name => files.get(name),
    makeListener: () => ({
      bind: async () => {
        events.push('bind')
        return 49152
      },
      close: async () => {
        events.push('close')
      },
      bestEffortClose: async () => true,
      unref: () => {},
      assertHealthy: () => {},
    }),
    withDeadline: async promise => await promise,
  }
  const result = await runHostPreflight({ verifyAuthorization: async () => true, io })
  assert.equal(result.status, 'OBSERVED_PERMISSION_CHECK_ONLY')
  assert.equal(result.schema, 'appraise.m02-ta-host-preflight-r14-result/v1')
  assert.deepEqual(
    events.filter(event => event === 'bind'),
    ['bind'],
  )
  assert.ok(events.indexOf('write:listener-intent.json') < events.indexOf('bind'))
})

test('R15 exact approval requires distinct reviewed command and user decision', () => {
  const entry = fileURLToPath(
    new URL('./fixtures/codex-app-server-m02-ta-host-preflight-r15/entrypoint.mjs', import.meta.url),
  )
  const digest = sha('a'),
    manifestSha = sha('b'),
    reviewSha = sha('c'),
    decisionSha = sha('d')
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
      version: 'appraise.m02-ta-host-preflight-r15/v1',
      reusedRuntimeResultSchema: 'appraise.m02-ta-host-preflight-r14-result/v1',
      sources: [{ path: entry, sha256: digest }],
    },
  }
  const review = {
    sha256: reviewSha,
    value: {
      schema: 'appraise.m02-ta-host-preflight-r15-exact-review/v1',
      verdict: 'ACCEPT_ONE_FIXED_R15_HOST_PREFLIGHT_INVOCATION',
      runtimeVerdict: 'NOT_RUN',
      manifest: { path: MANIFEST, manifestDigest: digest, fileSha256: manifestSha },
      proposal: { path: PROPOSAL, sha256: PROPOSAL_SHA },
      root: PREFLIGHT.root,
      requiredHostExecutionPermission: 'exec_command sandbox_permissions=require_escalated',
      sourceEnforcementOfSandboxMode: 'UNATTESTED',
      exactInvocationPrefix: base,
    },
  }
  const decision = {
    sha256: decisionSha,
    value: {
      schema: 'appraise.m02-ta-host-preflight-r15-user-decision/v1',
      decision: 'APPROVE_ONE_FIXED_R15_HOST_PREFLIGHT',
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
    () =>
      assertExactApproval({
        ...args,
        decision: { ...decision, value: { ...decision.value, noAutomaticT2Followon: false } },
      }),
    /absent/,
  )
})
