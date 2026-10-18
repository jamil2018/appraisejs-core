/** Read-only T3 manifest derivation. The accepted T2 run is a strict prerequisite. */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { POLICY, POLICY_DIGEST, digest } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { verifyAcceptedT2Evidence } from './prior-t2.mjs'
import { NATIVE_PINS } from '../codex-app-server-m02-ta-native-plans-r10/plans.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const PACKAGE_MARKER = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/codex-package.json'
const PACKAGE_MARKER_SHA = '558c7aabb05ccc87bdb8c8514f87659fec72929a39919c7156f8b8889f7589b3'
const R10_REVIEW = join(REPO, '.appraisejs/m02-ta-workspace-r10-offline-review-01.json')
const R10_REVIEW_SHA = 'c41bb7692750c9c03131e6ef6a6e02134def74eb3a4ae7740cdf9e6b52fd588d'
const TA03_PINS = Object.freeze({
  'tasks/codex-app-server-journeys/m02-ta03-helper-evidence-proposal-01.md':
    '5cb5637323d5c6a6dce67e0697e8a473e69ad476c31568fa7a695abcf9b3dab3',
  'tasks/codex-app-server-journeys/m02-ta03-approval-01.md':
    '8ca7635b537ef1fda04dc859f98eb04beb66eae4f05e3c697b12be53b411a8fc',
  '.appraisejs/m02-t3-helper-doc-review-01.json': '9fb0accb1960403cd1d1d9ba759ca2dc94bc25bc1ace8bdb427251bd67e9a65d',
})

async function stableBytes(file, requireOwner = true) {
  const state = await fs.lstat(file)
  if (
    !state.isFile() ||
    state.isSymbolicLink() ||
    (requireOwner && state.uid !== process.getuid()) ||
    (state.mode & 0o022) !== 0 ||
    state.size < 2 ||
    state.size > 8 * 1024 * 1024
  )
    throw new Error('T3 source pin identity')
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const held = await handle.stat()
    if (held.dev !== state.dev || held.ino !== state.ino || held.size !== state.size)
      throw new Error('T3 source pin replaced')
    const bytes = await handle.readFile()
    const after = await handle.stat()
    const afterPath = await fs.lstat(file)
    if (
      [after, afterPath].some(
        item =>
          item.dev !== state.dev ||
          item.ino !== state.ino ||
          item.size !== state.size ||
          item.mtimeMs !== state.mtimeMs ||
          item.mode !== state.mode,
      ) ||
      bytes.length !== state.size
    )
      throw new Error('T3 source pin changed during read')
    return bytes
  } finally {
    await handle.close()
  }
}

async function ownPin(file, purpose, requireOwner = true) {
  return Object.freeze({ path: file, purpose, sha256: sha(await stableBytes(file, requireOwner)) })
}

/** T3's frozen stage selects the R10 bundle; R12's p2 bundle remains historical evidence. */
export function selectT3CanonicalPins(t2Manifest) {
  const active = t2Manifest?.artifacts?.find(item => item.purpose === 'historical-r10-canonical-backend')
  if (
    active?.path !== join(REPO, '.appraisejs/m02-ta-matrix-build-r10/canonical-bridge.mjs') ||
    active.sha256 !== 'e2c7d99a882465437dd3ea878c85fafc8eaa47ca13578214ad3a2237c3ad5e67' ||
    t2Manifest.artifacts.filter(item => item.purpose === 'historical-r10-canonical-backend').length !== 1 ||
    t2Manifest.artifacts.filter(item => item.purpose === 'matrix-canonical-backend').length !== 1
  )
    throw new Error('T3 staged canonical backend differs from accepted R10 bytes')
  const historical = t2Manifest.artifacts.map(item => ({
    ...item,
    purpose:
      item.purpose === 'scoped-mcp-entry'
        ? 'historical-t2-scoped-entry'
        : item.purpose === 'matrix-canonical-backend'
          ? 'historical-t2-r12-canonical-backend'
          : item.purpose === 'historical-r10-canonical-backend'
            ? 'matrix-canonical-backend'
            : item.purpose,
  }))
  return Object.freeze({ active, historical })
}

export async function prepareWorkspaceManifest() {
  const prior = await verifyAcceptedT2Evidence()
  const t2 = prior
  if (
    t2.manifest.phase !== 'T2' ||
    t2.manifest.root !== '/private/tmp/appraise-m02-ta-matrix-p2' ||
    t2.manifest.cases.length !== 24 ||
    t2.manifest.nativeFileCreationUmask !== '0077'
  )
    throw new Error('accepted T2 preparation shape changed')
  const files = (await fs.readdir(HERE)).filter(name => name.endsWith('.mjs')).sort()
  const own = []
  for (const name of files) own.push(await ownPin(join(HERE, name), `workspace:${name}`))
  own.push(
    await ownPin(join(REPO, 'scripts/tests/codex-app-server-m02-ta-workspace-r11.test.mjs'), 'workspace:offline-tests'),
  )
  const r10ReviewPin = await ownPin(R10_REVIEW, 'accepted-workspace-r10-review')
  if (r10ReviewPin.sha256 !== R10_REVIEW_SHA) throw new Error('accepted R10 source review changed')
  const r10ReviewBytes = await stableBytes(R10_REVIEW)
  if (sha(r10ReviewBytes) !== R10_REVIEW_SHA) throw new Error('accepted R10 review changed between reads')
  const r10Review = JSON.parse(r10ReviewBytes)
  if (r10Review.decision !== 'BLOCKED_T3_PREPARATION_AND_NATIVE' || Object.keys(r10Review.pins ?? {}).length !== 14)
    throw new Error('accepted R10 source review shape changed')
  const frozenR10 = []
  for (const [relative, expected] of Object.entries(r10Review.pins)) {
    const current = await ownPin(join(REPO, relative), `accepted-r10:${relative}`)
    if (current.sha256 !== expected) throw new Error('accepted R10 source changed')
    frozenR10.push(current)
  }
  const ta03 = []
  for (const [relative, expected] of Object.entries(TA03_PINS)) {
    const current = await ownPin(join(REPO, relative), `approved-ta03:${relative}`)
    if (current.sha256 !== expected) throw new Error('TA03 approval/document provenance changed')
    ta03.push(current)
  }
  const marker = await ownPin(PACKAGE_MARKER, 'installed-codex-package-marker', false)
  if (marker.sha256 !== PACKAGE_MARKER_SHA) throw new Error('installed Code Mode package marker changed')
  for (const pin of Object.values(NATIVE_PINS)) {
    const current = await ownPin(pin.path, `native-helper:${pin.path}`, false)
    if (current.sha256 !== pin.sha256) throw new Error('native helper source pin changed')
    own.push(current)
  }
  const scoped = frozenR10.find(
    item => item.path === join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-workspace-r10/scoped-entry.mjs'),
  )
  if (!scoped) throw new Error('T3 scoped child entry missing')
  const { active: activeCanonical, historical } = selectT3CanonicalPins(t2.manifest)
  const candidates = [
    { ...scoped, purpose: 'scoped-mcp-entry' },
    ...own,
    ...frozenR10.filter(item => item.path !== scoped.path),
    r10ReviewPin,
    ...ta03,
    ...prior.files,
    ...historical,
  ]
  const pathHashes = new Map()
  const artifacts = []
  for (const item of candidates) {
    if (pathHashes.has(item.path) && pathHashes.get(item.path) !== item.sha256)
      throw new Error('T3 artifact path has contradictory hashes')
    if (pathHashes.has(item.path)) continue
    pathHashes.set(item.path, item.sha256)
    artifacts.push(item)
  }
  const manifest = Object.freeze({
    version: 'appraise.m02-ta-workspace-r11/v1',
    policyDigest: POLICY_DIGEST,
    phase: 'T3',
    root: POLICY.roots.T3,
    cases: ['N01', 'N02'],
    artifacts,
    predecessor: {
      t2ManifestDigest: t2.manifestDigest,
      t2ManifestFileSha256: t2.manifestFileSha256,
      t2ArchiveIndexSha256: prior.indexSha256,
      t2ActualReviewSha256: prior.reviewSha256,
      t2R12ExactReviewSha256: prior.exactReviewSha256,
      t2R12UserDecisionSha256: prior.userDecisionSha256,
      t2R12RecoveryProposalSha256: prior.recoveryProposalSha256,
      casesCompleted: prior.casesCompleted,
      unresolvedUnknown: prior.unresolvedUnknown,
    },
    canonicalSource: {
      stagedSourcePath: activeCanonical.path,
      stagedSourceSha256: activeCanonical.sha256,
      provenance: 'ACCEPTED_R10_CANONICAL_BUNDLE_RETAINED_IN_R12_HISTORY',
    },
    sourceHostBudget: {
      t3CapacityAllocation: 4,
      t3OuterMaximum: 2,
      nativeHelpersSourceMaximum: 2,
      actualShortLivedHostStarts: 'UNKNOWN',
      nativeScratchHelperInventory: 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED',
      actualHostCountAttested: false,
    },
    nativeFileCreationUmask: '0077',
    routeReview: 'SEALED_T1_CAPTURE_WITH_NATIVE_DESCRIPTOR_VARIANTS_PREPARED_NOT_RUNTIME_QUALIFIED',
    ta03: {
      scope: 'M02_TRUSTED_AGENT_SCRIPTED_N01_N02_ONLY',
      proposalSha256: TA03_PINS['tasks/codex-app-server-journeys/m02-ta03-helper-evidence-proposal-01.md'],
      approvalRecordSha256: TA03_PINS['tasks/codex-app-server-journeys/m02-ta03-approval-01.md'],
      docReviewSha256: TA03_PINS['.appraisejs/m02-t3-helper-doc-review-01.json'],
      nativeScratchHelperInventory: 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED',
      hostileAgentContainmentQualified: false,
    },
    runtimeAuthorized: false,
    blockers: [],
    evidenceClass: 'OFFLINE_PREPARED_EXACT_RUNTIME_REVIEW_REQUIRED',
  })
  return Object.freeze({
    manifest,
    manifestDigest: digest(manifest),
    seal: t2.seal,
    canonicalSha256: activeCanonical.sha256,
    blockers: [],
    runtimeEligible: false,
  })
}
