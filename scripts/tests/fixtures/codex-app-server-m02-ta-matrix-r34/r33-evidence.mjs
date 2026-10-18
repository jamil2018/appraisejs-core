/** Exact consumed R33 evidence: one A06 profile case completed; no full T2 or global cleanup inference. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { verifyR32Predecessor } from '../codex-app-server-m02-ta-matrix-r33/r32-evidence.mjs'
import { serializeR33Preparation } from '../codex-app-server-m02-ta-matrix-r33/preparation.mjs'
import { verifyR33HistoricalClosure } from '../codex-app-server-m02-ta-matrix-r33/runtime-effects.mjs'
import { readStableFile } from './r21-evidence.mjs'
import { requireTA04Absent } from './prior-evidence.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { digest, ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const OLD_ROOT = '/private/tmp/appraise-m02-ta-matrix-p18'
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r33-02/manifest.json')
const MANIFEST_SHA = '8f2d5face5d196e2aa4e86318f804b0cae185443f9dea827dd4b09cbaac1abde'
const MANIFEST_DIGEST = 'f1066d5f20d91d58fdeffd948117d0779966d711d57cae60174bb301a72cff70'
const TERMINAL = join(REPO, '.appraisejs/m02-r33-native-terminal-01.json')
const TERMINAL_SHA = 'e9980133c44f7942c02c3b2c53ce601137a4779f14bd8bc921776e984a7b9513'
const INDEX = join(REPO, '.appraisejs/m02-r33-native-terminal-evidence-01/index.json')
const INDEX_SHA = '13242fc1daccb6d395648bb2be23c5d6009a3db6c7a29552a9545f30c2255869'
const CASES = Object.freeze(['B07-A06'])
const WITNESSES = Object.freeze(['a59dcaeadd70c2cdac94123f275dcd0ed2b1282104bd6b38dfb7399c7f312bc1'])
const AUTHORITY_PINS = Object.freeze({
  context: [
    '.appraisejs/m02-r33-user-authorization-context-01.json',
    '83e92d2fa7de43e9a97ceb8e3a01563e25c847f98939dbafa6aedfd49bb3460d',
  ],
  decision: [
    '.appraisejs/m02-t2-r33-recovery-user-decision.json',
    '22b1fb0d841ab33fb29dc81eba5ad2d25b6f1bd100091974d4ac167b6652d353',
  ],
  review: [
    '.appraisejs/m02-t2-r33-exact-review.json',
    '2f1ad6c8eebdb540eb6ec38c39e20d57c4f758857f1983b8a7d684e82a54fe69',
  ],
  focused: [
    '.appraisejs/m02-r33-focused-review-02.json',
    '3dab959f0c3a137dc5ce8ceee9a9575b045677bbdecc3545b07f41f731251075',
  ],
  submission: [
    '.appraisejs/m02-r33-approved-native-submission-01.json',
    'dcce862568a0a9bd280905cd76c2e8b29a66db17f9f63cb494023dc71400288b',
  ],
})
const FIXED_COMMAND =
  "/usr/bin/env -i PATH=/usr/bin:/bin LANG=C /opt/homebrew/Cellar/node/26.11.0/bin/node '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r33/entrypoint.mjs' --run '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r33-02/manifest.json' f1066d5f20d91d58fdeffd948117d0779966d711d57cae60174bb301a72cff70 8f2d5face5d196e2aa4e86318f804b0cae185443f9dea827dd4b09cbaac1abde 2f1ad6c8eebdb540eb6ec38c39e20d57c4f758857f1983b8a7d684e82a54fe69 22b1fb0d841ab33fb29dc81eba5ad2d25b6f1bd100091974d4ac167b6652d353"
export const R33_COUNTS = Object.freeze({
  listenerStarts: 1,
  controlWrites: 3,
  codexStarts: 1,
  mcpStarts: 1,
  threadStarts: 1,
  canonicalRequests: 2,
  turnStarts: 1,
  providerRequests: 2,
  outerCalls: 1,
  auditRequests: 2,
  scopedCalls: 1,
  workspaceActions: 0,
  permissionReplies: 0,
  helperStarts: 0,
})
const GIT_READINESS = Object.freeze({
  samples: 9,
  gitObserved: true,
  gitIdentityCount: 3,
  gitGone: true,
  gitPidReused: false,
  hostObserved: true,
  hostIdentityStable: true,
  readinessComplete: true,
})
const ENVIRONMENT_PROFILE = Object.freeze({
  profile: 'appraise.m02-r33-minimal-path/v1',
  directoryIdentity: { dev: 16777233, ino: 70411601 },
  empty: true,
  observation: 'TRUSTED_DIRECTORY_CHECK_NOT_FILESYSTEM_CONTAINMENT',
})
const STATE_OBSERVATIONS = Object.freeze({
  identities: [
    { ordinal: 1, counts: { RUNNABLE: 2, SLEEPING: 0, STOPPED: 0, ZOMBIE: 0, OTHER: 0 }, goneObserved: true },
    { ordinal: 2, counts: { RUNNABLE: 12, SLEEPING: 0, STOPPED: 0, ZOMBIE: 0, OTHER: 0 }, goneObserved: true },
    { ordinal: 3, counts: { RUNNABLE: 2, SLEEPING: 0, STOPPED: 0, ZOMBIE: 0, OTHER: 0 }, goneObserved: true },
  ],
  overflow: false,
  unavailable: false,
  additionalOsQueries: 0,
  rawArgumentsOrEnvironmentRead: false,
})
const fail = reason => {
  throw new Error(`R34 consumed R33 ${reason}`)
}
const same = (a, b) => a.dev === b.dev && a.ino === b.ino
const privateDirectory = value =>
  value.isDirectory() && !value.isSymbolicLink() && value.uid === process.getuid() && (value.mode & 0o777) === 0o700

async function readPrepared() {
  const bytes = await readStableFile(MANIFEST, MANIFEST_SHA)
  const prepared = JSON.parse(bytes)
  if (
    prepared.schema !== 'appraise.m02-ta-matrix-r33-preparation/v1' ||
    prepared.manifestDigest !== MANIFEST_DIGEST ||
    digest(prepared.manifest) !== MANIFEST_DIGEST ||
    prepared.manifest.root !== OLD_ROOT ||
    prepared.manifest.phase !== 'T2' ||
    !isDeepStrictEqual(prepared.manifest.cases, ['B07-A06']) ||
    prepared.blockers?.length !== 0 ||
    prepared.runtimeEligible !== false ||
    prepared.canonicalSha256 !== 'eb57d4b565cca2f3fb06329fb3dce2c0705fb4d5914015a21878b62a020daabb'
  )
    fail('preparation drift')
  const history = await verifyR33HistoricalClosure(prepared.manifest)
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
  if (current !== 7414 || history.size !== 23 || paths.size !== 7437) fail('closure drift')
  const canonicalBytes = await readStableFile(join(dirname(MANIFEST), 'canonical-bridge.mjs'), prepared.canonicalSha256)
  if (!bytes.equals(serializeR33Preparation({ ...prepared, canonicalBytes }))) fail('serialized preparation drift')
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
    context.schema !== 'appraise.m02-r33-user-authorization-context/v1' ||
    context.authorizedAction !== 'ONE_FRESH_R33_P18_A06_PROFILE_INVOCATION' ||
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
    decision.verdict !== 'AUTHORIZE_ONE_FIXED_A06_PROFILE_R33_INVOCATION' ||
    decision.exactArtifactUserApprovalClaimed !== false ||
    decision.authorizationContext?.path !== join(REPO, AUTHORITY_PINS.context[0]) ||
    decision.authorizationContext.sha256 !== AUTHORITY_PINS.context[1] ||
    decision.manifestDigest !== MANIFEST_DIGEST ||
    decision.manifestFileSha256 !== MANIFEST_SHA ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    review.verdict !== 'ACCEPT_ONE_FIXED_A06_PROFILE_R33_INVOCATION' ||
    review.exactArtifactUserApprovalClaimed !== false ||
    review.manifest.fileSha256 !== MANIFEST_SHA ||
    review.manifest.manifestDigest !== MANIFEST_DIGEST ||
    review.independentReportSha256 !== AUTHORITY_PINS.focused[1] ||
    focused.verdict !== 'ACCEPT_R33_SINGLE_A06_MINIMAL_PATH_PROFILE_CANDIDATE_ONLY' ||
    !isDeepStrictEqual(
      context.cumulativeWholeCampaignCeilings,
      prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    ) ||
    submission.schema !== 'appraise.m02-native-submission/v1' ||
    submission.campaign !== 'R33' ||
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
    pending = new Set(),
    types = new Map()
  const counts = Object.fromEntries(Object.keys(R33_COUNTS).map(kind => [kind, 0]))
  for (const [position, row] of records.entries()) {
    const hash = createHash('sha256')
      .update(JSON.stringify({ seq: row.seq, previous: row.previous, event: row.event }))
      .digest('hex')
    if (row.seq !== position + 1 || row.previous !== previous || row.hash !== hash) fail('journal chain drift')
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
        !same(event.fileIdentity, { dev: 16777233, ino: 70405824 }) ||
        !same(event.fileIdentity, index.files.find(item => item.copy === 'phase-journal.jsonl').originalIdentity))
    )
      fail('journal init drift')
    if (event.type === 'begin') {
      if (active !== null || begun !== 0 || event.caseId !== 'B07-A06' || event.sourceHostCapacity !== 2)
        fail('begin order or source allocation drift')
      active = event.caseId
      source += event.sourceHostCapacity
      begun++
    }
    if (event.type === 'reserve') {
      if (
        active !== 'B07-A06' ||
        !Object.hasOwn(counts, event.kind) ||
        typeof event.id !== 'string' ||
        (event.kind === 'scopedCalls'
          ? event.id !== `m02_B07_A06_${counts.scopedCalls}`
          : !event.id.startsWith(`${active}-`)) ||
        reserved.has(event.id)
      )
        fail('reservation drift')
      reserved.add(event.id)
      pending.add(event.id)
      counts[event.kind]++
    }
    if (event.type === 'ack') {
      if (active !== 'B07-A06' || !pending.delete(event.id)) fail('ACK drift')
      acknowledgements++
    }
    if (event.type === 'finish') {
      if (
        active !== 'B07-A06' ||
        finished !== 0 ||
        pending.size ||
        event.cleanupKnown !== true ||
        event.outcome !== 'no-effect' ||
        event.caseWitnessSha256 !== WITNESSES[0] ||
        !isDeepStrictEqual(counts, terminal.completedCases[0].counts)
      )
        fail('finish witness drift')
      active = null
      finished++
    }
    if (
      event.type === 'checkpoint' &&
      (position !== 35 ||
        active !== null ||
        finished !== 1 ||
        pending.size ||
        !isDeepStrictEqual(event, { type: 'checkpoint' }))
    )
      fail('terminal checkpoint drift')
  }
  if (
    records.length !== 36 ||
    index.journalRecords !== 36 ||
    terminal.journal.records !== 36 ||
    previous !== index.journalLastHash ||
    previous !== terminal.journal.terminalHash ||
    begun !== 1 ||
    finished !== 1 ||
    source !== 2 ||
    active !== null ||
    reserved.size !== 16 ||
    acknowledgements !== 16 ||
    pending.size ||
    !isDeepStrictEqual(counts, R33_COUNTS) ||
    !isDeepStrictEqual(Object.fromEntries(types), {
      init: 1,
      begin: 1,
      reserve: 16,
      ack: 16,
      finish: 1,
      checkpoint: 1,
    }) ||
    records.at(-2).event.type !== 'finish' ||
    records.at(-1).event.type !== 'checkpoint'
  )
    fail('terminal journal accounting drift')
}

export async function verifyR33Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR32Predecessor({ requireNewRootAbsent: false })
  const prepared = await readPrepared()
  await verifyAuthority(prepared)
  const terminal = JSON.parse(await readStableFile(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readStableFile(INDEX, INDEX_SHA))
  if (
    terminal.schema !== 'appraise.m02-r33-native-terminal/v1' ||
    terminal.status !== 'A06_MINIMAL_PATH_PROFILE_COMPLETED_NOT_FULL_T2' ||
    terminal.exitCode !== 0 ||
    terminal.completed !== 1 ||
    terminal.failedCase !== null ||
    terminal.runtimeQualified !== false ||
    terminal.root !== OLD_ROOT ||
    terminal.manifestDigest !== MANIFEST_DIGEST ||
    terminal.manifestFileSha256 !== MANIFEST_SHA ||
    terminal.sourceHostCapacityReserved !== 2 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(terminal.consumed, R33_COUNTS) ||
    !isDeepStrictEqual(terminal.pending, []) ||
    terminal.completedCases?.length !== 1 ||
    terminal.lateCaseDiagnostics?.length !== 0 ||
    terminal.cleanupQualification !== 'A06_BOUNDED_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED' ||
    index.root !== OLD_ROOT ||
    index.schema !== 'appraise.m02-r33-native-terminal-evidence-index/v1' ||
    index.rootIdentity.dev !== 16777233 ||
    index.rootIdentity.ino !== 70405823 ||
    !isDeepStrictEqual(index.rootIdentity, terminal.rootIdentity) ||
    index.files?.length !== 7 ||
    index.journalChainVerified !== true ||
    index.runtimeAuthority !== false ||
    index.rawProviderAccountAuthHistoryOrDatabaseCopied !== false ||
    index.originalsRewritten !== false ||
    terminal.evidenceIndex.path !== INDEX ||
    terminal.evidenceIndex.sha256 !== INDEX_SHA ||
    terminal.journal.reservations !== 16 ||
    terminal.journal.ACKs !== 16 ||
    terminal.journal.chainVerified !== true ||
    terminal.noResendOrResume !== true ||
    terminal.T2 !== 'INCOMPLETE' ||
    terminal.T3 !== 'INCOMPLETE' ||
    terminal.M02 !== 'INCOMPLETE'
  )
    fail('terminal or index drift')
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
    const requests = [2][i]
    for (const name of [
      'script-plan.json',
      'mcp-startup.json',
      'mcp-exit.json',
      ...Array.from({ length: requests }, (_, at) => `provider-response-${at + 1}.json`),
      'case-outcome.json',
    ])
      names.add(`${caseId}--${name}`)
  }
  if (!isDeepStrictEqual(index.files.map(row => row.copy).sort(), [...names].sort())) fail('sanitized membership drift')
  const receipts = new Map()
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
    if (['mcp-startup.json', 'mcp-exit.json', 'case-outcome.json'].includes(name)) receipts.set(name, JSON.parse(copy))
    if (name === 'case-outcome.json') {
      const at = CASES.indexOf(caseId),
        value = JSON.parse(copy),
        completed = terminal.completedCases[at]
      if (
        row.sha256 !== WITNESSES[at] ||
        completed.caseId !== caseId ||
        completed.outcome !== 'no-effect' ||
        !isDeepStrictEqual(completed.counts, R33_COUNTS) ||
        !isDeepStrictEqual(completed.gitReadiness, GIT_READINESS) ||
        !isDeepStrictEqual(completed.environmentProfile, ENVIRONMENT_PROFILE) ||
        !isDeepStrictEqual(completed.processStates, STATE_OBSERVATIONS) ||
        completed.caseWitnessSha256 !== row.sha256 ||
        completed.cleanupKnown !== true ||
        completed.canonicalAccepted !== true ||
        completed.listenerClosed !== true ||
        value.caseId !== caseId ||
        value.manifestDigest !== MANIFEST_DIGEST ||
        value.expected !== completed.outcome ||
        !isDeepStrictEqual(value.canonical, {
          acceptances: 0,
          artifacts: 0,
          effects: 0,
          evidenceClass: 'DISPOSABLE_CANONICAL_DATABASE_READ',
          accepted: true,
        }) ||
        !isDeepStrictEqual(value.ownedCodex, { exit: { code: 0, signal: null }, close: { code: 0, signal: null } }) ||
        value.hostCleanup?.pidReused !== false ||
        !isDeepStrictEqual(value.hostObservation, value.hostCleanup?.observedHost) ||
        !isDeepStrictEqual(value.environmentProfile, completed.environmentProfile) ||
        !isDeepStrictEqual(value.processStates, completed.processStates) ||
        value.journalSeq !== 34 ||
        value.hostCleanup?.originalHostGone !== true ||
        value.listenerClosed !== true ||
        value.pending !== 0 ||
        !isDeepStrictEqual(value.counts, completed.counts) ||
        !isDeepStrictEqual(value.gitReadiness, completed.gitReadiness)
      )
        fail('completed witness drift')
    }
  }
  const startup = receipts.get('mcp-startup.json'),
    exit = receipts.get('mcp-exit.json'),
    outcome = receipts.get('case-outcome.json')
  if (
    startup?.schema !== 'appraise.m02-ta-matrix-child-receipt/v1' ||
    startup.event !== 'sdk-connect-returned' ||
    startup.caseId !== 'B07-A06' ||
    startup.evidenceClass !== 'TRUSTED_CHILD_SELF_REPORT' ||
    exit?.schema !== startup.schema ||
    exit.event !== 'node-exit-handler' ||
    exit.caseId !== startup.caseId ||
    exit.evidenceClass !== startup.evidenceClass ||
    exit.exitCode !== 0 ||
    ['capabilityHash', 'bootstrapHash', 'profileDigest'].some(key => exit[key] !== startup[key]) ||
    outcome.childEvidence?.evidenceClass !== 'TRUSTED_CHILD_SELF_REPORT' ||
    !isDeepStrictEqual(outcome.childEvidence.receipt, exit) ||
    outcome.childEvidence.sha256 !== createHash('sha256').update(JSON.stringify(exit)).digest('hex')
  )
    fail('MCP startup or exit witness drift')
  for (const { directory, stat } of parents) {
    const after = await fs.lstat(directory)
    if (!privateDirectory(after) || !same(stat, after)) fail('ancestor changed')
  }
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({
    ...old,
    prepared,
    r33TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: TERMINAL_SHA,
      indexPath: INDEX,
      indexSha256: INDEX_SHA,
      status: 'A06_MINIMAL_PATH_PROFILE_COMPLETED_NOT_FULL_T2',
      casesCompleted: 1,
      completedCases: Object.freeze([
        Object.freeze({ caseId: 'B07-A06', outcome: 'no-effect', caseWitnessSha256: WITNESSES[0], cleanupKnown: true }),
      ]),
      failedCase: null,
      cleanup: 'A06_BOUNDED_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED',
      root: OLD_ROOT,
      rootIdentity: Object.freeze({ ...index.rootIdentity }),
      consumed: R33_COUNTS,
      sourceCapacityReserved: 2,
      actualSourceHostCount: 'UNATTESTED',
      pending: Object.freeze([]),
      caseWitnessSha256: WITNESSES[0],
      boundedCleanupOnlyNotGlobalProcessAbsence: true,
      gitReadiness: structuredClone(GIT_READINESS),
      environmentProfile: structuredClone(ENVIRONMENT_PROFILE),
      processStates: structuredClone(STATE_OBSERVATIONS),
      fullT2Qualification: false,
    }),
  })
}
