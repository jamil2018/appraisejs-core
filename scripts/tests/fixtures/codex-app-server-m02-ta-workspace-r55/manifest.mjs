/** Additive T3 preparation. Actual full T2 evidence is mandatory; this module grants no runtime authority. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyT3Predecessor } from './r54-evidence.mjs'
import { readStableFile } from '../codex-app-server-m02-ta-matrix-r44/r21-evidence.mjs'
import { verifyR55HostFile } from './host-file.mjs'
import { buildWorkspaceCanonicalBytes } from './canonical-build.mjs'
import { fullT3RecoveryBudget, DEDICATED_TOOL_HELPER_SOURCE_EXPECTATIONS } from './full-t3-budget.mjs'
import { NATIVE_PINS } from './native-plans.mjs'
import { verifyNativeContractSources, NATIVE_CONTRACT_SOURCE_PINS } from './native-contracts.mjs'
import { POLICY, POLICY_DIGEST, JOURNAL_BASE_POLICY_DIGEST, ROOT, digest } from './policy.mjs'

const HERE = dirname(fileURLToPath(import.meta.url)),
  REPO = resolve(HERE, '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-workspace-build-r55')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t3-r55-native-plan-01.md')
const TA03_PINS = Object.freeze([
  [
    'tasks/codex-app-server-journeys/m02-ta03-helper-evidence-proposal-01.md',
    '5cb5637323d5c6a6dce67e0697e8a473e69ad476c31568fa7a695abcf9b3dab3',
  ],
  [
    'tasks/codex-app-server-journeys/m02-ta03-approval-01.md',
    '8ca7635b537ef1fda04dc859f98eb04beb66eae4f05e3c697b12be53b411a8fc',
  ],
  ['.appraisejs/m02-t3-helper-doc-review-01.json', '9fb0accb1960403cd1d1d9ba759ca2dc94bc25bc1ace8bdb427251bd67e9a65d'],
])
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
async function pin(file, expected) {
  return { path: file, purpose: `r55:${relative(REPO, file)}`, sha256: sha(await readStableFile(file, expected)) }
}

export async function prepareWorkspaceManifest() {
  const predecessor = await verifyT3Predecessor()
  const old = predecessor.priorT3Prepared.manifest
  const host = await verifyR55HostFile()
  if (host.processImageAttested !== false) throw new Error('T3 unexpected process attestation')
  const canonical = await buildWorkspaceCanonicalBytes()
  const budget = fullT3RecoveryBudget(old.recoveryBudget, predecessor.r54TerminalEvidence)
  const nativeContractQualification = await verifyNativeContractSources()
  const names = await fs.readdir(HERE)
  if (names.some(name => !/^[a-z0-9-]+\.mjs$/.test(name))) throw new Error('T3 source membership drift')
  const paths = new Map(names.sort().map(name => [join(HERE, name), undefined]))
  paths.set(PROPOSAL, undefined)
  for (const [file, expected] of TA03_PINS) paths.set(join(REPO, file), expected)
  for (const row of NATIVE_CONTRACT_SOURCE_PINS) paths.set(row.path, row.sha256)
  for (const row of Object.values(NATIVE_PINS)) paths.set(row.path, row.sha256)
  for (const name of [
    'm02-r55-explicit-user-authorization-01.json',
    'm02-r54-native-terminal-01.json',
    'm02-r54-native-terminal-evidence-01/index.json',
    'm02-r54-native-tool-terminal-01.json',
    'm02-r54-source-snapshot-01.json',
    'm02-r54-user-authorization-context-01.json',
    'm02-t3-r54-recovery-user-decision.json',
    'm02-t3-r54-exact-review.json',
    'm02-r54-focused-review-01.json',
    'm02-r54-approved-native-submission-01.json',
    'm02-r54-native-submitted-01.json',
    'm02-r54-fixed-command-01.json',
    'm02-r54-actual-file-only-precheck-01.json',
    'm02-ta-workspace-build-r54/manifest.json',

    'm02-r52-native-terminal-01.json',
    'm02-r52-native-terminal-evidence-01/index.json',
    'm02-r52-native-tool-terminal-01.json',
    'm02-r52-source-snapshot-01.json',
    'm02-r52-user-authorization-context-01.json',
    'm02-t3-r52-recovery-user-decision.json',
    'm02-t3-r52-exact-review.json',
    'm02-r52-focused-review-01.json',
    'm02-r52-approved-native-submission-01.json',
    'm02-r52-native-submitted-01.json',
    'm02-r52-fixed-command-01.json',
    'm02-r52-actual-file-only-precheck-01.json',
    'm02-ta-workspace-build-r52/manifest.json',
    'm02-r51-native-terminal-01.json',
    'm02-r51-b14-supplemental-evidence-01/index.json',
    'm02-r51-native-tool-terminal-01.json',
    'm02-r51-exact-user-approval-01.json',
    'm02-r51-source-snapshot-01.json',
    'm02-r51-actual-file-only-precheck-01.json',
    'm02-r51-native-terminal-evidence-01/index.json',
    'm02-r51-user-authorization-context-01.json',
    'm02-t2-r51-recovery-user-decision.json',
    'm02-t2-r51-exact-review.json',
    'm02-r51-focused-review-01.json',
    'm02-r51-approved-native-submission-01.json',
    'm02-r51-fixed-command-01.json',
    'm02-ta-matrix-build-r51/manifest.json',
  ])
    paths.set(join(REPO, '.appraisejs', name), undefined)
  const terminalIndex = JSON.parse(
    await readStableFile(predecessor.r51TerminalEvidence.indexPath, predecessor.r51TerminalEvidence.indexSha256),
  )
  for (const row of terminalIndex.files) {
    paths.set(row.originalPath, row.sha256)
    paths.set(join(dirname(predecessor.r51TerminalEvidence.indexPath), row.copy), row.sha256)
  }
  const supplementalIndexPath = join(REPO, '.appraisejs/m02-r51-b14-supplemental-evidence-01/index.json')
  const supplementalIndex = JSON.parse(await readStableFile(supplementalIndexPath))
  for (const row of supplementalIndex.files) {
    paths.set(row.originalPath, row.sha256)
    paths.set(join(dirname(supplementalIndexPath), row.copy), row.sha256)
  }
  const priorT3IndexPath = predecessor.r54TerminalEvidence.indexPath
  const priorT3Index = JSON.parse(await readStableFile(priorT3IndexPath, predecessor.r54TerminalEvidence.indexSha256))
  for (const row of priorT3Index.files) {
    paths.set(row.originalPath, row.sha256)
    paths.set(join(dirname(priorT3IndexPath), row.copy), row.sha256)
  }
  const artifacts = new Map(
    old.artifacts.map(row => [
      row.path,
      {
        ...row,
        purpose:
          row.purpose === 'matrix-canonical-backend'
            ? 'historical-r54-canonical-backend'
            : row.purpose === 'scoped-mcp-entry'
              ? 'historical-r54-scoped-entry'
              : row.purpose,
      },
    ]),
  )
  for (const [file, expected] of [...paths].sort(([a], [b]) => a.localeCompare(b))) {
    const row = await pin(file, expected),
      previous = artifacts.get(file)
    if (previous && previous.sha256 !== row.sha256) throw new Error('T3 predecessor artifact contradiction')
    if (!previous) artifacts.set(file, row)
  }
  const scoped = artifacts.get(join(HERE, 'scoped-entry.mjs'))
  artifacts.set(scoped.path, { ...scoped, purpose: 'scoped-mcp-entry' })
  const active = {
    path: join(BUILD, 'canonical-bridge.mjs'),
    purpose: 'matrix-canonical-backend',
    sha256: canonical.sha256,
  }
  if (artifacts.has(active.path)) throw new Error('T3 output collision')
  const historical = structuredClone(old)
  delete historical.stageProgress
  const manifest = {
    ...historical,
    historicalR54ScopedBootstrapRootQualification: structuredClone(old.scopedBootstrapRootQualification),
    scopedBootstrapRootQualification: {
      root: ROOT,
      rootSource: 'SAME_REVIEWED_POLICY_AS_SUPERVISOR',
      allowedRootCount: 1,
      pathAllowlistWidened: false,
    },
    version: 'appraise.m02-ta-workspace-r55/v1',
    phase: 'T3',
    root: ROOT,
    cases: POLICY.cases.filter(item => item.phase === 'T3').map(item => item.id),
    policyDigest: POLICY_DIGEST,
    amendedPolicyDigest: POLICY_DIGEST,
    journalBasePolicyDigest: JOURNAL_BASE_POLICY_DIGEST,
    historicalR54RootAmendment: structuredClone(old.rootAmendment),
    rootAmendment: {
      version: 'appraise.m02-ta-workspace-r55-root-amendment/v1',
      from: '/private/tmp/appraise-m02-ta-workspace-p3',
      to: ROOT,
      recovery: 'FRESH_T3_ROOT_NO_REPLAY',
    },
    probeOnly: false,
    diagnosticOnly: false,
    stopAfterB01: false,
    fullT2Qualification: false,
    acceptedFullT2Evidence: true,
    historicalR54FreshT3Authorization: structuredClone(old.freshT3Authorization),
    freshT3Authorization: {
      path: join(REPO, '.appraisejs/m02-r55-explicit-user-authorization-01.json'),
      sha256: '48e0aaede3ba1d0e681ff5a26ef74a8d2cf145a0865bdbd30590a7a0780fcd71',
      literalUserInstruction: 'Continue',
      continuationContext: 'CURRENT_N02_PROTOCOL_FIX_AND_FRESH_ORIGINAL_T3',
      nativeInvocationsMaximum: 1,
      scope: 'CONTINUE_N02_PASSIVE_NOTIFICATION_FIX_AND_ONE_FRESH_ORIGINAL_T3',
    },
    scratchDirectoryQualification: {
      stableDirectoryIdentity: ['dev', 'ino', 'uid', 'mode'],
      directoryLinksBeforeAction: 'EXACT_ORIGINAL_ALL_ANCHORS',
      directoryLinksAfterAction: 'EXACT_ORIGINAL_PLUS_ONE_AT_SCRATCH_PARENT_ONLY',
      scratchMembershipBefore: 'EMPTY',
      scratchMembershipAfter: 'EXACT_ONE_EXPECTED_FILE',
      operatingSystemScope: 'PINNED_MACOS_FILESYSTEM_OBSERVED_DIRECTORY_ENTRY_LINK_SEMANTICS',
      fileSingleLinkExactBytesHeldFdAndPathMetadataUnchanged: true,
      currentTupleHashesAndAllOtherAnchorsUnchanged: true,
      originalR52ChangedField: 'UNKNOWN_NOT_RETAINED',
    },
    turnDiffQualification: {
      method: 'turn/diff/updated',
      methodSha256: '411738230c49e374897ac082e0534e5567d5c5a6fc28521010c56f4f94ac4e47',
      pinnedSchemaPath: join(
        REPO,
        '.appraisejs/m02-executable-qualification-20261016-01/schemas/ServerNotification.json',
      ),
      pinnedSchemaSha256: '8e719512bc26bb3871fcf7b378b79abf912d82787609c0ad418b71f179d0883f',
      case: 'N02',
      phase: 'turn',
      exactOwnedThreadAndTurnRequired: true,
      exactFields: ['diff', 'threadId', 'turnId'],
      maxDiffBytes: 16384,
      maxFrames: 32,
      maxTotalFrameBytes: 65536,
      fixedWorkspaceActionAndOuterCallIssuedRequired: true,
      rawDiffRetained: false,
      diagnosticAuthority: false,
      advancesLifecycleOrAcknowledgesEffects: false,
      actualR54ParamsBody: 'UNKNOWN_NOT_RETAINED',
    },
    admissionAccounting: {
      fullRecursiveHistory: 'EVERY_CASE_IMMEDIATELY_BEFORE_BEGIN',
      phaseAnchor: 'BEFORE_FIRST_ADMISSION_SCAN_NO_RESET',
      phaseDeadlineMs: POLICY.deadlineMs.T3,
      admittedCaseDeadlineMs: POLICY.deadlineMs.case,
      historicalScanExcludedFromCaseTimer: true,
      historicalScanIncludedInPhaseTimer: true,
      privateSingleUseExactCaseManifestRootPhaseBinding: true,
      listenerAndSpawnCurrentGuardsUnchanged: true,
      totalPerCaseWallClockAccountingChanged: true,
    },
    historicalR54FutureInvocation: structuredClone(old.futureInvocation),
    futureInvocation: {
      requestedHostToolMode: 'exec_command sandbox_permissions=require_escalated',
      workdir: REPO,
      noAutomaticFurtherInvocation: true,
      priorUnknownsRequired: structuredClone(old.futureInvocation.priorUnknownsRequired),
    },
    r51TerminalEvidence: predecessor.r51TerminalEvidence,
    r52TerminalEvidence: predecessor.r52TerminalEvidence,
    r54TerminalEvidence: predecessor.r54TerminalEvidence,
    recoveryBudget: budget,
    historicalR54SourceHostBudget: structuredClone(old.sourceHostBudget),
    sourceHostBudget: {
      maximum: budget.newT3Maximum.sourceCapacity,
      t2CapacityAllocation: 0,
      futureT3CapacityAllocation: 4,
      allPhaseOuterMaximum: 2,
      auditRequestsMaximum: 0,
      reservationEvidenceClass: 'SOURCE_BOUND_CAPACITY_RESERVED',
      actualShortLivedHostStarts: 'UNKNOWN',
      actualHostCountAttested: false,
      nativeScratchHelperInventory: 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED',
      dedicatedToolHelperSourceExpectations: DEDICATED_TOOL_HELPER_SOURCE_EXPECTATIONS,
      helperExpectationEvidenceClass: 'PINNED_SOURCE_PATTERN_NOT_TOTAL_PROCESS_BOUND_OR_RUNTIME_COUNT',
      supervisorHelperReservationMaximum: budget.newT3Maximum.helperStarts,
    },
    ta03: {
      proposalPath: join(REPO, TA03_PINS[0][0]),
      proposalSha256: TA03_PINS[0][1],
      approvalRecordPath: join(REPO, TA03_PINS[1][0]),
      approvalRecordSha256: TA03_PINS[1][1],
      independentReviewPath: join(REPO, TA03_PINS[2][0]),
      independentReviewSha256: TA03_PINS[2][1],
      nativeScratchHelperInventory: 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED',
      qualificationClass: 'TRUSTED_AGENT_SCRIPTED_NATIVE_FUNCTIONAL_CONFORMANCE_WITH_UNOBSERVED_HELPER_LIFETIME',
      dedicatedToolHelperSourceExpectations: DEDICATED_TOOL_HELPER_SOURCE_EXPECTATIONS,
      helperExpectationEvidenceClass: 'PINNED_SOURCE_PATTERN_NOT_TOTAL_PROCESS_BOUND_OR_RUNTIME_COUNT',
      observedNativeHelperCountAttested: false,
    },
    nativeContractQualification,
    historicalR54EnvironmentProfile: structuredClone(old.environmentProfile),
    environmentProfile: {
      version: 'appraise.m02-r55-explicit-three-key-launch-environment/v1',
      keys: ['CODEX_HOME', 'HOME', 'TMPDIR'],
      ambientEnvironmentMergedBySupervisor: false,
      effectiveProcessEnvironmentAttested: false,
      gitSuppressionClaimed: false,
    },
    gitReadiness: {
      ...structuredClone(old.gitReadiness),
      applicableCases: 2,
      maximumCampaignReadinessAndStrictOsPortCalls: 2236,
    },
    artifacts: [active, ...artifacts.values()],
    recoveryProposalPath: PROPOSAL,
    recoveryProposalSha256: artifacts.get(PROPOSAL).sha256,
    canonicalRelocation: {
      ...old.canonicalRelocation,
      originalSha256: canonical.originalSha256,
      stagedSha256: canonical.sha256,
      ...canonical.relocation,
      stagedCurrentWorkingDirectory: join(ROOT, 'supervisor'),
    },
    evidenceClass: 'T3_FIXED_NATIVE_SCRATCH_SOURCE_EXACT_REVIEW_REQUIRED',
    receiptEncoding: {
      historicalAvailability: 'SHA256_OF_EXACT_UTF8_JSON_STRINGIFY_MANIFEST_VALUE',
      completeHistoricalWitnessesRetainedAndVerified: true,
      fixedReceiptByteLimit: 65536,
      historicalSemanticAndArchiveChecksChanged: true,
    },
    runtimeAuthorized: false,
  }
  if (
    manifest.cases.join(',') !== 'N01,N02' ||
    manifest.artifacts.filter(row => row.purpose === 'matrix-canonical-backend').length !== 1 ||
    manifest.artifacts.filter(row => row.purpose === 'scoped-mcp-entry').length !== 1 ||
    manifest.artifacts.filter(row => row.availability === 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED').length !== 23 ||
    manifest.artifacts.filter(row => row.availability === 'HISTORICAL_TEMP_SOURCE_ABSENT_TA06_VERIFIED').length !==
      580 ||
    !manifest.artifacts.some(
      row => row.path === '/Applications/ChatGPT.app/Contents/Resources/codex-cli/codex-package.json',
    ) ||
    budget.cumulativeWholeCampaignCeilings.listenerStarts !== 263 ||
    budget.cumulativeWholeCampaignCeilings.controlWrites !== 1034 ||
    budget.cumulativeWholeCampaignCeilings.sourceCapacity !== 644 ||
    budget.combinedListenerAllocationCeilingIncludingR16 !== 264
  )
    throw new Error('T3 fixed composition or allocation drift')
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
