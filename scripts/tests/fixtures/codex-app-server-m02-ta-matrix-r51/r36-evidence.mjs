/** Exact consumed R36 B14 completion; bounded cleanup only, never full T2 or global inventory proof. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { verifyR35Predecessor } from '../codex-app-server-m02-ta-matrix-r36/r35-evidence.mjs'
import { serializeR36Preparation } from '../codex-app-server-m02-ta-matrix-r36/preparation.mjs'
import { verifyR36HistoricalClosure } from '../codex-app-server-m02-ta-matrix-r36/runtime-effects.mjs'
import { readStableFile } from '../codex-app-server-m02-ta-matrix-r36/r21-evidence.mjs'
import { requireTA04Absent } from '../codex-app-server-m02-ta-matrix-r36/prior-evidence.mjs'
import { POLICY as R36_POLICY } from '../codex-app-server-m02-ta-matrix-r36/policy.mjs'
import { verifyMcpChildReceipt } from '../codex-app-server-m02-ta-matrix-r10/mcp-readiness.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { digest, ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const OLD_ROOT = '/private/tmp/appraise-m02-ta-matrix-p21'
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r36/manifest.json')
const MANIFEST_SHA = '6818d63ad2d4e4073b3f0ab679e11d0399a2281a3fa759a7bb3e4d25dd466b10'
const MANIFEST_DIGEST = '2a5b8c750928032f7eb094172bf3529d0d816502e0b2a77d24eb28a714603260'
const TERMINAL = join(REPO, '.appraisejs/m02-r36-native-terminal-01.json')
const TERMINAL_SHA = 'e368676699d5bca766c308f2b3382b572a2c8f7acaf5457efe334090e2eeea36'
const INDEX = join(REPO, '.appraisejs/m02-r36-native-terminal-evidence-01/index.json')
const INDEX_SHA = '7a765d1fa388d194de8d322cb837b1518fc32b38a014ae51e23aa6ffcf7baa77'
const CASES = Object.freeze(R36_POLICY.cases.filter(item => item.phase === 'T2'))
export const R36_COUNTS = Object.freeze({
  listenerStarts: 1,
  controlWrites: 3,
  codexStarts: 1,
  mcpStarts: 1,
  threadStarts: 1,
  canonicalRequests: 2,
  turnStarts: 1,
  providerRequests: 2,
  outerCalls: 1,
  permissionReplies: 1,
  scopedCalls: 0,
  workspaceActions: 0,
  helperStarts: 0,
  auditRequests: 0,
})
const SHA256 = /^[a-f0-9]{64}$/
const KINDS = Object.freeze([...Object.keys(R36_POLICY.aggregate), 'outerCalls', 'auditRequests'])
const same = (a, b) => a?.dev === b?.dev && a?.ino === b?.ino
const sameFile = (a, b) =>
  ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key])
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = reason => {
  throw new Error(`R37 consumed R36 ${reason}`)
}
const privateDirectory = value =>
  value.isDirectory() && !value.isSymbolicLink() && value.uid === process.getuid() && (value.mode & 0o777) === 0o700
const ownedFile = value =>
  value.isFile() &&
  !value.isSymbolicLink() &&
  value.uid === process.getuid() &&
  value.nlink === 1 &&
  (value.mode & 0o777) === 0o600
const nonnegative = value => Number.isSafeInteger(value) && value >= 0
const AUTHORITY_PINS = Object.freeze({
  context: [
    '.appraisejs/m02-r36-user-authorization-context-01.json',
    '864545cca0c17145bc0b9c03c87efe0a8f72dddd8bb6ce8e1961e7d6c3841f14',
  ],
  decision: [
    '.appraisejs/m02-t2-r36-recovery-user-decision.json',
    '86e41d28fd79744480931efff9549b40b5bbfc31942532d271c9e7f926eae857',
  ],
  review: [
    '.appraisejs/m02-t2-r36-exact-review.json',
    '2f58082b4686fa2430e872ca2fb644421bb0fd8a375cf2d587e942607aa6a600',
  ],
  focused: [
    '.appraisejs/m02-r36-focused-review-01.json',
    '08f617772d1ac15c238a6daf9e610afa1f41a574bf3796bbf3ec1c6bd4f2effc',
  ],
  submission: [
    '.appraisejs/m02-r36-approved-native-submission-01.json',
    '29b906a26397cce6a470c7693c6d21358f2db9f2ad17c8e98572f6fbbd973e15',
  ],
})
const FIXED_COMMAND =
  "/usr/bin/env -i PATH=/usr/bin:/bin LANG=C /opt/homebrew/Cellar/node/26.11.0/bin/node '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r36/entrypoint.mjs' --run '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r36/manifest.json' 2a5b8c750928032f7eb094172bf3529d0d816502e0b2a77d24eb28a714603260 6818d63ad2d4e4073b3f0ab679e11d0399a2281a3fa759a7bb3e4d25dd466b10 2f58082b4686fa2430e872ca2fb644421bb0fd8a375cf2d587e942607aa6a600 86e41d28fd79744480931efff9549b40b5bbfc31942532d271c9e7f926eae857"

async function readPrepared() {
  const bytes = await readStableFile(MANIFEST, MANIFEST_SHA)
  const prepared = JSON.parse(bytes)
  if (
    prepared.schema !== 'appraise.m02-ta-matrix-r36-preparation/v1' ||
    prepared.manifestDigest !== MANIFEST_DIGEST ||
    digest(prepared.manifest) !== MANIFEST_DIGEST ||
    prepared.manifest.root !== OLD_ROOT ||
    prepared.manifest.phase !== 'T2' ||
    !isDeepStrictEqual(
      prepared.manifest.cases,
      CASES.map(item => item.id),
    ) ||
    prepared.blockers?.length !== 0 ||
    prepared.runtimeEligible !== false ||
    prepared.canonicalSha256 !== '7e0b3e6338063c112643434fa10a9c67403002da2165f0c356bbe12f8f8e046a'
  )
    fail('preparation drift')
  const history = await verifyR36HistoricalClosure(prepared.manifest)
  const paths = new Set()
  let current = 0
  for (const row of prepared.manifest.artifacts) {
    if (paths.has(row.path)) fail('artifact duplicate')
    paths.add(row.path)
    if (history.has(row.path)) {
      if (
        row.availability !== 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED' ||
        history.get(row.path).sha256 !== row.sha256
      )
        fail('historical artifact drift')
      continue
    }
    if (row.availability !== undefined) fail('current artifact availability drift')
    await readStableFile(row.path, row.sha256)
    current++
  }
  if (current !== 7921 || history.size !== 23 || paths.size !== 7944) fail('closure drift')
  const canonicalBytes = await readStableFile(join(dirname(MANIFEST), 'canonical-bridge.mjs'), prepared.canonicalSha256)
  if (!bytes.equals(serializeR36Preparation({ ...prepared, canonicalBytes }))) fail('serialized preparation drift')
  const seal = loadSealedRouteEvidence()
  if (seal.status !== 'SEALED_OFFLINE_ONLY') fail('sealed evidence invalid')
  return { ...prepared, canonicalBytes, seal, manifestFileSha256: MANIFEST_SHA }
}

async function verifyAuthority(prepared) {
  const values = {}
  for (const [key, [file, sha256]] of Object.entries(AUTHORITY_PINS))
    values[key] = JSON.parse(await readStableFile(join(REPO, file), sha256))
  const { context, decision, review, focused, submission } = values
  if (
    context.schema !== 'appraise.m02-r36-user-authorization-context/v1' ||
    context.authorizedAction !== 'ONE_FRESH_R36_P21_B14_INVOCATION' ||
    context.literalHashSpecificApprovalQuoteClaimed !== false ||
    context.noReplayOrResume !== true ||
    context.priorConsumedCommandsReusable !== false ||
    context.historicalAllocationsReset !== false ||
    context.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    context.combinedListenerAllocationCeilingIncludingR16 !==
      prepared.manifest.recoveryBudget.combinedListenerAllocationCeilingIncludingR16 ||
    context.manifest.path !== MANIFEST ||
    context.manifest.sha256 !== MANIFEST_SHA ||
    context.manifest.manifestDigest !== MANIFEST_DIGEST ||
    decision.verdict !== 'AUTHORIZE_ONE_FIXED_B14_R36_INVOCATION' ||
    decision.exactArtifactUserApprovalClaimed !== false ||
    decision.authorizationContext?.path !== join(REPO, AUTHORITY_PINS.context[0]) ||
    decision.authorizationContext.sha256 !== AUTHORITY_PINS.context[1] ||
    decision.manifestDigest !== MANIFEST_DIGEST ||
    decision.manifestFileSha256 !== MANIFEST_SHA ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    review.verdict !== 'ACCEPT_ONE_FIXED_B14_R36_INVOCATION' ||
    review.exactArtifactUserApprovalClaimed !== false ||
    review.manifest.fileSha256 !== MANIFEST_SHA ||
    review.manifest.manifestDigest !== MANIFEST_DIGEST ||
    review.independentReportSha256 !== AUTHORITY_PINS.focused[1] ||
    focused.verdict !== 'ACCEPT_R36_SINGLE_B14_PASSIVE_READ_STATE_CANDIDATE_ONLY' ||
    !isDeepStrictEqual(
      context.cumulativeWholeCampaignCeilings,
      prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    ) ||
    submission.schema !== 'appraise.m02-native-submission/v1' ||
    submission.campaign !== 'R36' ||
    submission.evidenceClass !== 'ONE_SUBMISSION_INTENT_NOT_EXECUTION_OR_HOST_APPROVAL_PROOF' ||
    submission.authorizationContext !== join(REPO, AUTHORITY_PINS.context[0]) ||
    submission.submissionCount !== 1 ||
    submission.precheck !== 'PASSED_NO_RUNTIME_AUTHORITY' ||
    submission.command?.runtimeAuthority !== false ||
    !isDeepStrictEqual(submission.command.argv, [...decision.exactInvocationPrefix, AUTHORITY_PINS.decision[1]]) ||
    !isDeepStrictEqual(decision.exactInvocationPrefix, [...review.exactInvocationPrefix, AUTHORITY_PINS.review[1]]) ||
    submission.command.command !== FIXED_COMMAND
  )
    fail('standing authority or review drift')
  await readStableFile(context.proposal.path, context.proposal.sha256)
  await readStableFile(context.standingAuthorization.path, context.standingAuthorization.sha256)
}

function countsValid(counts, item = null) {
  return (
    isDeepStrictEqual(Object.keys(counts ?? {}).sort(), [...KINDS].sort()) &&
    KINDS.every(kind => {
      const maximum = !item
        ? Infinity
        : kind === 'outerCalls'
          ? outerMaximum(item)
          : kind === 'auditRequests'
            ? auditRequestMaximum(item)
            : item.limits[kind]
      return nonnegative(counts[kind]) && counts[kind] <= maximum
    })
  )
}

const WITNESS = '58696b9e2a1af34b8ea41e5f5ef8198375f678c209f02a6bb1b1dbcb2e984c87'
const GIT_READINESS = Object.freeze({
  samples: 9,
  gitObserved: true,
  gitIdentityCount: 2,
  gitGone: true,
  gitPidReused: false,
  hostObserved: true,
  hostIdentityStable: true,
  readinessComplete: true,
})
const ENVIRONMENT_PROFILE = Object.freeze({
  profile: 'appraise.m02-r36-explicit-launch-environment/v1',
  directoryIdentity: {
    dev: 16777233,
    ino: 70723050,
  },
  empty: true,
  observation: 'TRUSTED_DIRECTORY_CHECK_NOT_FILESYSTEM_CONTAINMENT',
})
const STATE_OBSERVATIONS = Object.freeze({
  identities: [
    {
      ordinal: 1,
      counts: {
        RUNNABLE: 14,
        SLEEPING: 0,
        STOPPED: 0,
        ZOMBIE: 0,
        OTHER: 0,
      },
      goneObserved: true,
    },
    {
      ordinal: 2,
      counts: {
        RUNNABLE: 2,
        SLEEPING: 0,
        STOPPED: 0,
        ZOMBIE: 0,
        OTHER: 0,
      },
      goneObserved: true,
    },
  ],
  overflow: false,
  unavailable: false,
  additionalOsQueries: 0,
  rawArgumentsOrEnvironmentRead: false,
})
const PERMISSION_DIAGNOSTIC = Object.freeze({
  reason: 'ACCEPTED_SCHEMA',
  permissionsShape: 'NETWORK_PLUS_NULL_FILESYSTEM',
  fileSystem: 'NULL',
  cwd: 'MATCH',
  requestIdShape: 'SAFE_NONNEGATIVE_INTEGER',
  itemIdShape: 'SAFE_TOKEN',
  threadMatches: true,
  turnMatches: true,
  startedAtSafeInteger: true,
  networkEnabled: true,
  environmentIdShape: 'STRING',
  reasonShape: 'STRING',
})

function verifyJournal(bytes, terminal, index, prepared) {
  const text = bytes.toString('utf8')
  if (!text.endsWith('\n')) fail('journal partial line')
  const records = text
    .slice(0, -1)
    .split('\n')
    .map(line => JSON.parse(line))
  const counts = Object.fromEntries(KINDS.map(kind => [kind, 0]))
  const reserved = new Set(),
    pending = new Set(),
    types = new Map()
  let previous = '0'.repeat(64),
    begun = 0,
    finished = 0,
    source = 0,
    active = null,
    acknowledgements = 0
  for (const [position, row] of records.entries()) {
    if (
      row.seq !== position + 1 ||
      row.previous !== previous ||
      row.hash !== sha(JSON.stringify({ seq: row.seq, previous: row.previous, event: row.event }))
    )
      fail('journal chain drift')
    previous = row.hash
    const event = row.event
    if (!['init', 'begin', 'reserve', 'ack', 'finish', 'checkpoint'].includes(event.type))
      fail('unexpected journal event')
    types.set(event.type, (types.get(event.type) ?? 0) + 1)
    if (
      event.type === 'init' &&
      (position !== 0 ||
        event.phase !== 'T2' ||
        event.policyDigest !== prepared.manifest.journalBasePolicyDigest ||
        !same(event.directoryIdentity, index.rootIdentity) ||
        !same(event.fileIdentity, { dev: 16777233, ino: 70716923 }) ||
        !same(event.fileIdentity, index.files.find(item => item.copy === 'phase-journal.jsonl')?.originalIdentity))
    )
      fail('journal init drift')
    if (event.type !== 'init' && position === 0) fail('journal init missing')
    if (event.type === 'begin') {
      if (
        active !== null ||
        begun !== 0 ||
        event.caseId !== 'B14' ||
        event.sourceHostCapacity !== 2 ||
        event.evidenceClass !== 'SOURCE_BOUND_CAPACITY_RESERVED'
      )
        fail('begin or source allocation drift')
      active = event.caseId
      begun++
      source += event.sourceHostCapacity
    }
    if (event.type === 'reserve') {
      if (
        active !== 'B14' ||
        !KINDS.includes(event.kind) ||
        typeof event.id !== 'string' ||
        reserved.has(event.id) ||
        (event.kind === 'permissionReplies' ? event.id !== 'permission-0' : !event.id.startsWith('B14-'))
      )
        fail('reservation drift')
      reserved.add(event.id)
      pending.add(event.id)
      counts[event.kind]++
      if (!countsValid(counts, CASES[0])) fail('per-case reservation ceiling drift')
    }
    if (event.type === 'ack') {
      if (active !== 'B14' || !pending.delete(event.id)) fail('ACK without bound pending reservation')
      acknowledgements++
    }
    if (event.type === 'finish') {
      if (
        position !== records.length - 2 ||
        active !== 'B14' ||
        finished !== 0 ||
        pending.size ||
        event.cleanupKnown !== true ||
        event.outcome !== 'permission-denied' ||
        event.caseWitnessSha256 !== WITNESS ||
        !isDeepStrictEqual(counts, terminal.completedCases[0].counts)
      )
        fail('finish witness drift')
      active = null
      finished++
    }
    if (
      event.type === 'checkpoint' &&
      (position !== records.length - 1 ||
        active !== null ||
        finished !== 1 ||
        pending.size ||
        !isDeepStrictEqual(event, { type: 'checkpoint' }))
    )
      fail('terminal checkpoint drift')
  }
  if (
    records.length !== 32 ||
    index.journalRecords !== 32 ||
    terminal.journal.records !== 32 ||
    previous !== index.journalLastHash ||
    previous !== terminal.journal.terminalHash ||
    begun !== 1 ||
    finished !== 1 ||
    source !== 2 ||
    active !== null ||
    reserved.size !== 14 ||
    acknowledgements !== 14 ||
    pending.size ||
    !isDeepStrictEqual(counts, R36_COUNTS) ||
    !isDeepStrictEqual(counts, terminal.consumed) ||
    !isDeepStrictEqual(Object.fromEntries(types), {
      init: 1,
      begin: 1,
      reserve: 14,
      ack: 14,
      finish: 1,
      checkpoint: 1,
    }) ||
    records.at(-2).event.type !== 'finish' ||
    records.at(-1).event.type !== 'checkpoint'
  )
    fail('terminal journal accounting drift')
  return true
}

function expectedNames() {
  return new Set([
    'phase-journal.jsonl',
    ...[
      'script-plan.json',
      'provider-response-1.json',
      'provider-response-2.json',
      'mcp-startup.json',
      'mcp-exit.json',
      'case-outcome.json',
      'permission-request.json',
      'permission-terminal.json',
    ].map(name => `B14--${name}`),
  ])
}

function verifyCompletedWitness(receipts, terminal) {
  const completed = terminal.completedCases[0],
    outcome = receipts.get('B14--case-outcome.json')
  if (
    completed.caseId !== 'B14' ||
    completed.outcome !== 'permission-denied' ||
    completed.caseWitnessSha256 !== WITNESS ||
    completed.cleanupKnown !== true ||
    !isDeepStrictEqual(completed.counts, R36_COUNTS) ||
    !isDeepStrictEqual(completed.gitReadiness, GIT_READINESS) ||
    !isDeepStrictEqual(completed.environmentProfile, ENVIRONMENT_PROFILE) ||
    !isDeepStrictEqual(completed.processStates, STATE_OBSERVATIONS) ||
    !isDeepStrictEqual(completed.permissionRequestDiagnostic, PERMISSION_DIAGNOSTIC) ||
    completed.canonicalAccepted !== true ||
    completed.listenerClosed !== true ||
    outcome?.schema !== 'appraise.m02-ta-matrix-supervisor-receipt/v1' ||
    outcome.evidenceClass !== 'TRUSTED_SUPERVISOR_OBSERVATION' ||
    outcome.name !== 'case-outcome' ||
    outcome.status !== 'OBSERVED_BEFORE_CASE_COMMIT' ||
    outcome.caseId !== 'B14' ||
    outcome.manifestDigest !== MANIFEST_DIGEST ||
    outcome.expected !== completed.outcome ||
    outcome.outcomeEvidenceClass !== 'TRUSTED_SCRIPTED_CONFORMANCE_NOT_CONTAINMENT' ||
    !isDeepStrictEqual(outcome.canonical, {
      acceptances: 0,
      artifacts: 0,
      effects: 0,
      evidenceClass: 'DISPOSABLE_CANONICAL_DATABASE_READ',
      accepted: true,
    }) ||
    !isDeepStrictEqual(outcome.ownedCodex, { exit: { code: 0, signal: null }, close: { code: 0, signal: null } }) ||
    outcome.hostCleanup?.pidReused !== false ||
    outcome.hostCleanup.originalHostGone !== true ||
    !isDeepStrictEqual(outcome.hostObservation, outcome.hostCleanup.observedHost) ||
    !isDeepStrictEqual(outcome.environmentProfile, completed.environmentProfile) ||
    !isDeepStrictEqual(outcome.processStates, completed.processStates) ||
    !isDeepStrictEqual(outcome.permissionRequestDiagnostic, completed.permissionRequestDiagnostic) ||
    outcome.journalSeq !== 30 ||
    outcome.listenerClosed !== true ||
    outcome.pending !== 0 ||
    !isDeepStrictEqual(outcome.counts, completed.counts) ||
    !isDeepStrictEqual(outcome.gitReadiness, completed.gitReadiness)
  )
    fail('completed canonical or bounded-cleanup witness drift')
  const plan = receipts.get('B14--script-plan.json'),
    request = receipts.get('B14--permission-request.json'),
    first = receipts.get('B14--provider-response-1.json'),
    continuation = receipts.get('B14--provider-response-2.json'),
    permissionTerminal = receipts.get('B14--permission-terminal.json')
  for (const [name, receipt] of [
    ['script-plan', plan],
    ['permission-request', request],
    ['provider-response-1', first],
    ['provider-response-2', continuation],
    ['permission-terminal', permissionTerminal],
  ]) {
    if (
      receipt?.schema !== outcome.schema ||
      receipt.evidenceClass !== outcome.evidenceClass ||
      receipt.name !== name ||
      receipt.caseId !== 'B14' ||
      receipt.grants !== 0
    )
      fail('permission receipt envelope drift')
  }
  if (
    plan.callId !== 'm02_B14_0' ||
    plan.operation !== 'request_permissions' ||
    plan.scriptSha256 !== '5c5b2a87b8d21c7eb374325fd19c98e80f2a909e6a3029ec9307ec54c31b0701' ||
    request.event !== 'permission-request-observed' ||
    request.requestedNetworkEnabled !== true ||
    request.threadTurnCorrelated !== true ||
    first.requestIndex !== 1 ||
    first.nativeStatus !== null ||
    continuation.requestIndex !== 2 ||
    continuation.nativeStatus !== 'EMPTY_PERMISSION_DENIAL_CORRELATED' ||
    first.permissionDeclarationHash !== continuation.permissionDeclarationHash ||
    first.descriptorHash !== continuation.descriptorHash ||
    first.wrapperDescriptorHash !== continuation.wrapperDescriptorHash ||
    permissionTerminal.event !== 'permission-denial-terminal' ||
    permissionTerminal.resolved !== true
  )
    fail('correlated empty-denial or resolved terminal drift')
  const startup = receipts.get('B14--mcp-startup.json'),
    exit = receipts.get('B14--mcp-exit.json')
  const proof = { capabilityHash: startup?.capabilityHash, bootstrapHash: startup?.bootstrapHash }
  if (
    !verifyMcpChildReceipt({
      receipt: startup,
      event: 'sdk-connect-returned',
      caseId: 'B14',
      bootstrapProof: proof,
      profileDigest: startup?.profileDigest,
    }) ||
    !verifyMcpChildReceipt({
      receipt: exit,
      event: 'node-exit-handler',
      caseId: 'B14',
      bootstrapProof: proof,
      profileDigest: startup?.profileDigest,
    }) ||
    outcome.childEvidence?.evidenceClass !== 'TRUSTED_CHILD_SELF_REPORT' ||
    !isDeepStrictEqual(outcome.childEvidence.receipt, exit) ||
    outcome.childEvidence.sha256 !== sha(JSON.stringify(exit))
  )
    fail('MCP startup or exit self-report witness drift')
}

export async function verifyR36Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR35Predecessor({ requireNewRootAbsent: false })
  const prepared = await readPrepared()
  await verifyAuthority(prepared)
  const terminal = JSON.parse(await readStableFile(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readStableFile(INDEX, INDEX_SHA))
  if (
    terminal.schema !== 'appraise.m02-r36-native-terminal/v1' ||
    terminal.evidenceClass !==
      'NATIVE_EXEC_TOOL_TERMINAL_TRANSCRIPTION_CORROBORATED_BY_HASH_VERIFIED_JOURNAL_AND_CASE_WITNESSES' ||
    terminal.toolSession !== 77019 ||
    terminal.exitCode !== 0 ||
    terminal.status !== 'B14_CASE_COMPLETED_NOT_FULL_T2' ||
    terminal.completed !== 1 ||
    terminal.failedCase !== null ||
    terminal.runtimeQualified !== false ||
    terminal.root !== OLD_ROOT ||
    terminal.manifestDigest !== MANIFEST_DIGEST ||
    terminal.manifestFileSha256 !== MANIFEST_SHA ||
    terminal.sourceHostCapacityReserved !== 2 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(terminal.pending, []) ||
    !isDeepStrictEqual(terminal.lateCaseDiagnostics, []) ||
    !isDeepStrictEqual(terminal.protocolFailures, []) ||
    terminal.completedCases?.length !== 1 ||
    terminal.cleanupQualification !== 'B14_BOUNDED_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED' ||
    !isDeepStrictEqual(terminal.consumed, R36_COUNTS) ||
    terminal.journal?.chainVerified !== true ||
    terminal.journal.reservations !== 14 ||
    terminal.journal.ACKs !== 14 ||
    terminal.noResendOrResume !== true ||
    terminal.T2 !== 'INCOMPLETE' ||
    terminal.T3 !== 'INCOMPLETE' ||
    terminal.M02 !== 'INCOMPLETE' ||
    index.schema !== 'appraise.m02-r36-native-terminal-evidence-index/v1' ||
    index.root !== OLD_ROOT ||
    !isDeepStrictEqual(index.rootIdentity, terminal.rootIdentity) ||
    index.rootIdentity?.dev !== 16777233 ||
    index.rootIdentity?.ino !== 70716922 ||
    index.journalChainVerified !== true ||
    index.runtimeAuthority !== false ||
    index.rawProviderAccountAuthHistoryOrDatabaseCopied !== false ||
    index.originalsRewritten !== false ||
    terminal.evidenceIndex?.path !== INDEX ||
    terminal.evidenceIndex.sha256 !== INDEX_SHA
  )
    fail('terminal or index drift')
  const names = expectedNames()
  if (
    !Array.isArray(index.files) ||
    index.files.length !== 9 ||
    !isDeepStrictEqual(index.files.map(row => row.copy).sort(), [...names].sort())
  )
    fail('closed sanitized membership drift')
  const directories = [
    OLD_ROOT,
    join(OLD_ROOT, 'cases'),
    dirname(INDEX),
    ...CASES.flatMap(item => [join(OLD_ROOT, 'cases', item.id), join(OLD_ROOT, 'cases', item.id, 'supervisor')]),
  ]
  const parents = []
  for (const directory of directories) {
    const stat = await fs.lstat(directory)
    if (!privateDirectory(stat)) fail('ancestor ownership or mode drift')
    parents.push({ directory, stat })
  }
  if (!same(parents[0].stat, index.rootIdentity)) fail('root identity drift')
  const receipts = new Map()
  let journalVerified = false
  for (const row of index.files) {
    const [caseId, name] = row.copy.split('--')
    const expected =
      row.copy === 'phase-journal.jsonl'
        ? join(OLD_ROOT, row.copy)
        : join(OLD_ROOT, 'cases', caseId, 'supervisor', name)
    if (row.originalPath !== expected || !SHA256.test(row.sha256 ?? '') || !nonnegative(row.bytes))
      fail('sanitized path or pin drift')
    const before = await fs.lstat(expected),
      copyPath = join(dirname(INDEX), row.copy),
      copyBefore = await fs.lstat(copyPath)
    if (
      !ownedFile(before) ||
      !ownedFile(copyBefore) ||
      ['dev', 'ino', 'uid'].some(key => before[key] !== row.originalIdentity?.[key]) ||
      (before.mode & 0o777) !== (row.originalIdentity.mode & 0o777)
    )
      fail('original or sanitized file identity drift')
    const original = await readStableFile(expected, row.sha256),
      copy = await readStableFile(copyPath, row.sha256)
    if (
      !sameFile(before, await fs.lstat(expected)) ||
      !sameFile(copyBefore, await fs.lstat(copyPath)) ||
      !original.equals(copy) ||
      copy.length !== row.bytes
    )
      fail('original or sanitized bytes drift')
    if (row.copy === 'phase-journal.jsonl') {
      if (row.sha256 !== terminal.journal.sha256) fail('journal pin drift')
      journalVerified = verifyJournal(copy, terminal, index, prepared)
    } else {
      if (name === 'case-outcome.json' && row.sha256 !== WITNESS) fail('case witness pin drift')
      receipts.set(row.copy, JSON.parse(copy))
    }
  }
  if (!journalVerified) fail('journal missing')
  verifyCompletedWitness(receipts, terminal)
  for (const { directory, stat } of parents) {
    const after = await fs.lstat(directory)
    if (!privateDirectory(after) || !same(stat, after)) fail('ancestor changed')
  }
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({
    ...old,
    prepared,
    r36TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: TERMINAL_SHA,
      indexPath: INDEX,
      indexSha256: INDEX_SHA,
      manifestFileSha256: MANIFEST_SHA,
      manifestDigest: MANIFEST_DIGEST,
      status: 'B14_CASE_COMPLETED_NOT_FULL_T2',
      casesCompleted: 1,
      completedCases: Object.freeze([
        Object.freeze({ caseId: 'B14', outcome: 'permission-denied', caseWitnessSha256: WITNESS, cleanupKnown: true }),
      ]),
      failedCase: null,
      cleanup: 'B14_BOUNDED_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED',
      cleanupQualification: 'B14_BOUNDED_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED',
      root: OLD_ROOT,
      rootIdentity: Object.freeze({ ...index.rootIdentity }),
      consumed: R36_COUNTS,
      sourceCapacityReserved: 2,
      actualSourceHostCount: 'UNATTESTED',
      pending: Object.freeze([]),
      caseWitnessSha256: WITNESS,
      boundedCleanupOnlyNotGlobalProcessAbsence: true,
      gitReadiness: structuredClone(GIT_READINESS),
      environmentProfile: structuredClone(ENVIRONMENT_PROFILE),
      processStates: structuredClone(STATE_OBSERVATIONS),
      permissionRequestDiagnostic: structuredClone(PERMISSION_DIAGNOSTIC),
      nativeEmptyDenialStatus: 'EMPTY_PERMISSION_DENIAL_CORRELATED',
      permissionRequests: 1,
      permissionReplies: 1,
      grants: 0,
      fullT2Qualification: false,
    }),
  })
}
