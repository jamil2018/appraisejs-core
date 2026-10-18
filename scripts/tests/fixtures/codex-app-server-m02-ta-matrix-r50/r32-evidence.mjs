/** Exact consumed R32 evidence: eleven completed cases, failed A06 UNKNOWN; no replay or cleanup inference. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { verifyR30Predecessor } from '../codex-app-server-m02-ta-matrix-r32/r30-evidence.mjs'
import { serializeR32Preparation } from '../codex-app-server-m02-ta-matrix-r32/preparation.mjs'
import { verifyR32HistoricalClosure } from '../codex-app-server-m02-ta-matrix-r32/runtime-effects.mjs'
import { readStableFile } from './r21-evidence.mjs'
import { requireTA04Absent } from './prior-evidence.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { digest, ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const OLD_ROOT = '/private/tmp/appraise-m02-ta-matrix-p17'
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r32/manifest.json')
const MANIFEST_SHA = 'a2f72c10016eb0775a2d8380028f87f89db9a79da863e02b3003976677c73d39'
const MANIFEST_DIGEST = 'ae14ff66ac65b3debfd182ebd0550c4c351ec94398b90003aa332d043144879d'
const TERMINAL = join(REPO, '.appraisejs/m02-r32-native-terminal-01.json')
const TERMINAL_SHA = '9a9ade96ef1dac9717d9b728245434ff6ca37e5ba585d495af7edcdb12f98009'
const INDEX = join(REPO, '.appraisejs/m02-r32-native-terminal-evidence-01/index.json')
const INDEX_SHA = 'b8c2f6a759259cb9906a27227cbbb474302683b847df38e6fc2e777858d2149f'
const CASES = Object.freeze([
  'B01',
  'B02',
  'B03',
  'B04',
  'B05',
  'B06',
  'B07-A01',
  'B07-A02',
  'B07-A03',
  'B07-A04',
  'B07-A05',
  'B07-A06',
])
const WITNESSES = Object.freeze([
  'd72cac1792100733f38677ddb33e1830e149e563670d5fc270a4d4b0c44520df',
  '8e546a542d08870978671b15127ce1536c375b17f068e178e90fd65fef8b53d2',
  '93a46218605d439a050c81ac88229471651ec3c21978a219a3cead041ce14c49',
  '108069f1c69ce9fce015c0f3d67cf564b32ca0cd941492d65a82bcee431603a4',
  '9f6cb97683493daafaedcfe3c374d2333bfbfc5a1a9655335bb401956e3b48f0',
  '9f320169d6d2beb19d17baddab010a6fdd5c49f05af849a59fa1b21254daa058',
  '503401d1d2ae03eced9fa3b79f4b51434deefee535a4d6eac041cb9b3d2bd943',
  'e1ab08480045517b6bbad3fc279c77610225fa24d44a5be8d31ddfea3fe1295a',
  '7dbe58704846b5dcc01df67d32d5b8f085d5a2a49327327802381b1881e1711e',
  '3692a35e2412eba6637b09ac30016e80edc78f851177f4585387a71eb1be18b7',
  'd4ab0a5c074a92334aa150fa0bef3f360e6c0f8bbe04c847cd4ed602685f6350',
])
const AUTHORITY_PINS = Object.freeze({
  context: [
    '.appraisejs/m02-r32-user-authorization-context-01.json',
    '16baefd8f43668674b88429d9317fa75b507340b0bffee9a1158815ce5ca976d',
  ],
  decision: [
    '.appraisejs/m02-t2-r32-recovery-user-decision.json',
    '2913a7b8376c9851812713a73f5aac85015d31790afd72b65c4f998d04945d17',
  ],
  review: [
    '.appraisejs/m02-t2-r32-exact-review.json',
    '327d2118c719c01598b4f269fb1561ac2b62ac633e9496a404c260d8d5738c87',
  ],
  focused: [
    '.appraisejs/m02-r32-focused-review-01.json',
    'a0e2c1bb4e93aeaac869018e5e5b449bb567515d3ed04a97dc74457b992c0864',
  ],
  submission: [
    '.appraisejs/m02-r32-approved-native-submission-01.json',
    'f1b5471191fce7e0f39ed3d81e15ced6b83be7ab4b57e876231d35504e01bc62',
  ],
})
const FIXED_COMMAND =
  "/usr/bin/env -i PATH=/usr/bin:/bin LANG=C /opt/homebrew/Cellar/node/26.11.0/bin/node '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r32/entrypoint.mjs' --run '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r32/manifest.json' ae14ff66ac65b3debfd182ebd0550c4c351ec94398b90003aa332d043144879d a2f72c10016eb0775a2d8380028f87f89db9a79da863e02b3003976677c73d39 327d2118c719c01598b4f269fb1561ac2b62ac633e9496a404c260d8d5738c87 2913a7b8376c9851812713a73f5aac85015d31790afd72b65c4f998d04945d17"
export const R32_COUNTS = Object.freeze({
  listenerStarts: 12,
  controlWrites: 36,
  codexStarts: 12,
  mcpStarts: 12,
  threadStarts: 12,
  canonicalRequests: 64,
  turnStarts: 12,
  providerRequests: 32,
  outerCalls: 20,
  auditRequests: 40,
  scopedCalls: 20,
  workspaceActions: 0,
  permissionReplies: 0,
  helperStarts: 0,
})
const fail = reason => {
  throw new Error(`R36 consumed R32 ${reason}`)
}
const same = (a, b) => a.dev === b.dev && a.ino === b.ino
const privateDirectory = value =>
  value.isDirectory() && !value.isSymbolicLink() && value.uid === process.getuid() && (value.mode & 0o777) === 0o700

async function readPrepared() {
  const bytes = await readStableFile(MANIFEST, MANIFEST_SHA)
  const prepared = JSON.parse(bytes)
  if (
    prepared.schema !== 'appraise.m02-ta-matrix-r32-preparation/v1' ||
    prepared.manifestDigest !== MANIFEST_DIGEST ||
    digest(prepared.manifest) !== MANIFEST_DIGEST ||
    prepared.manifest.root !== OLD_ROOT ||
    prepared.manifest.phase !== 'T2' ||
    prepared.manifest.cases.length !== 24 ||
    prepared.blockers?.length !== 0 ||
    prepared.runtimeEligible !== false ||
    prepared.canonicalSha256 !== 'd035d515943dab09515eec7c6b7a4e5fb12438194f67369c7386a160508be5eb'
  )
    fail('preparation drift')
  const history = await verifyR32HistoricalClosure(prepared.manifest)
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
  if (current !== 7184 || history.size !== 23 || paths.size !== 7207) fail('closure drift')
  const canonicalBytes = await readStableFile(join(dirname(MANIFEST), 'canonical-bridge.mjs'), prepared.canonicalSha256)
  if (!bytes.equals(serializeR32Preparation({ ...prepared, canonicalBytes }))) fail('serialized preparation drift')
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
    context.schema !== 'appraise.m02-r32-user-authorization-context/v1' ||
    context.authorizedAction !== 'ONE_FRESH_R32_P17_FULL_T2_INVOCATION' ||
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
    decision.verdict !== 'AUTHORIZE_ONE_FIXED_FULL_T2_R32_INVOCATION' ||
    decision.exactArtifactUserApprovalClaimed !== false ||
    decision.authorizationContext?.path !== join(REPO, AUTHORITY_PINS.context[0]) ||
    decision.authorizationContext.sha256 !== AUTHORITY_PINS.context[1] ||
    decision.manifestDigest !== MANIFEST_DIGEST ||
    decision.manifestFileSha256 !== MANIFEST_SHA ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    review.verdict !== 'ACCEPT_ONE_FIXED_FULL_T2_R32_INVOCATION' ||
    review.manifest.fileSha256 !== MANIFEST_SHA ||
    review.manifest.manifestDigest !== MANIFEST_DIGEST ||
    review.independentReportSha256 !== AUTHORITY_PINS.focused[1] ||
    focused.verdict !== 'ACCEPT_R32_FULL_T2_GIT_HISTORY_CANDIDATE_ONLY' ||
    !isDeepStrictEqual(
      context.cumulativeWholeCampaignCeilings,
      prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    ) ||
    submission.version !== 'appraise.m02-native-submission/v1' ||
    submission.campaign !== 'R32' ||
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

function verifyJournal(bytes, terminal, index, prepared) {
  const text = bytes.toString('utf8')
  if (!text.endsWith('\n')) fail('journal partial line')
  const records = text
    .slice(0, -1)
    .split('\n')
    .map(line => JSON.parse(line))
  let previous = '0'.repeat(64),
    begun = 0,
    finished = 0,
    source = 0,
    active = null,
    acknowledgements = 0
  const reserved = new Set(),
    pending = new Set()
  const counts = Object.fromEntries(Object.keys(R32_COUNTS).map(kind => [kind, 0]))
  const types = new Map()
  let perCaseCounts = null
  for (const [position, row] of records.entries()) {
    const hash = createHash('sha256')
      .update(JSON.stringify({ seq: row.seq, previous: row.previous, event: row.event }))
      .digest('hex')
    if (row.seq !== position + 1 || row.previous !== previous || row.hash !== hash) fail('journal chain drift')
    previous = row.hash
    const event = row.event
    if (!['init', 'begin', 'reserve', 'ack', 'finish', 'unknown', 'recovery'].includes(event.type))
      fail('unexpected journal event')
    types.set(event.type, (types.get(event.type) ?? 0) + 1)
    if (
      event.type === 'init' &&
      (position !== 0 ||
        event.phase !== 'T2' ||
        event.policyDigest !== prepared.manifest.journalBasePolicyDigest ||
        !same(event.directoryIdentity, index.rootIdentity) ||
        !same(event.fileIdentity, index.files.find(item => item.copy === 'phase-journal.jsonl').originalIdentity))
    )
      fail('journal init drift')
    if (event.type === 'begin') {
      if (active !== null || event.caseId !== CASES[begun] || event.sourceHostCapacity !== (begun < 6 ? 4 : 2))
        fail('begin order or source allocation drift')
      active = event.caseId
      perCaseCounts = Object.fromEntries(Object.keys(R32_COUNTS).map(kind => [kind, 0]))
      source += event.sourceHostCapacity
      begun++
    }
    if (event.type === 'reserve') {
      if (
        !active ||
        !Object.hasOwn(counts, event.kind) ||
        typeof event.id !== 'string' ||
        (event.kind === 'scopedCalls'
          ? event.id !== `m02_${active.replaceAll('-', '_')}_${perCaseCounts.scopedCalls}`
          : !event.id.startsWith(`${active}-`)) ||
        reserved.has(event.id)
      )
        fail('reservation drift')
      reserved.add(event.id)
      pending.add(event.id)
      counts[event.kind]++
      perCaseCounts[event.kind]++
    }
    if (event.type === 'ack') {
      if (!active || !pending.delete(event.id)) fail('ACK drift')
      acknowledgements++
    }
    if (event.type === 'finish') {
      const completed = terminal.completedCases[finished]
      if (
        active !== CASES[finished] ||
        !completed ||
        completed.caseId !== active ||
        !isDeepStrictEqual(perCaseCounts, completed.counts) ||
        pending.size ||
        event.cleanupKnown !== true ||
        event.outcome !== completed.outcome ||
        event.caseWitnessSha256 !== WITNESSES[finished]
      )
        fail('finish witness drift')
      active = null
      finished++
    }
    if (event.type === 'unknown' && (active !== 'B07-A06' || event.reason !== 'AMBIGUOUS_EFFECT'))
      fail('UNKNOWN outcome drift')
  }
  if (
    records.length !== 571 ||
    index.journalRecords !== 571 ||
    terminal.journal.records !== 571 ||
    previous !== index.journalLastHash ||
    previous !== terminal.journal.terminalHash ||
    begun !== 12 ||
    finished !== 11 ||
    source !== 36 ||
    active !== 'B07-A06' ||
    reserved.size !== 272 ||
    acknowledgements !== 272 ||
    pending.size ||
    !isDeepStrictEqual(counts, R32_COUNTS) ||
    !isDeepStrictEqual(Object.fromEntries(types), {
      init: 1,
      begin: 12,
      reserve: 272,
      ack: 272,
      finish: 11,
      unknown: 1,
      recovery: 2,
    }) ||
    records.at(-3).event.type !== 'unknown' ||
    records.at(-2).event.action !== 'owned-stop-intent' ||
    records.at(-1).event.action !== 'owned-stop-observed'
  )
    fail('terminal journal accounting drift')
}

export async function verifyR32Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR30Predecessor({ requireNewRootAbsent: false })
  const prepared = await readPrepared()
  await verifyAuthority(prepared)
  const terminal = JSON.parse(await readStableFile(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readStableFile(INDEX, INDEX_SHA))
  if (
    terminal.schema !== 'appraise.m02-r32-native-terminal/v1' ||
    terminal.status !== 'UNKNOWN' ||
    terminal.completed !== 11 ||
    terminal.failedCase !== 'B07-A06' ||
    terminal.runtimeQualified !== false ||
    terminal.root !== OLD_ROOT ||
    terminal.manifestDigest !== MANIFEST_DIGEST ||
    terminal.manifestFileSha256 !== MANIFEST_SHA ||
    terminal.sourceHostCapacityReserved !== 36 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(terminal.consumed, R32_COUNTS) ||
    !isDeepStrictEqual(terminal.pending, []) ||
    terminal.completedCases?.length !== 11 ||
    terminal.lateCaseDiagnostics?.length !== 1 ||
    terminal.cleanupQualification !== 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN' ||
    index.root !== OLD_ROOT ||
    index.schema !== 'appraise.m02-r32-native-terminal-evidence-index/v1' ||
    index.rootIdentity.dev !== 16777233 ||
    index.rootIdentity.ino !== 70325306 ||
    !isDeepStrictEqual(index.rootIdentity, terminal.rootIdentity) ||
    index.files?.length !== 81 ||
    index.journalChainVerified !== true ||
    index.runtimeAuthority !== false ||
    index.rawProviderAccountAuthHistoryOrDatabaseCopied !== false ||
    index.originalsRewritten !== false ||
    terminal.evidenceIndex.path !== INDEX ||
    terminal.evidenceIndex.sha256 !== INDEX_SHA ||
    terminal.journal.reservations !== 272 ||
    terminal.journal.ACKs !== 272 ||
    terminal.journal.chainVerified !== true ||
    terminal.noResendOrResume !== true ||
    terminal.T2 !== 'INCOMPLETE' ||
    terminal.T3 !== 'INCOMPLETE' ||
    terminal.M02 !== 'INCOMPLETE'
  )
    fail('terminal or index drift')
  const failed = terminal.lateCaseDiagnostics[0]
  if (
    failed.caseId !== 'B07-A06' ||
    failed.stage !== 'GIT_READINESS' ||
    failed.reason !== 'GIT_READINESS_POLL_BUDGET_EXHAUSTED' ||
    !isDeepStrictEqual(failed.gitReadiness, {
      samples: 11,
      gitObserved: true,
      gitIdentityCount: 3,
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
    ...CASES.flatMap(id => [join(OLD_ROOT, 'cases', id), join(OLD_ROOT, 'cases', id, 'supervisor')]),
  ]
  const parents = []
  for (const directory of directories) {
    const stat = await fs.lstat(directory)
    if (!privateDirectory(stat)) fail('ancestor ownership or mode drift')
    parents.push({ directory, stat })
  }
  if (!same(parents[0].stat, index.rootIdentity)) fail('root identity drift')
  const names = new Set(['phase-journal.jsonl'])
  for (const [i, caseId] of CASES.entries()) {
    const requests = [3, 3, 4, 3, 3, 4, 2, 2, 2, 2, 2, 2][i]
    for (const name of [
      'script-plan.json',
      'mcp-startup.json',
      'mcp-exit.json',
      ...Array.from({ length: requests }, (_, at) => `provider-response-${at + 1}.json`),
      i < 11 ? 'case-outcome.json' : 'late-case-failure.json',
    ])
      names.add(`${caseId}--${name}`)
  }
  if (!isDeepStrictEqual(index.files.map(row => row.copy).sort(), [...names].sort())) fail('sanitized membership drift')
  for (const row of index.files) {
    const [caseId, name] = row.copy.split('--')
    const expected =
      row.copy === 'phase-journal.jsonl'
        ? join(OLD_ROOT, row.copy)
        : join(OLD_ROOT, 'cases', caseId, 'supervisor', name)
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
    const copyPath = join(dirname(INDEX), row.copy)
    const copyBefore = await fs.lstat(copyPath)
    if (
      !copyBefore.isFile() ||
      copyBefore.isSymbolicLink() ||
      copyBefore.nlink !== 1 ||
      copyBefore.uid !== process.getuid() ||
      (copyBefore.mode & 0o777) !== 0o600
    )
      fail('sanitized copy identity drift')
    const copy = await readStableFile(copyPath, row.sha256)
    if (!same(copyBefore, await fs.lstat(copyPath))) fail('sanitized copy changed')
    const original = await readStableFile(expected, row.sha256)
    if (!same(before, await fs.lstat(expected)) || !copy.equals(original) || copy.length !== row.bytes)
      fail('sanitized bytes drift')
    if (row.copy === 'phase-journal.jsonl') {
      if (row.sha256 !== terminal.journal.sha256) fail('journal pin drift')
      verifyJournal(copy, terminal, index, prepared)
    }
    if (name === 'case-outcome.json') {
      const at = CASES.indexOf(caseId),
        value = JSON.parse(copy),
        completed = terminal.completedCases[at]
      if (
        row.sha256 !== WITNESSES[at] ||
        completed.caseId !== caseId ||
        completed.caseWitnessSha256 !== row.sha256 ||
        completed.cleanupKnown !== true ||
        completed.canonicalAccepted !== true ||
        completed.listenerClosed !== true ||
        value.caseId !== caseId ||
        value.manifestDigest !== MANIFEST_DIGEST ||
        value.expected !== completed.outcome ||
        value.canonical?.accepted !== true ||
        value.hostCleanup?.originalHostGone !== true ||
        value.listenerClosed !== true ||
        value.pending !== 0 ||
        !isDeepStrictEqual(value.counts, completed.counts) ||
        !isDeepStrictEqual(value.gitReadiness, completed.gitReadiness)
      )
        fail('completed witness drift')
    }
    if (name === 'late-case-failure.json' && (caseId !== 'B07-A06' || !isDeepStrictEqual(JSON.parse(copy), failed)))
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
    r32TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: TERMINAL_SHA,
      indexPath: INDEX,
      indexSha256: INDEX_SHA,
      status: 'UNKNOWN',
      casesCompleted: 11,
      completedCases: Object.freeze(
        terminal.completedCases.map((row, at) =>
          Object.freeze({
            caseId: CASES[at],
            outcome: row.outcome,
            caseWitnessSha256: WITNESSES[at],
            cleanupKnown: true,
          }),
        ),
      ),
      failedCase: 'B07-A06',
      cleanup: 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN',
      failedCaseCleanup: 'UNKNOWN',
      root: OLD_ROOT,
      rootIdentity: Object.freeze({ ...index.rootIdentity }),
      consumed: R32_COUNTS,
      sourceCapacityReserved: 36,
      actualSourceHostCount: 'UNATTESTED',
      pending: Object.freeze([]),
      failureStage: 'GIT_READINESS',
      failureReason: 'GIT_READINESS_POLL_BUDGET_EXHAUSTED',
    }),
  })
}
