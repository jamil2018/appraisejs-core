/** Fresh B14 read-state working probe. Consumed predecessors remain immutable; full T2 is incomplete. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyR35Predecessor } from './r35-evidence.mjs'
import { readStableFile } from './r21-evidence.mjs'
import { verifyR36HostFile } from './host-file.mjs'
import { buildR36CanonicalBytes } from './canonical-build.mjs'
import { singleB14RecoveryBudget } from './single-b14-budget.mjs'
import { GIT_FILE_PIN, READINESS_POLICY } from './git-readiness.mjs'
import { MINIMAL_ENVIRONMENT_PROFILE } from './environment-profile.mjs'
import { POLICY, POLICY_DIGEST, JOURNAL_BASE_POLICY_DIGEST, ROOT_AMENDMENT, digest } from './policy.mjs'
const HERE = dirname(fileURLToPath(import.meta.url)),
  REPO = resolve(HERE, '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r36')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-r36-b14-read-state-01.md')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
export async function prepareR36MatrixManifest() {
  const predecessor = await verifyR35Predecessor(),
    old = predecessor.prepared.manifest
  const host = await verifyR36HostFile()
  if (host.processImageAttested !== false) throw new Error('R36 unexpected process attestation')
  const canonical = await buildR36CanonicalBytes(),
    budget = singleB14RecoveryBudget(old.recoveryBudget, predecessor.r35TerminalEvidence)
  const readStateSchemaPath = join(
    REPO,
    '.appraisejs/m02-executable-qualification-20261016-01/schemas/ServerNotification.json',
  )
  const readStateSchemaPin = old.artifacts.find(row => row.path === readStateSchemaPath)
  if (!readStateSchemaPin) throw new Error('R36 read-state schema pin missing')
  const readStateSchemaBytes = await readStableFile(readStateSchemaPath, readStateSchemaPin.sha256)
  const readStateSchema = JSON.parse(readStateSchemaBytes)
  if (readStateSchema.oneOf[3].properties.method.enum.join() !== 'thread/readState/changed')
    throw new Error('R36 notification method schema drift')
  const names = await fs.readdir(HERE)
  if (names.some(name => !/^[a-z0-9-]+\.mjs$/.test(name))) throw new Error('R36 source membership drift')
  const paths = new Set([
    ...names.sort().map(name => join(HERE, name)),
    PROPOSAL,
    join(REPO, 'tasks/codex-app-server-journeys/m02-r35-native-findings-01.md'),
  ])
  for (const name of [
    'm02-r35-native-terminal-01.json',
    'm02-r35-native-terminal-evidence-01/index.json',
    'm02-r35-user-authorization-context-01.json',
    'm02-t2-r35-recovery-user-decision.json',
    'm02-t2-r35-exact-review.json',
    'm02-r35-focused-review-01.json',
    'm02-r35-approved-native-submission-01.json',
    'm02-r35-fixed-command-01.json',
    'm02-ta-matrix-build-r35/manifest.json',
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
    throw new Error('R36 permission schema source drift')
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
      throw new Error('R36 permission schema membership drift')
    const file = join(schemaRoot, row.local_file),
      bytes = await readStableFile(file)
    if (
      bytes.length !== row.size_bytes ||
      createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== row.git_blob_sha1
    )
      throw new Error('R36 permission schema blob drift')
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
    throw new Error('R36 read-state source drift')
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
      throw new Error('R36 read-state source membership drift')
    const file = join(readStateSourceRoot, row.local_file),
      bytes = await readStableFile(file)
    if (
      bytes.length !== row.size_bytes ||
      createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== row.git_blob_sha1
    )
      throw new Error('R36 read-state source blob drift')
    paths.add(file)
  }
  const index = JSON.parse(
    await readStableFile(predecessor.r35TerminalEvidence.indexPath, predecessor.r35TerminalEvidence.indexSha256),
  )
  for (const row of index.files) {
    paths.add(row.originalPath)
    paths.add(join(dirname(predecessor.r35TerminalEvidence.indexPath), row.copy))
  }
  const artifacts = new Map(
    old.artifacts.map(row => [
      row.path,
      {
        ...row,
        purpose:
          row.purpose === 'matrix-canonical-backend'
            ? 'historical-r35-canonical-backend'
            : row.purpose === 'scoped-mcp-entry'
              ? 'historical-r35-scoped-entry'
              : row.purpose,
      },
    ]),
  )
  for (const file of [...paths].sort()) {
    const row = { path: file, purpose: `r36:${relative(REPO, file)}`, sha256: sha(await readStableFile(file)) },
      previous = artifacts.get(file)
    if (previous && previous.sha256 !== row.sha256) throw new Error('R36 predecessor pin contradiction')
    if (!previous) artifacts.set(file, row)
  }
  const scoped = artifacts.get(join(HERE, 'scoped-entry.mjs'))
  artifacts.set(scoped.path, { ...scoped, purpose: 'scoped-mcp-entry' })
  const active = {
    path: join(BUILD, 'canonical-bridge.mjs'),
    purpose: 'matrix-canonical-backend',
    sha256: canonical.sha256,
  }
  if (artifacts.has(active.path)) throw new Error('R36 output collision')
  const manifest = {
    ...structuredClone(old),
    version: 'appraise.m02-ta-matrix-r36/v1',
    root: POLICY.roots.T2,
    cases: ['B14'],
    probeOnly: true,
    diagnosticOnly: true,
    stopAfterB01: false,
    fullT2Qualification: false,
    environmentProfile: MINIMAL_ENVIRONMENT_PROFILE,
    processStateObserver: structuredClone(old.processStateObserver),
    qualifiedGitFile: GIT_FILE_PIN,
    policyDigest: POLICY_DIGEST,
    amendedPolicyDigest: POLICY_DIGEST,
    journalBasePolicyDigest: JOURNAL_BASE_POLICY_DIGEST,
    rootAmendment: ROOT_AMENDMENT,
    gitReadiness: {
      ...structuredClone(old.gitReadiness),
      applicableCases: 1,
      maximumCampaignReadinessAndStrictOsPortCalls: 1118,
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
    historicalR35SourceHostBudget: structuredClone(old.sourceHostBudget),
    sourceHostBudget: {
      maximum: budget.newT2Maximum.sourceCapacity,
      t2CapacityAllocation: budget.newT2Maximum.sourceCapacity,
      futureT3CapacityAllocation: 0,
      allPhaseOuterMaximum: 1,
      auditRequestsMaximum: 0,
      reservationEvidenceClass: 'SOURCE_BOUND_CAPACITY_RESERVED',
      actualShortLivedHostStarts: 'UNKNOWN',
      actualHostCountAttested: false,
    },
    recoveryProposalPath: PROPOSAL,
    recoveryProposalSha256: artifacts.get(PROPOSAL).sha256,
    r35TerminalEvidence: predecessor.r35TerminalEvidence,
    predecessorR35Manifest: {
      path: join(REPO, '.appraisejs/m02-ta-matrix-build-r35/manifest.json'),
      sha256: predecessor.prepared.manifestFileSha256,
      manifestDigest: predecessor.prepared.manifestDigest,
    },
    priorEvidence: {
      ...structuredClone(old.priorEvidence),
      r35: {
        status: 'UNKNOWN',
        casesCompleted: 0,
        failedCase: 'B14',
        pending: [],
        cleanup: 'UNKNOWN',
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
    evidenceClass: 'ONE_B14_WORKING_DIAGNOSTIC_PROBE_NOT_FULL_T2_EXACT_REVIEW_REQUIRED',
    runtimeAuthorized: false,
  }
  if (
    POLICY.cases.length !== 1 ||
    POLICY.cases[0].id !== 'B14' ||
    READINESS_POLICY.maxSamples !== 50 ||
    READINESS_POLICY.cleanupReserveMs !== 10000 ||
    manifest.artifacts.filter(row => row.purpose === 'matrix-canonical-backend').length !== 1 ||
    manifest.artifacts.filter(row => row.purpose === 'scoped-mcp-entry').length !== 1 ||
    manifest.artifacts.filter(row => row.availability === 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED').length !== 23 ||
    budget.cumulativeWholeCampaignCeilings.listenerStarts !== 136 ||
    budget.cumulativeWholeCampaignCeilings.controlWrites !== 526 ||
    budget.cumulativeWholeCampaignCeilings.sourceCapacity !== 340 ||
    budget.combinedListenerAllocationCeilingIncludingR16 !== 137
  )
    throw new Error('R36 exact B14 composition or allocation drift')
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
