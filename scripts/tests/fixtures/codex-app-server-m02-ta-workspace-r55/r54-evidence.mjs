/** Read-only R54 partial success and consumed UNKNOWN evidence; N02 scratch bytes establish no ACK or cleanup. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { verifyT3Predecessor as verifyR52Predecessor } from '../codex-app-server-m02-ta-workspace-r54/r52-evidence.mjs'
import { serializeWorkspacePreparation } from '../codex-app-server-m02-ta-workspace-r54/preparation.mjs'
import { verifyR54HistoricalClosure } from '../codex-app-server-m02-ta-workspace-r54/native-ports.mjs'
import { readStableFile } from '../codex-app-server-m02-ta-matrix-r51/r21-evidence.mjs'
import { requireTA04Absent } from '../codex-app-server-m02-ta-matrix-r51/prior-evidence.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { POLICY as R54_POLICY } from '../codex-app-server-m02-ta-workspace-r54/policy.mjs'
import { digest, ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const OLD_ROOT = '/private/tmp/appraise-m02-ta-workspace-p3'
const MANIFEST = join(REPO, '.appraisejs/m02-ta-workspace-build-r54/manifest.json')
const MANIFEST_SHA = 'e84c727ad2396ca676fbda13c2698403c962c08dbbe80eca1347ece2f025cd8b'
const MANIFEST_DIGEST = 'c5d6aaae9019ff947140321bcc69bc9fdbed0a19d6e30378dcad8854d620732b'
const CANONICAL_SHA = 'd0898a6beef046ac9b8d965603b8cde59b0a409115b97447e59a116bcd4ad129'
const TERMINAL = join(REPO, '.appraisejs/m02-r54-native-terminal-01.json')
const TERMINAL_SHA = '32008cfc8146aa326440b9b536cf43f17c6e611142b9d6bbf5f08686b9273263'
const INDEX = join(REPO, '.appraisejs/m02-r54-native-terminal-evidence-01/index.json')
const INDEX_SHA = 'ccda3723adbc8a9c4a585a4df2913277b79dcadbe7270c2bcf5830c963bd57d8'
const JOURNAL_SHA = 'ba80ff26c3c508614378b1cc1ffef54be7e175a0b916eb3459a1a5592ce313a0'
const TERMINAL_HASH = '6eedc748b01f5e03b20413a559285a19eb85a92e8efdda9491d437c1f339301a'
const SCRATCH_SHA = 'fd5a91b572727c6e571e72b819ead84d1c42cc6f4348a48c00658fffc506dbce'
const ROOT_IDENTITY = Object.freeze({ dev: 16777230, ino: 71565888 })
const KINDS = Object.freeze([...Object.keys(R54_POLICY.aggregate), 'outerCalls', 'auditRequests'])
const PENDING = Object.freeze([Object.freeze({ id: 'N02-workspace-action', kind: 'workspaceActions' })])
const CONSUMED = Object.freeze({
  threadStarts: 2,
  turnStarts: 2,
  providerRequests: 3,
  scopedCalls: 0,
  workspaceActions: 2,
  permissionReplies: 0,
  codexStarts: 2,
  mcpStarts: 2,
  listenerStarts: 2,
  controlWrites: 6,
  canonicalRequests: 4,
  helperStarts: 0,
  outerCalls: 2,
  auditRequests: 0,
})
const N01_WITNESS_SHA = '588bf78418c92755aefa1e831dc574d9a85d81f5db5083dab74daba846ddbaba'
const N02_SCRATCH_SHA = '2cc3e5422a4322245c5ee13bc78d6cc3558f6aa09d9de80ffc6884f75fc0e707'
const SCHEMA_PATH = join(REPO, '.appraisejs/m02-executable-qualification-20261016-01/schemas/ServerNotification.json')
const SCHEMA_SHA = '8e719512bc26bb3871fcf7b378b79abf912d82787609c0ad418b71f179d0883f'
const METHOD_SHA = '411738230c49e374897ac082e0534e5567d5c5a6fc28521010c56f4f94ac4e47'
const AUTHORITY_PINS = Object.freeze({
  review: [
    '.appraisejs/m02-t3-r54-exact-review.json',
    '69a460c6832a5d52a401236134dc322362998925c03cf8a13a7695e80cd40995',
  ],
  decision: [
    '.appraisejs/m02-t3-r54-recovery-user-decision.json',
    'ed9a4cb2af0786bc238011b744c4cdf37a9c50938ae4d49f54d86437649c3f2a',
  ],
  context: [
    '.appraisejs/m02-r54-user-authorization-context-01.json',
    '5feae30419adf6b8bb8f79fd2b3f516d864e6301e0db84d11835423b3a3a30ce',
  ],
  focused: [
    '.appraisejs/m02-r54-focused-review-01.json',
    'b02ac557099e04f0f48bbf8bb8f686f75a9e61e1dcb7190bdda41df6c0c0d904',
  ],
  submission: [
    '.appraisejs/m02-r54-approved-native-submission-01.json',
    '977a6126cbce998adc67d604b356385ecd842c8a643b09fa8e7762c8f5d7ff69',
  ],
  submitted: [
    '.appraisejs/m02-r54-native-submitted-01.json',
    '6d65018f1cdec4f144c8c924a3a2cb5433c5602e7bb1875ca01babb7674a4b87',
  ],
  fixed: [
    '.appraisejs/m02-r54-fixed-command-01.json',
    '1473eb8caa2087136c9fd7bd2fe8408dfdec0a93645c63294373906b463af402',
  ],
  precheck: [
    '.appraisejs/m02-r54-actual-file-only-precheck-01.json',
    '8deca7e16f366cce78d6178cad8c629e89ba0e33ca24d770176c25cd944694df',
  ],
  toolTerminal: [
    '.appraisejs/m02-r54-native-tool-terminal-01.json',
    'bba6ffd1f7ba4b2373a30c8983cb4d458c35fa7e1ca210addea6d52fcdf42af7',
  ],
  snapshot: [
    '.appraisejs/m02-r54-source-snapshot-01.json',
    '222b4d771ed2e3caed11184d4f4d8635f198c06a29bbc26c5d4a1ff1ea8b05f4',
  ],
})
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => a?.dev === b?.dev && a?.ino === b?.ino
const sameFile = (a, b) =>
  ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key])
const privateDirectory = value =>
  value.isDirectory() && !value.isSymbolicLink() && value.uid === process.getuid() && (value.mode & 0o7777) === 0o700
const ownedFile = value =>
  value.isFile() &&
  !value.isSymbolicLink() &&
  value.uid === process.getuid() &&
  value.nlink === 1 &&
  (value.mode & 0o7777) === 0o600
const fail = reason => {
  throw new Error(`R55 T3 predecessor ${reason}`)
}

async function readPrepared() {
  const bytes = await readStableFile(MANIFEST, MANIFEST_SHA)
  const prepared = JSON.parse(bytes)
  if (
    prepared.schema !== 'appraise.m02-ta-workspace-r54-preparation/v1' ||
    prepared.manifestDigest !== MANIFEST_DIGEST ||
    digest(prepared.manifest) !== MANIFEST_DIGEST ||
    prepared.manifest.root !== OLD_ROOT ||
    prepared.manifest.phase !== 'T3' ||
    !isDeepStrictEqual(prepared.manifest.cases, ['N01', 'N02']) ||
    prepared.blockers?.length !== 0 ||
    prepared.runtimeEligible !== false ||
    prepared.exactArtifactReviewRequired !== true ||
    prepared.canonicalSha256 !== CANONICAL_SHA
  )
    fail('preparation drift')
  const history = await verifyR54HistoricalClosure(prepared.manifest)
  const paths = new Set()
  let current = 0,
    ta04 = 0,
    ta06 = 0
  for (const row of prepared.manifest.artifacts) {
    if (paths.has(row.path)) fail('artifact duplicate')
    paths.add(row.path)
    if (history.has(row.path)) {
      const witness = history.get(row.path)
      const label =
        witness.status === 'HISTORICAL_TEMP_SOURCE_ABSENT_TA06_VERIFIED'
          ? 'HISTORICAL_TEMP_SOURCE_ABSENT_TA06_VERIFIED'
          : 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED'
      if (row.availability !== label || witness.sha256 !== row.sha256) fail('historical artifact label or pin drift')
      if (label === 'HISTORICAL_TEMP_SOURCE_ABSENT_TA06_VERIFIED') ta06++
      else ta04++
    } else {
      if (row.availability !== undefined) fail('current artifact availability drift')
      await readStableFile(row.path, row.sha256)
      current++
    }
  }
  if (
    current !== 8830 ||
    ta04 !== 23 ||
    ta06 !== 580 ||
    history.size !== 603 ||
    paths.size !== 9433 ||
    [...history.keys()].some(path => !paths.has(path))
  )
    fail('closure drift')
  const canonicalBytes = await readStableFile(join(dirname(MANIFEST), 'canonical-bridge.mjs'), CANONICAL_SHA)
  if (!bytes.equals(serializeWorkspacePreparation({ ...prepared, canonicalBytes })))
    fail('serialized preparation drift')
  const seal = loadSealedRouteEvidence()
  if (seal.status !== 'SEALED_OFFLINE_ONLY') fail('sealed evidence invalid')
  return { ...prepared, canonicalBytes, seal, manifestFileSha256: MANIFEST_SHA }
}

async function verifyAuthority(prepared, prior) {
  const values = {}
  for (const [key, [path, expected]] of Object.entries(AUTHORITY_PINS))
    values[key] = JSON.parse(await readStableFile(join(REPO, path), expected))
  const { review, decision, context, focused, submission, submitted, fixed, precheck, toolTerminal, snapshot } = values
  const prefix = [
    '/usr/bin/env',
    '-i',
    'PATH=/usr/bin:/bin',
    'LANG=C',
    '/opt/homebrew/Cellar/node/26.11.0/bin/node',
    join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-workspace-r54/entrypoint.mjs'),
    '--run',
    MANIFEST,
    MANIFEST_DIGEST,
    MANIFEST_SHA,
  ]
  const authority = prepared.manifest.freshT3Authorization
  if (
    context.schema !== 'appraise.m02-r54-user-authorization-context/v1' ||
    context.authorizedAction !== 'ONE_FRESH_R54_WORKSPACE_P2_T3_INVOCATION' ||
    context.literalHashSpecificApprovalQuoteClaimed !== false ||
    context.exactArtifactUserApprovalClaimed !== false ||
    context.explicitFreshT3UserAuthorityVerified !== true ||
    context.noReplayOrResume !== true ||
    context.priorConsumedCommandsReusable !== false ||
    context.historicalAllocationsReset !== false ||
    context.manifest.path !== MANIFEST ||
    context.manifest.sha256 !== MANIFEST_SHA ||
    context.manifest.manifestDigest !== MANIFEST_DIGEST ||
    context.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    !isDeepStrictEqual(context.r51TerminalEvidence, prior.r51TerminalEvidence) ||
    !isDeepStrictEqual(context.r52TerminalEvidence, prior.r52TerminalEvidence) ||
    !isDeepStrictEqual(
      context.cumulativeWholeCampaignCeilings,
      prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    ) ||
    context.combinedListenerAllocationCeilingIncludingR16 !== 262 ||
    !isDeepStrictEqual(context.freshT3Authorization, authority) ||
    !isDeepStrictEqual(review.freshT3Authorization, authority) ||
    !isDeepStrictEqual(decision.freshT3Authorization, authority) ||
    !isDeepStrictEqual(submission.explicitUserAuthority, authority) ||
    decision.schema !== 'appraise.m02-ta-t3-r54-recovery-user-decision/v1' ||
    decision.verdict !== 'AUTHORIZE_ONE_FIXED_T3_R54_INVOCATION' ||
    decision.exactArtifactUserApprovalClaimed !== false ||
    decision.specimenOnly !== false ||
    decision.manifestDigest !== MANIFEST_DIGEST ||
    decision.manifestFileSha256 !== MANIFEST_SHA ||
    decision.authorizationContext.path !== join(REPO, AUTHORITY_PINS.context[0]) ||
    decision.authorizationContext.sha256 !== AUTHORITY_PINS.context[1] ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    review.schema !== 'appraise.m02-ta-t3-r54-exact-review/v1' ||
    review.verdict !== 'ACCEPT_ONE_FIXED_T3_R54_INVOCATION' ||
    review.exactArtifactUserApprovalClaimed !== false ||
    review.manifest.path !== MANIFEST ||
    review.manifest.fileSha256 !== MANIFEST_SHA ||
    review.manifest.manifestDigest !== MANIFEST_DIGEST ||
    review.manifest.root !== OLD_ROOT ||
    review.manifest.phase !== 'T3' ||
    !isDeepStrictEqual(review.manifest.cases, ['N01', 'N02']) ||
    review.canonicalSha256 !== CANONICAL_SHA ||
    review.entrypointSha256 !== prepared.manifest.artifacts.find(row => row.path === prefix[5])?.sha256 ||
    review.recoveryProposalSha256 !== prepared.manifest.recoveryProposalSha256 ||
    review.historicalAvailabilitySha256 !== sha(JSON.stringify(prepared.manifest.historicalAvailability)) ||
    review.independentReportSha256 !== AUTHORITY_PINS.focused[1] ||
    focused.verdict !== 'ACCEPT_ONE_FIXED_T3_R54_INVOCATION' ||
    focused.runtimeAuthority !== false ||
    focused.pins.sourceSnapshot.sha256 !== AUTHORITY_PINS.snapshot[1] ||
    !isDeepStrictEqual(review.exactInvocationPrefix, prefix) ||
    !isDeepStrictEqual(decision.exactInvocationPrefix, [...prefix, AUTHORITY_PINS.review[1]]) ||
    !isDeepStrictEqual(fixed.argv, [...decision.exactInvocationPrefix, AUTHORITY_PINS.decision[1]]) ||
    fixed.freshInvocationMaximum !== 1 ||
    submission.schema !== 'appraise.m02-r54-approved-native-submission/v1' ||
    submission.nativeInvocationMaximum !== 1 ||
    submission.root !== OLD_ROOT ||
    submission.noReplayOrResume !== true ||
    submission.historicalAllocationsReset !== false ||
    submission.fixedCommandSha256 !== AUTHORITY_PINS.fixed[1] ||
    !isDeepStrictEqual(submission.argv, fixed.argv) ||
    submission.command !== fixed.command ||
    submitted.toolSession !== 50799 ||
    submitted.freshRoot !== OLD_ROOT ||
    submitted.resendOrResumeAllowed !== false ||
    submitted.wholeAllocationRetainedRegardlessOfObservedConsumption !== true ||
    toolTerminal.schema !== 'appraise.m02-r54-native-tool-terminal/v1' ||
    toolTerminal.toolSession !== 50799 ||
    toolTerminal.exitCode !== 1 ||
    !isDeepStrictEqual(toolTerminal.result, {
      status: 'UNKNOWN',
      completed: 1,
      failedCase: 'N02',
      failureStage: 'WAIT_TERMINAL',
      runtimeQualified: false,
    }) ||
    toolTerminal.consumedCommandReusable !== false ||
    toolTerminal.journalCorroborationRequired !== true ||
    precheck.schema !== 'appraise.m02-r54-actual-fixed-file-only-precheck/v1' ||
    precheck.exitCode !== 0 ||
    precheck.status !== 'PRECHECK_PASSED_NO_RUNTIME_AUTHORITY' ||
    precheck.guard.externalEffectAttempts !== 0 ||
    precheck.guard.nativeRunAttempted !== false ||
    precheck.manifestDigest !== MANIFEST_DIGEST ||
    precheck.manifestFileSha256 !== MANIFEST_SHA ||
    precheck.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    precheck.decisionSha256 !== AUTHORITY_PINS.decision[1]
  )
    fail('authority or consumed submission drift')
  for (const pin of [
    context.proposal,
    context.standingAuthorization,
    context.freshT3Authorization,
    decision.continuingImplementationAuthority,
  ])
    await readStableFile(pin.path, pin.sha256)
  const sourceDir = join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-workspace-r54')
  if (
    snapshot.schema !== 'appraise.m02-r54-source-snapshot/v1' ||
    snapshot.files?.length !== 27 ||
    snapshot.treeDigestEncoding !== 'SHA256_UTF8_JSON_STRINGIFY_FILES_ARRAY' ||
    !isDeepStrictEqual(
      (await fs.readdir(sourceDir)).sort(),
      snapshot.files.map(row => row.path.slice(sourceDir.length + 1)).sort(),
    )
  )
    fail('R54 source membership drift')
  for (const row of snapshot.files) {
    if (
      dirname(row.path) !== sourceDir ||
      !/^[a-z0-9-]+\.mjs$/.test(row.path.slice(sourceDir.length + 1)) ||
      prepared.manifest.artifacts.find(item => item.path === row.path)?.sha256 !== row.sha256
    )
      fail('R54 source linkage drift')
    const bytes = await readStableFile(row.path, row.sha256)
    if (bytes.length !== row.bytes) fail('R54 source length drift')
  }
  if (
    sha(JSON.stringify(snapshot.files)) !== snapshot.treeSha256 ||
    snapshot.treeSha256 !== focused.pins.sourceSnapshot.treeSha256
  )
    fail('R54 source tree digest drift')
}

function verifyJournal(bytes, terminal, index, prepared) {
  const text = bytes.toString('utf8')
  if (!text.endsWith('\n')) fail('journal partial line')
  const records = text
    .slice(0, -1)
    .split('\n')
    .map(line => JSON.parse(line))
  const counts = Object.fromEntries(KINDS.map(kind => [kind, 0]))
  const reserved = new Map(),
    pending = new Map()
  let previous = '0'.repeat(64),
    acknowledgements = 0,
    begins = 0,
    unknown = 0,
    recoveries = 0,
    finishes = 0
  let active = null
  for (const [position, row] of records.entries()) {
    if (
      row.seq !== position + 1 ||
      row.previous !== previous ||
      row.hash !== sha(JSON.stringify({ seq: row.seq, previous: row.previous, event: row.event }))
    )
      fail('journal chain drift')
    previous = row.hash
    const event = row.event
    if (position === 0) {
      if (
        event.type !== 'init' ||
        event.phase !== 'T3' ||
        event.policyDigest !== prepared.manifest.journalBasePolicyDigest ||
        !same(event.directoryIdentity, ROOT_IDENTITY) ||
        !same(event.fileIdentity, index.files.find(item => item.copy === 'phase-journal.jsonl')?.originalIdentity)
      )
        fail('journal init drift')
    } else if (event.type === 'begin') {
      const expected = begins === 0 ? 'N01' : 'N02'
      if (
        begins > 1 ||
        position !== (begins === 0 ? 1 : 31) ||
        event.caseId !== expected ||
        active !== null ||
        pending.size !== 0 ||
        event.sourceHostCapacity !== 2 ||
        event.evidenceClass !== 'SOURCE_BOUND_CAPACITY_RESERVED'
      )
        fail('begin drift')
      active = expected
      begins++
    } else if (event.type === 'reserve') {
      if (
        active === null ||
        unknown ||
        !KINDS.includes(event.kind) ||
        typeof event.id !== 'string' ||
        !event.id.startsWith(`${active}-`) ||
        reserved.has(event.id)
      )
        fail('reservation drift')
      reserved.set(event.id, event.kind)
      pending.set(event.id, event.kind)
      counts[event.kind]++
    } else if (event.type === 'ack') {
      if (unknown || active === null || !event.id.startsWith(`${active}-`) || !pending.delete(event.id))
        fail('ACK drift')
      acknowledgements++
    } else if (event.type === 'finish') {
      if (
        position !== 30 ||
        active !== 'N01' ||
        pending.size ||
        finishes ||
        event.outcome !== 'workspace-effect' ||
        event.cleanupKnown !== true ||
        event.caseWitnessSha256 !== N01_WITNESS_SHA ||
        !isDeepStrictEqual(counts, terminal.completedCases[0].counts)
      )
        fail('N01 finish drift')
      active = null
      finishes++
    } else if (event.type === 'unknown') {
      if (position !== 57 || active !== 'N02' || event.reason !== 'AMBIGUOUS_EFFECT' || unknown)
        fail('UNKNOWN fence drift')
      unknown++
    } else if (event.type === 'recovery') {
      const action = recoveries === 0 ? 'owned-stop-intent' : 'owned-stop-observed'
      if (
        !unknown ||
        position !== 58 + recoveries ||
        recoveries > 1 ||
        event.id !== `N02-${action}` ||
        event.action !== action
      )
        fail('owned stop observation drift')
      recoveries++
    } else fail('unplanned journal event')
  }
  if (
    records.length !== 60 ||
    index.journalRecords !== 60 ||
    terminal.journal.records !== 60 ||
    previous !== TERMINAL_HASH ||
    index.journalLastHash !== TERMINAL_HASH ||
    terminal.journal.terminalHash !== TERMINAL_HASH ||
    begins !== 2 ||
    finishes !== 1 ||
    reserved.size !== 27 ||
    acknowledgements !== 26 ||
    unknown !== 1 ||
    recoveries !== 2 ||
    !isDeepStrictEqual(
      [...pending].map(([id, kind]) => ({ id, kind })),
      PENDING,
    ) ||
    !isDeepStrictEqual(counts, CONSUMED) ||
    !isDeepStrictEqual(counts, terminal.consumed)
  )
    fail('terminal journal accounting drift')
}

async function verifyTerminal(prepared) {
  if (prepared.manifest.artifacts.find(row => row.path === SCHEMA_PATH)?.sha256 !== SCHEMA_SHA)
    fail('pinned notification schema linkage drift')
  const schema = JSON.parse(await readStableFile(SCHEMA_PATH, SCHEMA_SHA))
  const notification = schema.definitions?.TurnDiffUpdatedNotification
  if (
    notification?.type !== 'object' ||
    !isDeepStrictEqual(notification.required, ['diff', 'threadId', 'turnId']) ||
    ['diff', 'threadId', 'turnId'].some(key => notification.properties?.[key]?.type !== 'string')
  )
    fail('pinned notification schema drift')
  const terminal = JSON.parse(await readStableFile(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readStableFile(INDEX, INDEX_SHA))
  const names = [
    'phase-journal.jsonl',
    'N01--case-outcome.json',
    'N01--mcp-exit.json',
    'N01--mcp-startup.json',
    'N01--provider-response-1.json',
    'N01--provider-response-2.json',
    'N01--script-plan.json',
    'N01--workspace-proof.json',
    'N01--scratch.txt',
    'N02--case-failure.json',
    'N02--mcp-exit.json',
    'N02--mcp-startup.json',
    'N02--protocol-failure.json',
    'N02--provider-response-1.json',
    'N02--script-plan.json',
    'N02--scratch.txt',
  ]
  if (
    terminal.schema !== 'appraise.m02-r54-native-terminal/v1' ||
    terminal.toolSession !== 50799 ||
    terminal.exitCode !== 1 ||
    terminal.status !== 'UNKNOWN' ||
    terminal.completed !== 1 ||
    terminal.completedCases?.length !== 1 ||
    terminal.completedCases[0].caseId !== 'N01' ||
    terminal.completedCases[0].caseWitnessSha256 !== N01_WITNESS_SHA ||
    terminal.completedCases[0].cleanupKnown !== true ||
    terminal.failedCase !== 'N02' ||
    terminal.root !== OLD_ROOT ||
    !isDeepStrictEqual(terminal.rootIdentity, ROOT_IDENTITY) ||
    terminal.manifestDigest !== MANIFEST_DIGEST ||
    terminal.manifestFileSha256 !== MANIFEST_SHA ||
    terminal.sourceHostCapacityReserved !== 4 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(terminal.pending, PENDING) ||
    !isDeepStrictEqual(terminal.consumed, CONSUMED) ||
    terminal.journal.chainVerified !== true ||
    terminal.journal.sha256 !== JOURNAL_SHA ||
    terminal.journal.reservations !== 27 ||
    terminal.journal.ACKs !== 26 ||
    terminal.runtimeQualified !== false ||
    terminal.cleanupQualification !== 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN' ||
    terminal.globalProcessInventory !== 'UNATTESTED' ||
    terminal.noResendOrResume !== true ||
    terminal.T3 !== 'INCOMPLETE' ||
    terminal.M02 !== 'INCOMPLETE' ||
    terminal.protocolFailures?.length !== 1 ||
    terminal.evidenceIndex.path !== INDEX ||
    terminal.evidenceIndex.sha256 !== INDEX_SHA ||
    index.schema !== 'appraise.m02-r54-native-terminal-evidence-index/v1' ||
    index.root !== OLD_ROOT ||
    !isDeepStrictEqual(index.rootIdentity, ROOT_IDENTITY) ||
    index.journalChainVerified !== true ||
    index.runtimeAuthority !== false ||
    index.rawProviderAccountAuthHistoryOrDatabaseCopied !== false ||
    index.originalsRewritten !== false ||
    !isDeepStrictEqual(index.files?.map(row => row.copy).sort(), [...names].sort())
  )
    fail('terminal or index drift')
  const directories = [
    OLD_ROOT,
    join(OLD_ROOT, 'cases'),
    join(OLD_ROOT, 'cases/N01'),
    join(OLD_ROOT, 'cases/N01/supervisor'),
    join(OLD_ROOT, 'cases/N01/workspace'),
    join(OLD_ROOT, 'cases/N01/workspace/scratch'),
    join(OLD_ROOT, 'cases/N02'),
    join(OLD_ROOT, 'cases/N02/supervisor'),
    join(OLD_ROOT, 'cases/N02/workspace'),
    join(OLD_ROOT, 'cases/N02/workspace/scratch'),
    dirname(INDEX),
  ]
  const parents = []
  for (const directory of directories) {
    const stat = await fs.lstat(directory)
    if (!privateDirectory(stat)) fail('ancestor ownership or mode drift')
    parents.push({ directory, stat })
  }
  if (!same(parents[0].stat, ROOT_IDENTITY)) fail('live original root identity drift')
  const receipts = new Map()
  for (const row of index.files) {
    const caseId = row.copy.slice(0, 3)
    const expected =
      row.copy === 'phase-journal.jsonl'
        ? join(OLD_ROOT, row.copy)
        : row.copy === `${caseId}--scratch.txt`
          ? join(OLD_ROOT, `cases/${caseId}/workspace/scratch/${caseId.toLowerCase()}.txt`)
          : join(OLD_ROOT, `cases/${caseId}/supervisor`, row.copy.slice(5))
    const copyPath = join(dirname(INDEX), row.copy)
    const before = await fs.lstat(expected),
      copyBefore = await fs.lstat(copyPath)
    if (
      row.originalPath !== expected ||
      !/^[a-f0-9]{64}$/.test(row.sha256 ?? '') ||
      !Number.isSafeInteger(row.bytes) ||
      row.bytes < 0 ||
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
    if (row.copy === 'phase-journal.jsonl') {
      if (row.sha256 !== JOURNAL_SHA) fail('journal pin drift')
      verifyJournal(copy, terminal, index, prepared)
    } else if (row.copy.endsWith('--scratch.txt')) {
      if (row.sha256 !== (caseId === 'N01' ? SCRATCH_SHA : N02_SCRATCH_SHA) || copy.length !== 11)
        fail('scratch witness drift')
    } else receipts.set(row.copy, JSON.parse(copy))
  }
  const outcome = receipts.get('N01--case-outcome.json'),
    proof = receipts.get('N01--workspace-proof.json')
  const completed = terminal.completedCases[0]
  if (
    outcome?.schema !== 'appraise.m02-ta-workspace-supervisor-receipt/v1' ||
    outcome.evidenceClass !== 'TRUSTED_SUPERVISOR_OBSERVATION' ||
    outcome.name !== 'case-outcome' ||
    outcome.caseId !== 'N01' ||
    outcome.expected !== 'workspace-effect' ||
    outcome.manifestDigest !== MANIFEST_DIGEST ||
    !isDeepStrictEqual(outcome.ownedCodex, { exit: { code: 0, signal: null }, close: { code: 0, signal: null } }) ||
    outcome.listenerClosed !== true ||
    outcome.hostCleanup?.originalHostGone !== true ||
    outcome.hostCleanup.pidReused !== false ||
    !isDeepStrictEqual(outcome.hostCleanup.observedHost, outcome.hostObservation) ||
    outcome.gitReadiness?.gitGone !== true ||
    outcome.gitReadiness.gitPidReused !== false ||
    outcome.gitReadiness.hostObserved !== true ||
    outcome.gitReadiness.hostIdentityStable !== true ||
    outcome.gitReadiness.readinessComplete !== true ||
    outcome.canonical?.accepted !== true ||
    outcome.workspaceProofIssued !== true ||
    outcome.nativeStatus !== 'FIXED_WORKSPACE_EFFECT_CORRELATED' ||
    outcome.pending !== 0 ||
    outcome.journalSeq !== 30 ||
    outcome.sourceHostCapacityReserved !== 2 ||
    outcome.nativeScratchHelperInventory !== 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED' ||
    !isDeepStrictEqual(outcome.counts, completed.counts) ||
    !isDeepStrictEqual(outcome.gitReadiness, completed.gitReadiness) ||
    completed.outcome !== 'workspace-effect' ||
    completed.canonicalAccepted !== true ||
    completed.listenerClosed !== true ||
    completed.workspaceProofIssued !== true ||
    completed.nativeStatus !== 'FIXED_WORKSPACE_EFFECT_CORRELATED' ||
    proof?.name !== 'workspace-proof' ||
    proof.caseId !== 'N01' ||
    proof.relativePath !== 'scratch/n01.txt' ||
    proof.contentSha256 !== SCRATCH_SHA ||
    proof.rootDevice !== String(ROOT_IDENTITY.dev) ||
    proof.rootInode !== String(ROOT_IDENTITY.ino) ||
    proof.scratchInode !== String(index.files.find(row => row.copy === 'N01--scratch.txt').originalIdentity.ino) ||
    proof.evidenceProvenance !== 'OWNED_SCRATCH_FD_READ_V1' ||
    proof.nativeStatus !== 'FIXED_WORKSPACE_EFFECT_CORRELATED' ||
    receipts.get('N01--provider-response-2.json')?.workspaceContentSha256 !== SCRATCH_SHA
  )
    fail('N01 completed bounded conjunction drift')
  const failure = receipts.get('N02--case-failure.json'),
    protocol = receipts.get('N02--protocol-failure.json')
  if (
    failure?.schema !== 'appraise.m02-ta-workspace-supervisor-receipt/v1' ||
    failure.evidenceClass !== 'TRUSTED_SUPERVISOR_OBSERVATION' ||
    failure.name !== 'case-failure' ||
    failure.caseId !== 'N02' ||
    failure.status !== 'UNKNOWN' ||
    failure.stage !== 'WAIT_TERMINAL' ||
    failure.reason !== 'BOUNDED_STAGE_ONLY_CAUSE_UNCLASSIFIED' ||
    !isDeepStrictEqual(terminal.lateCaseDiagnostics, [failure]) ||
    failure.nativeSession?.workspaceActionPending !== true ||
    failure.nativeSession.workspaceProofIssued !== false ||
    failure.nativeSession.runtimeQualified !== false ||
    failure.nativeSession.nativeScratchHelperInventory !== 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED' ||
    !isDeepStrictEqual(failure.nativeSession.diagnostic, { stage: 'WAIT_CONTINUATION', reason: 'NONE' }) ||
    protocol?.schema !== 'appraise.m02-ta-workspace-supervisor-receipt/v1' ||
    protocol.evidenceClass !== 'TRUSTED_SUPERVISOR_OBSERVATION' ||
    protocol.name !== 'protocol-failure' ||
    protocol.caseId !== 'N02' ||
    protocol.category !== 'UNKNOWN_REQUEST_OR_NOTIFICATION' ||
    protocol.phase !== 'turn' ||
    protocol.methodSha256 !== METHOD_SHA ||
    sha('turn/diff/updated') !== METHOD_SHA ||
    protocol.frameKind !== 'notification' ||
    protocol.pendingKind !== null ||
    protocol.seq !== 57 ||
    !isDeepStrictEqual(terminal.protocolFailures, [protocol])
  )
    fail('N02 failure or protocol observation drift')
  for (const caseId of ['N01', 'N02']) {
    const plan = receipts.get(`${caseId}--script-plan.json`),
      response = receipts.get(`${caseId}--provider-response-1.json`)
    if (
      plan.operation !== (caseId === 'N01' ? 'exec_command' : 'apply_patch') ||
      plan.relativePath !== `scratch/${caseId.toLowerCase()}.txt` ||
      plan.expectedContentSha256 !== (caseId === 'N01' ? SCRATCH_SHA : N02_SCRATCH_SHA) ||
      plan.nativeScratchHelperInventory !== 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED' ||
      response.requestIndex !== 1 ||
      response.workspaceContentSha256 !== null
    )
      fail('scripted scratch linkage drift')
    for (const [name, event] of [
      ['mcp-startup.json', 'sdk-connect-returned'],
      ['mcp-exit.json', 'node-exit-handler'],
    ]) {
      const receipt = receipts.get(`${caseId}--${name}`)
      if (
        receipt.schema !== 'appraise.m02-ta-workspace-child-receipt/v1' ||
        receipt.evidenceClass !== 'TRUSTED_CHILD_SELF_REPORT' ||
        receipt.caseId !== caseId ||
        receipt.event !== event
      )
        fail('child receipt drift')
    }
  }
  for (const { directory, stat } of parents) {
    const after = await fs.lstat(directory)
    if (!privateDirectory(after) || !sameFile(stat, after)) fail('ancestor changed during verification')
  }
  return Object.freeze({
    path: TERMINAL,
    sha256: TERMINAL_SHA,
    indexPath: INDEX,
    indexSha256: INDEX_SHA,
    manifestFileSha256: MANIFEST_SHA,
    manifestDigest: MANIFEST_DIGEST,
    root: OLD_ROOT,
    rootIdentity: ROOT_IDENTITY,
    liveOriginalsRequired: true,
    sanitizedFiles: 16,
    toolSession: 50799,
    exitCode: 1,
    status: 'UNKNOWN',
    casesCompleted: 1,
    completedCases: Object.freeze(terminal.completedCases),
    failedCase: 'N02',
    waitLocation: 'WAIT_TERMINAL',
    consumed: CONSUMED,
    sourceCapacityReserved: 4,
    actualSourceHostCount: 'UNATTESTED',
    pending: PENDING,
    cleanup: terminal.cleanupQualification,
    failedCaseCleanup: 'UNKNOWN',
    globalCleanup: 'UNKNOWN',
    completedCaseCleanup: 'N01_BOUNDED_CONJUNCTION_ONLY',
    journalRecords: 60,
    reservations: 27,
    acknowledgements: 26,
    journalSha256: JOURNAL_SHA,
    journalTerminalHash: TERMINAL_HASH,
    journalUnknownFenceObserved: true,
    journalUnknownReason: 'AMBIGUOUS_EFFECT',
    journalTerminalCheckpointObserved: false,
    ownedStopIntentObserved: true,
    ownedStopObserved: true,
    ownedStopEstablishesCleanup: false,
    protocolFailure: Object.freeze({
      category: protocol.category,
      phase: protocol.phase,
      methodSha256: METHOD_SHA,
      method: 'turn/diff/updated',
      frameKind: 'notification',
      paramsBody: 'UNKNOWN',
      pinnedSchemaPath: SCHEMA_PATH,
      pinnedSchemaSha256: SCHEMA_SHA,
    }),
    n02ScratchFileSha256: N02_SCRATCH_SHA,
    scratchBytesProveActionAckOrCommandResultOrCanonicalOrCleanup: false,
    nativeScratchHelperInventory: 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED',
    noResendOrResume: true,
    fullT3Qualification: false,
    runtimeQualified: false,
    authorityPins: Object.freeze(
      Object.fromEntries(
        Object.entries(AUTHORITY_PINS).map(([key, [path, sha256]]) => [
          key,
          Object.freeze({ path: join(REPO, path), sha256 }),
        ]),
      ),
    ),
  })
}

export async function verifyT3Predecessor({ requireNewRootAbsent = true } = {}) {
  const prior = await verifyR52Predecessor({ requireNewRootAbsent: false })
  const priorT3Prepared = await readPrepared()
  await verifyAuthority(priorT3Prepared, prior)
  const r54TerminalEvidence = await verifyTerminal(priorT3Prepared)
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({ ...prior, prepared: prior.prepared, priorT3Prepared, r54TerminalEvidence })
}
