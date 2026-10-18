/** Read-only consumed R52 UNKNOWN evidence. Scratch bytes cannot establish an ACK, command result, or cleanup. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { verifyFullT2Predecessor } from '../codex-app-server-m02-ta-workspace-r52/r51-evidence.mjs'
import { serializeWorkspacePreparation } from '../codex-app-server-m02-ta-workspace-r52/preparation.mjs'
import { verifyR52HistoricalClosure } from '../codex-app-server-m02-ta-workspace-r52/native-ports.mjs'
import { readStableFile } from '../codex-app-server-m02-ta-matrix-r51/r21-evidence.mjs'
import { requireTA04Absent } from '../codex-app-server-m02-ta-matrix-r51/prior-evidence.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { POLICY as R52_POLICY } from '../codex-app-server-m02-ta-workspace-r52/policy.mjs'
import { digest, ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const OLD_ROOT = '/private/tmp/appraise-m02-ta-workspace-p2'
const MANIFEST = join(REPO, '.appraisejs/m02-ta-workspace-build-r52/manifest.json')
const MANIFEST_SHA = '9b55167bce231e3d226043ec2127033cf51e9d71bde4c5b8bb291962841aa128'
const MANIFEST_DIGEST = 'a06c0aec024564845debf8c7a7ff366f2c888d3befabd7142ea0a9b44c0e8c56'
const CANONICAL_SHA = '2eb9fba07d0c59c17b2683086feae195b5442e3c97de41501211fa6763591cd5'
const TERMINAL = join(REPO, '.appraisejs/m02-r52-native-terminal-01.json')
const TERMINAL_SHA = '173740017dff89601d8d144801f652de6231b352ddc4a3dfa2c977a1ac4a3939'
const INDEX = join(REPO, '.appraisejs/m02-r52-native-terminal-evidence-01/index.json')
const INDEX_SHA = 'f6f0c1c93a6440dc91995591089244934edd08485f46a3b8d4cca167614a1e24'
const JOURNAL_SHA = 'cdd2d669abe5d1a0c116427e899adc28dcf1477b1e02a10287583c3071fc5d63'
const TERMINAL_HASH = '72dbd0296e80b4818e012eb05acaca8870dbd987e148cf30ad4eec68e1622756'
const SCRATCH_SHA = 'fd5a91b572727c6e571e72b819ead84d1c42cc6f4348a48c00658fffc506dbce'
const ROOT_IDENTITY = Object.freeze({ dev: 16777230, ino: 71545042 })
const KINDS = Object.freeze([...Object.keys(R52_POLICY.aggregate), 'outerCalls', 'auditRequests'])
const PENDING = Object.freeze([
  Object.freeze({ id: 'N01-workspace-action', kind: 'workspaceActions' }),
  Object.freeze({ id: 'N01-listener-request-2', kind: 'providerRequests' }),
])
const CONSUMED = Object.freeze({
  threadStarts: 1,
  turnStarts: 1,
  providerRequests: 2,
  scopedCalls: 0,
  workspaceActions: 1,
  permissionReplies: 0,
  codexStarts: 1,
  mcpStarts: 1,
  listenerStarts: 1,
  controlWrites: 3,
  canonicalRequests: 2,
  helperStarts: 0,
  outerCalls: 1,
  auditRequests: 0,
})
const AUTHORITY_PINS = Object.freeze({
  review: [
    '.appraisejs/m02-t3-r52-exact-review.json',
    'ffee0cc34411ab8353bfe4e81d907160eb32eb7316557706203c10c8ab840c27',
  ],
  decision: [
    '.appraisejs/m02-t3-r52-recovery-user-decision.json',
    'c2e18a29226d1b945ceb0ee60006fad37de3deb5a48770ba09274452e7fe7952',
  ],
  context: [
    '.appraisejs/m02-r52-user-authorization-context-01.json',
    '744310a9a3398f5ba6856b15d937562cb5c9fb8760fde86d67baf99041f00d8a',
  ],
  focused: [
    '.appraisejs/m02-r52-focused-review-01.json',
    '262df6b33483ed54ab1e22d961c1be7f53478d8349eb1ab3da2edd92f7e8f7b7',
  ],
  submission: [
    '.appraisejs/m02-r52-approved-native-submission-01.json',
    '78a0b68026fa24a820e0851b45784a28e49a4394eb81d090e8b4b90bc60fa69a',
  ],
  submitted: [
    '.appraisejs/m02-r52-native-submitted-01.json',
    'de853380084f9baf8da12753c89f80d22d1f3faf70c58eefade7292be3267a35',
  ],
  fixed: [
    '.appraisejs/m02-r52-fixed-command-01.json',
    '3a775cdec19cff3ac6b656655136b63c92509867d03e92a396206fa3c5f033c6',
  ],
  precheck: [
    '.appraisejs/m02-r52-actual-file-only-precheck-01.json',
    'eb00e9fc209b2519f5041118a7fb98e13a21686a1a44d4681fd4d821b92876b2',
  ],
  toolTerminal: [
    '.appraisejs/m02-r52-native-tool-terminal-01.json',
    '07f0058d1f53d01a8aeb381203da7b8158df00ff0fa599f7b7f9faed8fc28ce3',
  ],
  snapshot: [
    '.appraisejs/m02-r52-source-snapshot-01.json',
    '61694426c51b6a7d3f7ca22ab95b850de2a322963fa5ccb6e0358ab8ecbdbdb5',
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
  throw new Error(`R54 T3 predecessor ${reason}`)
}

async function readPrepared() {
  const bytes = await readStableFile(MANIFEST, MANIFEST_SHA)
  const prepared = JSON.parse(bytes)
  if (
    prepared.schema !== 'appraise.m02-ta-workspace-r52-preparation/v1' ||
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
  const history = await verifyR52HistoricalClosure(prepared.manifest)
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
    current !== 8773 ||
    ta04 !== 23 ||
    ta06 !== 580 ||
    history.size !== 603 ||
    paths.size !== 9376 ||
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

async function verifyAuthority(prepared, fullR51Prior) {
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
    join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-workspace-r52/entrypoint.mjs'),
    '--run',
    MANIFEST,
    MANIFEST_DIGEST,
    MANIFEST_SHA,
  ]
  if (
    context.schema !== 'appraise.m02-r52-user-authorization-context/v1' ||
    context.authorizedAction !== 'ONE_FRESH_R52_WORKSPACE_P2_T3_INVOCATION' ||
    context.literalHashSpecificApprovalQuoteClaimed !== false ||
    context.conditionalT3AuthorityConditionVerified !== true ||
    context.noReplayOrResume !== true ||
    context.priorConsumedCommandsReusable !== false ||
    context.historicalAllocationsReset !== false ||
    context.manifest.path !== MANIFEST ||
    context.manifest.sha256 !== MANIFEST_SHA ||
    context.manifest.manifestDigest !== MANIFEST_DIGEST ||
    context.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    !isDeepStrictEqual(context.r51TerminalEvidence, fullR51Prior.r51TerminalEvidence) ||
    !isDeepStrictEqual(
      context.cumulativeWholeCampaignCeilings,
      prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    ) ||
    context.combinedListenerAllocationCeilingIncludingR16 !== 260 ||
    decision.schema !== 'appraise.m02-ta-t3-r52-recovery-user-decision/v1' ||
    decision.verdict !== 'AUTHORIZE_ONE_FIXED_T3_R52_INVOCATION' ||
    decision.exactArtifactUserApprovalClaimed !== false ||
    decision.specimenOnly !== false ||
    decision.authorizationContext.path !== join(REPO, AUTHORITY_PINS.context[0]) ||
    decision.authorizationContext.sha256 !== AUTHORITY_PINS.context[1] ||
    decision.manifestDigest !== MANIFEST_DIGEST ||
    decision.manifestFileSha256 !== MANIFEST_SHA ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    review.schema !== 'appraise.m02-ta-t3-r52-exact-review/v1' ||
    review.verdict !== 'ACCEPT_ONE_FIXED_T3_R52_INVOCATION' ||
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
    focused.verdict !== 'ACCEPT_ONE_FIXED_T3_R52_INVOCATION' ||
    focused.runtimeAuthority !== false ||
    focused.pins.sourceSnapshot.sha256 !== AUTHORITY_PINS.snapshot[1] ||
    !isDeepStrictEqual(review.exactInvocationPrefix, prefix) ||
    !isDeepStrictEqual(decision.exactInvocationPrefix, [...prefix, AUTHORITY_PINS.review[1]]) ||
    !isDeepStrictEqual(fixed.argv, [...decision.exactInvocationPrefix, AUTHORITY_PINS.decision[1]]) ||
    fixed.freshInvocationMaximum !== 1 ||
    submission.schema !== 'appraise.m02-r52-approved-native-submission/v1' ||
    submission.nativeInvocationMaximum !== 1 ||
    submission.root !== OLD_ROOT ||
    submission.noReplayOrResume !== true ||
    submission.historicalAllocationsReset !== false ||
    submission.fixedCommandSha256 !== AUTHORITY_PINS.fixed[1] ||
    !isDeepStrictEqual(submission.argv, fixed.argv) ||
    submission.command !== fixed.command ||
    !isDeepStrictEqual(submission.conditionMet, fullR51Prior.r51TerminalEvidence) ||
    submitted.toolSession !== 31057 ||
    submitted.freshRoot !== OLD_ROOT ||
    submitted.resendOrResumeAllowed !== false ||
    submitted.wholeAllocationRetainedRegardlessOfObservedConsumption !== true ||
    toolTerminal.schema !== 'appraise.m02-r52-native-tool-terminal/v1' ||
    toolTerminal.toolSession !== 31057 ||
    toolTerminal.exitCode !== 1 ||
    !isDeepStrictEqual(toolTerminal.result, {
      status: 'UNKNOWN',
      completed: 0,
      failedCase: 'N01',
      failureStage: 'WAIT_TERMINAL',
      runtimeQualified: false,
    }) ||
    toolTerminal.consumedCommandReusable !== false ||
    toolTerminal.journalCorroborationRequired !== true ||
    precheck.schema !== 'appraise.m02-r52-actual-fixed-file-only-precheck/v1' ||
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
    context.conditionalT3Authorization,
    decision.continuingImplementationAuthority,
  ])
    await readStableFile(pin.path, pin.sha256)
  const sourceDir = join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-workspace-r52')
  if (
    snapshot.schema !== 'appraise.m02-r52-source-snapshot/v1' ||
    snapshot.files?.length !== 27 ||
    !isDeepStrictEqual(
      (await fs.readdir(sourceDir)).sort(),
      snapshot.files.map(row => row.path.slice(sourceDir.length + 1)).sort(),
    )
  )
    fail('R52 source membership drift')
  for (const row of snapshot.files) {
    if (
      dirname(row.path) !== sourceDir ||
      !/^[a-z0-9-]+\.mjs$/.test(row.path.slice(sourceDir.length + 1)) ||
      prepared.manifest.artifacts.find(item => item.path === row.path)?.sha256 !== row.sha256
    )
      fail('R52 source linkage drift')
    const bytes = await readStableFile(row.path, row.sha256)
    if (bytes.length !== row.bytes) fail('R52 source length drift')
  }
  if (
    sha(Buffer.from(JSON.stringify(snapshot.files))) !== snapshot.treeSha256 ||
    snapshot.treeSha256 !== focused.pins.sourceSnapshot.treeSha256
  )
    fail('R52 source tree digest drift')
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
    recoveries = 0
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
      if (
        position !== 1 ||
        event.caseId !== 'N01' ||
        event.sourceHostCapacity !== 2 ||
        event.evidenceClass !== 'SOURCE_BOUND_CAPACITY_RESERVED'
      )
        fail('begin drift')
      begins++
    } else if (event.type === 'reserve') {
      if (
        begins !== 1 ||
        unknown ||
        !KINDS.includes(event.kind) ||
        typeof event.id !== 'string' ||
        !event.id.startsWith('N01-') ||
        reserved.has(event.id)
      )
        fail('reservation drift')
      reserved.set(event.id, event.kind)
      pending.set(event.id, event.kind)
      counts[event.kind]++
    } else if (event.type === 'ack') {
      if (unknown || !pending.delete(event.id)) fail('ACK drift')
      acknowledgements++
    } else if (event.type === 'unknown') {
      if (position !== 28 || event.reason !== 'AMBIGUOUS_EFFECT' || unknown) fail('UNKNOWN fence drift')
      unknown++
    } else if (event.type === 'recovery') {
      const action = recoveries === 0 ? 'owned-stop-intent' : 'owned-stop-observed'
      if (
        !unknown ||
        position !== 29 + recoveries ||
        recoveries > 1 ||
        event.id !== `N01-${action}` ||
        event.action !== action
      )
        fail('owned stop observation drift')
      recoveries++
    } else fail('unplanned journal event')
  }
  const observedPending = [...pending].map(([id, kind]) => ({ id, kind }))
  if (
    records.length !== 31 ||
    index.journalRecords !== 31 ||
    terminal.journal.records !== 31 ||
    previous !== TERMINAL_HASH ||
    index.journalLastHash !== TERMINAL_HASH ||
    terminal.journal.terminalHash !== TERMINAL_HASH ||
    begins !== 1 ||
    reserved.size !== 14 ||
    acknowledgements !== 12 ||
    unknown !== 1 ||
    recoveries !== 2 ||
    !isDeepStrictEqual(observedPending, PENDING) ||
    !isDeepStrictEqual(counts, CONSUMED) ||
    !isDeepStrictEqual(counts, terminal.consumed)
  )
    fail('terminal journal accounting drift')
}

async function verifyTerminal(prepared) {
  const terminal = JSON.parse(await readStableFile(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readStableFile(INDEX, INDEX_SHA))
  const names = [
    'phase-journal.jsonl',
    'N01--case-failure.json',
    'N01--mcp-exit.json',
    'N01--mcp-startup.json',
    'N01--provider-response-1.json',
    'N01--script-plan.json',
    'N01--scratch.txt',
  ]
  if (
    terminal.schema !== 'appraise.m02-r52-native-terminal/v1' ||
    terminal.toolSession !== 31057 ||
    terminal.exitCode !== 1 ||
    terminal.status !== 'UNKNOWN' ||
    terminal.completed !== 0 ||
    !isDeepStrictEqual(terminal.completedCases, []) ||
    terminal.failedCase !== 'N01' ||
    terminal.root !== OLD_ROOT ||
    !isDeepStrictEqual(terminal.rootIdentity, ROOT_IDENTITY) ||
    terminal.manifestDigest !== MANIFEST_DIGEST ||
    terminal.manifestFileSha256 !== MANIFEST_SHA ||
    terminal.sourceHostCapacityReserved !== 2 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(terminal.pending, PENDING) ||
    !isDeepStrictEqual(terminal.consumed, CONSUMED) ||
    terminal.journal.chainVerified !== true ||
    terminal.journal.sha256 !== JOURNAL_SHA ||
    terminal.journal.reservations !== 14 ||
    terminal.journal.ACKs !== 12 ||
    terminal.runtimeQualified !== false ||
    terminal.cleanupQualification !== 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN' ||
    terminal.globalProcessInventory !== 'UNATTESTED' ||
    terminal.noResendOrResume !== true ||
    terminal.T3 !== 'INCOMPLETE' ||
    terminal.M02 !== 'INCOMPLETE' ||
    !isDeepStrictEqual(terminal.protocolFailures, []) ||
    terminal.evidenceIndex.path !== INDEX ||
    terminal.evidenceIndex.sha256 !== INDEX_SHA ||
    index.schema !== 'appraise.m02-r52-native-terminal-evidence-index/v1' ||
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
    const expected =
      row.copy === 'phase-journal.jsonl'
        ? join(OLD_ROOT, row.copy)
        : row.copy === 'N01--scratch.txt'
          ? join(OLD_ROOT, 'cases/N01/workspace/scratch/n01.txt')
          : join(OLD_ROOT, 'cases/N01/supervisor', row.copy.slice('N01--'.length))
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
    } else if (row.copy === 'N01--scratch.txt') {
      if (row.sha256 !== SCRATCH_SHA || copy.length !== 11) fail('scratch witness drift')
    } else receipts.set(row.copy, JSON.parse(copy))
  }
  const failure = receipts.get('N01--case-failure.json')
  if (
    failure?.schema !== 'appraise.m02-ta-workspace-supervisor-receipt/v1' ||
    failure.evidenceClass !== 'TRUSTED_SUPERVISOR_OBSERVATION' ||
    failure.name !== 'case-failure' ||
    failure.caseId !== 'N01' ||
    failure.status !== 'UNKNOWN' ||
    failure.stage !== 'WAIT_TERMINAL' ||
    failure.reason !== 'BOUNDED_STAGE_ONLY_CAUSE_UNCLASSIFIED' ||
    !isDeepStrictEqual(terminal.lateCaseDiagnostics, [failure]) ||
    failure.nativeSession?.workspaceActionPending !== true ||
    failure.nativeSession.workspaceProofIssued !== false ||
    failure.nativeSession.fenced !== true ||
    failure.nativeSession.runtimeQualified !== false ||
    failure.nativeSession.nativeScratchHelperInventory !== 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED' ||
    !isDeepStrictEqual(failure.nativeSession.diagnostic, {
      stage: 'SCRATCH_PROOF',
      reason: 'SCRATCH_DIRECTORY_IDENTITY_CHANGED',
    })
  )
    fail('case failure drift')
  const plan = receipts.get('N01--script-plan.json'),
    response = receipts.get('N01--provider-response-1.json')
  if (
    plan.operation !== 'exec_command' ||
    plan.relativePath !== 'scratch/n01.txt' ||
    plan.expectedContentSha256 !== SCRATCH_SHA ||
    plan.nativeScratchHelperInventory !== 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED' ||
    response.requestIndex !== 1 ||
    response.workspaceContentSha256 !== null
  )
    fail('scratch is not successful action evidence')
  for (const [name, event] of [
    ['N01--mcp-startup.json', 'sdk-connect-returned'],
    ['N01--mcp-exit.json', 'node-exit-handler'],
  ]) {
    const receipt = receipts.get(name)
    if (
      receipt.schema !== 'appraise.m02-ta-workspace-child-receipt/v1' ||
      receipt.evidenceClass !== 'TRUSTED_CHILD_SELF_REPORT' ||
      receipt.caseId !== 'N01' ||
      receipt.event !== event
    )
      fail('child receipt drift')
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
    sanitizedFiles: 7,
    toolSession: 31057,
    exitCode: 1,
    status: 'UNKNOWN',
    casesCompleted: 0,
    completedCases: Object.freeze([]),
    failedCase: 'N01',
    waitLocation: 'WAIT_TERMINAL',
    failedAnchorField: 'UNKNOWN',
    diagnostic: Object.freeze({ stage: 'SCRATCH_PROOF', reason: 'SCRATCH_DIRECTORY_IDENTITY_CHANGED' }),
    consumed: CONSUMED,
    sourceCapacityReserved: 2,
    actualSourceHostCount: 'UNATTESTED',
    pending: PENDING,
    cleanup: terminal.cleanupQualification,
    failedCaseCleanup: 'UNKNOWN',
    globalCleanup: 'UNKNOWN',
    journalRecords: 31,
    reservations: 14,
    acknowledgements: 12,
    journalSha256: JOURNAL_SHA,
    journalTerminalHash: TERMINAL_HASH,
    journalUnknownFenceObserved: true,
    journalUnknownReason: 'AMBIGUOUS_EFFECT',
    journalTerminalCheckpointObserved: false,
    ownedStopIntentObserved: true,
    ownedStopObserved: true,
    ownedStopEstablishesCleanup: false,
    scratchFileSha256: SCRATCH_SHA,
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
  const fullR51Prior = await verifyFullT2Predecessor({ requireNewRootAbsent: false })
  const priorT3Prepared = await readPrepared()
  await verifyAuthority(priorT3Prepared, fullR51Prior)
  const r52TerminalEvidence = await verifyTerminal(priorT3Prepared)
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({ ...fullR51Prior, prepared: fullR51Prior.prepared, priorT3Prepared, r52TerminalEvidence })
}
