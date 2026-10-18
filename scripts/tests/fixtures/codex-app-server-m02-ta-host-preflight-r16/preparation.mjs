/** R16 offline preparation: historical p1 remains UNKNOWN; production effects use p2 only. */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PREFLIGHT, classify, digest, sha256 } from '../codex-app-server-m02-ta-host-preflight-r14/policy.mjs'
import {
  assertReadDeadline,
  stableRead,
  verifyHostPreflightPreparation as verifyR15Preparation,
} from '../codex-app-server-m02-ta-host-preflight-r15/preparation.mjs'
import { R16_ROOT } from './filesystem-io.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
export const BUILD = join(REPO, '.appraisejs/m02-ta-host-preflight-build-r16')
export const MANIFEST = join(BUILD, 'manifest.json')
export const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-host-execution-preflight-03.md')
export const PROPOSAL_SHA = 'eb7d5be5d8c0a30b720e997d3a0c89f53f73ece4cee81780fc97d9569f8b8aa0'
export const R16_POLICY = Object.freeze({
  ...PREFLIGHT,
  version: 'appraise.m02-ta-host-preflight-r16/v1',
  root: R16_ROOT,
})
const R15_ROOT = PREFLIGHT.root
const R15_UID = 503
const R15_MANIFEST_SHA = 'c935acfd1d525364355602e387fa65f59a7165dd66278b0fd515dd128b678024'
const R15_DIGEST = '3888aed49c44641dbf3feb86d39eb3aacccd65abf3e1ae9fba29c29db4fe6854'
const R15_PROOF = Object.freeze({
  sourceReview: [
    '.appraisejs/m02-host-preflight-r15-source-review-01.json',
    '1b0ef782cf1a01737f7ade8f64796d286ca1d7cdee52c20b118ea4623a084f0f',
  ],
  exactReview: [
    '.appraisejs/m02-host-preflight-r15-exact-review.json',
    '5c3cedc19977ef86c62f7ef75f1bf230bd4f9c357a6a6da46c64018612cfe38d',
  ],
  userDecision: [
    '.appraisejs/m02-host-preflight-r15-user-decision.json',
    '5e90a8f61f4de1d02826936488c42b31b302613cfc711562e2fed90f64a54aad',
  ],
  visibleResult: [
    '.appraisejs/m02-host-preflight-r15-execution-result-01.json',
    '7ee11d5268ab7618a3e773993b23238052ea4874a0f82e08da8ad6b474ced30d',
  ],
  archiveIndex: [
    '.appraisejs/m02-host-preflight-r15-execution-evidence-01/index.json',
    'e10206d4389f5227a3a846df0e8aa226ca9b749a3b265387e06c6cab656ad1b5',
  ],
  archiveResult: [
    '.appraisejs/m02-host-preflight-r15-execution-evidence-01/result.json',
    '34d49d5f61079e0724482a54e1a3f7a41d62c7b141f141c8f358250b53893d74',
  ],
  actualReview: [
    '.appraisejs/m02-host-preflight-r15-execution-review-01.json',
    '1f17b62f5ae86f85c6baff7b674c5f2f200e27c92c7cf97209068cc53a89e2ce',
  ],
})
const R15_RESULT_SHA = R15_PROOF.archiveResult[1]
export { assertReadDeadline }

function proofFailure(index, error) {
  const failure = new Error('R16 prior evidence changed')
  failure.safeReceipt = Object.freeze({
    stage: 'PIN_READ',
    pinClass: 'R15_EVIDENCE',
    operationIndex: index,
    errno: classify(error),
  })
  return failure
}

async function readR15Evidence({ deadline, now }) {
  const proof = {}
  const pins = []
  for (const [index, [name, [relative, expected]]] of Object.entries(R15_PROOF).entries()) {
    const path = join(REPO, relative)
    let bytes
    try {
      bytes = await stableRead(path, { max: 64 * 1024, privateFile: true, owned: true, deadline, now })
    } catch (error) {
      throw proofFailure(index, error)
    }
    if (sha256(bytes) !== expected) throw proofFailure(index)
    try {
      proof[name] = JSON.parse(bytes)
    } catch (error) {
      throw proofFailure(index, error)
    }
    pins.push({ path, sha256: expected })
  }
  return { proof, pins }
}

function assertR15Proof(proof) {
  const result = proof.archiveResult
  const index = proof.archiveIndex
  const review = proof.actualReview
  const visible = proof.visibleResult
  if (
    proof.exactReview?.schema !== 'appraise.m02-ta-host-preflight-r15-exact-review/v1' ||
    proof.exactReview.verdict !== 'ACCEPT_ONE_FIXED_R15_HOST_PREFLIGHT_INVOCATION' ||
    proof.userDecision?.decision !== 'APPROVE_ONE_FIXED_R15_HOST_PREFLIGHT' ||
    proof.sourceReview?.verdict !== 'ACCEPT_OFFLINE_SOURCE_ONLY_FOR_ONE_PREPARATION' ||
    visible?.schema !== 'appraise.m02-ta-host-preflight-r15-visible-execution/v1' ||
    visible.toolResult?.status !== 'UNKNOWN' ||
    visible.toolResult.failure?.stage !== 'DIRECTORY_CREATE' ||
    visible.toolResult.failure?.errno !== 'ENOENT' ||
    visible.toolResult.failure?.operationIndex !== 1 ||
    visible.toolResult.directoriesCreated !== 1 ||
    visible.toolResult.intentWritten !== false ||
    visible.toolResult.listenerOpenObserved !== false ||
    visible.toolResult.listenerCloseObserved !== false ||
    visible.toolResult.rootIdentity?.dev !== 16777230 ||
    visible.toolResult.rootIdentity?.ino !== 68970680 ||
    visible.oneShotConsumed !== true ||
    index?.schema !== 'appraise.m02-ta-host-preflight-r15-sanitized-archive/v1' ||
    index.sourceRoot !== R15_ROOT ||
    index.outcome !== 'UNKNOWN' ||
    index.sourceEvidenceChanged !== false ||
    index.rootIdentity?.dev !== 16777230 ||
    index.rootIdentity?.ino !== 68970680 ||
    JSON.stringify(index.rootEntryNames) !== JSON.stringify(['result.json']) ||
    index.records?.length !== 3 ||
    index.records[0]?.source !== 'listener-intent.json' ||
    index.records[0]?.status !== 'MISSING_ENOENT' ||
    index.records[1]?.source !== 'result.json' ||
    index.records[1]?.status !== 'COPIED' ||
    index.records[1]?.sha256 !== R15_RESULT_SHA ||
    index.records[2]?.source !== 'cases/B01/workspace/synthetic.txt' ||
    index.records[2]?.status !== 'MISSING_ENOENT' ||
    result?.schema !== 'appraise.m02-ta-host-preflight-r14-result/v1' ||
    result.status !== 'UNKNOWN' ||
    result.failure?.stage !== 'DIRECTORY_CREATE' ||
    result.failure?.errno !== 'ENOENT' ||
    result.failure?.operationIndex !== 1 ||
    result.directoriesCreated !== 1 ||
    result.intentWritten !== false ||
    result.listenerOpenObserved !== false ||
    result.listenerCloseObserved !== false ||
    result.rootIdentity?.dev !== 16777230 ||
    result.rootIdentity?.ino !== 68970680 ||
    JSON.stringify(visible.toolResult) !== JSON.stringify(result) ||
    review?.schema !== 'appraise.m02-ta-host-preflight-r15-actual-failure-review/v1' ||
    review.verdict !== 'ACCEPT_ACTUAL_R15_UNKNOWN_EVIDENCE_NO_PERMISSION_QUALIFICATION' ||
    review.runtimeVerdict !== 'UNKNOWN' ||
    review.oneShotConsumed !== true ||
    review.actualObservation?.rootDev !== 16777230 ||
    review.actualObservation?.rootIno !== 68970680 ||
    review.actualObservation?.rootMode !== '0700' ||
    review.actualObservation?.rootOwnerUid !== R15_UID ||
    review.actualObservation?.listenerBind !== 'NOT_OBSERVED' ||
    review.actualObservation?.listenerIntent !== 'MISSING_AT_REVIEW' ||
    review.evidence?.copiedResult?.byteEqualToOwnedSource !== true ||
    review.evidence.copiedResult.sha256 !== R15_RESULT_SHA ||
    review.evidence.ownedResult?.sha256 !== R15_RESULT_SHA ||
    review.evidence.archiveIndex?.sha256 !== R15_PROOF.archiveIndex[1] ||
    review.evidence.visibleToolTranscription?.sha256 !== R15_PROOF.visibleResult[1] ||
    review.sourceBackedDiagnosis?.actualSyscallPathRetained !== false
  )
    throw proofFailure(null)
}

async function verifyOwnedR15Root({ deadline, now }) {
  assertReadDeadline(deadline, now)
  let before
  try {
    before = await fsp.lstat(R15_ROOT)
    assertReadDeadline(deadline, now)
    if (
      !before.isDirectory() ||
      before.isSymbolicLink() ||
      before.uid !== R15_UID ||
      before.uid !== process.getuid() ||
      (before.mode & 0o777) !== 0o700 ||
      before.dev !== 16777230 ||
      before.ino !== 68970680
    )
      throw new Error('p1 root identity changed')
    const names = await fsp.readdir(R15_ROOT)
    assertReadDeadline(deadline, now)
    if (JSON.stringify(names) !== JSON.stringify(['result.json'])) throw new Error('p1 entries changed')
    const bytes = await stableRead(join(R15_ROOT, 'result.json'), {
      max: 64 * 1024,
      privateFile: true,
      owned: true,
      deadline,
      now,
    })
    if (sha256(bytes) !== R15_RESULT_SHA) throw new Error('p1 result changed')
    const after = await fsp.lstat(R15_ROOT)
    assertReadDeadline(deadline, now)
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      after.uid !== before.uid ||
      after.mode !== before.mode
    )
      throw new Error('p1 root changed during read')
  } catch (error) {
    throw proofFailure(null, error)
  }
}

export async function prepareHostPreflightManifest({ deadline, now = Date.now } = {}) {
  const r15 = await verifyR15Preparation({ deadline, now })
  if (r15.manifestDigest !== R15_DIGEST || r15.manifestFileSha256 !== R15_MANIFEST_SHA) throw proofFailure(null)
  const { proof, pins } = await readR15Evidence({ deadline, now })
  assertR15Proof(proof)
  await verifyOwnedR15Root({ deadline, now })
  let proposalBytes
  try {
    proposalBytes = await stableRead(PROPOSAL, { max: 64 * 1024, deadline, now })
  } catch (error) {
    throw proofFailure(null, error)
  }
  if (sha256(proposalBytes) !== PROPOSAL_SHA) throw proofFailure(null)
  const sources = []
  for (const [index, path] of [
    join(HERE, 'filesystem-io.mjs'),
    join(HERE, 'preparation.mjs'),
    join(HERE, 'entrypoint.mjs'),
    join(REPO, 'scripts/tests/codex-app-server-m02-ta-host-preflight-r16.test.mjs'),
  ].entries()) {
    try {
      sources.push({ path, sha256: sha256(await stableRead(path, { max: 256 * 1024, owned: true, deadline, now })) })
    } catch (error) {
      throw proofFailure(index, error)
    }
  }
  const manifest = Object.freeze({
    version: 'appraise.m02-ta-host-preflight-r16/v1',
    policy: R16_POLICY,
    reusedCorePolicyDigest: digest(PREFLIGHT),
    reusedCore: 'accepted-r14-runHostPreflight-and-createOwnedLoopbackAdapter',
    reusedResultSchema: 'appraise.m02-ta-host-preflight-r14-result/v1',
    prior: {
      r15ManifestDigest: R15_DIGEST,
      r15ManifestFileSha256: R15_MANIFEST_SHA,
      r15Outcome: 'UNKNOWN',
      r15Root: { path: R15_ROOT, dev: 16777230, ino: 68970680, mode: '0700', soleEntry: 'result.json' },
      r15Evidence: pins,
      r13ArtifactCount: r15.manifest.prior.manifest.artifactCount,
    },
    proposal: { path: PROPOSAL, sha256: PROPOSAL_SHA },
    sources,
    fixedCommand: {
      launcher: '/usr/bin/env',
      environment: ['-i', 'PATH=/usr/bin:/bin', 'LANG=C'],
      node: PREFLIGHT.node,
      entrypoint: join(HERE, 'entrypoint.mjs'),
      permissionRequest: 'exec_command sandbox_permissions=require_escalated',
      sourceEnforcementOfSandboxMode: 'UNATTESTED',
    },
    root: R16_ROOT,
    scope: PREFLIGHT.scope,
    runtimeAuthorized: false,
    t2Authorized: false,
    blockers: [],
  })
  assertReadDeadline(deadline, now)
  return Object.freeze({
    manifest,
    manifestDigest: digest(manifest),
    runtimeEligible: false,
    exactReviewRequired: true,
  })
}

export async function writeHostPreflightPreparation() {
  const prepared = await prepareHostPreflightManifest()
  fs.mkdirSync(BUILD, { mode: 0o700 })
  const fd = fs.openSync(
    MANIFEST,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
    0o600,
  )
  try {
    fs.writeFileSync(
      fd,
      Buffer.from(
        `${JSON.stringify({ schema: 'appraise.m02-ta-host-preflight-r16-preparation/v1', ...prepared }, null, 2)}\n`,
      ),
    )
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  const dirfd = fs.openSync(BUILD, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
  try {
    fs.fsyncSync(dirfd)
  } finally {
    fs.closeSync(dirfd)
  }
  return {
    manifestDigest: prepared.manifestDigest,
    manifestFileSha256: sha256(fs.readFileSync(MANIFEST)),
    runtimeEligible: false,
  }
}

export async function verifyHostPreflightPreparation({ deadline, now = Date.now } = {}) {
  const prepared = await prepareHostPreflightManifest({ deadline, now })
  const bytes = await stableRead(MANIFEST, { max: 256 * 1024, privateFile: true, owned: true, deadline, now })
  const envelope = JSON.parse(bytes)
  if (
    envelope.schema !== 'appraise.m02-ta-host-preflight-r16-preparation/v1' ||
    envelope.manifestDigest !== prepared.manifestDigest ||
    digest(envelope.manifest) !== prepared.manifestDigest ||
    envelope.runtimeEligible !== false ||
    envelope.exactReviewRequired !== true ||
    JSON.stringify(envelope.manifest) !== JSON.stringify(prepared.manifest)
  )
    throw new Error('R16 preparation changed')
  assertReadDeadline(deadline, now)
  return Object.freeze({ ...prepared, manifestFileSha256: sha256(bytes) })
}
