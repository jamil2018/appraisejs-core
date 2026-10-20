/** Exact consumed R48 UNKNOWN evidence. Requires the retained live p27 originals; no archival fallback or replay. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { verifyR44Predecessor } from '../codex-app-server-m02-ta-matrix-r47/r44-evidence.mjs'
import { readStableFile } from '../codex-app-server-m02-ta-matrix-r23/r21-evidence.mjs'
import { serializeR48Preparation } from '../codex-app-server-m02-ta-matrix-r48/preparation.mjs'
import { verifyR48HistoricalClosure } from '../codex-app-server-m02-ta-matrix-r48/runtime-effects.mjs'
import { POLICY as R48_POLICY } from '../codex-app-server-m02-ta-matrix-r48/policy.mjs'
import { requireTA04Absent } from '../codex-app-server-m02-ta-matrix-r48/prior-evidence.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { ROOT, digest } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const OLD_ROOT = '/private/tmp/appraise-m02-ta-matrix-p27'
const ROOT_IDENTITY = Object.freeze({ dev: 16777230, ino: 71374269 })
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r48/manifest.json')
export const R48_MANIFEST_FILE_SHA256 = '4ddca20dda88713195eb9600c45fba85d63d667b58bd749476c9890934c38a44'
const MANIFEST_DIGEST = '76928ff889e3aa9021dff0411009ea23c21fc190a949d1465c5f08a778ef87b7'
const CANONICAL_SHA = '7edbdcfc8d9d12a604660bb9f5345f28d2ec0b3d85fbb602207f1332f6d58c8f'
const TERMINAL = join(REPO, '.appraisejs/m02-r48-native-terminal-01.json')
const TERMINAL_SHA = 'a1704ea21aa05ec8915f14eabd271450d901bcd76cb5bb4b9bf17c311c2995ee'
const INDEX = join(REPO, '.appraisejs/m02-r48-native-terminal-evidence-01/index.json')
const INDEX_SHA = '0fc86fd1ef7a370ba2dca0186e4ba5c2377d10ff9db574adcf5a705f7c062633'
export const R48_COUNTS = Object.freeze({
  threadStarts: 1,
  turnStarts: 0,
  providerRequests: 0,
  scopedCalls: 0,
  workspaceActions: 0,
  permissionReplies: 0,
  codexStarts: 1,
  mcpStarts: 1,
  listenerStarts: 1,
  controlWrites: 3,
  canonicalRequests: 0,
  helperStarts: 0,
  outerCalls: 0,
  auditRequests: 0,
})
const PENDING = Object.freeze([
  Object.freeze({ id: 'B01-codex-mcp', kind: 'mcpStarts' }),
  Object.freeze({ id: 'B01-thread-start', kind: 'threadStarts' }),
])
const AUTHORITY_PINS = Object.freeze({
  context: [
    '.appraisejs/m02-r48-user-authorization-context-01.json',
    'fec618b7ab3960833ce2d5800696a511dbd8da04b5f35a3fa9987a3e93662cb7',
  ],
  decision: [
    '.appraisejs/m02-t2-r48-recovery-user-decision.json',
    '40d012cc0593898b5402b524dbb0ffb048377d9a601945e11fb4cc4e50a2ee97',
  ],
  review: [
    '.appraisejs/m02-t2-r48-exact-review.json',
    'cd66b113ba69616070b9c512caf941283220045e8dee50556da9cc42b3a19bba',
  ],
  focused: [
    '.appraisejs/m02-r48-focused-review-01.json',
    '1f0a5ae701cbcbc2b252ff52009fa45ca85c1f5365efd5c77ee25f8702e24c56',
  ],
  submission: [
    '.appraisejs/m02-r48-approved-native-submission-01.json',
    'b056c3116aad354c6879cb57c4c47c555836eb786e1597518f9f5ef6658a231b',
  ],
  submitted: [
    '.appraisejs/m02-r48-native-submitted-01.json',
    '44eecffb82c041518a6a1913ccb47edd02917a2de7c5bd23dcf9db5db7405fdb',
  ],
  toolTerminal: [
    '.appraisejs/m02-r48-native-tool-terminal-01.json',
    '535eb2ee5ba2de37f34891ea85e69aa569de188744eac12119db47a08745ebed',
  ],
  fixed: [
    '.appraisejs/m02-r48-fixed-command-01.json',
    '8555df0668efefc1c95e359bcabe7499b19943ae15a621353df4d2302a9812f9',
  ],
  precheck: [
    '.appraisejs/m02-r48-actual-file-only-precheck-01.json',
    '1104710e784bcc127b603e6b3c0bfd6edfd884214a319fe50dc445a05e3d7ed1',
  ],
  snapshot: [
    '.appraisejs/m02-r48-source-snapshot-01.json',
    '34bd84a4baa1b5274cd3857c9f99adc6efe886ce6f7002d6c49a91496182baaf',
  ],
})
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = reason => {
  throw new Error(`R51 consumed R48 ${reason}`)
}
const same = (a, b) => a?.dev === b?.dev && a?.ino === b?.ino
const sameFile = (a, b) =>
  ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key])
const privateDirectory = s =>
  s.isDirectory() && !s.isSymbolicLink() && s.uid === process.getuid() && (s.mode & 0o7777) === 0o700
const ownedFile = s =>
  s.isFile() && !s.isSymbolicLink() && s.uid === process.getuid() && s.nlink === 1 && (s.mode & 0o7777) === 0o600

async function readPrepared() {
  const bytes = await readStableFile(MANIFEST, R48_MANIFEST_FILE_SHA256)
  const prepared = JSON.parse(bytes),
    manifest = prepared.manifest
  if (
    prepared.schema !== 'appraise.m02-ta-matrix-r48-preparation/v1' ||
    prepared.manifestDigest !== MANIFEST_DIGEST ||
    digest(manifest) !== MANIFEST_DIGEST ||
    manifest.root !== OLD_ROOT ||
    manifest.phase !== 'T2' ||
    !isDeepStrictEqual(
      manifest.cases,
      R48_POLICY.cases.map(item => item.id),
    ) ||
    prepared.runtimeEligible !== false ||
    prepared.blockers?.length !== 0 ||
    prepared.canonicalSha256 !== CANONICAL_SHA
  )
    fail('preparation drift')
  const history = await verifyR48HistoricalClosure(manifest),
    paths = new Set()
  let current = 0
  for (const row of manifest.artifacts) {
    if (paths.has(row.path)) fail('artifact duplicate')
    paths.add(row.path)
    if (history.has(row.path)) {
      if (history.get(row.path).sha256 !== row.sha256) fail('historical mapping drift')
    } else {
      if (row.availability !== undefined) fail('unexpected current availability')
      await readStableFile(row.path, row.sha256)
      current++
    }
  }
  if (paths.size !== 8932 || current !== 8329 || history.size !== 603) fail('artifact closure drift')
  const canonicalBytes = await readStableFile(join(dirname(MANIFEST), 'canonical-bridge.mjs'), CANONICAL_SHA)
  if (!bytes.equals(serializeR48Preparation({ ...prepared, canonicalBytes }))) fail('canonical serialization drift')
  const seal = loadSealedRouteEvidence()
  if (seal.status !== 'SEALED_OFFLINE_ONLY') fail('sealed evidence drift')
  return { ...prepared, canonicalBytes, seal, manifestFileSha256: R48_MANIFEST_FILE_SHA256 }
}

async function verifyAuthority(prepared) {
  const values = {}
  for (const [key, [path, expected]] of Object.entries(AUTHORITY_PINS))
    values[key] = JSON.parse(await readStableFile(join(REPO, path), expected))
  const { context, decision, review, focused, submission, submitted, toolTerminal, fixed, precheck, snapshot } = values
  const expectedPrefix = [
    '/usr/bin/env',
    '-i',
    'PATH=/usr/bin:/bin',
    'LANG=C',
    '/opt/homebrew/Cellar/node/26.11.0/bin/node',
    join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r48/entrypoint.mjs'),
    '--run',
    MANIFEST,
    MANIFEST_DIGEST,
    R48_MANIFEST_FILE_SHA256,
  ]
  if (
    context.schema !== 'appraise.m02-r48-user-authorization-context/v1' ||
    context.authorizedAction !== 'ONE_FRESH_R48_P27_FULL_T2_INVOCATION' ||
    context.literalHashSpecificApprovalQuoteClaimed !== false ||
    context.noReplayOrResume !== true ||
    context.priorConsumedCommandsReusable !== false ||
    context.historicalAllocationsReset !== false ||
    context.manifest.path !== MANIFEST ||
    context.manifest.sha256 !== R48_MANIFEST_FILE_SHA256 ||
    context.manifest.manifestDigest !== MANIFEST_DIGEST ||
    context.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    context.combinedListenerAllocationCeilingIncludingR16 !== 234 ||
    !isDeepStrictEqual(
      context.cumulativeWholeCampaignCeilings,
      prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    ) ||
    decision.schema !== 'appraise.m02-ta-t2-r48-recovery-user-decision/v1' ||
    decision.verdict !== 'AUTHORIZE_ONE_FIXED_FULL_T2_R48_INVOCATION' ||
    decision.exactArtifactUserApprovalClaimed !== false ||
    decision.authorizationContext.path !== join(REPO, AUTHORITY_PINS.context[0]) ||
    decision.authorizationContext.sha256 !== AUTHORITY_PINS.context[1] ||
    decision.manifestDigest !== MANIFEST_DIGEST ||
    decision.manifestFileSha256 !== R48_MANIFEST_FILE_SHA256 ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    decision.historicalAvailabilitySha256 !== sha(JSON.stringify(prepared.manifest.historicalAvailability)) ||
    review.schema !== 'appraise.m02-ta-t2-r48-exact-review/v1' ||
    review.verdict !== 'ACCEPT_ONE_FIXED_FULL_T2_R48_INVOCATION' ||
    review.exactArtifactUserApprovalClaimed !== false ||
    review.manifest.path !== MANIFEST ||
    review.manifest.root !== OLD_ROOT ||
    review.manifest.phase !== 'T2' ||
    review.manifest.fileSha256 !== R48_MANIFEST_FILE_SHA256 ||
    review.manifest.manifestDigest !== MANIFEST_DIGEST ||
    !isDeepStrictEqual(review.manifest.cases, prepared.manifest.cases) ||
    review.canonicalSha256 !== CANONICAL_SHA ||
    review.entrypointSha256 !== prepared.manifest.artifacts.find(row => row.path === expectedPrefix[5])?.sha256 ||
    review.recoveryProposalSha256 !== prepared.manifest.recoveryProposalSha256 ||
    review.historicalAvailabilitySha256 !== decision.historicalAvailabilitySha256 ||
    review.independentReportSha256 !== AUTHORITY_PINS.focused[1] ||
    focused.verdict !== 'ACCEPT_EXACT_R48_ARTIFACTS_FOR_ONE_FRESH_FULL_T2_INVOCATION' ||
    focused.runtimeAuthority !== false ||
    focused.pins.sourceSnapshot.sha256 !== AUTHORITY_PINS.snapshot[1] ||
    !isDeepStrictEqual(review.exactInvocationPrefix, expectedPrefix) ||
    !isDeepStrictEqual(decision.exactInvocationPrefix, [...expectedPrefix, AUTHORITY_PINS.review[1]]) ||
    !isDeepStrictEqual(fixed.argv, [...decision.exactInvocationPrefix, AUTHORITY_PINS.decision[1]]) ||
    fixed.runtimeAuthority !== false ||
    submission.schema !== 'appraise.m02-r48-approved-native-submission/v1' ||
    submission.nativeInvocationMaximum !== 1 ||
    submission.root !== OLD_ROOT ||
    submission.noReplayOrResume !== true ||
    submission.historicalAllocationsReset !== false ||
    submission.fixedCommandSha256 !== AUTHORITY_PINS.fixed[1] ||
    submission.fixedCommand !== join(REPO, AUTHORITY_PINS.fixed[0]) ||
    !isDeepStrictEqual(submission.argv, fixed.argv) ||
    submission.command !== fixed.command ||
    submitted.toolSession !== 33808 ||
    submitted.nativeCommandConsumed !== true ||
    submitted.retryOrResumeAuthorized !== false ||
    submitted.exactCommandPath !== join(REPO, AUTHORITY_PINS.fixed[0]) ||
    toolTerminal.toolSession !== 33808 ||
    toolTerminal.exitCode !== 1 ||
    toolTerminal.result.status !== 'UNKNOWN' ||
    toolTerminal.result.completed !== 0 ||
    toolTerminal.result.failedCase !== 'B01' ||
    toolTerminal.consumedCommandReusable !== false ||
    precheck.exitCode !== 0 ||
    precheck.result.status !== 'PRECHECK_PASSED_NO_RUNTIME_AUTHORITY' ||
    precheck.externalEffectAttempts !== 0 ||
    precheck.result.manifestDigest !== MANIFEST_DIGEST ||
    precheck.result.manifestFileSha256 !== R48_MANIFEST_FILE_SHA256 ||
    precheck.result.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    precheck.result.decisionSha256 !== AUTHORITY_PINS.decision[1]
  )
    fail('authority or consumed submission drift')
  for (const pin of [context.proposal, context.standingAuthorization, decision.continuingImplementationAuthority])
    await readStableFile(pin.path, pin.sha256)
  const sourceDir = join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r48')
  if (
    snapshot.schema !== 'appraise.m02-r48-source-snapshot/v1' ||
    snapshot.runtimeAuthority !== false ||
    snapshot.files?.length !== 49 ||
    !isDeepStrictEqual(
      (await fs.readdir(sourceDir)).sort(),
      snapshot.files.map(row => row.path.slice(sourceDir.length + 1)).sort(),
    )
  )
    fail('R48 source membership drift')
  const tree = createHash('sha256')
  for (const row of snapshot.files) {
    if (
      dirname(row.path) !== sourceDir ||
      !/^[a-z0-9-]+\.mjs$/.test(row.path.slice(sourceDir.length + 1)) ||
      prepared.manifest.artifacts.find(item => item.path === row.path)?.sha256 !== row.sha256
    )
      fail('R48 source linkage drift')
    const bytes = await readStableFile(row.path, row.sha256)
    if (bytes.length !== row.bytes) fail('R48 source length drift')
    tree.update(row.path).update('\0').update(row.sha256).update('\n')
  }
  if (tree.digest('hex') !== snapshot.treeSha256 || snapshot.treeSha256 !== focused.pins.sourceSnapshot.treeSha256)
    fail('R48 source tree digest drift')
  return values
}

function verifyJournal(bytes, index, terminal, prepared) {
  const text = bytes.toString('utf8')
  if (!text.endsWith('\n')) fail('partial journal')
  const records = text
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line))
  const counts = Object.fromEntries(Object.keys(R48_COUNTS).map(key => [key, 0])),
    reserved = new Map(),
    pending = new Map()
  let previous = '0'.repeat(64),
    begun = 0,
    acknowledgements = 0,
    unknown = 0,
    recovery = 0
  const expected = [
    ['init'],
    ['begin'],
    ['reserve', 'listenerStarts', 'B01-listener'],
    ['ack', 'B01-listener'],
    ['reserve', 'controlWrites', 'B01-bootstrap'],
    ['ack', 'B01-bootstrap'],
    ['reserve', 'codexStarts', 'B01-codex'],
    ['reserve', 'mcpStarts', 'B01-codex-mcp'],
    ['ack', 'B01-codex'],
    ['reserve', 'controlWrites', 'B01-initialize'],
    ['ack', 'B01-initialize'],
    ['reserve', 'controlWrites', 'B01-initialize-initialized'],
    ['ack', 'B01-initialize-initialized'],
    ['reserve', 'threadStarts', 'B01-thread-start'],
    ['unknown'],
    ['recovery', 'B01-owned-stop-intent', 'owned-stop-intent'],
    ['recovery', 'B01-owned-stop-observed', 'owned-stop-observed'],
  ]
  for (const [at, row] of records.entries()) {
    if (
      row.seq !== at + 1 ||
      row.previous !== previous ||
      row.hash !== sha(JSON.stringify({ seq: row.seq, previous: row.previous, event: row.event }))
    )
      fail('journal chain drift')
    previous = row.hash
    const e = row.event,
      wanted = expected[at]
    if (!wanted || e.type !== wanted[0]) fail('journal event order drift')
    if (
      e.type === 'init' &&
      (at !== 0 ||
        e.phase !== 'T2' ||
        e.policyDigest !== prepared.manifest.journalBasePolicyDigest ||
        !same(e.directoryIdentity, index.rootIdentity) ||
        !same(e.fileIdentity, index.files.find(row => row.copy === 'phase-journal.jsonl')?.originalIdentity))
    )
      fail('journal init drift')
    if (e.type === 'begin') {
      if (e.caseId !== 'B01' || e.sourceHostCapacity !== 4 || e.evidenceClass !== 'SOURCE_BOUND_CAPACITY_RESERVED')
        fail('journal begin drift')
      begun++
    }
    if (e.type === 'reserve') {
      if (
        begun !== 1 ||
        unknown ||
        e.kind !== wanted[1] ||
        e.id !== wanted[2] ||
        reserved.has(e.id) ||
        !Object.hasOwn(counts, e.kind)
      )
        fail('journal reservation drift')
      reserved.set(e.id, e.kind)
      pending.set(e.id, e.kind)
      counts[e.kind]++
    }
    if (e.type === 'ack') {
      if (unknown || e.id !== wanted[1] || !pending.delete(e.id)) fail('journal ACK drift')
      acknowledgements++
    }
    if (e.type === 'unknown') {
      if (e.reason !== 'AMBIGUOUS_EFFECT' || at !== 14) fail('journal UNKNOWN fence drift')
      unknown++
    }
    if (e.type === 'recovery') {
      if (unknown !== 1 || e.id !== wanted[1] || e.action !== wanted[2]) fail('journal recovery drift')
      recovery++
    }
  }
  const remaining = [...pending].map(([id, kind]) => ({ id, kind }))
  if (
    records.length !== 17 ||
    records.length !== index.journalRecords ||
    records.length !== terminal.journal.records ||
    previous !== index.journalLastHash ||
    previous !== terminal.journal.terminalHash ||
    begun !== 1 ||
    reserved.size !== 7 ||
    acknowledgements !== 5 ||
    unknown !== 1 ||
    recovery !== 2 ||
    terminal.journal.reservations !== 7 ||
    terminal.journal.ACKs !== 5 ||
    !isDeepStrictEqual(counts, R48_COUNTS) ||
    !isDeepStrictEqual(counts, terminal.consumed) ||
    !isDeepStrictEqual(remaining, PENDING) ||
    !isDeepStrictEqual(remaining, terminal.pending) ||
    records.length !== 1 + begun + reserved.size + acknowledgements + unknown + recovery
  )
    fail('journal accounting drift')
}

function verifyDiagnostics(files, terminal) {
  const protocol = JSON.parse(files.get('B01--protocol-failure.json')),
    late = JSON.parse(files.get('B01--late-case-failure.json'))
  if (
    !isDeepStrictEqual([protocol], terminal.protocolFailures) ||
    protocol.category !== 'UNCLASSIFIED_PROTOCOL' ||
    protocol.phase !== 'ready' ||
    protocol.pendingKind !== 'thread/start' ||
    protocol.seq !== 14 ||
    protocol.frameKind !== 'response' ||
    protocol.caseId !== 'B01' ||
    !isDeepStrictEqual([late], terminal.lateCaseDiagnostics) ||
    late.stage !== 'CASE_START' ||
    late.reason !== 'DURABLE_PHASE_UNKNOWN' ||
    late.caseId !== 'B01' ||
    late.rawExceptionRetained !== false ||
    Object.values(late.gates).some(value => value !== 'NOT_REACHED')
  )
    fail('diagnostic predicate drift')
  const stageBytes = files.get('stage-progress.jsonl'),
    stages = stageBytes
      .toString('utf8')
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line))
  const names = [
    'NEXT_CASE_ENTER',
    'ADMISSION_RECHECK_ENTER',
    'ADMISSION_RECHECK_RETURN',
    'RECURSIVE_HISTORY_ENTER',
    'RECURSIVE_HISTORY_RETURN',
    'ADMISSION_FINAL_RECHECK_ENTER',
    'ADMISSION_FINAL_RECHECK_RETURN',
    'ADMISSION_READY',
    'CASE_BEGIN_ENTER',
    'CASE_BEGIN_RETURN',
  ]
  if (
    !stageBytes.toString('utf8').endsWith('\n') ||
    stageBytes.length > 65536 ||
    stages.length !== 10 ||
    terminal.stageProgress.records !== 10 ||
    terminal.stageProgress.diagnosticAuthority !== false ||
    !isDeepStrictEqual(stages.at(-1), terminal.stageProgress.last) ||
    stages.some((row, i) => !isDeepStrictEqual(row, { seq: i + 1, caseId: 'B01', stage: names[i] }))
  )
    fail('observational stage prefix drift')
  const plan = JSON.parse(files.get('B01--script-plan.json')),
    operations = R48_POLICY.cases[0].script.operations
  if (
    plan.name !== 'script-plan' ||
    plan.caseId !== 'B01' ||
    plan.evidenceClass !== 'TRUSTED_SUPERVISOR_OBSERVATION' ||
    !/^[a-f0-9]{64}$/.test(plan.planSha256 ?? '') ||
    plan.calls?.length !== operations.length ||
    plan.calls.some(
      (call, i) =>
        call.callId !== `m02_B01_${i}` ||
        call.operation !== operations[i].toolName ||
        call.rejection !== false ||
        !/^[a-f0-9]{64}$/.test(call.argumentsHash ?? '') ||
        !/^[a-f0-9]{64}$/.test(call.scriptSha256 ?? ''),
    )
  )
    fail('script-plan drift')
}

export async function verifyR48Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR44Predecessor({ requireNewRootAbsent: false }),
    prepared = await readPrepared()
  await verifyAuthority(prepared)
  const terminal = JSON.parse(await readStableFile(TERMINAL, TERMINAL_SHA)),
    index = JSON.parse(await readStableFile(INDEX, INDEX_SHA))
  if (
    terminal.schema !== 'appraise.m02-r48-native-terminal/v1' ||
    terminal.toolSession !== 33808 ||
    terminal.exitCode !== 1 ||
    terminal.status !== 'UNKNOWN' ||
    terminal.completed !== 0 ||
    !isDeepStrictEqual(terminal.completedCases, []) ||
    terminal.failedCase !== 'B01' ||
    terminal.root !== OLD_ROOT ||
    !isDeepStrictEqual(terminal.rootIdentity, ROOT_IDENTITY) ||
    terminal.manifestDigest !== MANIFEST_DIGEST ||
    terminal.manifestFileSha256 !== R48_MANIFEST_FILE_SHA256 ||
    terminal.sourceHostCapacityReserved !== 4 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    terminal.runtimeQualified !== false ||
    terminal.noResendOrResume !== true ||
    terminal.cleanupQualification !== 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN' ||
    terminal.globalProcessInventory !== 'UNATTESTED' ||
    terminal.T2 !== 'INCOMPLETE' ||
    terminal.T3 !== 'INCOMPLETE' ||
    terminal.M02 !== 'INCOMPLETE' ||
    !isDeepStrictEqual(terminal.consumed, R48_COUNTS) ||
    !isDeepStrictEqual(terminal.pending, PENDING) ||
    terminal.journal.chainVerified !== true ||
    index.schema !== 'appraise.m02-r48-native-terminal-evidence-index/v1' ||
    index.root !== OLD_ROOT ||
    !isDeepStrictEqual(index.rootIdentity, ROOT_IDENTITY) ||
    index.runtimeAuthority !== false ||
    index.originalsRewritten !== false ||
    index.rawProviderAccountAuthHistoryOrDatabaseCopied !== false ||
    index.journalChainVerified !== true ||
    terminal.evidenceIndex.path !== INDEX ||
    terminal.evidenceIndex.sha256 !== INDEX_SHA
  )
    fail('terminal or index drift')
  const expectedNames = [
    'phase-journal.jsonl',
    'stage-progress.jsonl',
    'B01--late-case-failure.json',
    'B01--protocol-failure.json',
    'B01--script-plan.json',
  ]
  if (!isDeepStrictEqual(index.files?.map(row => row.copy).sort(), [...expectedNames].sort()))
    fail('evidence membership drift')
  const directories = [
    OLD_ROOT,
    join(OLD_ROOT, 'cases'),
    join(OLD_ROOT, 'cases/B01'),
    join(OLD_ROOT, 'cases/B01/supervisor'),
    dirname(INDEX),
  ]
  const parents = []
  for (const directory of directories) {
    const stat = await fs.lstat(directory)
    if (!privateDirectory(stat)) fail('ancestor ownership or mode drift')
    parents.push({ directory, stat })
  }
  if (!same(parents[0].stat, ROOT_IDENTITY)) fail('live original root identity drift')
  const files = new Map()
  for (const row of index.files) {
    const expected = row.copy.includes('--')
      ? join(OLD_ROOT, 'cases/B01/supervisor', row.copy.slice(5))
      : join(OLD_ROOT, row.copy)
    if (
      row.originalPath !== expected ||
      !/^[a-f0-9]{64}$/.test(row.sha256 ?? '') ||
      !Number.isSafeInteger(row.bytes) ||
      row.bytes < 0
    )
      fail('original path or pin drift')
    const copyPath = join(dirname(INDEX), row.copy),
      before = await fs.lstat(expected),
      copyBefore = await fs.lstat(copyPath)
    if (
      !ownedFile(before) ||
      !ownedFile(copyBefore) ||
      ['dev', 'ino', 'uid', 'mode'].some(key => before[key] !== row.originalIdentity?.[key])
    )
      fail('original or copy identity drift')
    const original = await readStableFile(expected, row.sha256),
      copy = await readStableFile(copyPath, row.sha256)
    if (
      !sameFile(before, await fs.lstat(expected)) ||
      !sameFile(copyBefore, await fs.lstat(copyPath)) ||
      !original.equals(copy) ||
      copy.length !== row.bytes
    )
      fail('original or copy bytes drift')
    files.set(row.copy, copy)
  }
  if (index.files.find(row => row.copy === 'phase-journal.jsonl').sha256 !== terminal.journal.sha256)
    fail('journal terminal pin drift')
  verifyJournal(files.get('phase-journal.jsonl'), index, terminal, prepared)
  verifyDiagnostics(files, terminal)
  for (const { directory, stat } of parents) {
    const after = await fs.lstat(directory)
    if (!privateDirectory(after) || !sameFile(stat, after)) fail('ancestor changed during verification')
  }
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({
    ...old,
    prepared,
    r48TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: TERMINAL_SHA,
      indexPath: INDEX,
      indexSha256: INDEX_SHA,
      manifestFileSha256: R48_MANIFEST_FILE_SHA256,
      manifestDigest: MANIFEST_DIGEST,
      status: 'UNKNOWN',
      casesCompleted: 0,
      failedCase: 'B01',
      completedCases: Object.freeze([]),
      root: OLD_ROOT,
      rootIdentity: ROOT_IDENTITY,
      cleanup: terminal.cleanupQualification,
      cleanupQualification: terminal.cleanupQualification,
      failedCaseCleanup: 'UNKNOWN',
      globalCleanup: 'UNKNOWN',
      waitLocation: 'UNKNOWN',
      consumed: R48_COUNTS,
      sourceCapacityReserved: 4,
      actualSourceHostCount: 'UNATTESTED',
      pending: PENDING,
      journalUnknownFenceObserved: true,
      journalTerminalCheckpointObserved: false,
      journalRecords: 17,
      reservations: 7,
      acknowledgements: 5,
      ownedStopIntentObserved: true,
      ownedStopObserved: true,
      ownedStopEstablishesCleanup: false,
      protocolCategory: 'UNCLASSIFIED_PROTOCOL',
      protocolPhase: 'ready',
      protocolPendingKind: 'thread/start',
      stageProgressRecords: 10,
      fullT2Qualification: false,
      acceptanceStatus: 'INCOMPLETE',
      runtimeQualified: false,
    }),
  })
}
