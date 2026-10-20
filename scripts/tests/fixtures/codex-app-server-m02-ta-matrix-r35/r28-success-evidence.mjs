/** Exact accepted B01 R28 evidence; no full T2 or global process-absence qualification. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { readStableFile } from '../codex-app-server-m02-ta-matrix-r28/r21-evidence.mjs'
import { verifyR27Predecessor } from '../codex-app-server-m02-ta-matrix-r28/r27-evidence.mjs'
import { requireTA04Absent } from './prior-evidence.mjs'
import { serializeR28Preparation } from '../codex-app-server-m02-ta-matrix-r28/preparation.mjs'
import { verifyR28HistoricalClosure } from '../codex-app-server-m02-ta-matrix-r28/runtime-effects.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { digest, ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r28-02/manifest.json')
const MANIFEST_SHA = '9be8bed3bbdee3e0bf8d0714369098840e2ad391c6d0e8dc2bdba7811a009edd'
const TERMINAL = join(REPO, '.appraisejs/m02-r28-native-terminal-01.json')
const TERMINAL_SHA = '7305fe812dc00aaabd5f54d650de566b3ef2cdfe01a0148bd106db32b9bca5cb'
const INDEX = join(REPO, '.appraisejs/m02-r28-native-terminal-evidence-01/index.json')
const INDEX_SHA = '6910954bafefce55e0d22ab681315300678d2b77a0b41da51d2db378654c5bd2'
const ROOT_R28 = '/private/tmp/appraise-m02-ta-matrix-p14'
const AUTHORITY_PINS = Object.freeze({
  context: [
    '.appraisejs/m02-r28-user-authorization-context-01.json',
    'fc19244e86a01c6e1340e7a3f082ffaaf2d6be7ef58f3bb0f95c5da4128bf7e1',
  ],
  decision: [
    '.appraisejs/m02-t2-r28-recovery-user-decision.json',
    '57d2192fc3a8b60ed7638b6f52e9c75bd4b595c03c425851f4f3bf295b439652',
  ],
  review: [
    '.appraisejs/m02-t2-r28-exact-review.json',
    'c42ef677d03fbdba60cf487ce7a32c7ea05f81a13e09cc88f2819f124e4406c5',
  ],
  submission: [
    '.appraisejs/m02-r28-approved-native-submission-01.json',
    'df138fbe276403c580e0281b0fda5ff50eac9500561367b23783d63e8cd1f68c',
  ],
  focusedReview: [
    '.appraisejs/m02-r28-focused-review-02.json',
    'f9b0713fcd6ac211b022449b2149380c8a4114f5be349bdf86ceabebbec534bd',
  ],
})
const EXECUTION_PLAN = join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t2-r28-execution-plan-01.md')
const EXECUTION_PLAN_SHA = 'ddc9c6c9d66186b2b38abb2f5bda60dcd46eeaca2e9fd7b60d0f5812beace51a'
const CASE_WITNESS_SHA = '26993764ee7858b7ef060b7141d5bdebc739b9eee9e4d72a876183671cb986be'
const CLEANUP = 'CASE_OWNED_CODEX_CODE_MODE_HOST_MCP_AND_LISTENER_EVIDENCE_ACCEPTED'
export const R28_COUNTS = Object.freeze({
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
  throw new Error(`R35 consumed R28 ${reason}`)
}
const privateDirectory = state =>
  state.isDirectory() && !state.isSymbolicLink() && state.uid === process.getuid() && (state.mode & 0o777) === 0o700
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino

async function readFrozenR28() {
  const bytes = await readStableFile(MANIFEST, MANIFEST_SHA)
  const prepared = JSON.parse(bytes)
  if (
    prepared.schema !== 'appraise.m02-ta-matrix-r28-preparation/v1' ||
    prepared.manifestDigest !== digest(prepared.manifest) ||
    prepared.manifestDigest !== 'edb05b19f7b89cafa6e62c54f267dc1add560c84d6152fea1887ef8122016a4f' ||
    prepared.manifest.phase !== 'T2' ||
    prepared.manifest.root !== ROOT_R28 ||
    prepared.runtimeEligible !== false ||
    prepared.exactArtifactReviewRequired !== true ||
    prepared.blockers?.length !== 0
  )
    fail('manifest drift')
  const historical = await verifyR28HistoricalClosure(prepared.manifest)
  let current = 0
  const paths = new Set()
  for (const row of prepared.manifest.artifacts) {
    if (paths.has(row.path)) fail('artifact duplicate')
    paths.add(row.path)
    if (historical.has(row.path)) continue
    await readStableFile(row.path, row.sha256)
    current++
  }
  if (current !== 6910 || historical.size !== 23 || paths.size !== 6933) fail('closure drift')
  const canonicalBytes = await readStableFile(join(dirname(MANIFEST), 'canonical-bridge.mjs'), prepared.canonicalSha256)
  if (!bytes.equals(serializeR28Preparation({ ...prepared, canonicalBytes }))) fail('serialization drift')
  const seal = loadSealedRouteEvidence()
  if (seal.status !== 'SEALED_OFFLINE_ONLY') fail('seal unavailable')
  return { ...prepared, canonicalBytes, manifestFileSha256: MANIFEST_SHA, seal }
}

async function verifyAuthority(prepared) {
  const artifacts = {}
  for (const [key, [file, sha256]] of Object.entries(AUTHORITY_PINS))
    artifacts[key] = JSON.parse(await readStableFile(join(REPO, file), sha256))
  const { context, decision, review, submission, focusedReview } = artifacts
  if (
    context.schema !== 'appraise.m02-r28-user-authorization-context/v1' ||
    context.executionPlan.path !== EXECUTION_PLAN ||
    context.executionPlan.sha256 !== EXECUTION_PLAN_SHA ||
    context.authorizedAction !== 'ONE_FRESH_R28_P14_B01_GIT_READINESS_CORRECTION' ||
    context.literalHashSpecificApprovalQuoteClaimed !== false ||
    context.newSuccessorOrT3SpecificAuthorityClaimed !== false ||
    context.priorConsumedCommandsReusable !== false ||
    context.historicalAllocationsReset !== false ||
    context.currentInvocationLimitsAndStopsUnchanged !== true ||
    decision.schema !== 'appraise.m02-ta-t2-r28-recovery-user-decision/v1' ||
    decision.verdict !== 'APPROVE_ONE_FIXED_B01_R28_DIAGNOSTIC_INVOCATION' ||
    decision.scope !== 'ONE_NEW_B01_DIAGNOSTIC_P14_INVOCATION_NO_RESUME' ||
    decision.specimenOnly !== false ||
    decision.manifestDigest !== prepared.manifestDigest ||
    decision.manifestFileSha256 !== MANIFEST_SHA ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    review.schema !== 'appraise.m02-ta-t2-r28-exact-review/v1' ||
    review.verdict !== 'ACCEPT_ONE_FIXED_B01_R28_DIAGNOSTIC_INVOCATION' ||
    review.runtimeVerdict !== 'NOT_RUN' ||
    review.exactArtifactUserApprovalClaimed !== false ||
    review.manifest.path !== MANIFEST ||
    review.manifest.fileSha256 !== MANIFEST_SHA ||
    review.manifest.manifestDigest !== prepared.manifestDigest ||
    !isDeepStrictEqual(review.manifest.cases, ['B01']) ||
    review.independentReport !== join(REPO, AUTHORITY_PINS.focusedReview[0]) ||
    review.independentReportSha256 !== AUTHORITY_PINS.focusedReview[1] ||
    focusedReview.verdict !== 'ACCEPT_R28_B01_GIT_READINESS_CANDIDATE_ONLY' ||
    submission.schema !== 'appraise.m02-r28-native-submission/v1' ||
    submission.authorityContext !== join(REPO, AUTHORITY_PINS.context[0]) ||
    submission.oneFreshR28Only !== true ||
    submission.nativeInvocationIntended !== 1 ||
    submission.noReplayOrResume !== true ||
    submission.futureRunAuthorityNotExpandedByThisReceipt !== true ||
    !isDeepStrictEqual(submission.exactArgv, [...decision.exactInvocationPrefix, AUTHORITY_PINS.decision[1]])
  )
    fail('authority context or review binding drift')
  await readStableFile(EXECUTION_PLAN, EXECUTION_PLAN_SHA)
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
  const counts = Object.fromEntries(Object.keys(R28_COUNTS).map(kind => [kind, 0]))
  const types = new Map()
  let acknowledgements = 0
  for (const [i, record] of records.entries()) {
    const actual = createHash('sha256')
      .update(JSON.stringify({ seq: record.seq, previous: record.previous, event: record.event }))
      .digest('hex')
    if (record.seq !== i + 1 || record.previous !== previous || record.hash !== actual) fail('chain drift')
    previous = record.hash
    const event = record.event
    if (!['init', 'begin', 'reserve', 'ack', 'finish', 'checkpoint'].includes(event.type))
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
    if (
      event.type === 'finish' &&
      (event.outcome !== 'accepted' || event.cleanupKnown !== true || event.caseWitnessSha256 !== CASE_WITNESS_SHA)
    )
      fail('accepted finish witness drift')
  }
  if (
    records.length !== 58 ||
    index.journalRecords !== 58 ||
    terminal.journal.records !== 58 ||
    previous !== index.journalLastHash ||
    previous !== terminal.journal.terminalHash ||
    reservations.size !== 27 ||
    acknowledgements !== 27 ||
    pending.size !== 0 ||
    !isDeepStrictEqual(counts, R28_COUNTS) ||
    !isDeepStrictEqual(Object.fromEntries(types), {
      init: 1,
      begin: 1,
      reserve: 27,
      ack: 27,
      finish: 1,
      checkpoint: 1,
    }) ||
    records.at(-2).event.type !== 'finish' ||
    records.at(-1).event.type !== 'checkpoint'
  )
    fail('terminal journal accounting drift')
}

export async function verifyR28Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR27Predecessor({ requireNewRootAbsent: false })
  const prepared = await readFrozenR28()
  await verifyAuthority(prepared)
  const terminal = JSON.parse(await readStableFile(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readStableFile(INDEX, INDEX_SHA))
  if (
    terminal.schema !== 'appraise.m02-r28-native-terminal/v1' ||
    terminal.status !== 'B01_PROBE_COMPLETED_NOT_FULL_T2' ||
    terminal.completed !== 1 ||
    terminal.runtimeQualified !== false ||
    terminal.cleanupQualification !== CLEANUP ||
    terminal.sourceHostCapacityReserved !== 4 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    terminal.canonicalAccepted !== true ||
    terminal.ownedHostGone !== true ||
    terminal.listenerClosed !== true ||
    terminal.boundedCleanupOnlyNotGlobalProcessAbsence !== true ||
    terminal.caseWitnessSha256 !== CASE_WITNESS_SHA ||
    terminal.gitReadiness?.samples !== 8 ||
    terminal.gitReadiness.gitObserved !== true ||
    terminal.gitReadiness.gitIdentityCount !== 1 ||
    terminal.gitReadiness.gitGone !== true ||
    terminal.gitReadiness.gitPidReused !== false ||
    terminal.gitReadiness.hostObserved !== true ||
    terminal.gitReadiness.hostIdentityStable !== true ||
    terminal.gitReadiness.readinessComplete !== true ||
    !isDeepStrictEqual(terminal.pending, []) ||
    !isDeepStrictEqual(terminal.consumed, R28_COUNTS) ||
    terminal.root !== ROOT_R28 ||
    terminal.manifestFileSha256 !== MANIFEST_SHA ||
    terminal.manifestDigest !== prepared.manifestDigest ||
    terminal.evidenceIndex.path !== INDEX ||
    terminal.evidenceIndex.sha256 !== INDEX_SHA ||
    index.schema !== 'appraise.m02-r28-native-terminal-evidence-index/v1' ||
    index.root !== ROOT_R28 ||
    !isDeepStrictEqual(index.rootIdentity, terminal.rootIdentity) ||
    index.rootIdentity.dev !== 16777233 ||
    index.rootIdentity.ino !== 70303115 ||
    index.journalChainVerified !== true ||
    index.files?.length !== 7 ||
    index.cleanupQualification !== CLEANUP ||
    index.runtimeAuthority !== false ||
    index.rawProviderAccountAuthHistoryOrDatabaseCopied !== false ||
    index.originalsRewritten !== false
  )
    fail('terminal drift')
  const directories = [
    ROOT_R28,
    join(ROOT_R28, 'cases'),
    join(ROOT_R28, 'cases/B01'),
    join(ROOT_R28, 'cases/B01/supervisor'),
  ]
  const parents = []
  for (const directory of directories) {
    const state = await fs.lstat(directory)
    if (!privateDirectory(state)) fail('retained ancestor ownership or mode drift')
    parents.push({ directory, state })
  }
  if (!sameIdentity(parents[0].state, index.rootIdentity)) fail('retained root identity drift')
  const names = [
    'phase-journal.jsonl',
    'provider-response-1.json',
    'provider-response-2.json',
    'provider-response-3.json',
    'mcp-startup.json',
    'mcp-exit.json',
    'case-outcome.json',
  ]
  if (!isDeepStrictEqual(index.files.map(row => row.copy).sort(), [...names].sort())) fail('evidence membership drift')
  for (const row of index.files) {
    const expected =
      row.copy === 'phase-journal.jsonl' ? join(ROOT_R28, row.copy) : join(ROOT_R28, 'cases/B01/supervisor', row.copy)
    if (row.originalPath !== expected) fail('sanitized evidence scope drift')
    const before = await fs.lstat(expected)
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      before.uid !== process.getuid() ||
      (before.mode & 0o777) !== 0o600 ||
      ['dev', 'ino', 'uid'].some(key => before[key] !== row.originalIdentity[key]) ||
      (before.mode & 0o777) !== (row.originalIdentity.mode & 0o777)
    )
      fail('original evidence identity drift')
    const copy = await readStableFile(join(dirname(INDEX), row.copy), row.sha256)
    const original = await readStableFile(expected, row.sha256)
    const after = await fs.lstat(expected)
    if (
      !sameIdentity(before, after) ||
      !copy.equals(original) ||
      copy.length !== row.bytes ||
      original.length !== row.bytes
    )
      fail('sanitized evidence byte drift')
    if (row.copy === 'case-outcome.json') {
      const witness = JSON.parse(copy)
      if (
        row.sha256 !== CASE_WITNESS_SHA ||
        witness.caseId !== 'B01' ||
        witness.expected !== 'accepted' ||
        witness.manifestDigest !== prepared.manifestDigest ||
        witness.pending !== 0 ||
        witness.listenerClosed !== true ||
        witness.canonical?.accepted !== true ||
        witness.hostCleanup?.originalHostGone !== true ||
        witness.ownedCodex?.exit?.code !== 0 ||
        witness.ownedCodex?.exit?.signal !== null ||
        witness.ownedCodex?.close?.code !== 0 ||
        witness.ownedCodex?.close?.signal !== null ||
        !isDeepStrictEqual(witness.gitReadiness, terminal.gitReadiness)
      )
        fail('accepted case witness drift')
    }
    if (row.copy === 'phase-journal.jsonl') {
      if (row.sha256 !== terminal.journal.sha256) fail('journal artifact binding drift')
      verifyJournal(copy, index, terminal, prepared)
    }
  }
  for (const name of ['late-case-failure.json', 'provider-failure.json', 'protocol-failure.json']) {
    await requireTA04Absent(join(ROOT_R28, 'cases/B01/supervisor', name))
  }
  for (const { directory, state } of parents) {
    const current = await fs.lstat(directory)
    if (!privateDirectory(current) || !sameIdentity(current, state)) fail('retained ancestor identity changed')
  }
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({
    ...old,
    prepared,
    r28TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: TERMINAL_SHA,
      indexPath: INDEX,
      indexSha256: INDEX_SHA,
      status: 'B01_PROBE_COMPLETED_NOT_FULL_T2',
      casesCompleted: 1,
      cleanup: CLEANUP,
      root: ROOT_R28,
      rootIdentity: Object.freeze({ ...index.rootIdentity }),
      consumed: R28_COUNTS,
      sourceCapacityReserved: 4,
      pending: Object.freeze([]),
      caseWitnessSha256: CASE_WITNESS_SHA,
      boundedCleanupOnlyNotGlobalProcessAbsence: true,
      actualSourceHostCount: 'UNATTESTED',
      gitReadiness: Object.freeze({ ...terminal.gitReadiness }),
    }),
  })
}
