/** TA06 additive archival semantic replay. Recorded original identities remain historical; current original identity is UNKNOWN. */
/** Read-only consumed R27 evidence; empty pending is neither case completion nor cleanup qualification. */
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

import { verifyR26Predecessor } from './history-r26-evidence.mjs'
import { requireTA04Absent } from '../codex-app-server-m02-ta-matrix-r28/prior-evidence.mjs'
import { serializeR27Preparation } from '../codex-app-server-m02-ta-matrix-r27/preparation.mjs'

import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { digest, ROOT } from '../codex-app-server-m02-ta-matrix-r28/policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r27/manifest.json')
const MANIFEST_SHA = '714d0d4448d6f3f22a2bf5d24aa2a02b612c61947d2f2a973578365365e743f8'
const TERMINAL = join(REPO, '.appraisejs/m02-r27-native-terminal-01.json')
const TERMINAL_SHA = '32c33c144992a3794c2c00c974ae400bcd9ecd3966f0d78a0a6f8b12cfb695ab'
const INDEX = join(REPO, '.appraisejs/m02-r27-native-terminal-evidence-01/index.json')
const INDEX_SHA = 'c271eac4bdbaa31350bd3f149b4ed0e22e047bf26cae95b968912d6e6ae9f580'
const ROOT_R27 = '/private/tmp/appraise-m02-ta-matrix-p13'
const AUTHORITY_PINS = Object.freeze({
  context: [
    '.appraisejs/m02-r27-user-authorization-context-01.json',
    'e568bdbcc7d6d23d97396e6650d935eb49443c4be8c1a70fa6c51db320a156ad',
  ],
  decision: [
    '.appraisejs/m02-t2-r27-recovery-user-decision.json',
    'a636cede2241162717a458d9fe18092a80625cb0d69f4a4e657d714e0f563d91',
  ],
  review: [
    '.appraisejs/m02-t2-r27-exact-review.json',
    '050d900e59712913f4b27d4b2715c299502a401d2ce8cae939116680b70af2ab',
  ],
  submission: [
    '.appraisejs/m02-r27-approved-native-submission-01.json',
    '38ca9b80f782ab133be8536bb8d01f2da12ee4f99dbb9c8b520d92e9f712b37c',
  ],
  focusedReview: [
    '.appraisejs/m02-r27-focused-review-01.json',
    '3166e5ae6eb733484af189ebe0470f6a7eaf6e78496ab429a4deee6e909aca0b',
  ],
})
const EXECUTION_PLAN = join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t2-r27-execution-plan-01.md')
const EXECUTION_PLAN_SHA = '09853ac5564de66791be5aeafe657114ab2f6650d4d5652cc0ed1bb5d6acf4af'
const CHILD_PATH_OBSERVATIONS = Object.freeze({
  observations: Object.freeze([
    Object.freeze({
      pathClass: 'EXPECTED_HOST',
      basenameClass: 'CODE_MODE_HOST',
      expectedHostMatch: true,
      interpreterMatch: false,
      codexMatch: false,
    }),
    Object.freeze({
      pathClass: 'MANIFEST_INTERPRETER',
      basenameClass: 'NODE',
      expectedHostMatch: false,
      interpreterMatch: true,
      codexMatch: false,
    }),
    Object.freeze({
      pathClass: 'HOMEBREW',
      basenameClass: 'GIT',
      expectedHostMatch: false,
      interpreterMatch: false,
      codexMatch: false,
    }),
  ]),
  overflow: false,
  unavailable: false,
  additionalOsQueries: 0,
  rawPathRetained: false,
})
export const R27_COUNTS = Object.freeze({
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
  throw new Error(`R28 consumed R27 ${reason}`)
}
const privateDirectory = state =>
  state.isDirectory() && !state.isSymbolicLink() && state.uid === process.getuid() && (state.mode & 0o777) === 0o700
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino

async function readFrozenR27() {
  const bytes = await readClaimBytes(MANIFEST, MANIFEST_SHA)
  const prepared = JSON.parse(bytes)
  if (
    prepared.schema !== 'appraise.m02-ta-matrix-r27-preparation/v1' ||
    prepared.manifestDigest !== digest(prepared.manifest) ||
    prepared.manifestDigest !== '168e172adf68cadf7771663d1139a3baf1e1a3ac2913f7c0cfa7fae6e98b8c85' ||
    prepared.manifest.phase !== 'T2' ||
    prepared.manifest.root !== ROOT_R27 ||
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
  if (ancestralClaimsChecked !== 6861 || historical.size !== 23 || paths.size !== 6884) fail('closure drift')
  const canonicalBytes = await readClaimBytes(join(dirname(MANIFEST), 'canonical-bridge.mjs'), prepared.canonicalSha256)
  if (!bytes.equals(serializeR27Preparation({ ...prepared, canonicalBytes }))) fail('serialization drift')
  const seal = loadSealedRouteEvidence()
  if (seal.status !== 'SEALED_OFFLINE_ONLY') fail('seal unavailable')
  return { ...prepared, canonicalBytes, manifestFileSha256: MANIFEST_SHA, seal }
}

async function verifyAuthority(prepared) {
  const artifacts = {}
  for (const [key, [file, sha256]] of Object.entries(AUTHORITY_PINS))
    artifacts[key] = JSON.parse(await readClaimBytes(join(REPO, file), sha256))
  const { context, decision, review, submission, focusedReview } = artifacts
  if (
    context.schema !== 'appraise.m02-r27-user-authorization-context/v1' ||
    context.executionPlan.path !== EXECUTION_PLAN ||
    context.executionPlan.sha256 !== EXECUTION_PLAN_SHA ||
    context.authorizedAction !== 'ONE_FRESH_R27_P13_B01_METADATA_CLASSIFICATION_DIAGNOSTIC' ||
    context.literalHashSpecificApprovalQuoteClaimed !== false ||
    context.newSuccessorOrT3SpecificAuthorityClaimed !== false ||
    context.priorConsumedCommandsReusable !== false ||
    context.historicalAllocationsReset !== false ||
    context.currentInvocationLimitsAndStopsUnchanged !== true ||
    decision.schema !== 'appraise.m02-ta-t2-r27-recovery-user-decision/v1' ||
    decision.verdict !== 'APPROVE_ONE_FIXED_B01_R27_DIAGNOSTIC_INVOCATION' ||
    decision.scope !== 'ONE_NEW_B01_DIAGNOSTIC_P13_INVOCATION_NO_RESUME' ||
    decision.specimenOnly !== false ||
    decision.manifestDigest !== prepared.manifestDigest ||
    decision.manifestFileSha256 !== MANIFEST_SHA ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    review.schema !== 'appraise.m02-ta-t2-r27-exact-review/v1' ||
    review.verdict !== 'ACCEPT_ONE_FIXED_B01_R27_DIAGNOSTIC_INVOCATION' ||
    review.runtimeVerdict !== 'NOT_RUN' ||
    review.exactArtifactUserApprovalClaimed !== false ||
    review.manifest.path !== MANIFEST ||
    review.manifest.fileSha256 !== MANIFEST_SHA ||
    review.manifest.manifestDigest !== prepared.manifestDigest ||
    !isDeepStrictEqual(review.manifest.cases, ['B01']) ||
    review.independentReport !== join(REPO, AUTHORITY_PINS.focusedReview[0]) ||
    review.independentReportSha256 !== AUTHORITY_PINS.focusedReview[1] ||
    focusedReview.verdict !== 'ACCEPT_R27_B01_CHILD_PATH_DIAGNOSTIC_PROPOSAL_ONLY' ||
    submission.schema !== 'appraise.m02-r27-native-submission/v1' ||
    submission.authorityContext !== join(REPO, AUTHORITY_PINS.context[0]) ||
    submission.oneFreshR27Only !== true ||
    submission.nativeInvocationIntended !== 1 ||
    submission.noReplayOrResume !== true ||
    submission.futureRunAuthorityNotExpandedByThisReceipt !== true ||
    !isDeepStrictEqual(submission.exactArgv, [...decision.exactInvocationPrefix, AUTHORITY_PINS.decision[1]])
  )
    fail('authority context or review binding drift')
  await readClaimBytes(EXECUTION_PLAN, EXECUTION_PLAN_SHA)
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
  const counts = Object.fromEntries(Object.keys(R27_COUNTS).map(kind => [kind, 0]))
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
    !isDeepStrictEqual(counts, R27_COUNTS) ||
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

export async function verifyR27Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR26Predecessor({ requireNewRootAbsent: false })
  const prepared = await readFrozenR27()
  await verifyAuthority(prepared)
  const terminal = JSON.parse(await readClaimBytes(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readClaimBytes(INDEX, INDEX_SHA))
  if (
    terminal.schema !== 'appraise.m02-r27-native-terminal/v1' ||
    terminal.status !== 'UNKNOWN' ||
    terminal.completed !== 0 ||
    terminal.failedCase !== 'B01' ||
    terminal.runtimeQualified !== false ||
    terminal.reason !== 'AMBIGUOUS_EFFECT' ||
    terminal.cleanupQualification !== 'UNKNOWN' ||
    terminal.sourceHostCapacityReserved !== 4 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    terminal.lateCaseDiagnostic?.schema !== 'appraise.m02-ta-matrix-r27-late-case-failure/v1' ||
    terminal.lateCaseDiagnostic.caseId !== 'B01' ||
    terminal.lateCaseDiagnostic.stage !== 'HOST_LIVE_CHECK' ||
    terminal.lateCaseDiagnostic.reason !== 'UNREVIEWED_DIRECT_CHILD' ||
    terminal.lateCaseDiagnostic.code !== 'OWNED_HOST_OBSERVATION_UNKNOWN' ||
    terminal.lateCaseDiagnostic.rawExceptionRetained !== false ||
    !isDeepStrictEqual(terminal.lateCaseDiagnostic.childPaths, CHILD_PATH_OBSERVATIONS) ||
    !isDeepStrictEqual(terminal.pending, []) ||
    !isDeepStrictEqual(terminal.consumed, R27_COUNTS) ||
    terminal.root !== ROOT_R27 ||
    terminal.manifestFileSha256 !== MANIFEST_SHA ||
    terminal.manifestDigest !== prepared.manifestDigest ||
    terminal.evidenceIndex.path !== INDEX ||
    terminal.evidenceIndex.sha256 !== INDEX_SHA ||
    index.schema !== 'appraise.m02-r27-native-terminal-evidence-index/v1' ||
    index.root !== ROOT_R27 ||
    !isDeepStrictEqual(index.rootIdentity, terminal.rootIdentity) ||
    index.rootIdentity.dev !== 16777233 ||
    index.rootIdentity.ino !== 70296042 ||
    index.journalChainVerified !== true ||
    index.files?.length !== 7 ||
    index.cleanupQualification !== 'UNKNOWN' ||
    index.runtimeAuthority !== false ||
    index.rawProviderAccountAuthHistoryOrDatabaseCopied !== false ||
    index.originalsRewritten !== false
  )
    fail('terminal drift')
  await assertHistoricalRoot(ROOT_R27, index.rootIdentity)
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
      row.copy === 'phase-journal.jsonl' ? join(ROOT_R27, row.copy) : join(ROOT_R27, 'cases/B01/supervisor', row.copy)
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
    await requireTA04Absent(join(ROOT_R27, 'cases/B01/supervisor', name))
  }
  for (const { directory, state } of parents) {
    const current = await fs.lstat(directory)
    if (!privateDirectory(current) || !sameIdentity(current, state)) fail('retained ancestor identity changed')
  }
  await assertHistoricalRoot(ROOT_R27, index.rootIdentity)
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({
    ...old,
    prepared,
    r27TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: TERMINAL_SHA,
      indexPath: INDEX,
      indexSha256: INDEX_SHA,
      status: 'UNKNOWN',
      casesCompleted: 0,
      cleanup: 'UNKNOWN',
      root: ROOT_R27,
      rootIdentity: Object.freeze({ ...index.rootIdentity }),
      currentOriginalRootIdentity: 'UNKNOWN',
      consumed: R27_COUNTS,
      sourceCapacityReserved: 4,
      pending: Object.freeze([]),
      failureStage: 'HOST_LIVE_CHECK',
      failureReason: 'UNREVIEWED_DIRECT_CHILD',
      childPathCategories: Object.freeze(['EXPECTED_HOST', 'MANIFEST_INTERPRETER', 'HOMEBREW_GIT']),
    }),
  })
}
