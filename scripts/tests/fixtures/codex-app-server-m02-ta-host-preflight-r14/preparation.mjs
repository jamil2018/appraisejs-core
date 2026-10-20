/** Exclusive offline preparation. No active preflight occurs on import or preparation. */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PREFLIGHT, classify, digest, sha256 } from './policy.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
export const BUILD = join(REPO, '.appraisejs/m02-ta-host-preflight-build-r14')
export const MANIFEST = join(BUILD, 'manifest.json')
const PRIOR_MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r13/manifest.json')
const PRIOR_REVIEW = join(REPO, '.appraisejs/m02-t2-r13-execution-review-01.json')
export const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-host-execution-preflight-01.md')
export const PROPOSAL_SHA = 'd688ea01b6889d00e323908eb6f544a89e59c19767605ac2d196b30e91a4be64'
const SHA = /^[a-f0-9]{64}$/

export function assertReadDeadline(deadline, now = Date.now) {
  if (deadline !== undefined && (!Number.isSafeInteger(deadline) || now() >= deadline))
    throw Object.assign(new Error('R14 command deadline'), { code: 'ETIMEDOUT' })
}

export function pinReadFailure(pinClass, operationIndex, error) {
  if (
    !['PRIOR_MANIFEST', 'PRIOR_REVIEW', 'R13_ARTIFACT', 'PACKAGE_MARKER', 'R14_SOURCE', 'PREPARED_MANIFEST'].includes(
      pinClass,
    )
  )
    throw new Error('unreviewed pin failure class')
  const failure = new Error('R14 PIN_READ failed')
  failure.safeReceipt = Object.freeze({ stage: 'PIN_READ', pinClass, operationIndex, errno: classify(error) })
  return failure
}

async function stableRead(file, { max = 400 * 1024 * 1024, privateFile = false, owned = false, deadline, now } = {}) {
  assertReadDeadline(deadline, now)
  const before = await fsp.lstat(file)
  assertReadDeadline(deadline, now)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    (before.mode & 0o022) !== 0 ||
    (privateFile && (before.mode & 0o777) !== 0o600) ||
    (owned && before.uid !== process.getuid()) ||
    before.size < 1 ||
    before.size > max
  )
    throw new Error('R14 pinned file identity changed')
  assertReadDeadline(deadline, now)
  const handle = await fsp.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    assertReadDeadline(deadline, now)
    const held = await handle.stat()
    assertReadDeadline(deadline, now)
    if (held.dev !== before.dev || held.ino !== before.ino || held.size !== before.size)
      throw new Error('R14 pinned file replaced')
    const bytes = await handle.readFile()
    assertReadDeadline(deadline, now)
    const after = await handle.stat()
    assertReadDeadline(deadline, now)
    const path = await fsp.lstat(file)
    assertReadDeadline(deadline, now)
    if (
      bytes.length !== before.size ||
      [after, path].some(
        s => s.dev !== before.dev || s.ino !== before.ino || s.size !== before.size || s.mtimeMs !== before.mtimeMs,
      )
    )
      throw new Error('R14 pinned file changed during read')
    return bytes
  } finally {
    await handle.close()
  }
}

export async function prepareHostPreflightManifest({ deadline, now = Date.now } = {}) {
  const timed = { deadline, now }
  assertReadDeadline(deadline, now)
  const [priorBytes, reviewBytes] = await Promise.all([
    stableRead(PRIOR_MANIFEST, { max: 8 * 1024 * 1024, privateFile: true, owned: true, ...timed }).catch(error => {
      throw pinReadFailure('PRIOR_MANIFEST', null, error)
    }),
    stableRead(PRIOR_REVIEW, { max: 64 * 1024, privateFile: true, owned: true, ...timed }).catch(error => {
      throw pinReadFailure('PRIOR_REVIEW', null, error)
    }),
  ])
  if (sha256(priorBytes) !== PREFLIGHT.priorManifestSha256) throw pinReadFailure('PRIOR_MANIFEST', null, null)
  if (sha256(reviewBytes) !== PREFLIGHT.priorReviewSha256) throw pinReadFailure('PRIOR_REVIEW', null, null)
  const prior = JSON.parse(priorBytes).manifest
  const review = JSON.parse(reviewBytes)
  if (
    prior?.version !== 'appraise.m02-ta-matrix-r13/v1' ||
    prior.root !== '/private/tmp/appraise-m02-ta-matrix-p3' ||
    prior.artifacts?.length !== PREFLIGHT.priorArtifacts ||
    new Set(prior.artifacts.map(item => item.path)).size !== PREFLIGHT.priorArtifacts ||
    review.schema !== 'appraise.m02-ta-t2-r13-actual-failure-review/v1' ||
    review.verdict !== 'ACCEPT_ACTUAL_R13_UNKNOWN_EVIDENCE_NO_T2_QUALIFICATION' ||
    review.runtimeVerdict !== 'UNKNOWN' ||
    review.journal?.unknown !== true
  )
    throw pinReadFailure('PRIOR_REVIEW', null, null)
  for (const [index, item] of prior.artifacts.entries()) {
    if (typeof item.path !== 'string' || !item.path.startsWith('/') || !SHA.test(item.sha256 ?? ''))
      throw pinReadFailure('R13_ARTIFACT', index, null)
    let bytes
    try {
      bytes = await stableRead(item.path, timed)
    } catch (error) {
      throw pinReadFailure('R13_ARTIFACT', index, error)
    }
    if (sha256(bytes) !== item.sha256) throw pinReadFailure('R13_ARTIFACT', index, null)
  }
  let markerBytes
  try {
    markerBytes = await stableRead(PREFLIGHT.packageMarker, { max: 64 * 1024, ...timed })
  } catch (error) {
    throw pinReadFailure('PACKAGE_MARKER', null, error)
  }
  if (sha256(markerBytes) !== PREFLIGHT.packageMarkerSha256) throw pinReadFailure('PACKAGE_MARKER', null, null)
  let proposalBytes
  try {
    proposalBytes = await stableRead(PROPOSAL, { max: 64 * 1024, ...timed })
  } catch (error) {
    throw pinReadFailure('R14_SOURCE', null, error)
  }
  if (sha256(proposalBytes) !== PROPOSAL_SHA) throw pinReadFailure('R14_SOURCE', null, null)
  const sourceNames = ['policy.mjs', 'preparation.mjs', 'runner.mjs', 'entrypoint.mjs']
  const sources = []
  for (const [index, name] of sourceNames.entries()) {
    const path = join(HERE, name)
    try {
      sources.push({ path, sha256: sha256(await stableRead(path, { max: 256 * 1024, owned: true, ...timed })) })
    } catch (error) {
      throw pinReadFailure('R14_SOURCE', index, error)
    }
  }
  const testPath = join(REPO, 'scripts/tests/codex-app-server-m02-ta-host-preflight-r14.test.mjs')
  try {
    sources.push({
      path: testPath,
      sha256: sha256(await stableRead(testPath, { max: 256 * 1024, owned: true, ...timed })),
    })
  } catch (error) {
    throw pinReadFailure('R14_SOURCE', sourceNames.length, error)
  }
  const manifest = Object.freeze({
    version: PREFLIGHT.version,
    policy: PREFLIGHT,
    prior: {
      manifest: {
        path: PRIOR_MANIFEST,
        sha256: PREFLIGHT.priorManifestSha256,
        artifactCount: PREFLIGHT.priorArtifacts,
      },
      actualReview: { path: PRIOR_REVIEW, sha256: PREFLIGHT.priorReviewSha256, verdict: review.verdict },
      priorT2Outcome: 'UNKNOWN',
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
        `${JSON.stringify({ schema: 'appraise.m02-ta-host-preflight-r14-preparation/v1', ...prepared }, null, 2)}\n`,
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
  let bytes
  try {
    bytes = await stableRead(MANIFEST, { max: 256 * 1024, privateFile: true, owned: true, deadline, now })
  } catch (error) {
    throw pinReadFailure('PREPARED_MANIFEST', null, error)
  }
  const envelope = JSON.parse(bytes)
  if (
    envelope.schema !== 'appraise.m02-ta-host-preflight-r14-preparation/v1' ||
    envelope.manifestDigest !== prepared.manifestDigest ||
    digest(envelope.manifest) !== prepared.manifestDigest ||
    envelope.runtimeEligible !== false ||
    envelope.exactReviewRequired !== true ||
    JSON.stringify(envelope.manifest) !== JSON.stringify(prepared.manifest)
  )
    throw new Error('R14 preparation changed')
  assertReadDeadline(deadline, now)
  return Object.freeze({ ...prepared, manifestFileSha256: sha256(bytes) })
}
