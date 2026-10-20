/** Pure R20 derivation from the pinned, consumed 6,521-artifact R19 envelope. */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyR11HostFile } from '../codex-app-server-m02-ta-owned-host-observer-r11/observer.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { buildR20CanonicalBytes, HISTORICAL_BUNDLE, HISTORICAL_SHA } from './canonical-build.mjs'
import { verifyConsumedR19 } from './prior-evidence.mjs'
import { POLICY, POLICY_DIGEST, PRIOR_ROOT, ROOT_AMENDMENT, digest } from './policy.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r20')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t2-recovery-05.md')
const DESIGN = join(REPO, '.appraisejs/m02-ta-t2-r20-design-review-01.json')
const HISTORICAL_MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r19/manifest.json')
const R19_REVIEW = join(REPO, '.appraisejs/m02-t2-r19-exact-review.json')
const R19_DECISION = join(REPO, '.appraisejs/m02-t2-r19-recovery-user-decision.json')
const R19_RESULT = join(REPO, '.appraisejs/m02-t2-r19-execution-result-01.json')
const R19_ACTUAL_REVIEW = join(REPO, '.appraisejs/m02-t2-r19-execution-review-01.json')
const R19_SOURCE_REVIEW = join(REPO, '.appraisejs/m02-ta-matrix-r19-source-review-01.json')
const EXPECTED = Object.freeze({
  proposal: 'e9be70c933fa188a74ffe464494bc5768089a812754217d4b9e48a3839a540c6',
  design: '96774f00ab14ba42d39b8da482f05a495eb82276b4bb931b8928cd83fdff1d64',
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
    throw new Error('R20 pin identity drift')
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    if (!same(before, await handle.stat())) throw new Error('R20 pin replaced before read')
    const bytes = await handle.readFile()
    if (!same(before, await handle.stat()) || !same(before, await fs.lstat(file)) || bytes.length !== before.size)
      throw new Error('R20 pin changed during read')
    return Object.freeze({ path: file, purpose, sha256: sha(bytes) })
  } finally {
    await handle.close()
  }
}

async function tree(directory) {
  const found = []
  const walk = async file => {
    const state = await fs.lstat(file)
    if (state.isSymbolicLink()) throw new Error('R20 source symlink')
    if (state.isFile()) return found.push(file)
    if (!state.isDirectory()) throw new Error('R20 source special file')
    for (const name of await fs.readdir(file)) await walk(join(file, name))
  }
  await walk(directory)
  return found.sort()
}

export async function prepareR20MatrixManifest() {
  const [prior, host, canonical] = await Promise.all([
    verifyConsumedR19(),
    verifyR11HostFile(),
    buildR20CanonicalBytes(),
  ])
  const old = prior.manifest
  if (
    prior.status !== 'PRIOR_P1_P2_P3_P4_UNKNOWN_R19_GATE_ONLY_RETAINED' ||
    prior.r19?.manifestSha256 !== EXPECTED.historicalManifest ||
    old.version !== 'appraise.m02-ta-matrix-r19/v1' ||
    old.root !== PRIOR_ROOT ||
    old.policyDigest !== ROOT_AMENDMENT.priorPolicyDigest ||
    old.artifacts.length !== 6521 ||
    old.artifacts.filter(item => item.sha256 === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
      .length !== 16 ||
    old.artifacts.filter(item => item.purpose === 'matrix-canonical-backend').length !== 1 ||
    old.artifacts.filter(item => item.purpose === 'scoped-mcp-entry').length !== 1 ||
    canonical.originalSha256 !== HISTORICAL_SHA ||
    host.processImageAttested !== false
  )
    throw new Error('R20 predecessor drift')
  for (const pin of old.artifacts) {
    const current = await filePin(pin.path, pin.purpose)
    if (current.sha256 !== pin.sha256) throw new Error('R20 inherited artifact drift')
  }
  const fixed = new Map([
    [PROPOSAL, EXPECTED.proposal],
    [DESIGN, EXPECTED.design],
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
      join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-r20.test.mjs'),
      join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-r20-prior.test.mjs'),
      ...fixed.keys(),
      ...prior.pinnedFiles,
    ]),
  ].sort()
  const additions = []
  for (const file of required) {
    const pin = await filePin(file, `r20:${relative(REPO, file)}`)
    if (fixed.has(file) && pin.sha256 !== fixed.get(file)) throw new Error('R20 exact design or predecessor pin drift')
    additions.push(pin)
  }
  const historical = old.artifacts.map(item => ({
    ...item,
    purpose:
      item.purpose === 'matrix-canonical-backend'
        ? 'historical-r19-canonical-backend'
        : item.purpose === 'scoped-mcp-entry'
          ? 'historical-r19-scoped-entry'
          : item.purpose,
  }))
  const artifacts = new Map(historical.map(item => [item.path, item]))
  if (artifacts.size !== historical.length) throw new Error('R19 duplicate artifact path')
  for (const pin of additions) {
    const previous = artifacts.get(pin.path)
    if (previous && previous.sha256 !== pin.sha256) throw new Error('R20 duplicate pin drift')
    if (!previous) artifacts.set(pin.path, pin)
  }
  const scoped = additions.find(item => item.path === join(HERE, 'scoped-entry.mjs'))
  if (!scoped) throw new Error('R20 scoped entry absent')
  artifacts.set(scoped.path, { ...scoped, purpose: 'scoped-mcp-entry' })
  const bundle = join(BUILD, 'canonical-bridge.mjs')
  if (artifacts.has(bundle)) throw new Error('R20 bundle path collision')
  const active = { path: bundle, purpose: 'matrix-canonical-backend', sha256: canonical.sha256 }
  const manifest = {
    ...structuredClone(old),
    version: 'appraise.m02-ta-matrix-r20/v1',
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
    recoveryBudget: {
      ...old.recoveryBudget,
      priorR19GateOnlyNodeInvocations: 1,
    },
    priorEvidence: {
      ...old.priorEvidence,
      r19: { status: 'GATE_ONLY_REFUSED', rootAbsent: true, casesCompleted: 0 },
      allFourRootsRetained: true,
    },
    futureInvocation: {
      ...old.futureInvocation,
      priorR19GateOnlyRequired: true,
    },
    r19GateOnlyEvidence: {
      manifestPath: HISTORICAL_MANIFEST,
      manifestSha256: EXPECTED.historicalManifest,
      exactReviewSha256: EXPECTED.r19Review,
      decisionSha256: EXPECTED.r19Decision,
      visibleResultSha256: EXPECTED.r19Result,
      actualReviewSha256: EXPECTED.r19ActualReview,
      sourceReviewSha256: EXPECTED.r19SourceReview,
    },
    r20Design: { path: DESIGN, sha256: EXPECTED.design },
    runtimeAuthorized: false,
    evidenceClass: 'OFFLINE_R20_RECOVERY_CANDIDATE_EXACT_REVIEW_AND_NEW_USER_DECISION_REQUIRED',
  }
  if (
    manifest.artifacts.filter(item => item.purpose === 'matrix-canonical-backend').length !== 1 ||
    manifest.artifacts.filter(item => item.purpose === 'scoped-mcp-entry').length !== 1 ||
    manifest.cases.length !== 24 ||
    manifest.recoveryBudget.newT2Maximum.cases !== 24 ||
    manifest.recoveryBudget.cumulativeWholeCampaignCeilings.providerRequests !== 66 ||
    manifest.recoveryBudget.cumulativeWholeCampaignCeilings.sourceCapacity !== 78
  )
    throw new Error('R20 active purpose, case, or budget drift')
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
