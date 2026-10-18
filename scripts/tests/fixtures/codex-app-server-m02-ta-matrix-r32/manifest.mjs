/** Full 24-case T2 R32 continuation; frozen predecessors and strict gates remain required. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyR30Predecessor } from './r30-evidence.mjs'
import { readStableFile } from './r21-evidence.mjs'
import { verifyR32HostFile } from './host-file.mjs'
import { buildR32CanonicalBytes } from './canonical-build.mjs'
import { fullT2RecoveryBudget } from './full-t2-budget.mjs'
import { GIT_FILE_PIN } from './git-readiness.mjs'
import { POLICY, POLICY_DIGEST, ROOT_AMENDMENT, digest } from './policy.mjs'
const HERE = dirname(fileURLToPath(import.meta.url)),
  REPO = resolve(HERE, '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r32')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-r32-git-history-continuation-01.md')
const AUTHORITY = join(REPO, '.appraisejs/m02-continuing-implementation-authority-01.json')
const GIT_SOURCE = join(REPO, '.appraisejs/m02-git-lifecycle-source-20261017-01')
const GIT_SOURCE_PIN_SHA = '9a348d75bfc9c54811b9c3e38bd16aa0f9a3503e62752c17e2bef1b8536420d3'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
async function pin(file) {
  return { path: file, purpose: `r32:${relative(REPO, file)}`, sha256: sha(await readStableFile(file)) }
}
async function modules(directory) {
  const names = await fs.readdir(directory)
  if (names.some(name => !/^[a-z0-9-]+\.mjs$/.test(name))) throw new Error('R32 source membership drift')
  return names.sort().map(name => join(directory, name))
}
async function gitLifecycleEvidence() {
  const pinPath = join(GIT_SOURCE, 'source-pin.json')
  const pin = JSON.parse(await readStableFile(pinPath, GIT_SOURCE_PIN_SHA))
  if (
    pin.schema !== 'appraisejs-pinned-public-source-reference/v1' ||
    pin.revision !== '4ebc485ca321243727539187169425fcf972f2c4' ||
    pin.binaryProvenance !== 'UNATTESTED' ||
    pin.runtimeCompatibility !== 'UNQUALIFIED' ||
    pin.files?.length !== 5 ||
    pin.files
      .map(row => row.file)
      .sort()
      .join(',') !== 'codex_thread.rs,fsmonitor.rs,git_process.rs,info.rs,thread_startup_metadata.rs'
  )
    throw new Error('R32 Git lifecycle source evidence drift')
  const paths = [pinPath, join(REPO, pin.treePath)]
  await readStableFile(paths[1], pin.treeSha256)
  for (const row of pin.files) {
    const file = join(GIT_SOURCE, row.file)
    const bytes = await readStableFile(file, row.sha256)
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    if (bytes.length !== row.bytes || blob !== row.gitBlobSha1) throw new Error('R32 Git lifecycle source blob drift')
    paths.push(file)
  }
  return {
    paths,
    record: {
      path: pinPath,
      sha256: GIT_SOURCE_PIN_SHA,
      revision: pin.revision,
      evidenceClass: 'PUBLIC_SOURCE_REVIEW_NOT_NATIVE_CAUSE_OR_PROCESS_BOUND',
      installedBinarySourceProvenance: 'UNATTESTED',
      runtimeCompatibility: 'UNQUALIFIED',
    },
  }
}
export async function prepareR32MatrixManifest() {
  const predecessor = await verifyR30Predecessor()
  const gitSource = await gitLifecycleEvidence()
  const host = await verifyR32HostFile()
  if (host.processImageAttested !== false) throw new Error('R32 unexpected host attestation')
  const canonical = await buildR32CanonicalBytes()
  const old = predecessor.prepared.manifest
  const authorityBytes = await readStableFile(AUTHORITY)
  const authority = JSON.parse(authorityBytes)
  if (
    authority.schema !== 'appraise.m02-continuing-implementation-authority/v1' ||
    authority.exactArtifactUserApprovalClaimed !== false ||
    !authority.userObjective?.includes('all actions relating to implemention')
  )
    throw new Error('R32 continuing implementation authority drift')
  const paths = new Set([
    ...(await modules(HERE)),
    ...gitSource.paths,
    PROPOSAL,
    GIT_FILE_PIN.path,
    ...[
      'm02-r30-native-terminal-01.json',
      'm02-r30-native-terminal-evidence-01/index.json',
      'm02-r30-user-authorization-context-01.json',
      'm02-t2-r30-recovery-user-decision.json',
      'm02-t2-r30-exact-review.json',
      'm02-r30-focused-review-02.json',
      'm02-r30-approved-native-submission-01.json',
      'm02-ta-matrix-build-r30-02/manifest.json',
      'm02-standing-test-authorization-01.json',
    ].map(name => join(REPO, '.appraisejs', name)),
    join(REPO, 'tasks/codex-app-server-journeys/m02-r30-native-findings-01.md'),
    join(REPO, 'tasks/codex-app-server-journeys/M02-STANDING-TEST-AUTHORIZATION.md'),
  ])
  const terminalIndex = JSON.parse(
    await readStableFile(predecessor.r30TerminalEvidence.indexPath, predecessor.r30TerminalEvidence.indexSha256),
  )
  for (const row of terminalIndex.files) {
    paths.add(row.originalPath)
    paths.add(join(dirname(predecessor.r30TerminalEvidence.indexPath), row.copy))
  }
  const artifacts = new Map()
  for (const row of old.artifacts)
    artifacts.set(row.path, {
      ...row,
      purpose:
        row.purpose === 'matrix-canonical-backend'
          ? 'historical-r30-canonical-backend'
          : row.purpose === 'scoped-mcp-entry'
            ? 'historical-r30-scoped-entry'
            : row.purpose,
    })
  for (const file of [...paths].sort()) {
    const row = await pin(file),
      existing = artifacts.get(file)
    if (existing && existing.sha256 !== row.sha256) throw new Error('R32 predecessor pin contradiction')
    if (!existing) artifacts.set(file, row)
  }
  const scoped = artifacts.get(join(HERE, 'scoped-entry.mjs'))
  artifacts.set(scoped.path, { ...scoped, purpose: 'scoped-mcp-entry' })
  const active = {
    path: join(BUILD, 'canonical-bridge.mjs'),
    purpose: 'matrix-canonical-backend',
    sha256: canonical.sha256,
  }
  if (artifacts.has(active.path)) throw new Error('R32 output collision')
  const budget = fullT2RecoveryBudget(old.recoveryBudget, predecessor.r30TerminalEvidence)
  const proposal = artifacts.get(PROPOSAL)
  const manifest = {
    ...structuredClone(old),
    version: 'appraise.m02-ta-matrix-r32/v1',
    root: POLICY.roots.T2,
    cases: POLICY.cases.filter(item => item.phase === 'T2').map(item => item.id),
    probeOnly: false,
    stopAfterB01: false,
    qualifiedGitFile: GIT_FILE_PIN,
    gitLifecycleSourceEvidence: gitSource.record,
    gitReadiness: {
      maximumSamples: 11,
      samplePauseMs: 1000,
      strictCompletionSamples: 1,
      combinedCompletionMaximum: 12,
      maximumUniqueGitIdentities: 4,
      maximumObservedOrUnresolvedLiveGitIdentities: 3,
      retainedHistoryNeverDeleted: true,
      everyRecordedOriginalMustBeGone: true,
      currentGitRowsMustBeEmpty: true,
      sameBirthPathChangeRejected: true,
      maximumReadinessOsPortCalls: 242,
      maximumStrictCompletionOsPortCalls: 18,
      bindingAndStopChecksCountedSeparately: true,
      envelopeEvidenceClass: 'REVIEWED_OBSERVED_HISTORY_NOT_ATTESTED_COLLECTOR_BOUND',
      actualGitCommandOrCause: 'UNKNOWN',
      actualNativeProcessCountAttested: false,
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
    historicalR30SourceHostBudget: structuredClone(old.sourceHostBudget),
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
    r30TerminalEvidence: predecessor.r30TerminalEvidence,
    predecessorR30Manifest: {
      path: join(REPO, '.appraisejs/m02-ta-matrix-build-r30-02/manifest.json'),
      sha256: predecessor.prepared.manifestFileSha256,
      manifestDigest: predecessor.prepared.manifestDigest,
    },
    priorEvidence: {
      ...structuredClone(old.priorEvidence),
      r30: {
        status: 'UNKNOWN',
        casesCompleted: 0,
        failedCase: 'B01',
        failedCaseCleanup: 'UNKNOWN',
        cleanup: predecessor.r30TerminalEvidence.cleanup,
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
    budget.cumulativeWholeCampaignCeilings.listenerStarts !== 109 ||
    budget.cumulativeWholeCampaignCeilings.sourceCapacity !== 276 ||
    budget.combinedListenerAllocationCeilingIncludingR16 !== 110
  )
    throw new Error('R32 exact composition or cumulative budget drift')
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
