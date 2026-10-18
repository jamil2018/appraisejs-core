/** Fresh full24 T2 campaign after native B14 completion; predecessors remain immutable. */
import { TA06_PINS, TA06_LABEL, verifyTA06ManifestHistory } from './ta06-archive.mjs'
import { STAGE_PROGRESS_POLICY, STAGES } from './stage-progress.mjs'
import fs from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyR44Predecessor } from './r44-evidence.mjs'
import { readStableFile } from './r21-evidence.mjs'
import { verifyR48HostFile } from './host-file.mjs'
import { buildR48CanonicalBytes } from './canonical-build.mjs'
import { fullT2RecoveryBudget } from './full-t2-budget.mjs'
import { GIT_FILE_PIN, READINESS_POLICY } from './git-readiness.mjs'
import { MINIMAL_ENVIRONMENT_PROFILE } from './environment-profile.mjs'
import { POLICY, POLICY_DIGEST, JOURNAL_BASE_POLICY_DIGEST, ROOT_AMENDMENT, digest } from './policy.mjs'
const HERE = dirname(fileURLToPath(import.meta.url)),
  REPO = resolve(HERE, '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r48')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-r48-full-t2-stage-diagnostic-01.md')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
export async function prepareR48MatrixManifest() {
  const predecessor = await verifyR44Predecessor(),
    old = predecessor.prepared.manifest
  const qualifiedPriorEvidence = {}
  const qualifiedPriorEvidenceFields = []
  for (const [key, value] of Object.entries(predecessor)) {
    if (!/^r[0-9]+TerminalEvidence$/.test(key) || !Object.hasOwn(old, key)) continue
    const previous = old[key]
    if (isDeepStrictEqual(value, previous)) qualifiedPriorEvidence[key] = structuredClone(previous)
    else {
      if (
        Object.hasOwn(previous, 'currentOriginalRootIdentity') ||
        !isDeepStrictEqual(value, { ...previous, currentOriginalRootIdentity: 'UNKNOWN' })
      )
        throw new Error('R48 archival evidence change exceeds exact current-identity UNKNOWN qualification')
      qualifiedPriorEvidence[key] = structuredClone(value)
      qualifiedPriorEvidenceFields.push(`${key}.currentOriginalRootIdentity`)
    }
  }
  const host = await verifyR48HostFile()
  if (host.processImageAttested !== false) throw new Error('R48 unexpected process attestation')
  const canonical = await buildR48CanonicalBytes(),
    budget = fullT2RecoveryBudget(old.recoveryBudget, predecessor.r44TerminalEvidence)
  const readStateSchemaPath = join(
    REPO,
    '.appraisejs/m02-executable-qualification-20261016-01/schemas/ServerNotification.json',
  )
  const readStateSchemaPin = old.artifacts.find(row => row.path === readStateSchemaPath)
  if (!readStateSchemaPin) throw new Error('R48 read-state schema pin missing')
  const readStateSchemaBytes = await readStableFile(readStateSchemaPath, readStateSchemaPin.sha256)
  const readStateSchema = JSON.parse(readStateSchemaBytes)
  if (readStateSchema.oneOf[3].properties.method.enum.join() !== 'thread/readState/changed')
    throw new Error('R48 notification method schema drift')
  const names = await fs.readdir(HERE)
  if (names.some(name => !/^[a-z0-9-]+\.mjs$/.test(name))) throw new Error('R48 source membership drift')
  const paths = new Set([
    ...names.sort().map(name => join(HERE, name)),
    PROPOSAL,
    join(REPO, '.appraisejs/m02-r47-source-snapshot-01.json'),
    join(REPO, '.appraisejs/m02-r47-actual-file-only-precheck-01.json'),
    join(REPO, '.appraisejs/m02-r47-focused-review-01.json'),
    join(REPO, '.appraisejs/m02-r47-file-only-precheck-effect-guard-01.json'),
    join(REPO, '.appraisejs/m02-r47-fixed-command-01.json'),
    join(REPO, '.appraisejs/m02-ta-matrix-build-r47/manifest.json'),
    join(REPO, '.appraisejs/m02-ta-matrix-build-r47/canonical-bridge.mjs'),
    ...(await fs.readdir(join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47')))
      .sort()
      .map(name => join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r47', name)),
    join(REPO, '.appraisejs/m02-r39-unexecuted-candidate-01.json'),
    join(REPO, '.appraisejs/m02-r39-focused-review-01.json'),
    join(REPO, '.appraisejs/m02-ta-matrix-build-r39/manifest.json'),
    join(REPO, '.appraisejs/m02-ta-matrix-build-r39/canonical-bridge.mjs'),
    join(REPO, 'tasks/codex-app-server-journeys/m02-r39-pre-admission-full-t2-01.md'),
    ...(await fs.readdir(join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r39')))
      .sort()
      .map(name => join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r39', name)),
    join(REPO, '.appraisejs/m02-r37-prelistener-history-timing-01.json'),
    join(REPO, 'tasks/codex-app-server-journeys/M02-R44-POSTRUN-CURRENT-WORK-01.md'),
  ])
  for (const name of [
    'm02-r44-native-terminal-01.json',
    'm02-r44-private-journal-holder-observation-01.json',
    'm02-r44-guarded-admission-timing-01.json',
    'm02-r44-postrun-file-integrity-01.json',
    'm02-r44-native-terminal-evidence-01/index.json',
    'm02-r44-user-authorization-context-01.json',
    'm02-t2-r44-recovery-user-decision.json',
    'm02-t2-r44-exact-review.json',
    'm02-r44-focused-review-01.json',
    'm02-r44-approved-native-submission-01.json',
    'm02-r44-fixed-command-01.json',
    'm02-ta-matrix-build-r44/manifest.json',
  ])
    paths.add(join(REPO, '.appraisejs', name))
  const schemaRoot = join(REPO, '.appraisejs/m02-r34-permission-schema-source-20261017-01'),
    schemaPinPath = join(schemaRoot, 'source-pin.json')
  const schemaPinBytes = await readStableFile(schemaPinPath),
    schemaPin = JSON.parse(schemaPinBytes)
  if (
    schemaPin.revision !== '4ebc485ca321243727539187169425fcf972f2c4' ||
    schemaPin.installed_binary_or_runtime_attested !== false ||
    schemaPin.files.length !== 5
  )
    throw new Error('R48 permission schema source drift')
  paths.add(schemaPinPath)
  for (const row of schemaPin.files) {
    if (
      ![
        'PermissionsRequestApprovalParams.json',
        'PermissionsRequestApprovalParams.ts',
        'RequestPermissionProfile.ts',
        'request_permissions.rs',
        'RequestId.json',
      ].includes(row.local_file)
    )
      throw new Error('R48 permission schema membership drift')
    const file = join(schemaRoot, row.local_file),
      bytes = await readStableFile(file)
    if (
      bytes.length !== row.size_bytes ||
      createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== row.git_blob_sha1
    )
      throw new Error('R48 permission schema blob drift')
    paths.add(file)
  }
  const readStateSourceRoot = join(REPO, '.appraisejs/m02-r35-readstate-source-20261017-01')
  const readStateSourcePinPath = join(readStateSourceRoot, 'source-pin-02.json')
  const readStateSourcePinBytes = await readStableFile(readStateSourcePinPath)
  const readStateSourcePin = JSON.parse(readStateSourcePinBytes)
  if (
    readStateSourcePin.revision !== '4ebc485ca321243727539187169425fcf972f2c4' ||
    readStateSourcePin.installed_binary_or_runtime_attested !== false ||
    readStateSourcePin.files.length !== 6
  )
    throw new Error('R48 read-state source drift')
  paths.add(readStateSourcePinPath)
  for (const row of readStateSourcePin.files) {
    if (
      ![
        'thread_read_state.rs',
        'thread_lifecycle.rs',
        'thread_state.rs',
        'ThreadReadStateChangedNotification.json',
        'ThreadReadStateChangedNotification.ts',
        'ThreadReadState.ts',
      ].includes(row.local_file)
    )
      throw new Error('R48 read-state source membership drift')
    const file = join(readStateSourceRoot, row.local_file),
      bytes = await readStableFile(file)
    if (
      bytes.length !== row.size_bytes ||
      createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== row.git_blob_sha1
    )
      throw new Error('R48 read-state source blob drift')
    paths.add(file)
  }
  const index = JSON.parse(
    await readStableFile(predecessor.r44TerminalEvidence.indexPath, predecessor.r44TerminalEvidence.indexSha256),
  )
  for (const row of index.files) {
    paths.add(join(dirname(predecessor.r44TerminalEvidence.indexPath), row.copy))
  }
  const ta06Ledger = JSON.parse(
    await readStableFile(TA06_PINS.ledger.path, TA06_PINS.ledger.sha256, { max: 4 * 1024 * 1024 }),
  )
  const ta06Claims = new Map(ta06Ledger.newlyAbsentManifestClaims.map(row => [row.predecessorClaim.path, row]))
  for (const pin of Object.values(TA06_PINS)) if (typeof pin === 'object') paths.add(pin.path)
  for (const witness of [
    ...ta06Ledger.newlyAbsentManifestClaims,
    ...ta06Ledger.additionalR44OriginalCopyEvidence,
    ...ta06Ledger.additionalEarlierOriginalEvidence,
  ]) {
    paths.add(witness.archiveIndex)
    paths.add(witness.archiveCopy)
  }
  const artifacts = new Map(
    old.artifacts.map(row => [
      row.path,
      {
        ...row,
        ...(ta06Claims.has(row.path) ? { availability: TA06_LABEL } : {}),
        purpose:
          row.purpose === 'matrix-canonical-backend'
            ? 'historical-r44-canonical-backend'
            : row.purpose === 'scoped-mcp-entry'
              ? 'historical-r44-scoped-entry'
              : row.purpose,
      },
    ]),
  )
  for (const file of [...paths].sort()) {
    const row = { path: file, purpose: `r48:${relative(REPO, file)}`, sha256: sha(await readStableFile(file)) },
      previous = artifacts.get(file)
    if (previous && previous.sha256 !== row.sha256) throw new Error('R48 predecessor pin contradiction')
    if (!previous) artifacts.set(file, row)
  }
  const scoped = artifacts.get(join(HERE, 'scoped-entry.mjs'))
  artifacts.set(scoped.path, { ...scoped, purpose: 'scoped-mcp-entry' })
  const active = {
    path: join(BUILD, 'canonical-bridge.mjs'),
    purpose: 'matrix-canonical-backend',
    sha256: canonical.sha256,
  }
  if (artifacts.has(active.path)) throw new Error('R48 output collision')
  const manifest = {
    ...structuredClone(old),
    ...qualifiedPriorEvidence,
    archivalPriorEvidenceQualification: {
      addedFields: qualifiedPriorEvidenceFields,
      onlyValue: 'UNKNOWN',
      everyOriginalFieldPreservedExactly: true,
    },
    version: 'appraise.m02-ta-matrix-r48/v1',
    root: POLICY.roots.T2,
    cases: POLICY.cases.filter(item => item.phase === 'T2').map(item => item.id),
    probeOnly: false,
    diagnosticOnly: false,
    stopAfterB01: false,
    fullT2Qualification: false,
    environmentProfile: MINIMAL_ENVIRONMENT_PROFILE,
    ta06Qualification: {
      pins: TA06_PINS,
      manifestHistoricalClaims: 580,
      additionalNonManifestWitnesses: 68,
      originalTA04Claims: 23,
      absentHistoricalRoots: 18,
      historicalDirectoryMetadata: 'NOT_RETAINED_UNKNOWN',
      p7OriginalFileMetadata: 'NOT_RETAINED_UNKNOWN',
      currentOriginalRootIdentity: 'UNKNOWN',
      archiveCopyMetadataIsNotOriginalIdentity: true,
      priorSemanticChecksRetained: true,
    },
    stageProgress: { ...STAGE_PROGRESS_POLICY, stages: STAGES, additionalOsQueries: 0, diagnosticAuthority: false },
    childPathDiagnostics: {
      firstUnreviewedPath: 'ONE_CLOSED_CLASSIFICATION_INDEPENDENT_OF_15_OBSERVATION_OVERFLOW',
      actualR41RejectedPath: 'UNKNOWN',
      additionalOsQueries: 0,
      rawPathOrHashOrPidArgumentsEnvironmentRetained: false,
      readinessAcceptanceChanged: false,
      diagnosticCanPrecedeDifferentFailure: true,
    },
    admissionAccounting: {
      fullRecursiveHistory: 'EVERY_CASE_IMMEDIATELY_BEFORE_BEGIN',
      phaseAnchor: 'BEFORE_FIRST_ADMISSION_SCAN_NO_RESET',
      phaseDeadlineMs: POLICY.deadlineMs.T2,
      admittedCaseDeadlineMs: POLICY.deadlineMs.case,
      historicalScanExcludedFromCaseTimer: true,
      historicalScanIncludedInPhaseTimer: true,
      privateSingleUseExactCaseManifestRootPhaseBinding: true,
      listenerAndSpawnCurrentGuardsUnchanged: true,
      totalPerCaseWallClockAccountingChanged: true,
    },
    processStateObserver: structuredClone(old.processStateObserver),
    historicalR44InstalledCodeModeHost: structuredClone(old.installedCodeModeHost),
    installedCodeModeHost: host,
    qualifiedGitFile: GIT_FILE_PIN,
    policyDigest: POLICY_DIGEST,
    amendedPolicyDigest: POLICY_DIGEST,
    journalBasePolicyDigest: JOURNAL_BASE_POLICY_DIGEST,
    rootAmendment: ROOT_AMENDMENT,
    gitReadiness: {
      ...structuredClone(old.gitReadiness),
      applicableCases: 23,
      maximumCampaignReadinessAndStrictOsPortCalls: 23 * 1118,
    },
    permissionDiagnostics: {
      evidenceClass: 'CLOSED_SANITIZED_FIRST_REJECTED_PREDICATE_NO_RAW_FRAME',
      maximumRetainedFailures: 1,
      rawFrameOrValuesRetained: false,
      schemaCorrection: 'OPTIONAL_NULL_FILESYSTEM_WITH_NO_FILESYSTEM_GRANT',
      permissionGrantPolicyChanged: false,
      actualR34RejectedPredicate: 'UNKNOWN',
    },
    readStateNotification: {
      method: 'thread/readState/changed',
      observedMethodSha256: 'c01777adbac1a378a064995a4fc9ba94568b0153b1159c4e97699d0121e76c51',
      schemaPath: readStateSchemaPath,
      schemaSha256: sha(readStateSchemaBytes),
      actualR35ParameterShape: 'UNKNOWN',
      classification: 'CORRELATED_PASSIVE_PRESENTATION_NOT_AUTHORITY_OR_ACK',
      sourcePinPath: readStateSourcePinPath,
      sourcePinSha256: sha(readStateSourcePinBytes),
      actualR35EmitterPath: 'UNKNOWN',
      rawParamsRetained: false,
    },
    permissionSchemaSourceEvidence: {
      path: schemaPinPath,
      sha256: sha(schemaPinBytes),
      qualification: 'PINNED_SOURCE_SCHEMA_COMPATIBILITY_NOT_ACTUAL_R34_PREDICATE',
      installedBinaryProvenanceAttested: false,
    },
    artifacts: [active, ...artifacts.values()],
    recoveryBudget: budget,
    historicalR44SourceHostBudget: structuredClone(old.sourceHostBudget),
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
    recoveryProposalSha256: artifacts.get(PROPOSAL).sha256,
    r44TerminalEvidence: predecessor.r44TerminalEvidence,
    predecessorR44Manifest: {
      path: join(REPO, '.appraisejs/m02-ta-matrix-build-r44/manifest.json'),
      sha256: predecessor.prepared.manifestFileSha256,
      manifestDigest: predecessor.prepared.manifestDigest,
    },
    priorEvidence: {
      ...structuredClone(old.priorEvidence),
      r44: {
        status: 'UNKNOWN',
        casesCompleted: 4,
        completedCases: predecessor.r44TerminalEvidence.completedCases,
        failedCase: null,
        pending: [],
        cleanup: predecessor.r44TerminalEvidence.cleanup,
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
    evidenceClass: 'TA06_FULL_T2_WITH_BOUNDED_STAGE_PROGRESS_DIAGNOSTIC',
    receiptEncoding: {
      historicalAvailability: 'SHA256_OF_EXACT_UTF8_JSON_STRINGIFY_MANIFEST_VALUE',
      completeHistoricalWitnessesRetainedAndVerified: true,
      fixedReceiptByteLimit: 65536,
      historicalSemanticAndArchiveChecksChanged: true,
      exactTA06QualificationApplied: true,
    },
    unexecutedR39Candidate: {
      recordPath: join(REPO, '.appraisejs/m02-r39-unexecuted-candidate-01.json'),
      nativeAllocation: 0,
      reason: 'REQUIRED_RECEIPT_EXCEEDS_EXISTING_64K_LIMIT_BEFORE_ANY_RECEIPT_WRITE',
    },
    runtimeAuthorized: false,
  }
  if (
    POLICY.cases.length !== 24 ||
    READINESS_POLICY.maxSamples !== 50 ||
    READINESS_POLICY.cleanupReserveMs !== 10000 ||
    manifest.artifacts.filter(row => row.purpose === 'matrix-canonical-backend').length !== 1 ||
    manifest.artifacts.filter(row => row.purpose === 'scoped-mcp-entry').length !== 1 ||
    manifest.artifacts.filter(row => row.availability === 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED').length !== 23 ||
    manifest.artifacts.filter(row => row.availability === TA06_LABEL).length !== 580 ||
    budget.cumulativeWholeCampaignCeilings.listenerStarts !== 233 ||
    budget.cumulativeWholeCampaignCeilings.controlWrites !== 914 ||
    budget.cumulativeWholeCampaignCeilings.sourceCapacity !== 574 ||
    budget.combinedListenerAllocationCeilingIncludingR16 !== 234
  )
    throw new Error('R48 exact full T2 composition or allocation drift')
  await verifyTA06ManifestHistory(manifest)
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
