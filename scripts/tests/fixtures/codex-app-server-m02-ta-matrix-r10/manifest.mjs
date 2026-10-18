/** Pure, read-only T2 manifest derivation. File output belongs to a reviewed --prepare command. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { POLICY, POLICY_DIGEST, digest } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { PHASE_OUTER_POLICY } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { buildMatrixCanonicalBytes } from './canonical-build.mjs'
import { PINNED_CODE_MODE_HOST } from '../codex-app-server-m02-ta-owned-host-observer/observer.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../../../')
const BUILD = path.join(REPO, '.appraisejs/m02-ta-matrix-build-r10')
const BASE = path.join(REPO, '.appraisejs/m02-ta-t1-build-r9/manifest.json')
const BASE_SHA = 'fd8385c4eeb3a168d15b30e3a3bf2afe585590d43c67bcdaa8da6ed64a84e5db'
const ADDON = path.join(REPO, '.appraisejs/m02-owned-host-observer-build-01/mac-owned-host.node')
const ADDON_SHA = '24d3ac3d109dbaecf1c044d68a6a9b5d697c630944a9f12d81084f41b985d763'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

async function filePin(file, purpose) {
  const state = await fs.lstat(file)
  if (!state.isFile() || state.isSymbolicLink()) throw new Error(`artifact type drift: ${purpose}`)
  return { path: file, purpose, sha256: sha(await fs.readFile(file)) }
}
async function tree(directory) {
  const items = []
  const walk = async current => {
    const state = await fs.lstat(current)
    if (state.isSymbolicLink()) throw new Error('runtime dependency symlink')
    if (state.isFile()) return items.push(current)
    if (!state.isDirectory()) throw new Error('runtime dependency special file')
    for (const item of await fs.readdir(current)) await walk(path.join(current, item))
  }
  await walk(directory)
  return items.sort()
}

export async function prepareMatrixManifest() {
  const state = await fs.lstat(BASE)
  if (!state.isFile() || state.isSymbolicLink()) throw new Error('historical manifest identity')
  const baseBytes = await fs.readFile(BASE)
  if (sha(baseBytes) !== BASE_SHA) throw new Error('historical R9 manifest drift')
  const base = JSON.parse(baseBytes)
  if (
    base.manifestDigest !== digest(base.manifest) ||
    base.manifest.phase !== 'T1' ||
    base.manifest.artifacts.length !== 6276
  )
    throw new Error('historical R9 manifest shape drift')
  for (const item of base.manifest.artifacts) {
    const current = await filePin(item.path, item.purpose)
    if (current.sha256 !== item.sha256) throw new Error(`historical artifact drift: ${item.purpose}`)
  }
  const seal = loadSealedRouteEvidence()
  if (seal.status !== 'SEALED_OFFLINE_ONLY') throw new Error('sealed T1 capture/profile drift')
  const required = [
    ...(await tree(HERE)),
    ...(await tree(path.join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-phase-r10'))),
    ...(await tree(path.join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-route-r10'))),
    ...(await tree(path.join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-codec-r10'))),
    ...(await tree(path.join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-native-plans-r10'))),
    path.join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-r10.test.mjs'),
    path.join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-protocol-r10.test.mjs'),
    path.join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-p00-protocol-r10.test.mjs'),
    path.join(REPO, 'scripts/tests/codex-app-server-m02-ta-phase-r10.test.mjs'),
    path.join(REPO, 'scripts/tests/codex-app-server-m02-ta-route-r10.test.mjs'),
    path.join(REPO, 'scripts/tests/codex-app-server-m02-ta-codec-r10.test.mjs'),
    path.join(REPO, 'scripts/tests/codex-app-server-m02-ta-native-plans-r10.test.mjs'),
    path.join(REPO, 'scripts/tests/codex-app-server-m02-ta-native-route-r10.test.mjs'),
    path.join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-owned-host-observer/observer.mjs'),
    path.join(REPO, 'packages/appraisejs/package.json'),
    ADDON,
    PINNED_CODE_MODE_HOST.path,
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/codex-package.json',
    path.join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-entrypoint-r10.test.mjs'),
    path.join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-startup-r10.test.mjs'),
  ]
  for (const directory of ['node_modules/esbuild', 'node_modules/@esbuild'])
    required.push(...(await tree(path.join(REPO, directory))))
  const newPins = []
  for (const file of [...new Set(required)].sort())
    newPins.push(await filePin(file, `matrix:${path.relative(REPO, file)}`))
  if (newPins.find(item => item.path === ADDON)?.sha256 !== ADDON_SHA) throw new Error('owned host addon pin drift')
  if (newPins.find(item => item.path === PINNED_CODE_MODE_HOST.path)?.sha256 !== PINNED_CODE_MODE_HOST.sha256)
    throw new Error('Code Mode host pin drift')
  if (
    newPins.find(item => item.path === '/Applications/ChatGPT.app/Contents/Resources/codex-cli/codex-package.json')
      ?.sha256 !== '558c7aabb05ccc87bdb8c8514f87659fec72929a39919c7156f8b8889f7589b3'
  )
    throw new Error('Code Mode package marker drift')
  const canonical = await buildMatrixCanonicalBytes()
  const generatedPin = {
    path: path.join(BUILD, 'canonical-bridge.mjs'),
    purpose: 'matrix-canonical-backend',
    sha256: canonical.sha256,
  }
  const scopedEntry = newPins.find(item => item.path === path.join(HERE, 'scoped-entry.mjs'))
  if (!scopedEntry) throw new Error('matrix scoped worker pin absent')
  const historical = base.manifest.artifacts.map(item => ({
    ...item,
    purpose: item.purpose === 'scoped-mcp-entry' ? 'historical-r9-scoped-entry' : item.purpose,
  }))
  const manifest = {
    version: 'appraise.m02-ta-matrix-r10/v1',
    policyDigest: POLICY_DIGEST,
    phase: 'T2',
    root: POLICY.roots.T2,
    cases: POLICY.cases.filter(item => item.phase === 'T2').map(item => item.id),
    artifacts: [
      { ...scopedEntry, purpose: 'scoped-mcp-entry' },
      generatedPin,
      ...newPins.filter(item => item.path !== scopedEntry.path),
      ...historical,
    ],
    sourceHostBudget: {
      maximum: 62,
      t2CapacityAllocation: 58,
      futureT3CapacityAllocation: 4,
      allPhaseOuterMaximum: PHASE_OUTER_POLICY.aggregateMaximum,
      auditRequestsMaximum: PHASE_OUTER_POLICY.auditRequestsAggregateMaximum,
      reservationEvidenceClass: 'SOURCE_BOUND_CAPACITY_RESERVED',
      actualShortLivedHostStarts: 'UNKNOWN',
      actualHostCountAttested: false,
    },
    canonicalRelocation: {
      originalSha256: canonical.originalSha256,
      stagedSha256: canonical.sha256,
      from: canonical.relocation.from,
      to: canonical.relocation.to,
      count: canonical.relocation.count,
      packageMetadataPath: path.join(REPO, 'packages/appraisejs/package.json'),
      migrationSourceRoot: path.join(REPO, 'prisma/migrations'),
      stagedCurrentWorkingDirectory: path.join(POLICY.roots.T2, 'supervisor'),
    },
    nativeFileCreationUmask: '0077',
    routeReview: 'SEALED_T1_CAPTURE_AND_SIX_OFFLINE_SDK_PROFILES_PREPARED_NOT_RUNTIME_QUALIFIED',
    runtimeAuthorized: false,
    evidenceClass: 'OFFLINE_PREPARED_EXACT_RUNTIME_REVIEW_REQUIRED',
  }
  return Object.freeze({
    manifest,
    manifestDigest: digest(manifest),
    blockers: [],
    runtimeEligible: false,
    canonicalBytes: canonical.bytes,
    canonicalSha256: canonical.sha256,
    seal,
  })
}
