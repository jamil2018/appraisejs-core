/** TA06 additive archival semantic replay. Recorded original identities remain historical; current original identity is UNKNOWN. */
/** Read-only consumed R25 evidence; empty pending is neither case completion nor cleanup qualification. */
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

import { verifyR24Predecessor } from './history-r24-evidence.mjs'
import { requireTA04Absent } from '../codex-app-server-m02-ta-matrix-r26/prior-evidence.mjs'
import { serializeR25Preparation } from '../codex-app-server-m02-ta-matrix-r25/preparation.mjs'

import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { digest, ROOT } from '../codex-app-server-m02-ta-matrix-r26/policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r25/manifest.json')
const MANIFEST_SHA = 'cc4922392584a41b954722b9a2719f717022bf2d17274b1c5654aab581192a30'
const TERMINAL = join(REPO, '.appraisejs/m02-r25-native-terminal-01.json')
const TERMINAL_SHA = 'b00ce3c4bebaff70c6d11b71420fd011ea3dc0584d5812b544df0cd6cdce378e'
const INDEX = join(REPO, '.appraisejs/m02-r25-native-terminal-evidence-01/index.json')
const INDEX_SHA = '08d3462782080cdc0ec7d3abdf913020ee9a3a3037e4df43470596132ce1d746'
const ROOT_R25 = '/private/tmp/appraise-m02-ta-matrix-p11'
const AUTHORITY_PINS = Object.freeze({
  approval: [
    '.appraisejs/m02-r25-literal-exact-user-approval-01.json',
    '70d7cfb68e234460d16451788461402d20d8eaf68adf4f1c8914549e06f3522e',
  ],
  decision: [
    '.appraisejs/m02-t2-r25-recovery-user-decision.json',
    'fc190cb932fb5a864c42775c6694da01937ddd55a5d987d9d078d60a65946ec2',
  ],
  review: [
    '.appraisejs/m02-t2-r25-exact-review.json',
    '97b5a8d623f00cc5c98d42490373504aa74ab34980b67b4cb75140a38495d131',
  ],
  execution: [
    '.appraisejs/m02-r25-execution-review-01.json',
    'd5e957f0705e5c19d0d5ae451ec33a709432ad6d8cbb340b3b66adb4237b4555',
  ],
  submission: [
    '.appraisejs/m02-r25-approved-native-submission-01.json',
    '9218d855d84d2484b8b16d9ea58cf11a4326f847f09aef085ed787b7ce4217ef',
  ],
})
export const R25_COUNTS = Object.freeze({
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
  throw new Error(`R26 consumed R25 ${reason}`)
}
const privateDirectory = state =>
  state.isDirectory() && !state.isSymbolicLink() && state.uid === process.getuid() && (state.mode & 0o777) === 0o700
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino

async function readFrozenR25() {
  const bytes = await readClaimBytes(MANIFEST, MANIFEST_SHA)
  const prepared = JSON.parse(bytes)
  if (
    prepared.schema !== 'appraise.m02-ta-matrix-r25-preparation/v1' ||
    prepared.manifestDigest !== digest(prepared.manifest) ||
    prepared.manifest.phase !== 'T2' ||
    prepared.manifest.root !== ROOT_R25 ||
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
  if (ancestralClaimsChecked !== 6763 || historical.size !== 23 || paths.size !== 6786) fail('closure drift')
  const canonicalBytes = await readClaimBytes(join(dirname(MANIFEST), 'canonical-bridge.mjs'), prepared.canonicalSha256)
  if (!bytes.equals(serializeR25Preparation({ ...prepared, canonicalBytes }))) fail('serialization drift')
  const seal = loadSealedRouteEvidence()
  if (seal.status !== 'SEALED_OFFLINE_ONLY') fail('seal unavailable')
  return { ...prepared, canonicalBytes, manifestFileSha256: MANIFEST_SHA, seal }
}

async function verifyAuthority(prepared) {
  const artifacts = {}
  for (const [key, [file, sha256]] of Object.entries(AUTHORITY_PINS))
    artifacts[key] = JSON.parse(await readClaimBytes(join(REPO, file), sha256))
  const { approval, decision, review, execution, submission } = artifacts
  if (
    approval.schema !== 'appraise.m02-r25-literal-exact-user-approval/v1' ||
    approval.scope !== 'ONE_FRESH_R25_P11_NATIVE_INVOCATION_ONLY' ||
    approval.manifest.path !== MANIFEST ||
    approval.manifest.sha256 !== MANIFEST_SHA ||
    approval.manifestDigest !== prepared.manifestDigest ||
    approval.authorizedDecisionSha256 !== AUTHORITY_PINS.decision[1] ||
    approval.exactReview.path !== join(REPO, AUTHORITY_PINS.review[0]) ||
    approval.exactReview.sha256 !== AUTHORITY_PINS.review[1] ||
    decision.schema !== 'appraise.m02-ta-t2-r25-recovery-user-decision/v1' ||
    decision.verdict !== 'APPROVE_ONE_FIXED_T2_R25_INVOCATION' ||
    decision.specimenOnly !== false ||
    decision.exactArtifactUserApprovalClaimed !== true ||
    decision.manifestDigest !== prepared.manifestDigest ||
    decision.manifestFileSha256 !== MANIFEST_SHA ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    review.verdict !== 'ACCEPT_ONE_FIXED_T2_R25_INVOCATION' ||
    review.runtimeVerdict !== 'NOT_RUN' ||
    review.manifest.path !== MANIFEST ||
    review.manifest.fileSha256 !== MANIFEST_SHA ||
    review.manifest.manifestDigest !== prepared.manifestDigest ||
    execution.verdict !== 'ACCEPT_TERMINAL_UNKNOWN_EVIDENCE_ONLY' ||
    execution.runtimeVerdict !== 'UNKNOWN_NOT_QUALIFIED' ||
    execution.materialOutcome.status !== 'UNKNOWN' ||
    execution.materialOutcome.completedActualT2Cases !== 0 ||
    execution.authorizationBinding.actualDecision.sha256 !== AUTHORITY_PINS.decision[1] ||
    execution.sixEvidencePairs.indexSha256 !== INDEX_SHA ||
    submission.approval.path !== join(REPO, AUTHORITY_PINS.approval[0]) ||
    submission.approval.sha256 !== AUTHORITY_PINS.approval[1] ||
    submission.freshRoot !== ROOT_R25 ||
    submission.nativeCommandSubmittedOnceAfterExactApproval !== true
  )
    fail('approval or review binding drift')
  await readClaimBytes(
    join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t2-r25-exact-authorization-request-01.md'),
    'dd1f94b829df90c53c0756fe56f6a2bf2fe7e9febe004060c97d9d65d4aa275c',
  )
  await readClaimBytes(
    join(REPO, '.appraisejs/m02-r25-final-readiness-01.json'),
    '30de7fbbc0f0d614664f2a42f030ae7cbd7fab8a3fa6f3ada97aec5f50350d9b',
  )
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
  const counts = Object.fromEntries(Object.keys(R25_COUNTS).map(kind => [kind, 0]))
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
    index.journalLastSequence !== 59 ||
    terminal.journal.records !== 59 ||
    previous !== index.journalLastHash ||
    previous !== terminal.journal.terminalHash ||
    reservations.size !== 27 ||
    acknowledgements !== 27 ||
    pending.size !== 0 ||
    !isDeepStrictEqual(counts, R25_COUNTS) ||
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

export async function verifyR25Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR24Predecessor({ requireNewRootAbsent: false })
  const prepared = await readFrozenR25()
  await verifyAuthority(prepared)
  const terminal = JSON.parse(await readClaimBytes(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readClaimBytes(INDEX, INDEX_SHA))
  if (
    terminal.schema !== 'appraise.m02-r25-native-terminal/v1' ||
    terminal.status !== 'UNKNOWN' ||
    terminal.completed !== 0 ||
    terminal.failedCase !== 'B01' ||
    terminal.runtimeQualified !== false ||
    terminal.reason !== 'AMBIGUOUS_EFFECT' ||
    terminal.cleanupQualification !== 'UNKNOWN' ||
    terminal.sourceHostCapacityReserved !== 4 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(terminal.pending, []) ||
    !isDeepStrictEqual(terminal.consumed, R25_COUNTS) ||
    terminal.root !== ROOT_R25 ||
    terminal.manifestFileSha256 !== MANIFEST_SHA ||
    terminal.manifestDigest !== prepared.manifestDigest ||
    terminal.evidenceIndex.path !== INDEX ||
    terminal.evidenceIndex.sha256 !== INDEX_SHA ||
    index.schema !== 'appraise.m02-r25-sanitized-terminal-evidence/v1' ||
    index.root !== ROOT_R25 ||
    !isDeepStrictEqual(index.rootIdentity, terminal.rootIdentity) ||
    index.journalChainVerified !== true ||
    index.files?.length !== 6 ||
    index.cleanupQualification !== 'UNKNOWN' ||
    index.runtimeAuthority !== false ||
    index.rawProviderAccountAuthHistoryOrDatabaseCopied !== false ||
    index.originalsRewritten !== false
  )
    fail('terminal drift')
  await assertHistoricalRoot(ROOT_R25, index.rootIdentity)
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
  ]
  if (!isDeepStrictEqual(index.files.map(row => row.copy).sort(), [...names].sort())) fail('evidence membership drift')
  for (const row of index.files) {
    const expected =
      row.copy === 'phase-journal.jsonl' ? join(ROOT_R25, row.copy) : join(ROOT_R25, 'cases/B01/supervisor', row.copy)
    if (row.originalPath !== expected) fail('sanitized evidence scope drift')
    const copy = await readHistoricalPair(row, INDEX, expected)
    if (row.copy === 'phase-journal.jsonl') {
      if (row.sha256 !== terminal.journal.sha256) fail('journal artifact binding drift')
      verifyJournal(copy, index, terminal, prepared)
    }
  }
  for (const name of ['case-outcome.json', 'provider-failure.json', 'protocol-failure.json']) {
    if (index.sanitizedReceiptAbsences?.[name] !== true) fail('absence record drift')
    await requireTA04Absent(join(ROOT_R25, 'cases/B01/supervisor', name))
  }
  for (const { directory, state } of parents) {
    const current = await fs.lstat(directory)
    if (!privateDirectory(current) || !sameIdentity(current, state)) fail('retained ancestor identity changed')
  }
  await assertHistoricalRoot(ROOT_R25, index.rootIdentity)
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({
    ...old,
    prepared,
    r25TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: TERMINAL_SHA,
      indexPath: INDEX,
      indexSha256: INDEX_SHA,
      status: 'UNKNOWN',
      casesCompleted: 0,
      cleanup: 'UNKNOWN',
      root: ROOT_R25,
      rootIdentity: Object.freeze({ ...index.rootIdentity }),
      currentOriginalRootIdentity: 'UNKNOWN',
      consumed: R25_COUNTS,
      sourceCapacityReserved: 4,
      pending: Object.freeze([]),
    }),
  })
}
