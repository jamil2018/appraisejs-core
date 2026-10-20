/** TA06 additive archival semantic replay. Recorded original identities remain historical; current original identity is UNKNOWN. */
/** Read-only consumed R26 evidence; empty pending is neither case completion nor cleanup qualification. */
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

import { verifyR25Predecessor } from './history-r25-evidence.mjs'
import { requireTA04Absent } from '../codex-app-server-m02-ta-matrix-r27/prior-evidence.mjs'
import { serializeR26Preparation } from '../codex-app-server-m02-ta-matrix-r26/preparation.mjs'

import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { digest, ROOT } from '../codex-app-server-m02-ta-matrix-r27/policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r26-02/manifest.json')
const MANIFEST_SHA = 'bacf83d01f826a63ebba62aaaeeb8c7a8ac0b4fa258bcfb8ae83842f9032107c'
const TERMINAL = join(REPO, '.appraisejs/m02-r26-native-terminal-01.json')
const TERMINAL_SHA = '1d6eb999d3bc7fab59d2e5a935ef3e447fdb678f3a666d640402148cdd4d47af'
const INDEX = join(REPO, '.appraisejs/m02-r26-native-terminal-evidence-01/index.json')
const INDEX_SHA = '1f683fb8167a36bdeacd27b2a421c4c7a32cd5a29fee8a2ebb7cb9bdaa1483ac'
const ROOT_R26 = '/private/tmp/appraise-m02-ta-matrix-p12'
const AUTHORITY_PINS = Object.freeze({
  context: [
    '.appraisejs/m02-r26-user-authorization-context-01.json',
    '995a48724c8acc1fb9fcf2da54d5ace086bdef50a06d17142d685f0ade52edd6',
  ],
  decision: [
    '.appraisejs/m02-t2-r26-recovery-user-decision.json',
    '4061c35fa7e9c2658d728cef5ae078b6d00782182b0967aa80607ddaa912cb14',
  ],
  review: [
    '.appraisejs/m02-t2-r26-exact-review.json',
    '3e7f2959b8dc6072f499dba325ea9a26c07041667f5b889029bc9cf3132011e4',
  ],
  submission: [
    '.appraisejs/m02-r26-approved-native-submission-01.json',
    '7a41f8798015de6fc8a3958702a506fc52f794371e1bd3362ca855b3fe3ebd25',
  ],
  readiness: [
    '.appraisejs/m02-r26-final-readiness-01.json',
    '91edd1a04542d1afc80e56b6282c42d485c52f8b76ef2ba97a9c46cc2c5a624c',
  ],
  focusedReview: [
    '.appraisejs/m02-r26-focused-review-02.json',
    '7f74c10dd266ad71e45936a6ca9f54830db448a9a4221e0c28e7003928e9e379',
  ],
})
const REQUEST = join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t2-r26-exact-authorization-request-01.md')
const REQUEST_SHA = 'c2f46dd703e418e0f34ebdce46f42c9778bc929963c292c8effc8f4910ac90aa'
export const R26_COUNTS = Object.freeze({
  threadStarts: 1,
  turnStarts: 1,
  providerRequests: 3,
  scopedCalls: 2,
  workspaceActions: 0,
  permissionReplies: 0,
  codexStarts: 1,
  mcpStarts: 1,
  listenerStarts: 1,
  controlWrites: 3,
  canonicalRequests: 8,
  helperStarts: 0,
  outerCalls: 2,
  auditRequests: 4,
})
const fail = reason => {
  throw new Error(`R27 consumed R26 ${reason}`)
}
const privateDirectory = state =>
  state.isDirectory() && !state.isSymbolicLink() && state.uid === process.getuid() && (state.mode & 0o777) === 0o700
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino

async function readFrozenR26() {
  const bytes = await readClaimBytes(MANIFEST, MANIFEST_SHA)
  const prepared = JSON.parse(bytes)
  if (
    prepared.schema !== 'appraise.m02-ta-matrix-r26-preparation/v1' ||
    prepared.manifestDigest !== digest(prepared.manifest) ||
    prepared.manifestDigest !== '5de31358eb1484312136bc917966f63ef2cad117be3170a19ffef9a7de181fcc' ||
    prepared.manifest.phase !== 'T2' ||
    prepared.manifest.root !== ROOT_R26 ||
    prepared.runtimeEligible !== false ||
    prepared.exactArtifactReviewRequired !== true ||
    prepared.blockers?.length !== 0
  )
    fail('manifest drift')
  const historical = await verifyLegacyHistoricalClosure(prepared.manifest)
  let ancestralClaimsChecked = 0
  const paths = new Set()
  for (const row of prepared.manifest.artifacts) {
    if (paths.has(row.path)) fail('artifact duplicate')
    paths.add(row.path)
    if (historical.has(row.path)) continue
    await readClaimBytes(row.path, row.sha256)
    ancestralClaimsChecked++
  }
  if (ancestralClaimsChecked !== 6812 || historical.size !== 23 || paths.size !== 6835) fail('closure drift')
  const canonicalBytes = await readClaimBytes(join(dirname(MANIFEST), 'canonical-bridge.mjs'), prepared.canonicalSha256)
  if (!bytes.equals(serializeR26Preparation({ ...prepared, canonicalBytes }))) fail('serialization drift')
  const seal = loadSealedRouteEvidence()
  if (seal.status !== 'SEALED_OFFLINE_ONLY') fail('seal unavailable')
  return { ...prepared, canonicalBytes, manifestFileSha256: MANIFEST_SHA, seal }
}

async function verifyAuthority(prepared) {
  const artifacts = {}
  for (const [key, [file, sha256]] of Object.entries(AUTHORITY_PINS))
    artifacts[key] = JSON.parse(await readClaimBytes(join(REPO, file), sha256))
  const { context, decision, review, submission, readiness, focusedReview } = artifacts
  if (
    context.schema !== 'appraise.m02-r26-user-authorization-context/v1' ||
    context.pendingReviewedRequest.path !== REQUEST ||
    context.pendingReviewedRequest.sha256 !== REQUEST_SHA ||
    context.authorizedAction !== 'EXECUTE_THE_ALREADY_PREPARED_R26_P12_B01_DIAGNOSTIC_ONCE' ||
    context.literalHashSpecificApprovalQuoteClaimed !== false ||
    context.newSuccessorOrT3SpecificAuthorityClaimed !== false ||
    context.priorConsumedCommandsReusable !== false ||
    context.historicalAllocationsReset !== false ||
    context.currentInvocationLimitsAndStopsUnchanged !== true ||
    decision.schema !== 'appraise.m02-ta-t2-r26-recovery-user-decision/v1' ||
    decision.verdict !== 'APPROVE_ONE_FIXED_B01_R26_DIAGNOSTIC_INVOCATION' ||
    decision.scope !== 'ONE_NEW_B01_DIAGNOSTIC_P12_INVOCATION_NO_RESUME' ||
    decision.specimenOnly !== false ||
    decision.manifestDigest !== prepared.manifestDigest ||
    decision.manifestFileSha256 !== MANIFEST_SHA ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    review.schema !== 'appraise.m02-ta-t2-r26-exact-review/v1' ||
    review.verdict !== 'ACCEPT_ONE_FIXED_B01_R26_DIAGNOSTIC_INVOCATION' ||
    review.runtimeVerdict !== 'NOT_RUN' ||
    review.exactArtifactUserApprovalClaimed !== false ||
    review.manifest.path !== MANIFEST ||
    review.manifest.fileSha256 !== MANIFEST_SHA ||
    review.manifest.manifestDigest !== prepared.manifestDigest ||
    !isDeepStrictEqual(review.manifest.cases, ['B01']) ||
    review.independentReport !== join(REPO, AUTHORITY_PINS.focusedReview[0]) ||
    review.independentReportSha256 !== AUTHORITY_PINS.focusedReview[1] ||
    focusedReview.verdict !== 'ACCEPT_R26_B01_DIAGNOSTIC_PROPOSAL_ONLY' ||
    submission.schema !== 'appraise.m02-r26-native-submission/v1' ||
    submission.authorityContext !== join(REPO, AUTHORITY_PINS.context[0]) ||
    submission.oneFreshR26Only !== true ||
    submission.nativeInvocationIntended !== 1 ||
    submission.noReplayOrResume !== true ||
    submission.futureRunAuthorityNotExpandedByThisReceipt !== true ||
    !isDeepStrictEqual(submission.exactArgv, [...decision.exactInvocationPrefix, AUTHORITY_PINS.decision[1]]) ||
    readiness.schema !== 'appraise.m02-r26-final-readiness/v1' ||
    readiness.request.path !== REQUEST ||
    readiness.request.sha256 !== REQUEST_SHA ||
    readiness.manifest.path !== MANIFEST ||
    readiness.manifest.sha256 !== MANIFEST_SHA ||
    readiness.manifest.manifestDigest !== prepared.manifestDigest ||
    readiness.exactReview.sha256 !== AUTHORITY_PINS.review[1] ||
    readiness.prospectiveDecisionSha256 !== AUTHORITY_PINS.decision[1]
  )
    fail('authority context or review binding drift')
  // These are immutable preexecution readiness fields, not present root/decision-absence claims.
  await readClaimBytes(REQUEST, REQUEST_SHA)
}

function verifyJournal(bytes, index, terminal, prepared) {
  const records = bytes
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line))
  let previous = '0'.repeat(64)
  const reservations = new Map()
  const pending = new Set()
  const counts = Object.fromEntries(Object.keys(R26_COUNTS).map(kind => [kind, 0]))
  const types = new Map()
  let acknowledgements = 0
  for (const [i, record] of records.entries()) {
    const actual = createHash('sha256')
      .update(JSON.stringify({ seq: record.seq, previous: record.previous, event: record.event }))
      .digest('hex')
    if (record.seq !== i + 1 || record.previous !== previous || record.hash !== actual) fail('chain drift')
    previous = record.hash
    const event = record.event
    if (!['init', 'begin', 'reserve', 'ack', 'unknown', 'recovery'].includes(event.type))
      fail('unexpected journal event')
    types.set(event.type, (types.get(event.type) ?? 0) + 1)
    if (
      event.type === 'init' &&
      (i !== 0 ||
        event.phase !== 'T2' ||
        event.policyDigest !== prepared.manifest.journalBasePolicyDigest ||
        !sameIdentity(event.directoryIdentity, index.rootIdentity))
    )
      fail('journal init drift')
    if (event.type === 'begin' && (event.caseId !== 'B01' || event.sourceHostCapacity !== 4))
      fail('journal source capacity drift')
    if (event.type === 'reserve') {
      if (!Object.hasOwn(counts, event.kind) || typeof event.id !== 'string' || reservations.has(event.id))
        fail('reservation drift')
      reservations.set(event.id, event.kind)
      pending.add(event.id)
      counts[event.kind]++
    }
    if (event.type === 'ack') {
      if (!pending.delete(event.id)) fail('ACK correlation drift')
      acknowledgements++
    }
    if (event.type === 'unknown' && event.reason !== 'AMBIGUOUS_EFFECT') fail('UNKNOWN reason drift')
  }
  if (
    records.length !== 59 ||
    index.journalRecords !== 59 ||
    terminal.journal.records !== 59 ||
    previous !== index.journalLastHash ||
    previous !== terminal.journal.terminalHash ||
    reservations.size !== 27 ||
    acknowledgements !== 27 ||
    pending.size !== 0 ||
    !isDeepStrictEqual(counts, R26_COUNTS) ||
    !isDeepStrictEqual(Object.fromEntries(types), {
      init: 1,
      begin: 1,
      reserve: 27,
      ack: 27,
      unknown: 1,
      recovery: 2,
    }) ||
    records.at(-3).event.type !== 'unknown' ||
    records.at(-2).event.action !== 'owned-stop-intent' ||
    records.at(-1).event.action !== 'owned-stop-observed'
  )
    fail('terminal journal accounting drift')
}

export async function verifyR26Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR25Predecessor({ requireNewRootAbsent: false })
  const prepared = await readFrozenR26()
  await verifyAuthority(prepared)
  const terminal = JSON.parse(await readClaimBytes(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readClaimBytes(INDEX, INDEX_SHA))
  if (
    terminal.schema !== 'appraise.m02-r26-native-terminal/v1' ||
    terminal.status !== 'UNKNOWN' ||
    terminal.completed !== 0 ||
    terminal.failedCase !== 'B01' ||
    terminal.runtimeQualified !== false ||
    terminal.reason !== 'AMBIGUOUS_EFFECT' ||
    terminal.cleanupQualification !== 'UNKNOWN' ||
    terminal.sourceHostCapacityReserved !== 4 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    terminal.lateCaseDiagnostic?.schema !== 'appraise.m02-ta-matrix-r26-late-case-failure/v1' ||
    terminal.lateCaseDiagnostic.caseId !== 'B01' ||
    terminal.lateCaseDiagnostic.stage !== 'HOST_LIVE_CHECK' ||
    terminal.lateCaseDiagnostic.reason !== 'UNREVIEWED_DIRECT_CHILD' ||
    terminal.lateCaseDiagnostic.code !== 'OWNED_HOST_OBSERVATION_UNKNOWN' ||
    terminal.lateCaseDiagnostic.rawExceptionRetained !== false ||
    !isDeepStrictEqual(terminal.pending, []) ||
    !isDeepStrictEqual(terminal.consumed, R26_COUNTS) ||
    terminal.root !== ROOT_R26 ||
    terminal.manifestFileSha256 !== MANIFEST_SHA ||
    terminal.manifestDigest !== prepared.manifestDigest ||
    terminal.evidenceIndex.path !== INDEX ||
    terminal.evidenceIndex.sha256 !== INDEX_SHA ||
    index.schema !== 'appraise.m02-r26-native-terminal-evidence-index/v1' ||
    index.root !== ROOT_R26 ||
    !isDeepStrictEqual(index.rootIdentity, terminal.rootIdentity) ||
    index.rootIdentity.dev !== 16777233 ||
    index.rootIdentity.ino !== 70288056 ||
    index.journalChainVerified !== true ||
    index.files?.length !== 7 ||
    index.cleanupQualification !== 'UNKNOWN' ||
    index.runtimeAuthority !== false ||
    index.rawProviderAccountAuthHistoryOrDatabaseCopied !== false ||
    index.originalsRewritten !== false
  )
    fail('terminal drift')
  await assertHistoricalRoot(ROOT_R26, index.rootIdentity)
  const directories = [dirname(INDEX)]
  const parents = []
  for (const directory of directories) {
    const state = await fs.lstat(directory)
    if (!privateDirectory(state)) fail('retained ancestor ownership or mode drift')
    parents.push({ directory, state })
  }
  const names = [
    'phase-journal.jsonl',
    'provider-response-1.json',
    'provider-response-2.json',
    'provider-response-3.json',
    'mcp-startup.json',
    'mcp-exit.json',
    'late-case-failure.json',
  ]
  if (!isDeepStrictEqual(index.files.map(row => row.copy).sort(), [...names].sort())) fail('evidence membership drift')
  for (const row of index.files) {
    const expected =
      row.copy === 'phase-journal.jsonl' ? join(ROOT_R26, row.copy) : join(ROOT_R26, 'cases/B01/supervisor', row.copy)
    if (row.originalPath !== expected) fail('sanitized evidence scope drift')
    const copy = await readHistoricalPair(row, INDEX, expected)
    if (row.copy === 'late-case-failure.json' && !isDeepStrictEqual(JSON.parse(copy), terminal.lateCaseDiagnostic))
      fail('late-case diagnostic binding drift')
    if (row.copy === 'phase-journal.jsonl') {
      if (row.sha256 !== terminal.journal.sha256) fail('journal artifact binding drift')
      verifyJournal(copy, index, terminal, prepared)
    }
  }
  for (const name of ['case-outcome.json', 'provider-failure.json', 'protocol-failure.json']) {
    await requireTA04Absent(join(ROOT_R26, 'cases/B01/supervisor', name))
  }
  for (const { directory, state } of parents) {
    const current = await fs.lstat(directory)
    if (!privateDirectory(current) || !sameIdentity(current, state)) fail('retained ancestor identity changed')
  }
  await assertHistoricalRoot(ROOT_R26, index.rootIdentity)
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({
    ...old,
    prepared,
    r26TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: TERMINAL_SHA,
      indexPath: INDEX,
      indexSha256: INDEX_SHA,
      status: 'UNKNOWN',
      casesCompleted: 0,
      cleanup: 'UNKNOWN',
      root: ROOT_R26,
      rootIdentity: Object.freeze({ ...index.rootIdentity }),
      currentOriginalRootIdentity: 'UNKNOWN',
      consumed: R26_COUNTS,
      sourceCapacityReserved: 4,
      pending: Object.freeze([]),
      failureStage: 'HOST_LIVE_CHECK',
      failureReason: 'UNREVIEWED_DIRECT_CHILD',
    }),
  })
}
