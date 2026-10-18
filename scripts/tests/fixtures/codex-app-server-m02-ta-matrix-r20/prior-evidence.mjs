/** Read-only retention proof for consumed, gate-refused R19 and earlier UNKNOWN history. */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyConsumedR17 } from '../codex-app-server-m02-ta-matrix-r19/prior-evidence.mjs'
import { digest, PRIOR_ROOT, ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r19')
const FILES = Object.freeze({
  manifest: [join(BUILD, 'manifest.json'), '2c04717e51e0c0a5b19060b35e13457c407ad8942db9bf797c27b3401de4c8b0'],
  exactReview: [
    join(REPO, '.appraisejs/m02-t2-r19-exact-review.json'),
    '665c347237c012e98316762f92a22979958663ac02eb5a302a2dd4b07e4a210c',
  ],
  decision: [
    join(REPO, '.appraisejs/m02-t2-r19-recovery-user-decision.json'),
    'c59f3453327cc87565fc2d227413e6b53a6542baa1ad9d27fb6f2190d326cacb',
  ],
  visibleResult: [
    join(REPO, '.appraisejs/m02-t2-r19-execution-result-01.json'),
    'cabb4b9811fa9ea6604ca73379024d76db109e765aedcaa0d28439c516dd5006',
  ],
  actualReview: [
    join(REPO, '.appraisejs/m02-t2-r19-execution-review-01.json'),
    'a43293b55e8c1bc274997cdc28fbf874596b6585dcad2cc3ae55e4b02715782f',
  ],
  sourceReview: [
    join(REPO, '.appraisejs/m02-ta-matrix-r19-source-review-01.json'),
    'ce6acc36513f7a0a5c34fc3031c3a63cef0e8493a7066a097fa66788cbea9530',
  ],
})
const MANIFEST_DIGEST = '4ad539c087bc35bb5668f97c2175b14df33ae56c1162a3a10599a4255f24d0f7'
const CANONICAL_SHA = '074a6e84c132b3f78d1fbfca30fbab200575da2a1d900f280407d1b00c82bfad'
const EMPTY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs'].every(key => a[key] === b[key])

async function exactFile(file, expected, { max = 256 * 1024 * 1024, owned = false } = {}) {
  const before = await fs.lstat(file)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    (owned && before.uid !== process.getuid()) ||
    (before.mode & 0o022) !== 0 ||
    (owned && before.nlink !== 1) ||
    before.size > max
  )
    throw new Error('R19 retained file identity drift')
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    if (!same(before, await handle.stat())) throw new Error('R19 retained file replaced before read')
    const bytes = await handle.readFile()
    if (
      !same(before, await handle.stat()) ||
      !same(before, await fs.lstat(file)) ||
      bytes.length !== before.size ||
      sha(bytes) !== expected
    )
      throw new Error('R19 retained file changed or hash drift')
    return bytes
  } finally {
    await handle.close()
  }
}

async function requireAbsent(root) {
  try {
    await fs.lstat(root)
    throw new Error(`consumed R19 gate-only root or fresh R20 root exists: ${root}`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

function validateManifest(envelope) {
  const manifest = envelope?.manifest
  if (
    envelope?.schema !== 'appraise.m02-ta-matrix-r19-preparation/v1' ||
    envelope.manifestDigest !== MANIFEST_DIGEST ||
    envelope.canonicalSha256 !== CANONICAL_SHA ||
    !manifest ||
    manifest.version !== 'appraise.m02-ta-matrix-r19/v1' ||
    manifest.root !== PRIOR_ROOT ||
    manifest.phase !== 'T2' ||
    manifest.runtimeAuthorized !== false ||
    digest(manifest) !== MANIFEST_DIGEST ||
    !Array.isArray(manifest.artifacts) ||
    manifest.artifacts.length !== 6521 ||
    manifest.artifacts.filter(item => item.sha256 === EMPTY_SHA).length !== 16 ||
    manifest.artifacts.filter(item => item.purpose === 'matrix-canonical-backend').length !== 1 ||
    manifest.artifacts.filter(item => item.purpose === 'scoped-mcp-entry').length !== 1 ||
    manifest.artifacts.find(item => item.purpose === 'matrix-canonical-backend')?.path !==
      join(BUILD, 'canonical-bridge.mjs') ||
    manifest.artifacts.find(item => item.purpose === 'matrix-canonical-backend')?.sha256 !== CANONICAL_SHA
  )
    throw new Error('R19 consumed manifest shape or digest drift')
  const seen = new Set()
  for (const item of manifest.artifacts) {
    if (
      typeof item?.path !== 'string' ||
      !isAbsolute(item.path) ||
      resolve(item.path) !== item.path ||
      seen.has(item.path) ||
      typeof item.purpose !== 'string' ||
      !/^[a-f0-9]{64}$/.test(item.sha256 ?? '')
    )
      throw new Error('R19 consumed artifact pin invalid')
    seen.add(item.path)
  }
  return manifest
}

function validateReceipts(envelope, review, decision, visible, actual, source) {
  const manifest = envelope.manifest
  if (
    review?.schema !== 'appraise.m02-ta-t2-r19-exact-review/v1' ||
    review.verdict !== 'ACCEPT_ONE_FIXED_T2_R19_INVOCATION' ||
    review.runtimeVerdict !== 'NOT_RUN' ||
    review.manifest?.fileSha256 !== FILES.manifest[1] ||
    review.manifest?.manifestDigest !== MANIFEST_DIGEST ||
    review.manifest?.root !== PRIOR_ROOT ||
    review.canonicalSha256 !== CANONICAL_SHA ||
    review.freshP5RootAbsentAtReview !== true ||
    review.priorP1P2P3P4UnknownPreserved !== true ||
    review.sourceReviewSha256 !== FILES.sourceReview[1] ||
    decision?.schema !== 'appraise.m02-ta-t2-r19-recovery-user-decision/v1' ||
    decision.verdict !== 'APPROVE_ONE_FIXED_T2_R19_RECOVERY' ||
    decision.exactReviewSha256 !== FILES.exactReview[1] ||
    decision.manifestFileSha256 !== FILES.manifest[1] ||
    decision.manifestDigest !== MANIFEST_DIGEST ||
    decision.priorP1P2P3P4UnknownPreserved !== true ||
    visible?.schema !== 'appraise.m02-ta-t2-r19-visible-execution/v1' ||
    visible.observedStatus !== 'ENTRYPOINT_REVIEW_GATE_REFUSED' ||
    visible.exitCode !== 1 ||
    visible.casesCompleted !== 0 ||
    visible.runtimeRoot !== PRIOR_ROOT ||
    visible.runtimeRootAbsentAtPostRunRead !== true ||
    visible.actualHostMode !== 'UNATTESTED' ||
    visible.terminalOutput !== 'T2 entrypoint independent exact R19 review absent or changed\n' ||
    actual?.schema !== 'appraise.m02-ta-t2-r19-actual-review/v1' ||
    actual.verdict !== 'ACCEPT_ACTUAL_R19_GATE_REFUSAL_NO_T2_QUALIFICATION' ||
    actual.runtimeVerdict !== 'ENTRYPOINT_REVIEW_GATE_REFUSED' ||
    actual.approvalAndExecution?.oneShotCommandConsumed !== true ||
    actual.approvalAndExecution?.casesCompleted !== 0 ||
    actual.boundary?.p5RootAbsentAtPostRunRead !== true ||
    actual.boundary?.noT2CasesCompleted !== true ||
    actual.boundary?.noRetryOrResumeAuthorized !== true ||
    actual.preservation?.r19ManifestArtifactsRehashed !== 6521 ||
    actual.preservation?.r19ManifestMismatches !== 0 ||
    actual.pins?.manifest?.sha256 !== FILES.manifest[1] ||
    actual.pins?.exactReview?.sha256 !== FILES.exactReview[1] ||
    actual.pins?.decision?.sha256 !== FILES.decision[1] ||
    actual.pins?.visibleResult?.sha256 !== FILES.visibleResult[1] ||
    actual.pins?.sourceReview?.sha256 !== FILES.sourceReview[1] ||
    source?.schema !== 'appraise.m02-ta-matrix-r19-source-review/v1' ||
    source.verdict !== 'ACCEPT_EXACT_OFFLINE_SOURCE_FOR_ONE_PREPARE_ONLY' ||
    manifest.cases.length !== 24
  )
    throw new Error('R19 consumed gate-only evidence shape drift')
}

export async function verifyConsumedR19({ requireNewRootAbsent = true } = {}) {
  const earlier = await verifyConsumedR17({ requireNewRootAbsent: false })
  if (earlier.status !== 'PRIOR_P1_P2_P3_P4_UNKNOWN_PRESERVED') throw new Error('earlier UNKNOWN history drift')
  await requireAbsent(PRIOR_ROOT)
  if (requireNewRootAbsent) await requireAbsent(ROOT)
  const bytes = await Promise.all(
    Object.values(FILES).map(([file, hash]) => exactFile(file, hash, { max: 4 * 1024 * 1024, owned: true })),
  )
  const [envelope, review, decision, visible, actual, source] = bytes.map(value => JSON.parse(value))
  const manifest = validateManifest(envelope)
  validateReceipts(envelope, review, decision, visible, actual, source)
  for (const item of manifest.artifacts) await exactFile(item.path, item.sha256)
  await requireAbsent(PRIOR_ROOT)
  if (requireNewRootAbsent) await requireAbsent(ROOT)
  return Object.freeze({
    status: 'PRIOR_P1_P2_P3_P4_UNKNOWN_R19_GATE_ONLY_RETAINED',
    manifest,
    pinnedFiles: Object.freeze([
      ...new Set([
        ...earlier.pinnedFiles,
        ...Object.values(FILES).map(([file]) => file),
        ...manifest.artifacts.map(item => item.path),
      ]),
    ]),
    r19: Object.freeze({
      manifestSha256: FILES.manifest[1],
      manifestDigest: MANIFEST_DIGEST,
      exactReviewSha256: FILES.exactReview[1],
      decisionSha256: FILES.decision[1],
      visibleResultSha256: FILES.visibleResult[1],
      actualReviewSha256: FILES.actualReview[1],
      sourceReviewSha256: FILES.sourceReview[1],
      rootAbsent: true,
      casesCompleted: 0,
    }),
  })
}
