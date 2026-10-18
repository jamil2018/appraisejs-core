/** One fresh A06 environment-profile qualification; no full T2 claim. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyR32Predecessor } from './r32-evidence.mjs'
import { readStableFile } from './r21-evidence.mjs'
import { verifyR33HostFile } from './host-file.mjs'
import { buildR33CanonicalBytes } from './canonical-build.mjs'
import { fullT2RecoveryBudget } from './full-t2-budget.mjs'
import { GIT_FILE_PIN } from './git-readiness.mjs'
import { MINIMAL_ENVIRONMENT_PROFILE } from './environment-profile.mjs'
import { POLICY, POLICY_DIGEST, JOURNAL_BASE_POLICY_DIGEST, ROOT_AMENDMENT, digest } from './policy.mjs'
const HERE = dirname(fileURLToPath(import.meta.url)),
  REPO = resolve(HERE, '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r33-02')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-r33-minimal-path-a06-01.md')
const AUTHORITY = join(REPO, '.appraisejs/m02-continuing-implementation-authority-01.json')
const GIT_SOURCE = join(REPO, '.appraisejs/m02-git-lifecycle-source-20261017-01')
const GIT_SOURCE_PIN_SHA = '9a348d75bfc9c54811b9c3e38bd16aa0f9a3503e62752c17e2bef1b8536420d3'
const STATE_BUILD = join(REPO, '.appraisejs/m02-owned-host-observer-build-r33-01/source-pin.json')
const STATE_BUILD_SHA = '75681708c0b759609d408da4ad99797b3f5768c1adb77e7d53cb2dbe5d145269'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
async function pin(file) {
  return { path: file, purpose: `r33:${relative(REPO, file)}`, sha256: sha(await readStableFile(file)) }
}
async function modules(directory) {
  const names = await fs.readdir(directory)
  if (names.some(name => !/^[a-z0-9-]+\.mjs$/.test(name))) throw new Error('R33 source membership drift')
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
    throw new Error('R33 Git lifecycle source evidence drift')
  const paths = [pinPath, join(REPO, pin.treePath)]
  await readStableFile(paths[1], pin.treeSha256)
  for (const row of pin.files) {
    const file = join(GIT_SOURCE, row.file)
    const bytes = await readStableFile(file, row.sha256)
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    if (bytes.length !== row.bytes || blob !== row.gitBlobSha1) throw new Error('R33 Git lifecycle source blob drift')
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
export async function prepareR33MatrixManifest() {
  const predecessor = await verifyR32Predecessor()
  const stateBuild = JSON.parse(await readStableFile(STATE_BUILD, STATE_BUILD_SHA))
  if (
    stateBuild.schema !== 'appraise.m02-owned-host-observer-r33-offline-build/v1' ||
    stateBuild.sourceDelta.additionalProcessMetadataQueries !== 0 ||
    stateBuild.sourceDelta.additionalApiMethods !== 0 ||
    stateBuild.sourceDelta.moduleInitializationProcessQueries !== 0 ||
    stateBuild.processState.acceptancePredicateUse !== false ||
    stateBuild.processState.zombieIdentityClassification !== 'PRESENT' ||
    stateBuild.runtimeCompatibility !== 'UNQUALIFIED' ||
    stateBuild.runtimeAttested !== false ||
    stateBuild.output.path !== join(dirname(STATE_BUILD), 'mac-owned-host.node') ||
    stateBuild.output.sha256 !== 'e325eaa2a5655c9a985159f39105128b9925d1179c2f45bceeff7b917cc12998' ||
    stateBuild.sourcePins.length !== 3 ||
    stateBuild.nodeHeaderPins.length !== 4 ||
    stateBuild.sdkHeaderPins.length !== 3
  )
    throw new Error('R33 state observer build evidence drift')
  const statePins = [
    ...stateBuild.sourcePins,
    ...stateBuild.nodeHeaderPins,
    ...stateBuild.sdkHeaderPins,
    stateBuild.compilerDriverPin,
    stateBuild.output,
  ]
  for (const row of statePins) {
    if ((await readStableFile(row.path, row.sha256)).length !== row.bytes)
      throw new Error('R33 state source bytes drift')
  }
  const configSourceRoot = join(REPO, '.appraisejs/m02-git-config-source-20261017-01')
  const configSourcePin = join(configSourceRoot, 'source-pin.json')
  const configSource = JSON.parse(
    await readStableFile(configSourcePin, 'ddc6bc7e46deee6b7fdda98988859b7f8615eee522f6ca21937c28d264e4c90d'),
  )
  if (configSource.revision !== '4ebc485ca321243727539187169425fcf972f2c4' || configSource.files.length !== 2)
    throw new Error('R33 environment source pin drift')
  for (const row of configSource.files) await readStableFile(join(configSourceRoot, row.file), row.sha256)
  const gitSource = await gitLifecycleEvidence()
  const host = await verifyR33HostFile()
  if (host.processImageAttested !== false) throw new Error('R33 unexpected host attestation')
  const canonical = await buildR33CanonicalBytes()
  const old = predecessor.prepared.manifest
  const authorityBytes = await readStableFile(AUTHORITY)
  const authority = JSON.parse(authorityBytes)
  if (
    authority.schema !== 'appraise.m02-continuing-implementation-authority/v1' ||
    authority.exactArtifactUserApprovalClaimed !== false ||
    !authority.userObjective?.includes('all actions relating to implemention')
  )
    throw new Error('R33 continuing implementation authority drift')
  const paths = new Set([
    ...(await modules(HERE)),
    STATE_BUILD,
    ...[
      'm02-r33-focused-review-01.json',
      'm02-ta-matrix-build-r33/manifest.json',
      'm02-ta-matrix-build-r33/canonical-bridge.mjs',
    ].map(name => join(REPO, '.appraisejs', name)),
    ...statePins.map(row => row.path),
    configSourcePin,
    ...configSource.files.map(row => join(configSourceRoot, row.file)),
    ...gitSource.paths,
    PROPOSAL,
    GIT_FILE_PIN.path,
    ...[
      'm02-r32-native-terminal-01.json',
      'm02-r32-native-terminal-evidence-01/index.json',
      'm02-r32-user-authorization-context-01.json',
      'm02-t2-r32-recovery-user-decision.json',
      'm02-t2-r32-exact-review.json',
      'm02-r32-focused-review-01.json',
      'm02-r32-approved-native-submission-01.json',
      'm02-ta-matrix-build-r32/manifest.json',
      'm02-standing-test-authorization-01.json',
    ].map(name => join(REPO, '.appraisejs', name)),
    join(REPO, 'tasks/codex-app-server-journeys/m02-r32-native-findings-01.md'),
    join(REPO, 'tasks/codex-app-server-journeys/M02-STANDING-TEST-AUTHORIZATION.md'),
  ])
  const terminalIndex = JSON.parse(
    await readStableFile(predecessor.r32TerminalEvidence.indexPath, predecessor.r32TerminalEvidence.indexSha256),
  )
  for (const row of terminalIndex.files) {
    paths.add(row.originalPath)
    paths.add(join(dirname(predecessor.r32TerminalEvidence.indexPath), row.copy))
  }
  const artifacts = new Map()
  for (const row of old.artifacts)
    artifacts.set(row.path, {
      ...row,
      purpose:
        row.purpose === 'matrix-canonical-backend'
          ? 'historical-r32-canonical-backend'
          : row.purpose === 'scoped-mcp-entry'
            ? 'historical-r32-scoped-entry'
            : row.purpose,
    })
  for (const file of [...paths].sort()) {
    const row = await pin(file),
      existing = artifacts.get(file)
    if (existing && existing.sha256 !== row.sha256) throw new Error('R33 predecessor pin contradiction')
    if (!existing) artifacts.set(file, row)
  }
  const scoped = artifacts.get(join(HERE, 'scoped-entry.mjs'))
  artifacts.set(scoped.path, { ...scoped, purpose: 'scoped-mcp-entry' })
  const active = {
    path: join(BUILD, 'canonical-bridge.mjs'),
    purpose: 'matrix-canonical-backend',
    sha256: canonical.sha256,
  }
  if (artifacts.has(active.path)) throw new Error('R33 output collision')
  const budget = fullT2RecoveryBudget(old.recoveryBudget, predecessor.r32TerminalEvidence)
  const proposal = artifacts.get(PROPOSAL)
  const manifest = {
    ...structuredClone(old),
    version: 'appraise.m02-ta-matrix-r33/v1',
    root: POLICY.roots.T2,
    cases: POLICY.cases.filter(item => item.phase === 'T2').map(item => item.id),
    probeOnly: true,
    diagnosticOnly: true,
    environmentProfile: MINIMAL_ENVIRONMENT_PROFILE,
    unexecutedCandidate: {
      manifestPath: join(REPO, '.appraisejs/m02-ta-matrix-build-r33/manifest.json'),
      manifestSha256: '9b6fc273bedb19dd412d831ee26ae437c7bd6b13dded8cf3189b375a7a2d1e68',
      reportPath: join(REPO, '.appraisejs/m02-r33-focused-review-01.json'),
      reportSha256: '323a7c3b94711f660cd99e251d65cb7357a1026598bea732e152d34d9662f1dc',
      status: 'REVISE_UNRUN_ZERO_NATIVE_ALLOCATION',
    },
    processStateObserver: {
      sourcePinPath: STATE_BUILD,
      sourcePinSha256: STATE_BUILD_SHA,
      addonPath: stateBuild.output.path,
      addonSha256: stateBuild.output.sha256,
      additionalOsQueries: 0,
      stateUsedForAcceptance: false,
      argumentOrEnvironmentReads: false,
      zombieIsPresent: true,
    },
    journalBasePolicyDigest: JOURNAL_BASE_POLICY_DIGEST,
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
    historicalR32SourceHostBudget: structuredClone(old.sourceHostBudget),
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
    r32TerminalEvidence: predecessor.r32TerminalEvidence,
    predecessorR32Manifest: {
      path: join(REPO, '.appraisejs/m02-ta-matrix-build-r32/manifest.json'),
      sha256: predecessor.prepared.manifestFileSha256,
      manifestDigest: predecessor.prepared.manifestDigest,
    },
    priorEvidence: {
      ...structuredClone(old.priorEvidence),
      r32: {
        status: 'UNKNOWN',
        casesCompleted: 11,
        failedCase: 'B07-A06',
        failedCaseCleanup: 'UNKNOWN',
        cleanup: predecessor.r32TerminalEvidence.cleanup,
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
    evidenceClass: 'SINGLE_A06_MINIMAL_PATH_PROFILE_EXACT_REVIEW_AND_BOUND_STANDING_AUTHORITY',
    runtimeAuthorized: false,
  }
  if (
    manifest.artifacts.filter(x => x.purpose === 'matrix-canonical-backend').length !== 1 ||
    manifest.artifacts.filter(x => x.purpose === 'scoped-mcp-entry').length !== 1 ||
    manifest.artifacts.filter(x => x.availability === 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED').length !== 23 ||
    budget.cumulativeWholeCampaignCeilings.listenerStarts !== 110 ||
    budget.cumulativeWholeCampaignCeilings.sourceCapacity !== 278 ||
    budget.combinedListenerAllocationCeilingIncludingR16 !== 111
  )
    throw new Error('R33 exact composition or cumulative budget drift')
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
