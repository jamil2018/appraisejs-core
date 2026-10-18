/** TA06 additive archival semantic replay. Recorded original identities remain historical; current original identity is UNKNOWN. */
/** Exact consumed R35 B14 UNKNOWN after correlated empty denial; no cleanup or full T2 inference. */
import fs from 'node:fs/promises'
import {
  readClaimBytes,
  assertHistoricalRoot,
  readHistoricalPair,
  verifyLegacyHistoricalClosure,
} from './ta06-archive.mjs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { verifyR34Predecessor } from './history-r34-evidence.mjs'
import { serializeR35Preparation } from '../codex-app-server-m02-ta-matrix-r35/preparation.mjs'

import { requireTA04Absent } from '../codex-app-server-m02-ta-matrix-r35/prior-evidence.mjs'
import { POLICY as R35_POLICY } from '../codex-app-server-m02-ta-matrix-r35/policy.mjs'
import { verifyMcpChildReceipt } from '../codex-app-server-m02-ta-matrix-r10/mcp-readiness.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { digest, ROOT } from '../codex-app-server-m02-ta-matrix-r36/policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const OLD_ROOT = '/private/tmp/appraise-m02-ta-matrix-p20'
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r35/manifest.json')
const MANIFEST_SHA = 'c10543b9b04fbd086ef07ad6b269d3bf4add36b991dd1f7aeefc63ff2245a41f'
const MANIFEST_DIGEST = '11de6d88b3d0bf51f55da769a82dd4d6c51f2cb6f73f950044f6f9ca94a61632'
const TERMINAL = join(REPO, '.appraisejs/m02-r35-native-terminal-01.json')
const TERMINAL_SHA = 'b6d3a7636d1ca09ec683c0d29e95838fc07bf3667aacac789290f067bb054cbf'
const INDEX = join(REPO, '.appraisejs/m02-r35-native-terminal-evidence-01/index.json')
const INDEX_SHA = '0fba32759bad8e74343db48d538d51e247f1e132412c9289d47b16d90c255534'
const CASES = Object.freeze(R35_POLICY.cases.filter(item => item.phase === 'T2'))
export const R35_COUNTS = Object.freeze({
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
const KINDS = Object.freeze([...Object.keys(R35_POLICY.aggregate), 'outerCalls', 'auditRequests'])
const same = (a, b) => a?.dev === b?.dev && a?.ino === b?.ino
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = reason => {
  throw new Error(`R36 consumed R35 ${reason}`)
}
const privateDirectory = value =>
  value.isDirectory() && !value.isSymbolicLink() && value.uid === process.getuid() && (value.mode & 0o777) === 0o700
const nonnegative = value => Number.isSafeInteger(value) && value >= 0
const AUTHORITY_PINS = Object.freeze({
  context: [
    '.appraisejs/m02-r35-user-authorization-context-01.json',
    '4ffd67c4c51d141b6dbd7ad34ad884480ad361596a69de2df7ca0a321d8ba48a',
  ],
  decision: [
    '.appraisejs/m02-t2-r35-recovery-user-decision.json',
    '5cf795adcd59cd5a74f568202ab42590c987371fd13de7c236cdf477f2664748',
  ],
  review: [
    '.appraisejs/m02-t2-r35-exact-review.json',
    '620419012a471b0ac4b50e4526882ee1242175231f5d000cd27b1133dee7c1eb',
  ],
  focused: [
    '.appraisejs/m02-r35-focused-review-01.json',
    '87fc063f5fc23aff45ff98075fcd8bff0b448ff9a98ed1357ae9357acf06c6d8',
  ],
  submission: [
    '.appraisejs/m02-r35-approved-native-submission-01.json',
    'caa18957ad8f1d5229fe1a3ea2379d75539e3a880b1a1c16bc800d1f77a1e310',
  ],
})
const FIXED_COMMAND =
  "/usr/bin/env -i PATH=/usr/bin:/bin LANG=C /opt/homebrew/Cellar/node/26.11.0/bin/node '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r35/entrypoint.mjs' --run '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r35/manifest.json' 11de6d88b3d0bf51f55da769a82dd4d6c51f2cb6f73f950044f6f9ca94a61632 c10543b9b04fbd086ef07ad6b269d3bf4add36b991dd1f7aeefc63ff2245a41f 620419012a471b0ac4b50e4526882ee1242175231f5d000cd27b1133dee7c1eb 5cf795adcd59cd5a74f568202ab42590c987371fd13de7c236cdf477f2664748"

async function readPrepared() {
  const bytes = await readClaimBytes(MANIFEST, MANIFEST_SHA)
  const prepared = JSON.parse(bytes)
  if (
    prepared.schema !== 'appraise.m02-ta-matrix-r35-preparation/v1' ||
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
    prepared.canonicalSha256 !== '13f9fb2d20b8f4f0f7b3bf5ee426a3cd78e287c745108e42c5291ed993bceb6c'
  )
    fail('preparation drift')
  const history = await verifyLegacyHistoricalClosure(prepared.manifest)
  const paths = new Set()
  let ancestralClaimsChecked = 0
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
    if (row.availability !== undefined) fail('ancestral artifact availability drift')
    await readClaimBytes(row.path, row.sha256)
    ancestralClaimsChecked++
  }
  if (ancestralClaimsChecked !== 7842 || history.size !== 23 || paths.size !== 7865) fail('closure drift')
  const canonicalBytes = await readClaimBytes(join(dirname(MANIFEST), 'canonical-bridge.mjs'), prepared.canonicalSha256)
  if (!bytes.equals(serializeR35Preparation({ ...prepared, canonicalBytes }))) fail('serialized preparation drift')
  const seal = loadSealedRouteEvidence()
  if (seal.status !== 'SEALED_OFFLINE_ONLY') fail('sealed evidence invalid')
  return { ...prepared, canonicalBytes, seal, manifestFileSha256: MANIFEST_SHA }
}

async function verifyAuthority(prepared) {
  const values = {}
  for (const [key, [file, sha256]] of Object.entries(AUTHORITY_PINS))
    values[key] = JSON.parse(await readClaimBytes(join(REPO, file), sha256))
  const { context, decision, review, focused, submission } = values
  if (
    context.schema !== 'appraise.m02-r35-user-authorization-context/v1' ||
    context.authorizedAction !== 'ONE_FRESH_R35_P20_B14_INVOCATION' ||
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
    decision.verdict !== 'AUTHORIZE_ONE_FIXED_B14_R35_INVOCATION' ||
    decision.exactArtifactUserApprovalClaimed !== false ||
    decision.authorizationContext?.path !== join(REPO, AUTHORITY_PINS.context[0]) ||
    decision.authorizationContext.sha256 !== AUTHORITY_PINS.context[1] ||
    decision.manifestDigest !== MANIFEST_DIGEST ||
    decision.manifestFileSha256 !== MANIFEST_SHA ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    review.verdict !== 'ACCEPT_ONE_FIXED_B14_R35_INVOCATION' ||
    review.exactArtifactUserApprovalClaimed !== false ||
    review.manifest.fileSha256 !== MANIFEST_SHA ||
    review.manifest.manifestDigest !== MANIFEST_DIGEST ||
    review.independentReportSha256 !== AUTHORITY_PINS.focused[1] ||
    focused.verdict !== 'ACCEPT_R35_SINGLE_B14_PERMISSION_SCHEMA_CANDIDATE_ONLY' ||
    !isDeepStrictEqual(
      context.cumulativeWholeCampaignCeilings,
      prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    ) ||
    submission.schema !== 'appraise.m02-native-submission/v1' ||
    submission.campaign !== 'R35' ||
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
  await readClaimBytes(context.proposal.path, context.proposal.sha256)
  await readClaimBytes(context.standingAuthorization.path, context.standingAuthorization.sha256)
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
    source = 0,
    acknowledgements = 0,
    unknown = false
  for (const [position, row] of records.entries()) {
    if (
      row.seq !== position + 1 ||
      row.previous !== previous ||
      row.hash !== sha(JSON.stringify({ seq: row.seq, previous: row.previous, event: row.event }))
    )
      fail('journal chain drift')
    previous = row.hash
    const event = row.event
    if (
      !['init', 'begin', 'reserve', 'ack', 'unknown', 'recovery'].includes(event.type) ||
      (unknown && event.type !== 'recovery')
    )
      fail('unexpected journal event')
    types.set(event.type, (types.get(event.type) ?? 0) + 1)
    if (
      event.type === 'init' &&
      (position !== 0 ||
        event.phase !== 'T2' ||
        event.policyDigest !== prepared.manifest.journalBasePolicyDigest ||
        !same(event.directoryIdentity, index.rootIdentity) ||
        !same(event.fileIdentity, { dev: 16777233, ino: 70696257 }) ||
        !same(event.fileIdentity, index.files.find(item => item.copy === 'phase-journal.jsonl')?.originalIdentity))
    )
      fail('journal init drift')
    if (event.type !== 'init' && position === 0) fail('journal init missing')
    if (event.type === 'begin') {
      if (
        begun !== 0 ||
        event.caseId !== 'B14' ||
        event.sourceHostCapacity !== 2 ||
        event.evidenceClass !== 'SOURCE_BOUND_CAPACITY_RESERVED'
      )
        fail('begin or source allocation drift')
      begun++
      source += event.sourceHostCapacity
    }
    if (event.type === 'reserve') {
      if (
        begun !== 1 ||
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
      if (begun !== 1 || !pending.delete(event.id)) fail('ACK without bound pending reservation')
      acknowledgements++
    }
    if (event.type === 'unknown') {
      if (position !== records.length - 3 || event.reason !== 'AMBIGUOUS_EFFECT' || pending.size)
        fail('UNKNOWN outcome drift')
      unknown = true
    }
    if (event.type === 'recovery') {
      const action =
        position === records.length - 2
          ? 'owned-stop-intent'
          : position === records.length - 1
            ? 'owned-stop-observed'
            : null
      if (!unknown || !action || !isDeepStrictEqual(event, { type: 'recovery', id: `B14-${action}`, action }))
        fail('owned-stop recovery witness drift')
    }
  }
  if (
    records.length !== 33 ||
    index.journalRecords !== 33 ||
    terminal.journal.records !== 33 ||
    previous !== index.journalLastHash ||
    previous !== terminal.journal.terminalHash ||
    begun !== 1 ||
    source !== 2 ||
    reserved.size !== 14 ||
    acknowledgements !== 14 ||
    pending.size ||
    !unknown ||
    !isDeepStrictEqual(counts, R35_COUNTS) ||
    !isDeepStrictEqual(counts, terminal.consumed) ||
    !isDeepStrictEqual(Object.fromEntries(types), { init: 1, begin: 1, reserve: 14, ack: 14, unknown: 1, recovery: 2 })
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
      'late-case-failure.json',
      'protocol-failure.json',
      'permission-request.json',
    ].map(name => `B14--${name}`),
  ])
}

export async function verifyR35Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR34Predecessor({ requireNewRootAbsent: false })
  const prepared = await readPrepared()
  await verifyAuthority(prepared)
  const terminal = JSON.parse(await readClaimBytes(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readClaimBytes(INDEX, INDEX_SHA))
  if (
    terminal.schema !== 'appraise.m02-r35-native-terminal/v1' ||
    terminal.exitCode !== 1 ||
    terminal.status !== 'UNKNOWN' ||
    terminal.completed !== 0 ||
    terminal.failedCase !== 'B14' ||
    terminal.runtimeQualified !== false ||
    terminal.root !== OLD_ROOT ||
    terminal.manifestDigest !== MANIFEST_DIGEST ||
    terminal.manifestFileSha256 !== MANIFEST_SHA ||
    terminal.sourceHostCapacityReserved !== 2 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(terminal.pending, []) ||
    terminal.lateCaseDiagnostics?.length !== 1 ||
    !isDeepStrictEqual(terminal.completedCases, []) ||
    terminal.cleanupQualification !== 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN' ||
    !isDeepStrictEqual(terminal.consumed, R35_COUNTS) ||
    terminal.journal?.chainVerified !== true ||
    terminal.journal.reservations !== 14 ||
    terminal.journal.ACKs !== 14 ||
    terminal.noResendOrResume !== true ||
    terminal.T2 !== 'INCOMPLETE' ||
    terminal.T3 !== 'INCOMPLETE' ||
    terminal.M02 !== 'INCOMPLETE' ||
    index.schema !== 'appraise.m02-r35-native-terminal-evidence-index/v1' ||
    index.root !== OLD_ROOT ||
    !isDeepStrictEqual(index.rootIdentity, terminal.rootIdentity) ||
    index.rootIdentity?.dev !== 16777233 ||
    index.rootIdentity?.ino !== 70696256 ||
    index.journalChainVerified !== true ||
    index.runtimeAuthority !== false ||
    index.rawProviderAccountAuthHistoryOrDatabaseCopied !== false ||
    index.originalsRewritten !== false ||
    terminal.evidenceIndex?.path !== INDEX ||
    terminal.evidenceIndex.sha256 !== INDEX_SHA
  )
    fail('terminal or index drift')
  const failed = terminal.lateCaseDiagnostics[0]
  if (
    failed.schema !== 'appraise.m02-ta-matrix-r35-late-case-failure/v1' ||
    failed.caseId !== 'B14' ||
    failed.stage !== 'WAIT_TERMINAL' ||
    failed.reason !== 'DURABLE_PHASE_UNKNOWN' ||
    !isDeepStrictEqual(failed.gates, {
      lifecycle: 'NOT_REACHED',
      child: 'NOT_REACHED',
      canonical: 'NOT_REACHED',
      effectCounts: 'NOT_REACHED',
      script: 'NOT_REACHED',
      pendingEmpty: 'NOT_REACHED',
      unfenced: 'NOT_REACHED',
    }) ||
    failed.rawExceptionRetained !== false
  )
    fail('failed B14 stage drift')
  const names = expectedNames()
  if (
    !Array.isArray(index.files) ||
    index.files.length !== 9 ||
    !isDeepStrictEqual(index.files.map(row => row.copy).sort(), [...names].sort())
  )
    fail('closed sanitized membership drift')
  await assertHistoricalRoot(OLD_ROOT, index.rootIdentity)
  const directories = [dirname(INDEX)]
  const parents = []
  for (const directory of directories) {
    const stat = await fs.lstat(directory)
    if (!privateDirectory(stat)) fail('ancestor ownership or mode drift')
    parents.push({ directory, stat })
  }
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
    const copy = await readHistoricalPair(row, INDEX, expected)
    if (row.copy === 'phase-journal.jsonl') {
      if (row.sha256 !== terminal.journal.sha256) fail('journal pin drift')
      journalVerified = verifyJournal(copy, terminal, index, prepared)
    } else {
      receipts.set(row.copy, JSON.parse(copy))
    }
  }
  if (!journalVerified) fail('journal missing')
  const protocol = receipts.get('B14--protocol-failure.json'),
    plan = receipts.get('B14--script-plan.json')
  const startup = receipts.get('B14--mcp-startup.json'),
    exit = receipts.get('B14--mcp-exit.json')
  const proof = { capabilityHash: startup?.capabilityHash, bootstrapHash: startup?.bootstrapHash }
  const request = receipts.get('B14--permission-request.json'),
    first = receipts.get('B14--provider-response-1.json'),
    continuation = receipts.get('B14--provider-response-2.json')
  if (
    plan?.caseId !== 'B14' ||
    plan.operation !== 'request_permissions' ||
    plan.grants !== 0 ||
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
    })
  )
    fail('B14 plan or MCP self-report drift')
  if (
    request?.caseId !== 'B14' ||
    request.event !== 'permission-request-observed' ||
    request.requestedNetworkEnabled !== true ||
    request.threadTurnCorrelated !== true ||
    request.grants !== 0 ||
    first?.requestIndex !== 1 ||
    first.caseId !== 'B14' ||
    first.grants !== 0 ||
    first.nativeStatus !== null ||
    continuation?.caseId !== 'B14' ||
    continuation.requestIndex !== 2 ||
    continuation.grants !== 0 ||
    continuation.nativeStatus !== 'EMPTY_PERMISSION_DENIAL_CORRELATED' ||
    first.permissionDeclarationHash !== continuation.permissionDeclarationHash ||
    first.descriptorHash !== continuation.descriptorHash
  )
    fail('B14 correlated empty-denial evidence drift')
  if (
    !isDeepStrictEqual(receipts.get('B14--late-case-failure.json'), failed) ||
    !isDeepStrictEqual(terminal.protocolFailures, [protocol]) ||
    protocol?.schema !== 'appraise.m02-ta-matrix-supervisor-receipt/v1' ||
    protocol.caseId !== 'B14' ||
    protocol.category !== 'UNKNOWN_REQUEST_OR_NOTIFICATION' ||
    protocol.phase !== 'turn' ||
    protocol.pendingKind !== null ||
    protocol.seq !== 30 ||
    protocol.frameKind !== 'notification' ||
    protocol.methodSha256 !== 'c01777adbac1a378a064995a4fc9ba94568b0153b1159c4e97699d0121e76c51' ||
    protocol.timestampPresent !== true ||
    protocol.envelopeFailureReason !== null ||
    protocol.permissionDiagnostic !== null ||
    terminal.consumed.permissionReplies !== 1
  )
    fail('B14 unknown notification witness drift')
  for (const { directory, stat } of parents) {
    const after = await fs.lstat(directory)
    if (!privateDirectory(after) || !same(stat, after)) fail('ancestor changed')
  }
  await assertHistoricalRoot(OLD_ROOT, index.rootIdentity)
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({
    ...old,
    prepared,
    r35TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: TERMINAL_SHA,
      indexPath: INDEX,
      indexSha256: INDEX_SHA,
      manifestFileSha256: MANIFEST_SHA,
      manifestDigest: MANIFEST_DIGEST,
      status: 'UNKNOWN',
      casesCompleted: 0,
      failedCase: 'B14',
      completedCases: Object.freeze([]),
      cleanup: 'UNKNOWN',
      cleanupQualification: 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN',
      failedCaseCleanup: 'UNKNOWN',
      root: OLD_ROOT,
      rootIdentity: Object.freeze({ ...index.rootIdentity }),
      currentOriginalRootIdentity: 'UNKNOWN',
      consumed: R35_COUNTS,
      sourceCapacityReserved: 2,
      actualSourceHostCount: 'UNATTESTED',
      pending: Object.freeze([]),
      failureStage: 'WAIT_TERMINAL',
      failureReason: 'DURABLE_PHASE_UNKNOWN',
      protocolFailureCategory: 'UNKNOWN_REQUEST_OR_NOTIFICATION',
      methodSha256: 'c01777adbac1a378a064995a4fc9ba94568b0153b1159c4e97699d0121e76c51',
      actualNotificationParameters: 'UNKNOWN',
      nativeEmptyDenialStatus: 'EMPTY_PERMISSION_DENIAL_CORRELATED',
      permissionRequests: 1,
      permissionReplies: 1,
      grants: 0,
      firstPermissionDiagnosticRetained: false,
      fullT2Qualification: false,
      runtimeQualified: false,
    }),
  })
}
