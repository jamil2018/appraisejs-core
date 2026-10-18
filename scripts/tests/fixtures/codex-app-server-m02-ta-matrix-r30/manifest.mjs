/** Full 24-case T2 R30 continuation; frozen predecessors and strict gates remain required. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyR29Predecessor } from './r29-evidence.mjs'
import { readStableFile } from './r21-evidence.mjs'
import { verifyR30HostFile } from './host-file.mjs'
import { buildR30CanonicalBytes } from './canonical-build.mjs'
import { fullT2RecoveryBudget } from './full-t2-budget.mjs'
import { GIT_FILE_PIN } from './git-readiness.mjs'
import { POLICY, POLICY_DIGEST, ROOT_AMENDMENT, digest } from './policy.mjs'
const HERE = dirname(fileURLToPath(import.meta.url)),
  REPO = resolve(HERE, '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r30-02')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-r30-git-readiness-continuation-02.md')
const AUTHORITY = join(REPO, '.appraisejs/m02-continuing-implementation-authority-01.json')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
async function pin(file) {
  return { path: file, purpose: `r30:${relative(REPO, file)}`, sha256: sha(await readStableFile(file)) }
}
async function modules(directory) {
  const names = await fs.readdir(directory)
  if (names.some(name => !/^[a-z0-9-]+\.mjs$/.test(name))) throw new Error('R30 source membership drift')
  return names.sort().map(name => join(directory, name))
}
export async function prepareR30MatrixManifest() {
  const predecessor = await verifyR29Predecessor()
  const host = await verifyR30HostFile()
  if (host.processImageAttested !== false) throw new Error('R30 unexpected host attestation')
  const canonical = await buildR30CanonicalBytes()
  const old = predecessor.prepared.manifest
  const authorityBytes = await readStableFile(AUTHORITY)
  const authority = JSON.parse(authorityBytes)
  if (
    authority.schema !== 'appraise.m02-continuing-implementation-authority/v1' ||
    authority.exactArtifactUserApprovalClaimed !== false ||
    !authority.userObjective?.includes('all actions relating to implemention')
  )
    throw new Error('R30 continuing implementation authority drift')
  const paths = new Set([
    ...(await modules(HERE)),
    PROPOSAL,
    GIT_FILE_PIN.path,
    ...[
      'm02-r29-native-terminal-01.json',
      'm02-r29-native-terminal-evidence-01/index.json',
      'm02-r29-user-authorization-context-01.json',
      'm02-t2-r29-recovery-user-decision.json',
      'm02-t2-r29-exact-review.json',
      'm02-r29-approved-native-submission-01.json',
      'm02-ta-matrix-build-r29-02/manifest.json',
      'm02-standing-test-authorization-01.json',
    ].map(name => join(REPO, '.appraisejs', name)),
    join(REPO, 'tasks/codex-app-server-journeys/m02-r29-native-findings-01.md'),
    join(REPO, 'tasks/codex-app-server-journeys/M02-STANDING-TEST-AUTHORIZATION.md'),
  ])
  const terminalIndex = JSON.parse(
    await readStableFile(predecessor.r29TerminalEvidence.indexPath, predecessor.r29TerminalEvidence.indexSha256),
  )
  for (const row of terminalIndex.files) {
    paths.add(row.originalPath)
    paths.add(join(dirname(predecessor.r29TerminalEvidence.indexPath), row.copy))
  }
  const artifacts = new Map()
  for (const row of old.artifacts)
    artifacts.set(row.path, {
      ...row,
      purpose:
        row.purpose === 'matrix-canonical-backend'
          ? 'historical-r29-canonical-backend'
          : row.purpose === 'scoped-mcp-entry'
            ? 'historical-r29-scoped-entry'
            : row.purpose,
    })
  for (const file of [...paths].sort()) {
    const row = await pin(file),
      existing = artifacts.get(file)
    if (existing && existing.sha256 !== row.sha256) throw new Error('R30 predecessor pin contradiction')
    if (!existing) artifacts.set(file, row)
  }
  const scoped = artifacts.get(join(HERE, 'scoped-entry.mjs'))
  artifacts.set(scoped.path, { ...scoped, purpose: 'scoped-mcp-entry' })
  const active = {
    path: join(BUILD, 'canonical-bridge.mjs'),
    purpose: 'matrix-canonical-backend',
    sha256: canonical.sha256,
  }
  if (artifacts.has(active.path)) throw new Error('R30 output collision')
  const budget = fullT2RecoveryBudget(old.recoveryBudget, predecessor.r29TerminalEvidence)
  const proposal = artifacts.get(PROPOSAL)
  const manifest = {
    ...structuredClone(old),
    version: 'appraise.m02-ta-matrix-r30/v1',
    root: POLICY.roots.T2,
    cases: POLICY.cases.filter(item => item.phase === 'T2').map(item => item.id),
    probeOnly: false,
    stopAfterB01: false,
    qualifiedGitFile: GIT_FILE_PIN,
    gitReadiness: {
      maximumSamples: 11,
      samplePauseMs: 1000,
      strictCompletionSamples: 1,
      combinedCompletionMaximum: 12,
      maximumUniqueGitIdentities: 1,
      gitAllowedAtStrictCompletion: false,
      finalHostIdentityMustMatchReadiness: true,
      originalCaseDeadlineNotReset: true,
    },
    fullT2Qualification: false,
    policyDigest: POLICY_DIGEST,
    amendedPolicyDigest: POLICY_DIGEST,
    rootAmendment: ROOT_AMENDMENT,
    artifacts: [active, ...artifacts.values()],
    recoveryBudget: budget,
    historicalR29SourceHostBudget: structuredClone(old.sourceHostBudget),
    sourceHostBudget: {
      maximum: budget.newT2Maximum.sourceCapacity,
      t2CapacityAllocation: budget.newT2Maximum.sourceCapacity,
      futureT3CapacityAllocation: 0,
      allPhaseOuterMaximum: budget.newT2Maximum.outerCalls,
      auditRequestsMaximum: budget.newT2Maximum.auditRequests,
      reservationEvidenceClass: 'SOURCE_BOUND_CAPACITY_RESERVED',
      actualShortLivedHostStarts: 'UNKNOWN',
      actualHostCountAttested: false,
    },
    recoveryProposalPath: PROPOSAL,
    recoveryProposalSha256: proposal.sha256,
    continuingImplementationAuthority: {
      path: AUTHORITY,
      sha256: sha(authorityBytes),
      exactArtifactUserApprovalClaimed: false,
    },
    r29TerminalEvidence: predecessor.r29TerminalEvidence,
    predecessorR29Manifest: {
      path: join(REPO, '.appraisejs/m02-ta-matrix-build-r29-02/manifest.json'),
      sha256: predecessor.prepared.manifestFileSha256,
      manifestDigest: predecessor.prepared.manifestDigest,
    },
    priorEvidence: {
      ...structuredClone(old.priorEvidence),
      r29: {
        status: 'UNKNOWN',
        casesCompleted: 7,
        failedCase: 'B07-A02',
        failedCaseCleanup: 'UNKNOWN',
        cleanup: predecessor.r29TerminalEvidence.cleanup,
        pending: [],
      },
    },
    canonicalRelocation: {
      ...old.canonicalRelocation,
      originalSha256: canonical.originalSha256,
      stagedSha256: canonical.sha256,
      ...canonical.relocation,
      stagedCurrentWorkingDirectory: join(POLICY.roots.T2, 'supervisor'),
    },
    evidenceClass: 'FULL_T2_CONTINUATION_EXACT_REVIEW_AND_BOUND_STANDING_AUTHORITY',
    runtimeAuthorized: false,
  }
  if (
    manifest.artifacts.filter(x => x.purpose === 'matrix-canonical-backend').length !== 1 ||
    manifest.artifacts.filter(x => x.purpose === 'scoped-mcp-entry').length !== 1 ||
    manifest.artifacts.filter(x => x.availability === 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED').length !== 23 ||
    budget.cumulativeWholeCampaignCeilings.listenerStarts !== 85 ||
    budget.cumulativeWholeCampaignCeilings.sourceCapacity !== 218 ||
    budget.combinedListenerAllocationCeilingIncludingR16 !== 86
  )
    throw new Error('R30 exact composition or cumulative budget drift')
  return Object.freeze({
    manifest,
    manifestDigest: digest(manifest),
    canonicalBytes: canonical.bytes,
    canonicalSha256: canonical.sha256,
    blockers: [],
    runtimeEligible: false,
    seal: predecessor.prepared.seal,
  })
}
