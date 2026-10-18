/** Pure R19 manifest derivation from the fixed 6,470-pin R17 envelope. */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyR11HostFile } from '../codex-app-server-m02-ta-owned-host-observer-r11/observer.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { verifyConsumedPreflights } from '../codex-app-server-m02-ta-matrix-r17/preflight-evidence.mjs'
import { buildR19CanonicalBytes, HISTORICAL_BUNDLE, HISTORICAL_SHA } from './canonical-build.mjs'
import { verifyConsumedR17 } from './prior-evidence.mjs'
import { POLICY, POLICY_DIGEST, ROOT_AMENDMENT, digest } from './policy.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r19')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t2-recovery-04.md')
const DESIGN = join(REPO, '.appraisejs/m02-ta-t2-r19-design-review-01.json')
const STAGE_CLARIFICATION = join(REPO, 'tasks/codex-app-server-journeys/m02-ta-r19-stage-instrumentation-01.md')
const STAGE_REVIEW = join(REPO, '.appraisejs/m02-ta-r19-stage-design-review-01.json')
const R18_REVIEW = join(REPO, '.appraisejs/m02-ta-continuation-r18-exact-review-01.json')
const R18_REPORT = join(REPO, 'tasks/codex-app-server-journeys/m02-ta-continuation-offline-01.md')
const R18_SESSION = join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-continuation-r18/script-session.mjs')
const R18_FIXTURE = join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-continuation-r18/synthetic-session.mjs')
const R18_TEST = join(REPO, 'scripts/tests/codex-app-server-m02-ta-continuation-r18.test.mjs')
const EXPECTED = Object.freeze({
  r17Manifest: '1152b718d331be89c4c2c49227effd8d9435a2b4062dc01f24e33006ec854124',
  r17Digest: 'f66dcb2379ef2deb4f9e4076b13a31d0e7377a80de49ecf0873b18a716e8d871',
  proposal: 'bc71a8f227ca2746bded21517c5f73ef044b1eca8cd90d8db20a171e73a04c7e',
  design: 'cc86bc264e65c8e420c54ab2f2ea8194462644a8e91db3ef0849d42b0fdd2d82',
  stageClarification: '23dd705d58b4b6d8679a98bb86d324acc03e162c0a2d43b61662cbcfc5bddc0d',
  stageReview: 'db55c2bd8d66a7ef19a992cde1546fe4dfd71713ab8714e05753a4f773755c67',
  r18Review: '69dcba1bc3d8a28c16103eeface66bac42f5c8739243e281cd1f2d7962ddd163',
  r18Report: 'b790ba7b8a0af750f9ae2b93b13266fd2659b04008b44a089ec2da4b7b8267bf',
  r18Session: '72de195fec5ab975b827761fd2f4ea7994001d47b27b36e88e9f1c02c2c671fe',
  r18Fixture: '2264c9fea1623a859d25f3e151b851c4f41d056f8b4c0e872fcf16ba770d65fc',
  r18Test: '7fe6767bf482b2382bbf753a7f68be76c6264d47293d14ed20fb12a0958abfb8',
})
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs'].every(key => a[key] === b[key])

async function filePin(file, purpose) {
  const before = await fs.lstat(file)
  if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o022) !== 0)
    throw new Error('R19 pin identity drift')
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    if (!same(before, await handle.stat())) throw new Error('R19 pin replaced before read')
    const bytes = await handle.readFile()
    if (!same(before, await handle.stat()) || !same(before, await fs.lstat(file)) || bytes.length !== before.size)
      throw new Error('R19 pin changed during read')
    return Object.freeze({ path: file, purpose, sha256: sha(bytes) })
  } finally {
    await handle.close()
  }
}

async function tree(directory) {
  const found = []
  const walk = async file => {
    const state = await fs.lstat(file)
    if (state.isSymbolicLink()) throw new Error('R19 source symlink')
    if (state.isFile()) return found.push(file)
    if (!state.isDirectory()) throw new Error('R19 source special file')
    for (const name of await fs.readdir(file)) await walk(join(file, name))
  }
  await walk(directory)
  return found.sort()
}

export async function prepareR19MatrixManifest() {
  const [prior, preflight, host, canonical] = await Promise.all([
    verifyConsumedR17(),
    verifyConsumedPreflights(),
    verifyR11HostFile(),
    buildR19CanonicalBytes(),
  ])
  const old = prior.manifest
  if (
    prior.status !== 'PRIOR_P1_P2_P3_P4_UNKNOWN_PRESERVED' ||
    old.version !== 'appraise.m02-ta-matrix-r17/v1' ||
    old.root !== ROOT_AMENDMENT.from ||
    old.policyDigest !== ROOT_AMENDMENT.priorPolicyDigest ||
    old.artifacts.length !== 6470 ||
    old.artifacts.filter(item => item.sha256 === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
      .length !== 16 ||
    old.artifacts.filter(item => item.purpose === 'matrix-canonical-backend').length !== 1 ||
    old.artifacts.filter(item => item.purpose === 'scoped-mcp-entry').length !== 1 ||
    old.artifacts.find(item => item.purpose === 'matrix-canonical-backend')?.path !== HISTORICAL_BUNDLE ||
    old.artifacts.find(item => item.purpose === 'matrix-canonical-backend')?.sha256 !== HISTORICAL_SHA ||
    canonical.originalSha256 !== HISTORICAL_SHA ||
    preflight.status !== 'R15_UNKNOWN_R16_CLI_OBSERVED_PERMISSION_CHECK_ONLY' ||
    host.processImageAttested !== false
  )
    throw new Error('R19 predecessor drift')
  for (const pin of old.artifacts) {
    const current = await filePin(pin.path, pin.purpose)
    if (current.sha256 !== pin.sha256) throw new Error('R19 inherited artifact drift')
  }
  const fixed = new Map([
    [PROPOSAL, EXPECTED.proposal],
    [DESIGN, EXPECTED.design],
    [STAGE_CLARIFICATION, EXPECTED.stageClarification],
    [STAGE_REVIEW, EXPECTED.stageReview],
    [R18_REVIEW, EXPECTED.r18Review],
    [R18_REPORT, EXPECTED.r18Report],
    [R18_SESSION, EXPECTED.r18Session],
    [R18_FIXTURE, EXPECTED.r18Fixture],
    [R18_TEST, EXPECTED.r18Test],
  ])
  const additions = []
  const required = [
    ...new Set([
      ...(await tree(HERE)),
      join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-r19.test.mjs'),
      join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-r19-provider-failure.test.mjs'),
      ...fixed.keys(),
      ...prior.pinnedFiles,
      ...preflight.pinnedFiles,
    ]),
  ].sort()
  for (const file of required) {
    const pin = await filePin(file, `r19:${relative(REPO, file)}`)
    if (fixed.has(file) && pin.sha256 !== fixed.get(file)) throw new Error('R19 design or R18 exact pin drift')
    additions.push(pin)
  }
  const historical = old.artifacts.map(item => ({
    ...item,
    purpose:
      item.purpose === 'matrix-canonical-backend'
        ? 'historical-r17-canonical-backend'
        : item.purpose === 'scoped-mcp-entry'
          ? 'historical-r17-scoped-entry'
          : item.purpose,
  }))
  const artifacts = new Map(historical.map(item => [item.path, item]))
  if (artifacts.size !== historical.length) throw new Error('R17 duplicate artifact path')
  for (const pin of additions) {
    const previous = artifacts.get(pin.path)
    if (previous && previous.sha256 !== pin.sha256) throw new Error('R19 duplicate pin drift')
    if (!previous) artifacts.set(pin.path, pin)
  }
  const scoped = additions.find(item => item.path === join(HERE, 'scoped-entry.mjs'))
  if (!scoped) throw new Error('R19 scoped entry absent')
  artifacts.set(scoped.path, { ...scoped, purpose: 'scoped-mcp-entry' })
  const bundle = join(BUILD, 'canonical-bridge.mjs')
  if (artifacts.has(bundle)) throw new Error('R19 bundle path collision')
  const active = { path: bundle, purpose: 'matrix-canonical-backend', sha256: canonical.sha256 }
  const manifest = {
    ...structuredClone(old),
    version: 'appraise.m02-ta-matrix-r19/v1',
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
      priorP4Unknown: prior.p4.consumed,
      cumulativeWholeCampaignCeilings: {
        codexStarts: 29,
        mcpStarts: 29,
        threadStarts: 29,
        turnStarts: 28,
        providerRequests: 66,
        scopedCalls: 34,
        workspaceActions: 2,
        permissionReplies: 1,
        listenerStarts: 31,
        controlWrites: 115,
        outerCalls: 39,
        canonicalRequests: 194,
        sourceCapacity: 78,
      },
      combinedListenerAllocationCeilingIncludingR16: 32,
    },
    priorEvidence: {
      ...old.priorEvidence,
      p4: { ...prior.p4, status: 'UNKNOWN' },
      allFourRootsRetained: true,
    },
    futureInvocation: {
      ...old.futureInvocation,
      priorUnknownsRequired: ['p1', 'p2', 'p3', 'p4'],
    },
    stageInstrumentation: {
      clarificationPath: STAGE_CLARIFICATION,
      clarificationSha256: EXPECTED.stageClarification,
      designReviewPath: STAGE_REVIEW,
      designReviewSha256: EXPECTED.stageReview,
      parentR18SessionPath: R18_SESSION,
      parentR18SessionSha256: EXPECTED.r18Session,
    },
    r18Review: { path: R18_REVIEW, sha256: EXPECTED.r18Review, reportSha256: EXPECTED.r18Report },
    runtimeAuthorized: false,
    evidenceClass: 'OFFLINE_R19_RECOVERY_CANDIDATE_EXACT_REVIEW_AND_NEW_USER_DECISION_REQUIRED',
  }
  if (
    manifest.artifacts.filter(item => item.purpose === 'matrix-canonical-backend').length !== 1 ||
    manifest.artifacts.filter(item => item.purpose === 'scoped-mcp-entry').length !== 1 ||
    manifest.cases.length !== 24 ||
    manifest.recoveryBudget.newT2Maximum.cases !== 24
  )
    throw new Error('R19 active purpose or case drift')
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
