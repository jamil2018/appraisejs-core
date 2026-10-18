/** Additive T3 preparation. Actual full T2 evidence is mandatory; this module grants no runtime authority. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyFullT2Predecessor } from './r41-evidence.mjs'
import { readStableFile } from '../codex-app-server-m02-ta-matrix-r41/r21-evidence.mjs'
import { verifyR42HostFile } from './host-file.mjs'
import { buildWorkspaceCanonicalBytes } from './canonical-build.mjs'
import { fullT3RecoveryBudget, DEDICATED_TOOL_HELPER_SOURCE_EXPECTATIONS } from './full-t3-budget.mjs'
import { NATIVE_PINS } from './native-plans.mjs'
import { verifyNativeContractSources, NATIVE_CONTRACT_SOURCE_PINS } from './native-contracts.mjs'
import { POLICY, POLICY_DIGEST, JOURNAL_BASE_POLICY_DIGEST, ROOT, digest } from './policy.mjs'

const HERE = dirname(fileURLToPath(import.meta.url)),
  REPO = resolve(HERE, '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-workspace-build-r42')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t3-r42-native-plan-01.md')
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
  return { path: file, purpose: `r42:${relative(REPO, file)}`, sha256: sha(await readStableFile(file, expected)) }
}

export async function prepareWorkspaceManifest() {
  const predecessor = await verifyFullT2Predecessor()
  const old = predecessor.prepared.manifest
  const host = await verifyR42HostFile()
  if (host.processImageAttested !== false) throw new Error('T3 unexpected process attestation')
  const canonical = await buildWorkspaceCanonicalBytes()
  const budget = fullT3RecoveryBudget(old.recoveryBudget, predecessor.r41TerminalEvidence)
  const nativeContractQualification = await verifyNativeContractSources()
  const names = await fs.readdir(HERE)
  if (names.some(name => !/^[a-z0-9-]+\.mjs$/.test(name))) throw new Error('T3 source membership drift')
  const paths = new Map(names.sort().map(name => [join(HERE, name), undefined]))
  paths.set(PROPOSAL, undefined)
  for (const [file, expected] of TA03_PINS) paths.set(join(REPO, file), expected)
  for (const row of NATIVE_CONTRACT_SOURCE_PINS) paths.set(row.path, row.sha256)
  for (const row of Object.values(NATIVE_PINS)) paths.set(row.path, row.sha256)
  for (const name of [
    'm02-r41-native-terminal-01.json',
    'm02-r41-native-terminal-evidence-01/index.json',
    'm02-r41-user-authorization-context-01.json',
    'm02-t2-r41-recovery-user-decision.json',
    'm02-t2-r41-exact-review.json',
    'm02-r41-focused-review-01.json',
    'm02-r41-approved-native-submission-01.json',
    'm02-r41-fixed-command-01.json',
    'm02-ta-matrix-build-r41/manifest.json',
  ])
    paths.set(join(REPO, '.appraisejs', name), undefined)
  const terminalIndex = JSON.parse(
    await readStableFile(predecessor.r41TerminalEvidence.indexPath, predecessor.r41TerminalEvidence.indexSha256),
  )
  for (const row of terminalIndex.files) {
    paths.set(row.originalPath, row.sha256)
    paths.set(join(dirname(predecessor.r41TerminalEvidence.indexPath), row.copy), row.sha256)
  }
  const artifacts = new Map(
    old.artifacts.map(row => [
      row.path,
      {
        ...row,
        purpose:
          row.purpose === 'matrix-canonical-backend'
            ? 'historical-r41-canonical-backend'
            : row.purpose === 'scoped-mcp-entry'
              ? 'historical-r41-scoped-entry'
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
  const manifest = {
    ...structuredClone(old),
    version: 'appraise.m02-ta-workspace-r42/v1',
    phase: 'T3',
    root: ROOT,
    cases: POLICY.cases.filter(item => item.phase === 'T3').map(item => item.id),
    policyDigest: POLICY_DIGEST,
    amendedPolicyDigest: POLICY_DIGEST,
    journalBasePolicyDigest: JOURNAL_BASE_POLICY_DIGEST,
    historicalR41RootAmendment: structuredClone(old.rootAmendment),
    rootAmendment: {
      version: 'appraise.m02-ta-workspace-r42-root-amendment/v1',
      from: '/private/tmp/appraise-m02-ta-workspace-p1',
      to: ROOT,
      recovery: 'FRESH_T3_ROOT_NO_REPLAY',
    },
    probeOnly: false,
    diagnosticOnly: false,
    stopAfterB01: false,
    fullT2Qualification: false,
    acceptedFullT2Evidence: true,
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
    historicalR41FutureInvocation: structuredClone(old.futureInvocation),
    futureInvocation: {
      requestedHostToolMode: 'exec_command sandbox_permissions=require_escalated',
      workdir: REPO,
      noAutomaticFurtherInvocation: true,
      priorUnknownsRequired: structuredClone(old.futureInvocation.priorUnknownsRequired),
    },
    r41TerminalEvidence: predecessor.r41TerminalEvidence,
    recoveryBudget: budget,
    historicalR41SourceHostBudget: structuredClone(old.sourceHostBudget),
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
    historicalR41EnvironmentProfile: structuredClone(old.environmentProfile),
    environmentProfile: {
      version: 'appraise.m02-r42-explicit-three-key-launch-environment/v1',
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
      historicalSemanticAndArchiveChecksChanged: false,
    },
    runtimeAuthorized: false,
  }
  if (
    manifest.cases.join(',') !== 'N01,N02' ||
    manifest.artifacts.filter(row => row.purpose === 'matrix-canonical-backend').length !== 1 ||
    manifest.artifacts.filter(row => row.purpose === 'scoped-mcp-entry').length !== 1 ||
    manifest.artifacts.filter(row => row.availability === 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED').length !== 23 ||
    !manifest.artifacts.some(
      row => row.path === '/Applications/ChatGPT.app/Contents/Resources/codex-cli/codex-package.json',
    ) ||
    budget.cumulativeWholeCampaignCeilings.listenerStarts !== 186 ||
    budget.cumulativeWholeCampaignCeilings.controlWrites !== 726 ||
    budget.cumulativeWholeCampaignCeilings.sourceCapacity !== 460 ||
    budget.combinedListenerAllocationCeilingIncludingR16 !== 187
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
