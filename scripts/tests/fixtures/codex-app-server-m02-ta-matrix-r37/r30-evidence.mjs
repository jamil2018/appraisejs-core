/** Exact consumed R30 B01 UNKNOWN; historical acceptance, pending and cleanup remain distinct. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { verifyR29Predecessor } from '../codex-app-server-m02-ta-matrix-r30/r29-evidence.mjs'
import { serializeR30Preparation } from '../codex-app-server-m02-ta-matrix-r30/preparation.mjs'
import { verifyR30HistoricalClosure } from '../codex-app-server-m02-ta-matrix-r30/runtime-effects.mjs'
import { readStableFile } from './r21-evidence.mjs'
import { requireTA04Absent } from './prior-evidence.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { digest, ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const OLD_ROOT = '/private/tmp/appraise-m02-ta-matrix-p16'
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r30-02/manifest.json')
const MANIFEST_SHA = '1af62ea98860c421f17f2d6cf58ceeb23254a2658b4220671a3f87a8a167a6f4'
const MANIFEST_DIGEST = '266dbd3fa11abebff70a7ae2a68fc5f94e41fcadd455396584c0eec6d5e48cda'
const TERMINAL = join(REPO, '.appraisejs/m02-r30-native-terminal-01.json')
const TERMINAL_SHA = 'becd9d208f33608cbf3cf7156bb7bf745a4fe550a25b39f1cd5542547e2ad129'
const INDEX = join(REPO, '.appraisejs/m02-r30-native-terminal-evidence-01/index.json')
const INDEX_SHA = 'f66dfca3ddba60c10714006355182a00bfdc105119926c13fe60671648fa4b17'
const AUTHORITY_PINS = Object.freeze({
  context: [
    '.appraisejs/m02-r30-user-authorization-context-01.json',
    '0b0a4789b6d565427391c1b1c69e9f92807627e543526376b1c3ee1ff91ecd25',
  ],
  decision: [
    '.appraisejs/m02-t2-r30-recovery-user-decision.json',
    'df2a430280cb9d8b531cb66788e67adcf2983fbabd7a9da4c1060849b3d5db16',
  ],
  review: [
    '.appraisejs/m02-t2-r30-exact-review.json',
    '33e7fbc7ba158001e6748b442bd90626742b2fda711b46be20d467d36747d91f',
  ],
  focused: [
    '.appraisejs/m02-r30-focused-review-02.json',
    '0ef4a74d1fb799edfce2d6042683b668669b12ca5dc4be11787f795f9561f307',
  ],
  submission: [
    '.appraisejs/m02-r30-approved-native-submission-01.json',
    'd650cf33ba6ae69d8e98fd2eb3fe0260f94a50cfbd1e1ca14e459cf1c92ca759',
  ],
})
export const R30_COUNTS = Object.freeze({
  listenerStarts: 1,
  controlWrites: 3,
  codexStarts: 1,
  mcpStarts: 1,
  threadStarts: 1,
  canonicalRequests: 8,
  turnStarts: 1,
  providerRequests: 3,
  outerCalls: 2,
  auditRequests: 4,
  scopedCalls: 2,
  workspaceActions: 0,
  permissionReplies: 0,
  helperStarts: 0,
})
const fail = reason => {
  throw new Error(`R36 consumed R30 ${reason}`)
}
const same = (a, b) => a.dev === b.dev && a.ino === b.ino
const privateDirectory = value =>
  value.isDirectory() && !value.isSymbolicLink() && value.uid === process.getuid() && (value.mode & 0o777) === 0o700

async function readPrepared() {
  const bytes = await readStableFile(MANIFEST, MANIFEST_SHA)
  const prepared = JSON.parse(bytes)
  if (
    prepared.schema !== 'appraise.m02-ta-matrix-r30-preparation/v1' ||
    prepared.manifestDigest !== MANIFEST_DIGEST ||
    digest(prepared.manifest) !== MANIFEST_DIGEST ||
    prepared.manifest.root !== OLD_ROOT ||
    prepared.manifest.phase !== 'T2' ||
    prepared.manifest.cases.length !== 24 ||
    prepared.blockers?.length !== 0 ||
    prepared.runtimeEligible !== false
  )
    fail('preparation drift')
  const history = await verifyR30HistoricalClosure(prepared.manifest)
  const paths = new Set()
  let current = 0
  for (const row of prepared.manifest.artifacts) {
    if (paths.has(row.path)) fail('artifact duplicate')
    paths.add(row.path)
    if (history.has(row.path)) continue
    await readStableFile(row.path, row.sha256)
    current++
  }
  if (current !== 7116 || history.size !== 23 || paths.size !== 7139) fail('closure drift')
  const canonicalBytes = await readStableFile(join(dirname(MANIFEST), 'canonical-bridge.mjs'), prepared.canonicalSha256)
  if (!bytes.equals(serializeR30Preparation({ ...prepared, canonicalBytes }))) fail('serialized preparation drift')
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
    context.schema !== 'appraise.m02-r30-user-authorization-context/v1' ||
    context.authorizedAction !== 'ONE_FRESH_R30_P16_FULL_T2_INVOCATION' ||
    context.literalHashSpecificApprovalQuoteClaimed !== false ||
    context.manifest.path !== MANIFEST ||
    context.manifest.sha256 !== MANIFEST_SHA ||
    context.manifest.manifestDigest !== MANIFEST_DIGEST ||
    decision.verdict !== 'AUTHORIZE_ONE_FIXED_FULL_T2_R30_INVOCATION' ||
    decision.exactArtifactUserApprovalClaimed !== false ||
    decision.authorizationContext?.path !== join(REPO, AUTHORITY_PINS.context[0]) ||
    decision.authorizationContext.sha256 !== AUTHORITY_PINS.context[1] ||
    decision.manifestDigest !== MANIFEST_DIGEST ||
    decision.manifestFileSha256 !== MANIFEST_SHA ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    review.verdict !== 'ACCEPT_ONE_FIXED_FULL_T2_R30_INVOCATION' ||
    review.manifest.fileSha256 !== MANIFEST_SHA ||
    review.manifest.manifestDigest !== MANIFEST_DIGEST ||
    review.independentReportSha256 !== AUTHORITY_PINS.focused[1] ||
    focused.verdict !== 'ACCEPT_R30_FULL_T2_READINESS_INTERVAL_CANDIDATE_ONLY' ||
    !isDeepStrictEqual(
      context.cumulativeWholeCampaignCeilings,
      prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    ) ||
    submission.authorityContext !== join(REPO, AUTHORITY_PINS.context[0]) ||
    submission.oneFreshR30Only !== true ||
    !isDeepStrictEqual(submission.exactArgv, [...decision.exactInvocationPrefix, AUTHORITY_PINS.decision[1]])
  )
    fail('standing authority or review drift')
  await readStableFile(context.proposal.path, context.proposal.sha256)
  await readStableFile(context.standingAuthorization.path, context.standingAuthorization.sha256)
}

function verifyJournal(bytes, terminal, index, prepared) {
  const text = bytes.toString('utf8')
  if (!text.endsWith('\n')) fail('journal partial line')
  const records = text
    .slice(0, -1)
    .split('\n')
    .map(line => JSON.parse(line))
  let previous = '0'.repeat(64),
    begun = 0,
    source = 0,
    active = null,
    acknowledgements = 0
  const reserved = new Set(),
    pending = new Set()
  const counts = Object.fromEntries(Object.keys(R30_COUNTS).map(kind => [kind, 0]))
  const types = new Map()
  for (const [position, row] of records.entries()) {
    const hash = createHash('sha256')
      .update(JSON.stringify({ seq: row.seq, previous: row.previous, event: row.event }))
      .digest('hex')
    if (row.seq !== position + 1 || row.previous !== previous || row.hash !== hash) fail('journal chain drift')
    previous = row.hash
    const event = row.event
    if (!['init', 'begin', 'reserve', 'ack', 'unknown', 'recovery'].includes(event.type))
      fail('unexpected journal event')
    types.set(event.type, (types.get(event.type) ?? 0) + 1)
    if (
      event.type === 'init' &&
      (position !== 0 ||
        event.phase !== 'T2' ||
        event.policyDigest !== prepared.manifest.journalBasePolicyDigest ||
        !same(event.directoryIdentity, index.rootIdentity))
    )
      fail('journal init drift')
    if (event.type === 'begin') {
      if (active !== null || begun !== 0 || event.caseId !== 'B01' || event.sourceHostCapacity !== 4)
        fail('begin or source allocation drift')
      active = 'B01'
      source += event.sourceHostCapacity
      begun++
    }
    if (event.type === 'reserve') {
      if (
        active !== 'B01' ||
        !Object.hasOwn(counts, event.kind) ||
        typeof event.id !== 'string' ||
        reserved.has(event.id)
      )
        fail('reservation drift')
      reserved.add(event.id)
      pending.add(event.id)
      counts[event.kind]++
    }
    if (event.type === 'ack') {
      if (!pending.delete(event.id)) fail('ACK drift')
      acknowledgements++
    }
    if (event.type === 'unknown' && (active !== 'B01' || event.reason !== 'AMBIGUOUS_EFFECT'))
      fail('UNKNOWN outcome drift')
  }
  if (
    records.length !== 59 ||
    index.journalRecords !== 59 ||
    terminal.journal.records !== 59 ||
    previous !== index.journalLastHash ||
    previous !== terminal.journal.terminalHash ||
    begun !== 1 ||
    source !== 4 ||
    active !== 'B01' ||
    reserved.size !== 27 ||
    acknowledgements !== 27 ||
    pending.size ||
    !isDeepStrictEqual(counts, R30_COUNTS) ||
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

export async function verifyR30Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR29Predecessor({ requireNewRootAbsent: false })
  const prepared = await readPrepared()
  await verifyAuthority(prepared)
  const terminal = JSON.parse(await readStableFile(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readStableFile(INDEX, INDEX_SHA))
  if (
    terminal.schema !== 'appraise.m02-r30-native-terminal/v1' ||
    terminal.status !== 'UNKNOWN' ||
    terminal.completed !== 0 ||
    terminal.failedCase !== 'B01' ||
    terminal.runtimeQualified !== false ||
    terminal.root !== OLD_ROOT ||
    terminal.manifestDigest !== MANIFEST_DIGEST ||
    terminal.manifestFileSha256 !== MANIFEST_SHA ||
    terminal.sourceHostCapacityReserved !== 4 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(terminal.consumed, R30_COUNTS) ||
    !isDeepStrictEqual(terminal.pending, []) ||
    !isDeepStrictEqual(terminal.completedCases, []) ||
    terminal.lateCaseDiagnostics?.length !== 1 ||
    terminal.cleanupQualification !== 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN' ||
    index.root !== OLD_ROOT ||
    index.schema !== 'appraise.m02-r30-native-terminal-evidence-index/v1' ||
    index.rootIdentity.dev !== 16777233 ||
    index.rootIdentity.ino !== 70318026 ||
    !isDeepStrictEqual(index.rootIdentity, terminal.rootIdentity) ||
    index.files?.length !== 8 ||
    index.journalChainVerified !== true ||
    index.runtimeAuthority !== false ||
    index.rawProviderAccountAuthHistoryOrDatabaseCopied !== false ||
    index.originalsRewritten !== false ||
    terminal.evidenceIndex.path !== INDEX ||
    terminal.evidenceIndex.sha256 !== INDEX_SHA ||
    terminal.journal.reservations !== 27 ||
    terminal.journal.ACKs !== 27 ||
    terminal.journal.chainVerified !== true
  )
    fail('terminal or index drift')
  const failed = terminal.lateCaseDiagnostics[0]
  if (
    failed.caseId !== 'B01' ||
    failed.stage !== 'GIT_READINESS' ||
    failed.reason !== 'GIT_READINESS_GIT_IDENTITY_CHANGED' ||
    !isDeepStrictEqual(failed.gitReadiness, {
      samples: 2,
      gitObserved: true,
      gitIdentityCount: 1,
      gitGone: false,
      gitPidReused: false,
      hostObserved: true,
      hostIdentityStable: true,
      readinessComplete: false,
    })
  )
    fail('failed readiness observation drift')
  const directories = [
    OLD_ROOT,
    join(OLD_ROOT, 'cases'),
    join(OLD_ROOT, 'cases/B01'),
    join(OLD_ROOT, 'cases/B01/supervisor'),
  ]
  const parents = []
  for (const directory of directories) {
    const stat = await fs.lstat(directory)
    if (!privateDirectory(stat)) fail('ancestor ownership or mode drift')
    parents.push({ directory, stat })
  }
  if (!same(parents[0].stat, index.rootIdentity)) fail('root identity drift')
  const names = [
    'phase-journal.jsonl',
    ...[
      'script-plan.json',
      'mcp-startup.json',
      'mcp-exit.json',
      'provider-response-1.json',
      'provider-response-2.json',
      'provider-response-3.json',
      'late-case-failure.json',
    ].map(name => `B01--${name}`),
  ]
  if (!isDeepStrictEqual(index.files.map(row => row.copy).sort(), names.sort())) fail('sanitized membership drift')
  for (const row of index.files) {
    const expected =
      row.copy === 'phase-journal.jsonl'
        ? join(OLD_ROOT, row.copy)
        : join(OLD_ROOT, 'cases/B01/supervisor', row.copy.slice('B01--'.length))
    if (row.originalPath !== expected) fail('sanitized path drift')
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
      fail('original identity drift')
    const copy = await readStableFile(join(dirname(INDEX), row.copy), row.sha256)
    const original = await readStableFile(expected, row.sha256)
    if (!same(before, await fs.lstat(expected)) || !copy.equals(original) || copy.length !== row.bytes)
      fail('sanitized bytes drift')
    if (row.copy === 'phase-journal.jsonl') {
      if (row.sha256 !== terminal.journal.sha256) fail('journal pin drift')
      verifyJournal(copy, terminal, index, prepared)
    }
    if (row.copy === 'B01--late-case-failure.json' && !isDeepStrictEqual(JSON.parse(copy), failed))
      fail('late failure drift')
  }
  for (const { directory, stat } of parents) {
    const after = await fs.lstat(directory)
    if (!privateDirectory(after) || !same(stat, after)) fail('ancestor changed')
  }
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({
    ...old,
    prepared,
    r30TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: TERMINAL_SHA,
      indexPath: INDEX,
      indexSha256: INDEX_SHA,
      status: 'UNKNOWN',
      casesCompleted: 0,
      completedCases: Object.freeze([]),
      failedCase: 'B01',
      cleanup: 'UNKNOWN',
      failedCaseCleanup: 'UNKNOWN',
      root: OLD_ROOT,
      rootIdentity: Object.freeze({ ...index.rootIdentity }),
      consumed: R30_COUNTS,
      sourceCapacityReserved: 4,
      actualSourceHostCount: 'UNATTESTED',
      pending: Object.freeze([]),
      failureStage: 'GIT_READINESS',
      failureReason: 'GIT_READINESS_GIT_IDENTITY_CHANGED',
    }),
  })
}
