/** Exact R23 derivation: frozen R22 provenance plus one explicitly qualified current version. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyR22Predecessor } from './r22-evidence.mjs'
import { readStableFile } from './r21-evidence.mjs'
import { verifyR23HostFile } from './host-file.mjs'
import { buildR23CanonicalBytes, HISTORICAL_BUNDLE } from './canonical-build.mjs'
import { ROOT_PACKAGE, OLD_PACKAGE_SHA, CURRENT_PACKAGE_SHA } from './package-qualification.mjs'
import { POLICY, POLICY_DIGEST, ROOT_AMENDMENT, digest } from './policy.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
const HERE = dirname(fileURLToPath(import.meta.url)),
  REPO = resolve(HERE, '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r23')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t2-recovery-08.md')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
async function pin(file) {
  return { path: file, purpose: `r23:${relative(REPO, file)}`, sha256: sha(await readStableFile(file)) }
}
async function tree(dir, count) {
  const names = await fs.readdir(dir)
  if (names.length !== count || names.some(name => !/^[a-z0-9-]+\.mjs$/.test(name)))
    throw new Error('R23 source membership drift')
  return names.sort().map(name => join(dir, name))
}
export async function prepareR23MatrixManifest() {
  const [predecessor, host, canonical] = await Promise.all([
    verifyR22Predecessor(),
    verifyR23HostFile(),
    buildR23CanonicalBytes(),
  ])
  if (host.processImageAttested !== false) throw new Error('R23 unexpected host attestation')
  const old = predecessor.manifest,
    qualification = predecessor.packageQualification
  const files = new Set([
    ...(await tree(HERE, 26)),
    ...(await tree(join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r23-offline'), 2)),
    ...(await tree(join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r23-composed'), 2)),
    ...['cases', 'prior', 'composed'].map(name =>
      join(REPO, `scripts/tests/codex-app-server-m02-ta-matrix-r23-${name}.test.mjs`),
    ),
    ...predecessor.pinnedFiles,
    PROPOSAL,
    qualification.predecessorBytes.path,
    qualification.currentSnapshot.path,
    qualification.proposal.path,
    qualification.decision.path,
    qualification.index.path,
    join(REPO, '.appraisejs/m02-r22-resume-checkout-delta-01.json'),
  ])
  await readStableFile(
    join(REPO, '.appraisejs/m02-r22-resume-checkout-delta-01.json'),
    '8deca1a189581553cc644054c90eff3b4bcd4d6303b9e403b64c41f44736232f',
  )
  const additions = []
  for (const file of [...files].sort()) additions.push(await pin(file))
  const artifacts = new Map()
  for (const row of old.artifacts) {
    if (artifacts.has(row.path)) throw new Error('R23 predecessor duplicate pin')
    const next = {
      ...row,
      purpose:
        row.purpose === 'matrix-canonical-backend'
          ? 'historical-r22-canonical-backend'
          : row.purpose === 'scoped-mcp-entry'
            ? 'historical-r22-scoped-entry'
            : row.purpose,
    }
    if (row.path === ROOT_PACKAGE) {
      if (row.sha256 !== OLD_PACKAGE_SHA || row.availability !== undefined)
        throw new Error('R23 predecessor package identity drift')
      next.sha256 = CURRENT_PACKAGE_SHA
    }
    artifacts.set(row.path, next)
  }
  for (const row of additions) {
    const existing = artifacts.get(row.path)
    if (existing && existing.sha256 !== row.sha256) throw new Error('R23 additional pin contradiction')
    if (!existing) artifacts.set(row.path, row)
  }
  const scoped = artifacts.get(join(HERE, 'scoped-entry.mjs'))
  if (!scoped) throw new Error('R23 scoped source absent')
  artifacts.set(scoped.path, { ...scoped, purpose: 'scoped-mcp-entry' })
  const active = {
    path: join(BUILD, 'canonical-bridge.mjs'),
    purpose: 'matrix-canonical-backend',
    sha256: canonical.sha256,
  }
  if (artifacts.has(active.path)) throw new Error('R23 output collision')
  const proposal = additions.find(row => row.path === PROPOSAL)
  const manifest = {
    ...structuredClone(old),
    version: 'appraise.m02-ta-matrix-r23/v1',
    root: POLICY.roots.T2,
    policyDigest: POLICY_DIGEST,
    amendedPolicyDigest: POLICY_DIGEST,
    rootAmendment: ROOT_AMENDMENT,
    artifacts: [active, ...artifacts.values()],
    recoveryProposalPath: PROPOSAL,
    recoveryProposalSha256: proposal.sha256,
    canonicalRelocation: {
      ...old.canonicalRelocation,
      sourcePath: HISTORICAL_BUNDLE,
      originalSha256: canonical.originalSha256,
      stagedSha256: canonical.sha256,
      ...canonical.relocation,
      stagedCurrentWorkingDirectory: join(POLICY.roots.T2, 'supervisor'),
    },
    rootPackageQualification: qualification,
    r22BlockedEvidence: predecessor.blockedEvidence,
    checkoutEvolution: {
      historicalBaselineFiles: 3349,
      currentBaselineMatchesAtObservation: 3325,
      committedHarnessDriftEntries: 24,
      observationPath: join(REPO, '.appraisejs/m02-r22-resume-checkout-delta-01.json'),
      observationSha256: '8deca1a189581553cc644054c90eff3b4bcd4d6303b9e403b64c41f44736232f',
      originalBaselineRewritten: false,
      effectiveHostProperties: 'UNATTESTED',
    },
    priorEvidence: {
      ...structuredClone(old.priorEvidence),
      r22: { status: 'APPROVED_BLOCKED_BEFORE_PRECHECK', nativeAllocationsConsumed: 0, p8Absent: true },
    },
    historicalAvailability: {
      ...structuredClone(old.historicalAvailability),
      predecessorR22ManifestPath: join(REPO, '.appraisejs/m02-ta-matrix-build-r22/manifest.json'),
      predecessorR22ManifestSha256: 'a35aef1ffe9e5dda2c9108195d7f01e6b879df6f4ea963d3355772d2ce69ddd6',
      predecessorR22Entries: 6628,
      predecessorCurrentPinsMatchingBeforeTA05: 6604,
      currentRootPackageRequalifiedByTA05: 1,
      ancestorR19CurrentPinsMatchingOriginalHashes: 6497,
      historicalSnapshotCountsAreNotCurrentRehashClaims: true,
    },
    evidenceClass: 'OFFLINE_R23_TA05_CANDIDATE_EXACT_REVIEW_AND_NEW_USER_DECISION_REQUIRED',
    runtimeAuthorized: false,
  }
  if (
    manifest.artifacts.filter(x => x.purpose === 'matrix-canonical-backend').length !== 1 ||
    manifest.artifacts.filter(x => x.purpose === 'scoped-mcp-entry').length !== 1 ||
    manifest.artifacts.filter(x => x.availability === 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED').length !== 23 ||
    manifest.recoveryBudget.cumulativeWholeCampaignCeilings.listenerStarts !== 32 ||
    manifest.recoveryBudget.cumulativeWholeCampaignCeilings.sourceCapacity !== 82 ||
    manifest.recoveryBudget.combinedListenerAllocationCeilingIncludingR16 !== 33
  )
    throw new Error('R23 composition drift')
  // Original observations remain in their frozen manifests; current equality counts are scoped explicitly.
  manifest.historicalAvailability.recordedSnapshotMatches = {
    r19: old.historicalAvailability.currentPresentMatches,
    r21: old.historicalAvailability.currentPresentR21Matches,
  }
  manifest.historicalAvailability.currentMatchesOriginalHashes = { r19: 6497, r21: 6560, r22: 6604 }
  manifest.historicalAvailability.qualifiedCurrentVersions = 1
  delete manifest.historicalAvailability.currentPresentMatches
  delete manifest.historicalAvailability.currentPresentR21Matches
  await readStableFile(PROPOSAL, proposal.sha256)
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
