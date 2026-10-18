/** Offline R21 derivation. Historical absent sources remain archive claims, never live pins. */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { buildR21CanonicalBytes, HISTORICAL_BUNDLE, HISTORICAL_SHA } from './canonical-build.mjs'
import { verifyTA04History } from './prior-evidence.mjs'
import { verifyR21HostFile } from './host-file.mjs'
import { POLICY, POLICY_DIGEST, PRIOR_ROOT, ROOT_AMENDMENT, digest } from './policy.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r21')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t2-recovery-06.md')
const TA04 = join(REPO, 'tasks/codex-app-server-journeys/m02-ta04-availability-amendment-01.md')
const TA04_REVIEW = join(REPO, '.appraisejs/m02-ta04-availability-design-review-01.json')
const TA04_DECISION = join(REPO, '.appraisejs/m02-ta04-user-decision-01.json')
const SNAPSHOT = join(REPO, '.appraisejs/m02-r20-resume-preservation-01.json')
const AVAILABILITY = join(REPO, '.appraisejs/m02-r20-archive-availability-01.json')
const R20_REVIEW = join(REPO, '.appraisejs/m02-ta-matrix-r20-source-review-01.json')
const HISTORICAL_MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r19/manifest.json')
const R19_REVIEW = join(REPO, '.appraisejs/m02-t2-r19-exact-review.json')
const R19_DECISION = join(REPO, '.appraisejs/m02-t2-r19-recovery-user-decision.json')
const R19_RESULT = join(REPO, '.appraisejs/m02-t2-r19-execution-result-01.json')
const R19_ACTUAL_REVIEW = join(REPO, '.appraisejs/m02-t2-r19-execution-review-01.json')
const R19_SOURCE_REVIEW = join(REPO, '.appraisejs/m02-ta-matrix-r19-source-review-01.json')
const EXPECTED = Object.freeze({
  proposal: 'aea1c4ad1c9c158edb60a086dac70a2c0d8ddb87212b316958aad24daefde983',
  ta04: '35f790f9d47c9474df3e6ec26511471c9dc08b7df13f10ba8ddc40f562fd8381',
  ta04Review: '298a6e14f7f2a9a287c4e72ad28c96a2dc8489dd8e0252c8ff7978b0ab21c189',
  ta04Decision: '196fe5f3809f10c00272948a941d99cfafbca597f89672b079a31c8fe59eb64a',
  snapshot: 'f0c52df1bcc666af5a08d9494c15afc94c8cffcc2770507ad08d5a87145bda10',
  availability: 'f36f9f7d2cf7fe23a095e84fb0afc2086b22453500af6a99f2440b1bcb0fb1b1',
  r20Review: '4db3a2f1a6339d11e03a3ffbc91d74082502513916b4ec1b186d7f79ec6d2a6a',
  historicalManifest: '2c04717e51e0c0a5b19060b35e13457c407ad8942db9bf797c27b3401de4c8b0',
  r19Review: '665c347237c012e98316762f92a22979958663ac02eb5a302a2dd4b07e4a210c',
  r19Decision: 'c59f3453327cc87565fc2d227413e6b53a6542baa1ad9d27fb6f2190d326cacb',
  r19Result: 'cabb4b9811fa9ea6604ca73379024d76db109e765aedcaa0d28439c516dd5006',
  r19ActualReview: 'a43293b55e8c1bc274997cdc28fbf874596b6585dcad2cc3ae55e4b02715782f',
  r19SourceReview: 'ce6acc36513f7a0a5c34fc3031c3a63cef0e8493a7066a097fa66788cbea9530',
})
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs'].every(key => a[key] === b[key])

async function filePin(file, purpose) {
  const before = await fs.lstat(file)
  if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o022) !== 0)
    throw new Error('R21 pin identity drift')
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    if (!same(before, await handle.stat())) throw new Error('R21 pin replaced before read')
    const bytes = await handle.readFile()
    if (!same(before, await handle.stat()) || !same(before, await fs.lstat(file)) || bytes.length !== before.size)
      throw new Error('R21 pin changed during read')
    return Object.freeze({ path: file, purpose, sha256: sha(bytes) })
  } finally {
    await handle.close()
  }
}

async function tree(directory) {
  const found = []
  const walk = async file => {
    const state = await fs.lstat(file)
    if (state.isSymbolicLink()) throw new Error('R21 source symlink')
    if (state.isFile()) return found.push(file)
    if (!state.isDirectory()) throw new Error('R21 source special file')
    for (const name of await fs.readdir(file)) await walk(join(file, name))
  }
  await walk(directory)
  return found.sort()
}

export async function prepareR21MatrixManifest() {
  const [prior, host, canonical] = await Promise.all([
    verifyTA04History(),
    verifyR21HostFile(),
    buildR21CanonicalBytes(),
  ])
  const old = prior.manifest
  if (
    prior.status !== 'PRIOR_P1_P2_P3_P4_UNKNOWN_R19_GATE_ONLY_ARCHIVE_VERIFIED' ||
    prior.r19?.manifestSha256 !== EXPECTED.historicalManifest ||
    old.version !== 'appraise.m02-ta-matrix-r19/v1' ||
    old.root !== PRIOR_ROOT ||
    old.policyDigest !== ROOT_AMENDMENT.priorPolicyDigest ||
    old.artifacts.length !== 6521 ||
    prior.liveArtifacts?.length !== 6498 ||
    prior.historicalSources?.length !== 23 ||
    old.artifacts.filter(item => item.sha256 === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
      .length !== 16 ||
    old.artifacts.filter(item => item.purpose === 'matrix-canonical-backend').length !== 1 ||
    old.artifacts.filter(item => item.purpose === 'scoped-mcp-entry').length !== 1 ||
    canonical.originalSha256 !== HISTORICAL_SHA ||
    host.processImageAttested !== false
  )
    throw new Error('R21 predecessor drift')
  const fixed = new Map([
    [PROPOSAL, EXPECTED.proposal],
    [TA04, EXPECTED.ta04],
    [TA04_REVIEW, EXPECTED.ta04Review],
    [TA04_DECISION, EXPECTED.ta04Decision],
    [SNAPSHOT, EXPECTED.snapshot],
    [AVAILABILITY, EXPECTED.availability],
    [R20_REVIEW, EXPECTED.r20Review],
    [HISTORICAL_MANIFEST, EXPECTED.historicalManifest],
    [R19_REVIEW, EXPECTED.r19Review],
    [R19_DECISION, EXPECTED.r19Decision],
    [R19_RESULT, EXPECTED.r19Result],
    [R19_ACTUAL_REVIEW, EXPECTED.r19ActualReview],
    [R19_SOURCE_REVIEW, EXPECTED.r19SourceReview],
  ])
  const required = [
    ...new Set([
      ...(await tree(HERE)),
      join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-r21.test.mjs'),
      join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-r21-prior.test.mjs'),
      join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-r21-host.test.mjs'),
      ...fixed.keys(),
      ...prior.pinnedFiles,
    ]),
  ].sort()
  const additions = []
  for (const file of required) {
    const pin = await filePin(file, `r21:${relative(REPO, file)}`)
    if (fixed.has(file) && pin.sha256 !== fixed.get(file)) throw new Error('R21 exact TA04 or predecessor pin drift')
    additions.push(pin)
  }
  const missing = new Map(prior.historicalSources.map(item => [item.path, item]))
  if (missing.size !== 23 || prior.liveArtifacts.some(item => missing.has(item.path)))
    throw new Error('R21 historical classification collision')
  const historical = old.artifacts.map(item => ({
    ...item,
    purpose:
      item.purpose === 'matrix-canonical-backend'
        ? 'historical-r19-canonical-backend'
        : item.purpose === 'scoped-mcp-entry'
          ? 'historical-r19-scoped-entry'
          : item.purpose,
    ...(missing.has(item.path) ? { availability: 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED' } : {}),
  }))
  const artifacts = new Map(historical.map(item => [item.path, item]))
  if (artifacts.size !== historical.length) throw new Error('R19 duplicate artifact path')
  for (const pin of additions) {
    const previous = artifacts.get(pin.path)
    if (previous && previous.sha256 !== pin.sha256) throw new Error('R21 duplicate pin drift')
    if (!previous) artifacts.set(pin.path, pin)
  }
  const scoped = additions.find(item => item.path === join(HERE, 'scoped-entry.mjs'))
  if (!scoped) throw new Error('R21 scoped entry absent')
  artifacts.set(scoped.path, { ...scoped, purpose: 'scoped-mcp-entry' })
  const bundle = join(BUILD, 'canonical-bridge.mjs')
  if (artifacts.has(bundle)) throw new Error('R21 bundle path collision')
  const active = { path: bundle, purpose: 'matrix-canonical-backend', sha256: canonical.sha256 }
  const historicalPriorEvidence = structuredClone(old.priorEvidence)
  const priorEvidence = {
    ...historicalPriorEvidence,
    r19: { status: 'GATE_ONLY_REFUSED', rootAbsent: true, casesCompleted: 0 },
    allThreeRootsRetained: false,
    allFourRootsRetained: false,
    recordedHistoricalRootMetadata: historicalPriorEvidence,
    currentOriginalRootIdentity: 'UNKNOWN',
    currentOriginalRootContinuity: 'UNKNOWN',
    cleanupCause: 'UNKNOWN',
    sixHistoricalRootsCurrently: 'ABSENT_ENOENT',
    archiveBytes: 'VERIFIED_23_EXACT_COPIES',
  }
  const manifest = {
    ...structuredClone(old),
    version: 'appraise.m02-ta-matrix-r21/v1',
    root: POLICY.roots.T2,
    policyDigest: POLICY_DIGEST,
    amendedPolicyDigest: POLICY_DIGEST,
    recoveryProposalPath: PROPOSAL,
    recoveryProposalSha256: EXPECTED.proposal,
    rootAmendment: ROOT_AMENDMENT,
    artifacts: [active, ...artifacts.values()],
    canonicalRelocation: {
      ...old.canonicalRelocation,
      sourcePath: HISTORICAL_BUNDLE,
      originalSha256: canonical.originalSha256,
      stagedSha256: canonical.sha256,
      ...canonical.relocation,
      stagedCurrentWorkingDirectory: join(POLICY.roots.T2, 'supervisor'),
    },
    recoveryBudget: { ...old.recoveryBudget, priorR19GateOnlyNodeInvocations: 1 },
    priorEvidence,
    historicalAvailability: {
      predecessorManifestPath: HISTORICAL_MANIFEST,
      predecessorManifestSha256: EXPECTED.historicalManifest,
      predecessorEntries: 6521,
      currentPresentMatches: 6498,
      historicalSourceAbsentArchiveVerified: 23,
      archiveWitnesses: prior.historicalSources,
      currentOriginalRootIdentity: 'UNKNOWN',
      currentOriginalRootContinuity: 'UNKNOWN',
    },
    futureInvocation: { ...old.futureInvocation, priorR19GateOnlyRequired: true },
    r19GateOnlyEvidence: {
      manifestPath: HISTORICAL_MANIFEST,
      manifestSha256: EXPECTED.historicalManifest,
      exactReviewSha256: EXPECTED.r19Review,
      decisionSha256: EXPECTED.r19Decision,
      visibleResultSha256: EXPECTED.r19Result,
      actualReviewSha256: EXPECTED.r19ActualReview,
      sourceReviewSha256: EXPECTED.r19SourceReview,
    },
    ta04Authority: {
      proposal: { path: TA04, sha256: EXPECTED.ta04 },
      independentReview: { path: TA04_REVIEW, sha256: EXPECTED.ta04Review },
      userDecision: { path: TA04_DECISION, sha256: EXPECTED.ta04Decision },
      preservationSnapshot: { path: SNAPSHOT, sha256: EXPECTED.snapshot },
      archiveAvailability: { path: AVAILABILITY, sha256: EXPECTED.availability },
      frozenR20SourceReview: { path: R20_REVIEW, sha256: EXPECTED.r20Review },
      installedHostFileCurrentDevice: 16777233,
      installedHostFileHistoricalDevice: 16777230,
      processImageAttested: false,
    },
    runtimeAuthorized: false,
    evidenceClass: 'OFFLINE_R21_RECOVERY_CANDIDATE_EXACT_REVIEW_AND_NEW_USER_DECISION_REQUIRED',
  }
  if (
    manifest.artifacts.filter(item => item.purpose === 'matrix-canonical-backend').length !== 1 ||
    manifest.artifacts.filter(item => item.purpose === 'scoped-mcp-entry').length !== 1 ||
    manifest.artifacts.filter(item => item.availability === 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED').length !==
      23 ||
    manifest.cases.length !== 24 ||
    manifest.recoveryBudget.newT2Maximum.cases !== 24 ||
    manifest.recoveryBudget.cumulativeWholeCampaignCeilings.providerRequests !== 66 ||
    manifest.recoveryBudget.cumulativeWholeCampaignCeilings.sourceCapacity !== 78
  )
    throw new Error('R21 active purpose, case, or budget drift')
  return Object.freeze({
    manifest,
    manifestDigest: digest(manifest),
    canonicalBytes: canonical.bytes,
    canonicalSha256: canonical.sha256,
    blockers: [],
    runtimeEligible: false,
    seal: loadSealedRouteEvidence(),
  })
}
