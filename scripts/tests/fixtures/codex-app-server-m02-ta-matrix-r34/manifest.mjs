/** Fresh full T2 using original case-budget readiness; accepted predecessors remain exact. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyR33Predecessor } from './r33-evidence.mjs'
import { readStableFile } from './r21-evidence.mjs'
import { verifyR34HostFile } from './host-file.mjs'
import { buildR34CanonicalBytes } from './canonical-build.mjs'
import { fullT2RecoveryBudget } from './full-t2-budget.mjs'
import { GIT_FILE_PIN, READINESS_POLICY } from './git-readiness.mjs'
import { MINIMAL_ENVIRONMENT_PROFILE } from './environment-profile.mjs'
import { POLICY, POLICY_DIGEST, JOURNAL_BASE_POLICY_DIGEST, ROOT_AMENDMENT, digest } from './policy.mjs'

const HERE = dirname(fileURLToPath(import.meta.url)),
  REPO = resolve(HERE, '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r34')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-r34-case-budget-readiness-01.md')
const PATH_SOURCE = join(REPO, '.appraisejs/m02-r33-path-source-20261017-01')
const PATH_SOURCE_SHA = '491177a3d571bf61c3fe50d6ba73232547387db6c5029171c780a6bc1742895e'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
async function pin(file) {
  return { path: file, purpose: `r34:${relative(REPO, file)}`, sha256: sha(await readStableFile(file)) }
}
async function ownModules() {
  const names = await fs.readdir(HERE)
  if (names.some(name => !/^[a-z0-9-]+\.mjs$/.test(name))) throw new Error('R34 source membership drift')
  return names.sort().map(name => join(HERE, name))
}

export async function prepareR34MatrixManifest() {
  const predecessor = await verifyR33Predecessor()
  const old = predecessor.prepared.manifest
  const host = await verifyR34HostFile()
  if (host.processImageAttested !== false) throw new Error('R34 unexpected process attestation')
  const canonical = await buildR34CanonicalBytes()
  const budget = fullT2RecoveryBudget(old.recoveryBudget, predecessor.r33TerminalEvidence)
  const pathPinFile = join(PATH_SOURCE, 'source-pin.json')
  const pathSource = JSON.parse(await readStableFile(pathPinFile, PATH_SOURCE_SHA))
  if (
    pathSource.revision !== '4ebc485ca321243727539187169425fcf972f2c4' ||
    pathSource.installed_binary_or_runtime_attested !== false ||
    pathSource.files.length !== 2 ||
    pathSource.files
      .map(row => row.local_file)
      .sort()
      .join(',') !== 'app_server_main.rs,arg0_lib.rs'
  )
    throw new Error('R34 startup source evidence drift')
  const sourceFiles = [pathPinFile]
  for (const row of pathSource.files) {
    const file = join(PATH_SOURCE, row.local_file),
      bytes = await readStableFile(file)
    if (
      bytes.length !== row.size_bytes ||
      createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== row.git_blob_sha1
    )
      throw new Error('R34 startup source blob drift')
    sourceFiles.push(file)
  }
  const paths = new Set([
    ...(await ownModules()),
    ...sourceFiles,
    PROPOSAL,
    join(REPO, 'tasks/codex-app-server-journeys/m02-r33-native-findings-01.md'),
    ...[
      'm02-r33-native-terminal-01.json',
      'm02-r33-native-terminal-evidence-01/index.json',
      'm02-r33-user-authorization-context-01.json',
      'm02-t2-r33-recovery-user-decision.json',
      'm02-t2-r33-exact-review.json',
      'm02-r33-focused-review-02.json',
      'm02-r33-approved-native-submission-01.json',
      'm02-r33-fixed-command-01.json',
      'm02-ta-matrix-build-r33-02/manifest.json',
    ].map(name => join(REPO, '.appraisejs', name)),
  ])
  const terminalIndex = JSON.parse(
    await readStableFile(predecessor.r33TerminalEvidence.indexPath, predecessor.r33TerminalEvidence.indexSha256),
  )
  for (const row of terminalIndex.files) {
    paths.add(row.originalPath)
    paths.add(join(dirname(predecessor.r33TerminalEvidence.indexPath), row.copy))
  }
  const artifacts = new Map()
  for (const row of old.artifacts)
    artifacts.set(row.path, {
      ...row,
      purpose:
        row.purpose === 'matrix-canonical-backend'
          ? 'historical-r33-canonical-backend'
          : row.purpose === 'scoped-mcp-entry'
            ? 'historical-r33-scoped-entry'
            : row.purpose,
    })
  for (const file of [...paths].sort()) {
    const row = await pin(file),
      existing = artifacts.get(file)
    if (existing && existing.sha256 !== row.sha256) throw new Error('R34 predecessor pin contradiction')
    if (!existing) artifacts.set(file, row)
  }
  const scoped = artifacts.get(join(HERE, 'scoped-entry.mjs'))
  artifacts.set(scoped.path, { ...scoped, purpose: 'scoped-mcp-entry' })
  const active = {
    path: join(BUILD, 'canonical-bridge.mjs'),
    purpose: 'matrix-canonical-backend',
    sha256: canonical.sha256,
  }
  if (artifacts.has(active.path)) throw new Error('R34 output collision')
  const proposal = artifacts.get(PROPOSAL)
  const applicableCases = POLICY.cases.filter(item => item.phase === 'T2' && item.id !== 'P00').length
  if (
    applicableCases !== 23 ||
    READINESS_POLICY.caseLimitMs !== POLICY.deadlineMs.case ||
    READINESS_POLICY.maxSamples !== 50 ||
    READINESS_POLICY.pauseMs !== 1000 ||
    READINESS_POLICY.cleanupReserveMs !== 10000
  )
    throw new Error('R34 readiness policy drift')
  const manifest = {
    ...structuredClone(old),
    version: 'appraise.m02-ta-matrix-r34/v1',
    root: POLICY.roots.T2,
    cases: POLICY.cases.filter(item => item.phase === 'T2').map(item => item.id),
    probeOnly: false,
    diagnosticOnly: false,
    stopAfterB01: false,
    fullT2Qualification: false,
    environmentProfile: MINIMAL_ENVIRONMENT_PROFILE,
    journalBasePolicyDigest: JOURNAL_BASE_POLICY_DIGEST,
    qualifiedGitFile: GIT_FILE_PIN,
    processStateObserver: structuredClone(old.processStateObserver),
    startupPathSourceEvidence: {
      path: pathPinFile,
      sha256: PATH_SOURCE_SHA,
      qualification: 'PINNED_SOURCE_PATTERN_NOT_INSTALLED_RUNTIME_OR_GIT_CAUSE',
      launchEnvironmentOnly: true,
      effectiveProcessEnvironmentAttested: false,
      privateDotenvContentsRead: false,
      actualGitCommandOrCaller: 'UNKNOWN',
    },
    gitReadiness: {
      maximumSamples: READINESS_POLICY.maxSamples,
      samplePauseMs: READINESS_POLICY.pauseMs,
      cleanupSchedulingReserveMs: READINESS_POLICY.cleanupReserveMs,
      originalCoordinatorRemainingCaseBudgetRequired: true,
      budgetCheckedBeforeAndAfterEverySampleAndBeforeStrictCompletion: true,
      pauseCappedToRemainingReadinessBudget: true,
      caseDeadlineResetOrExtended: false,
      cleanupDurationAttested: false,
      strictCompletionSamples: 1,
      maximumUniqueGitIdentities: 4,
      maximumObservedOrUnresolvedLiveGitIdentities: 3,
      retainedHistoryNeverDeleted: true,
      everyRecordedOriginalMustBeGone: true,
      currentGitRowsMustBeEmpty: true,
      sameBirthPathChangeRejected: true,
      maximumReadinessOsPortCallsPerApplicableCase: 1100,
      maximumStrictCompletionOsPortCallsPerApplicableCase: 18,
      applicableCases,
      maximumCampaignReadinessAndStrictOsPortCalls: applicableCases * 1118,
      bindingAndStopChecksCountedSeparately: true,
      portCallsAreNotKernelOrProcessCounts: true,
      envelopeEvidenceClass: 'REVIEWED_OBSERVED_HISTORY_NOT_ATTESTED_COLLECTOR_BOUND',
      actualGitCommandOrCause: 'UNKNOWN',
      actualNativeProcessCountAttested: false,
      gitAllowedAtStrictCompletion: false,
      finalHostIdentityMustMatchReadiness: true,
      originalCaseDeadlineNotReset: true,
    },
    policyDigest: POLICY_DIGEST,
    amendedPolicyDigest: POLICY_DIGEST,
    rootAmendment: ROOT_AMENDMENT,
    artifacts: [active, ...artifacts.values()],
    recoveryBudget: budget,
    historicalR33SourceHostBudget: structuredClone(old.sourceHostBudget),
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
    r33TerminalEvidence: predecessor.r33TerminalEvidence,
    predecessorR33Manifest: {
      path: join(REPO, '.appraisejs/m02-ta-matrix-build-r33-02/manifest.json'),
      sha256: predecessor.prepared.manifestFileSha256,
      manifestDigest: predecessor.prepared.manifestDigest,
    },
    historicalUnexecutedR33Candidate: structuredClone(old.unexecutedCandidate),
    priorEvidence: {
      ...structuredClone(old.priorEvidence),
      r33: {
        status: 'A06_MINIMAL_PATH_PROFILE_COMPLETED_NOT_FULL_T2',
        casesCompleted: 1,
        completedCases: ['B07-A06'],
        failedCase: null,
        pending: [],
        cleanup: predecessor.r33TerminalEvidence.cleanup,
        fullT2Qualified: false,
      },
    },
    canonicalRelocation: {
      ...old.canonicalRelocation,
      originalSha256: canonical.originalSha256,
      stagedSha256: canonical.sha256,
      ...canonical.relocation,
      stagedCurrentWorkingDirectory: join(POLICY.roots.T2, 'supervisor'),
    },
    evidenceClass: 'FULL_T2_ORIGINAL_CASE_BUDGET_READINESS_EXACT_REVIEW_REQUIRED',
    runtimeAuthorized: false,
  }
  delete manifest.unexecutedCandidate
  if (
    manifest.cases.length !== 24 ||
    manifest.artifacts.filter(row => row.purpose === 'matrix-canonical-backend').length !== 1 ||
    manifest.artifacts.filter(row => row.purpose === 'scoped-mcp-entry').length !== 1 ||
    manifest.artifacts.filter(row => row.availability === 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED').length !== 23 ||
    budget.cumulativeWholeCampaignCeilings.listenerStarts !== 134 ||
    budget.cumulativeWholeCampaignCeilings.controlWrites !== 518 ||
    budget.cumulativeWholeCampaignCeilings.sourceCapacity !== 336 ||
    budget.combinedListenerAllocationCeilingIncludingR16 !== 135
  )
    throw new Error('R34 exact composition or cumulative allocation drift')
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
