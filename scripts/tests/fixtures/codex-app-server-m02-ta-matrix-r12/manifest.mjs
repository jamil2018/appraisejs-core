/** Read-only R12 T2 manifest derivation; the consumed R10/R11 preparation stays historical. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  verifyMatrixPreparation as verifyR10Preparation,
  MATRIX_MANIFEST as R10_MANIFEST,
} from '../codex-app-server-m02-ta-matrix-r10/preparation.mjs'
import { verifyR11HostFile } from '../codex-app-server-m02-ta-owned-host-observer-r11/observer.mjs'
import { buildMatrixCanonicalBytes } from './canonical-build.mjs'
import { verifyPriorT2Unknown } from './prior-evidence.mjs'
import { POLICY, POLICY_DIGEST, JOURNAL_BASE_POLICY_DIGEST, ROOT_AMENDMENT, digest } from './policy.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r12')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t2-recovery-01.md')
const R10_DIGEST = '69f6c17a7d1e0fddb3d2662b0ab6c5aaf1e125f38daca6b454e3cb3432235120'
const R10_SHA = '603d50d5b9afb3fb051d293e88fef87dfb68ef621dc0daac5b97e7a9ba4f7a7a'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

async function filePin(file, purpose) {
  const stat = await fs.lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`R12 pin type drift: ${purpose}`)
  return Object.freeze({ path: file, purpose, sha256: sha(await fs.readFile(file)) })
}
async function tree(dir) {
  const output = []
  const walk = async path => {
    const state = await fs.lstat(path)
    if (state.isSymbolicLink()) throw new Error('R12 source symlink')
    if (state.isFile()) return output.push(path)
    if (!state.isDirectory()) throw new Error('R12 source special file')
    for (const name of await fs.readdir(path)) await walk(join(path, name))
  }
  await walk(dir)
  return output.sort()
}

export async function prepareR12MatrixManifest() {
  const [old, prior, host, canonical] = await Promise.all([
    verifyR10Preparation(),
    verifyPriorT2Unknown(),
    verifyR11HostFile(),
    buildMatrixCanonicalBytes(),
  ])
  if (
    old.manifestDigest !== R10_DIGEST ||
    old.manifestFileSha256 !== R10_SHA ||
    old.manifest.phase !== 'T2' ||
    old.manifest.root !== ROOT_AMENDMENT.from ||
    old.manifest.artifacts.length !== 6337 ||
    prior.status !== 'PRIOR_T2_UNKNOWN_PRESERVED' ||
    host.uid !== 502 ||
    host.processImageAttested !== false
  )
    throw new Error('R12 predecessor or installed host drift')
  const required = [
    ...(await tree(HERE)),
    ...(await tree(join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-owned-host-observer-r11'))),
    join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-r12.test.mjs'),
    join(REPO, 'scripts/tests/codex-app-server-m02-ta-owned-host-observer-r11.test.mjs'),
    join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r11/entrypoint.mjs'),
    join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-entrypoint-r11.test.mjs'),
    R10_MANIFEST,
    PROPOSAL,
    ...prior.pinnedFiles,
  ]
  const pins = []
  for (const file of [...new Set(required)].sort()) pins.push(await filePin(file, `r12:${relative(REPO, file)}`))
  if (
    pins.find(pin => pin.path === R10_MANIFEST)?.sha256 !== R10_SHA ||
    pins.find(pin => pin.path.endsWith('/codex-app-server-m02-ta-matrix-r11/entrypoint.mjs'))?.sha256 !==
      'f981a80cd7e50ef690589ca0061ab8b599699acaedc4920b9dcc46ddc5cc957e' ||
    pins.find(pin => pin.path.endsWith('/codex-app-server-m02-ta-matrix-entrypoint-r11.test.mjs'))?.sha256 !==
      '8e0ba9feac57bf6c50b485e9e5faf6310501e1432544dc9f21cb36151717e704'
  )
    throw new Error('R12 accepted source or manifest drift')
  const scoped = pins.find(pin => pin.path === join(HERE, 'scoped-entry.mjs'))
  const proposal = pins.find(pin => pin.path === PROPOSAL)
  if (!scoped) throw new Error('R12 scoped entry pin absent')
  if (!proposal) throw new Error('R12 recovery proposal pin absent')
  const historical = old.manifest.artifacts.map(pin => ({
    ...pin,
    purpose:
      pin.purpose === 'matrix-canonical-backend'
        ? 'historical-r10-canonical-backend'
        : pin.purpose === 'scoped-mcp-entry'
          ? 'historical-r10-scoped-entry'
          : pin.purpose,
  }))
  const paths = [...historical, ...pins].map(pin => pin.path)
  if (new Set(paths).size !== paths.length) throw new Error('R12 duplicate pin path')
  const manifest = {
    version: 'appraise.m02-ta-matrix-r12/v1',
    phase: 'T2',
    root: POLICY.roots.T2,
    policyDigest: POLICY_DIGEST,
    amendedPolicyDigest: POLICY_DIGEST,
    basePolicyDigest: JOURNAL_BASE_POLICY_DIGEST,
    journalBasePolicyDigest: JOURNAL_BASE_POLICY_DIGEST,
    recoveryProposalPath: PROPOSAL,
    recoveryProposalSha256: proposal.sha256,
    rootAmendment: ROOT_AMENDMENT,
    cases: [...old.manifest.cases],
    artifacts: [
      { ...scoped, purpose: 'scoped-mcp-entry' },
      { path: join(BUILD, 'canonical-bridge.mjs'), purpose: 'matrix-canonical-backend', sha256: canonical.sha256 },
      ...pins.filter(pin => pin.path !== scoped.path),
      ...historical,
    ],
    canonicalRelocation: {
      sourcePath: old.manifest.artifacts.find(pin => pin.purpose === 'matrix-canonical-backend')?.path,
      originalSha256: canonical.originalSha256,
      stagedSha256: canonical.sha256,
      ...canonical.relocation,
      packageMetadataPath: old.manifest.canonicalRelocation.packageMetadataPath,
      migrationSourceRoot: old.manifest.canonicalRelocation.migrationSourceRoot,
      stagedCurrentWorkingDirectory: join(POLICY.roots.T2, 'supervisor'),
    },
    sourceHostBudget: old.manifest.sourceHostBudget,
    recoveryBudget: {
      oldT2Unknown: prior.consumed,
      oldT2SourceCapacityReserved: 4,
      newT2Maximum: { cases: 24, listenerStarts: 24, controlWrites: 96, sourceCapacity: 58 },
      cumulativeT2Ceilings: { listenerStarts: 25, controlWrites: 97, sourceCapacity: 62 },
      cumulativeWholeCampaignCeilings: { listenerStarts: 28, controlWrites: 109, sourceCapacity: 66 },
      oldCommandConsumed: true,
      newInvocationRequiresSeparateExplicitUserDecision: true,
    },
    priorEvidence: {
      archiveIndexSha256: prior.archiveIndexSha256,
      actualReviewSha256: prior.reviewSha256,
      oldJournalSha256: prior.journalSha256,
      oldRootStatus: 'UNKNOWN',
      oldRootIdentityPreserved: true,
    },
    installedCodeModeHost: {
      path: host.path,
      sha256: host.sha256,
      uid: host.uid,
      mode: host.mode,
      nlink: host.nlink,
      dev: host.dev,
      ino: host.ino,
      evidenceClass: host.evidenceClass,
      processImageAttested: false,
    },
    nativeFileCreationUmask: '0077',
    routeReview: old.manifest.routeReview,
    runtimeAuthorized: false,
    evidenceClass: 'OFFLINE_R12_RECOVERY_CANDIDATE_EXACT_REVIEW_AND_NEW_USER_DECISION_REQUIRED',
  }
  return Object.freeze({
    manifest,
    manifestDigest: digest(manifest),
    canonicalBytes: canonical.bytes,
    canonicalSha256: canonical.sha256,
    blockers: [],
    runtimeEligible: false,
    seal: old.seal,
  })
}
