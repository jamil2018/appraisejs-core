/** Read-only T3 manifest derivation. The accepted T2 run is a strict prerequisite. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { POLICY, POLICY_DIGEST, digest } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { verifyMatrixPreparation } from '../codex-app-server-m02-ta-matrix-r10/preparation.mjs'
import { verifyAcceptedT2Evidence } from './prior-t2.mjs'
import { NATIVE_PINS } from '../codex-app-server-m02-ta-native-plans-r10/plans.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const PACKAGE_MARKER = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/codex-package.json'
const PACKAGE_MARKER_SHA = '558c7aabb05ccc87bdb8c8514f87659fec72929a39919c7156f8b8889f7589b3'
export const T3_HELPER_BLOCKER = 'N01_HELPER_LIFETIME_OBSERVATION_UNAVAILABLE'

async function ownPin(file, purpose, requireOwner = true) {
  const state = await fs.lstat(file)
  if (
    !state.isFile() ||
    state.isSymbolicLink() ||
    (requireOwner && state.uid !== process.getuid()) ||
    (state.mode & 0o022) !== 0
  )
    throw new Error(`T3 source pin identity: ${purpose}`)
  return Object.freeze({ path: file, purpose, sha256: sha(await fs.readFile(file)) })
}

export async function prepareWorkspaceManifest() {
  const t2 = await verifyMatrixPreparation()
  if (
    t2.manifest.phase !== 'T2' ||
    t2.manifest.root !== POLICY.roots.T2 ||
    t2.manifest.cases.length !== 24 ||
    t2.manifest.nativeFileCreationUmask !== '0077'
  )
    throw new Error('accepted T2 preparation shape changed')
  const prior = await verifyAcceptedT2Evidence({
    manifestDigest: t2.manifestDigest,
    manifestFileSha256: t2.manifestFileSha256,
  })
  const files = (await fs.readdir(HERE)).filter(name => name.endsWith('.mjs')).sort()
  const own = []
  for (const name of files) own.push(await ownPin(join(HERE, name), `workspace:${name}`))
  own.push(
    await ownPin(join(REPO, 'scripts/tests/codex-app-server-m02-ta-workspace-r10.test.mjs'), 'workspace:offline-tests'),
  )
  const marker = await ownPin(PACKAGE_MARKER, 'installed-codex-package-marker', false)
  if (marker.sha256 !== PACKAGE_MARKER_SHA) throw new Error('installed Code Mode package marker changed')
  for (const pin of Object.values(NATIVE_PINS)) {
    const current = await ownPin(pin.path, `native-helper:${pin.path}`, false)
    if (current.sha256 !== pin.sha256) throw new Error('native helper source pin changed')
    own.push(current)
  }
  const scoped = own.find(item => item.path === join(HERE, 'scoped-entry.mjs'))
  if (!scoped) throw new Error('T3 scoped child entry missing')
  const historical = t2.manifest.artifacts.map(item => ({
    ...item,
    purpose: item.purpose === 'scoped-mcp-entry' ? 'historical-t2-scoped-entry' : item.purpose,
  }))
  const candidates = [
    { ...scoped, purpose: 'scoped-mcp-entry' },
    ...own.filter(item => item.path !== scoped.path),
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
    version: 'appraise.m02-ta-workspace-r10/v1',
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
      casesCompleted: prior.casesCompleted,
      unresolvedUnknown: prior.unresolvedUnknown,
    },
    sourceHostBudget: {
      t3CapacityAllocation: 4,
      t3OuterMaximum: 2,
      nativeHelpersSourceMaximum: 2,
      actualShortLivedHostStarts: 'UNKNOWN',
      actualNativeHelperStarts: 'UNKNOWN',
      actualHostCountAttested: false,
    },
    nativeFileCreationUmask: '0077',
    routeReview: 'SEALED_T1_CAPTURE_WITH_NATIVE_DESCRIPTOR_VARIANTS_PREPARED_NOT_RUNTIME_QUALIFIED',
    runtimeAuthorized: false,
    blockers: [T3_HELPER_BLOCKER],
    evidenceClass: 'OFFLINE_PREPARED_EXACT_RUNTIME_REVIEW_REQUIRED',
  })
  return Object.freeze({
    manifest,
    manifestDigest: digest(manifest),
    seal: t2.seal,
    canonicalSha256: t2.canonicalSha256,
    blockers: [T3_HELPER_BLOCKER],
    runtimeEligible: false,
  })
}
