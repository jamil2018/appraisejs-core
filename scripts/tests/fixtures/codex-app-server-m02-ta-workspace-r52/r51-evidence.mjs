/** Exact R51 full24 success with live original-file identity and bounded case cleanup. Earlier UNKNOWN evidence remains retained. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { verifyR48Predecessor } from '../codex-app-server-m02-ta-matrix-r51/r48-evidence.mjs'
import { serializeR51Preparation } from '../codex-app-server-m02-ta-matrix-r51/preparation.mjs'
import { verifyR51HistoricalClosure } from '../codex-app-server-m02-ta-matrix-r51/runtime-effects.mjs'
import { readStableFile } from '../codex-app-server-m02-ta-matrix-r51/r21-evidence.mjs'
import { requireTA04Absent } from '../codex-app-server-m02-ta-matrix-r51/prior-evidence.mjs'
import { POLICY as R51_POLICY } from '../codex-app-server-m02-ta-matrix-r51/policy.mjs'
import { validateChildPathDiagnostics } from '../codex-app-server-m02-ta-matrix-r51/child-path-diagnostic.mjs'
import { validateProcessStateDiagnostic } from '../codex-app-server-m02-ta-matrix-r51/process-state-diagnostic.mjs'
import { verifyMcpChildReceipt } from '../codex-app-server-m02-ta-matrix-r10/mcp-readiness.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { validateStageProgress } from '../codex-app-server-m02-ta-matrix-r51/stage-progress.mjs'
import { digest, ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const OLD_ROOT = '/private/tmp/appraise-m02-ta-matrix-p28'
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r51/manifest.json')
const MANIFEST_SHA = '07fa661fa5c229772be13c1b870641064cf13143ed7ca9e9cc5ed8e6118ae2e2'
const MANIFEST_DIGEST = '730c1f2490c12a69424792f3c35812b6efadd14ddd06e5524031116789f25bf1'
const TERMINAL = join(REPO, '.appraisejs/m02-r51-native-terminal-01.json')
const TERMINAL_SHA = '76dfc7cff42707403623e9096b8aa0752d742355ea26ce6be49f9ddc586e0951'
const INDEX = join(REPO, '.appraisejs/m02-r51-native-terminal-evidence-01/index.json')
const INDEX_SHA = 'afa42e953a9eb67bf660623d16056e2d3dbc47f5f7ab1748174bc356e9e908c4'
const CANONICAL_SHA = '06bb4769550795296292ddee6dcfeaa2fa97863bf16ccece62262cf9a0bc1a0d'
const ROOT_IDENTITY = Object.freeze({ dev: 16777230, ino: 71397373 })
const SUPPLEMENT = join(REPO, '.appraisejs/m02-r51-b14-supplemental-evidence-01/index.json')
const SUPPLEMENT_SHA = '92629f26ee6159d11d14b2cc07d8dcb01c03bce15194e6f7dceec95320b18f0c'
const SUPPLEMENT_NAMES = Object.freeze(['B14--permission-request.json', 'B14--permission-terminal.json'])
const CASES = Object.freeze(R51_POLICY.cases.filter(item => item.phase === 'T2'))
const SHA256 = /^[a-f0-9]{64}$/
const KINDS = Object.freeze([...Object.keys(R51_POLICY.aggregate), 'outerCalls', 'auditRequests'])
const same = (a, b) => a?.dev === b?.dev && a?.ino === b?.ino
const sameFile = (a, b) =>
  ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key])
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = reason => {
  throw new Error(`R52 full T2 predecessor ${reason}`)
}
const privateDirectory = value =>
  value.isDirectory() && !value.isSymbolicLink() && value.uid === process.getuid() && (value.mode & 0o7777) === 0o700
const ownedFile = value =>
  value.isFile() &&
  !value.isSymbolicLink() &&
  value.uid === process.getuid() &&
  value.nlink === 1 &&
  (value.mode & 0o7777) === 0o600
const nonnegative = value => Number.isSafeInteger(value) && value >= 0
const consistentOwnedExit = value =>
  value?.exit &&
  value?.close &&
  isDeepStrictEqual(value.exit, value.close) &&
  ((value.exit.code === 0 && value.exit.signal === null) ||
    (value.exit.code === null && value.exit.signal === 'SIGTERM'))
const AUTHORITY_PINS = Object.freeze({
  context: [
    '.appraisejs/m02-r51-user-authorization-context-01.json',
    'ac9f3585a7ad101b7052a57c3d7029e4a55c47114de176d0b4be037cc94a6de7',
  ],
  decision: [
    '.appraisejs/m02-t2-r51-recovery-user-decision.json',
    '85fdfde040de9cd254bdb9ee2481e0464cc386169b8d618ac6376ee567bbd3a3',
  ],
  review: [
    '.appraisejs/m02-t2-r51-exact-review.json',
    '48a793ade97748b4c115ff24eb2d0382472bbd3690559b78468955f76bc5f982',
  ],
  focused: [
    '.appraisejs/m02-r51-focused-review-01.json',
    '73d3bd5f4bbf3d051362b0ccbdca5f38e86884b7e4d6263f18a65297e0236cfc',
  ],
  submission: [
    '.appraisejs/m02-r51-approved-native-submission-01.json',
    '0840e44d632dbacf6661150196a90d46b2f6e42dd4b7f057278cefa72934529f',
  ],
  submitted: [
    '.appraisejs/m02-r51-native-submitted-01.json',
    '8dab3bfc4574d9c065710c7ee64849010863a6cf3ac2e2ee64457a96301425af',
  ],
  toolTerminal: [
    '.appraisejs/m02-r51-native-tool-terminal-01.json',
    '35933510755771dba130e87c51ae465d8022f956b3569393372235883297cc9d',
  ],
  fixed: [
    '.appraisejs/m02-r51-fixed-command-01.json',
    '10f32047cbb50f3a87fcded95cf01afcdb941564bdc33d52fea502f220e55c44',
  ],
  precheck: [
    '.appraisejs/m02-r51-actual-file-only-precheck-01.json',
    '0bf971a8d2e8ea2a9ad7504f700a36818cc5f6f57b503e0d07da5e1f76a0723e',
  ],
  snapshot: [
    '.appraisejs/m02-r51-source-snapshot-01.json',
    '187437c891f6813e64de3f0e31e83276d2193aaf22039c86cbb313756508da2c',
  ],
  approval: [
    '.appraisejs/m02-r51-exact-user-approval-01.json',
    '09dc2cbef2e2665359713757a4cadef156ad33b8dde96ec26b3d90f06f56650e',
  ],
})

async function readPrepared() {
  const bytes = await readStableFile(MANIFEST, MANIFEST_SHA)
  const prepared = JSON.parse(bytes)
  if (
    prepared.schema !== 'appraise.m02-ta-matrix-r51-preparation/v1' ||
    prepared.manifestDigest !== MANIFEST_DIGEST ||
    digest(prepared.manifest) !== MANIFEST_DIGEST ||
    prepared.manifest.root !== OLD_ROOT ||
    prepared.manifest.phase !== 'T2' ||
    !isDeepStrictEqual(
      prepared.manifest.cases,
      CASES.map(item => item.id),
    ) ||
    prepared.blockers?.length !== 0 ||
    prepared.runtimeEligible !== false ||
    prepared.canonicalSha256 !== '06bb4769550795296292ddee6dcfeaa2fa97863bf16ccece62262cf9a0bc1a0d'
  )
    fail('preparation drift')
  const history = await verifyR51HistoricalClosure(prepared.manifest)
  const paths = new Set()
  let current = 0
  for (const row of prepared.manifest.artifacts) {
    if (paths.has(row.path)) fail('artifact duplicate')
    paths.add(row.path)
    if (history.has(row.path)) {
      if (history.get(row.path).sha256 !== row.sha256) fail('historical artifact drift')
      continue
    }
    if (row.availability !== undefined) fail('current artifact availability drift')
    await readStableFile(row.path, row.sha256)
    current++
  }
  if (current !== 8402 || history.size !== 603 || paths.size !== 9005) fail('closure drift')
  const canonicalBytes = await readStableFile(join(dirname(MANIFEST), 'canonical-bridge.mjs'), prepared.canonicalSha256)
  if (!bytes.equals(serializeR51Preparation({ ...prepared, canonicalBytes }))) fail('serialized preparation drift')
  const seal = loadSealedRouteEvidence()
  if (seal.status !== 'SEALED_OFFLINE_ONLY') fail('sealed evidence invalid')
  return { ...prepared, canonicalBytes, seal, manifestFileSha256: MANIFEST_SHA }
}

async function verifyAuthority(prepared) {
  const values = {}
  for (const [key, [path, expected]] of Object.entries(AUTHORITY_PINS))
    values[key] = JSON.parse(await readStableFile(join(REPO, path), expected))
  const {
    context,
    decision,
    review,
    focused,
    submission,
    submitted,
    toolTerminal,
    fixed,
    precheck,
    snapshot,
    approval,
  } = values
  const expectedPrefix = [
    '/usr/bin/env',
    '-i',
    'PATH=/usr/bin:/bin',
    'LANG=C',
    '/opt/homebrew/Cellar/node/26.11.0/bin/node',
    join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r51/entrypoint.mjs'),
    '--run',
    MANIFEST,
    MANIFEST_DIGEST,
    MANIFEST_SHA,
  ]
  if (
    context.schema !== 'appraise.m02-r51-user-authorization-context/v1' ||
    context.authorizedAction !== 'ONE_FRESH_R51_P28_FULL_T2_INVOCATION' ||
    context.literalHashSpecificApprovalQuoteClaimed !== false ||
    context.noReplayOrResume !== true ||
    context.priorConsumedCommandsReusable !== false ||
    context.historicalAllocationsReset !== false ||
    context.manifest.path !== MANIFEST ||
    context.manifest.sha256 !== MANIFEST_SHA ||
    context.manifest.manifestDigest !== MANIFEST_DIGEST ||
    context.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    context.combinedListenerAllocationCeilingIncludingR16 !== 258 ||
    !isDeepStrictEqual(
      context.cumulativeWholeCampaignCeilings,
      prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    ) ||
    decision.schema !== 'appraise.m02-ta-t2-r51-recovery-user-decision/v1' ||
    decision.verdict !== 'AUTHORIZE_ONE_FIXED_FULL_T2_R51_INVOCATION' ||
    decision.exactArtifactUserApprovalClaimed !== false ||
    decision.authorizationContext.path !== join(REPO, AUTHORITY_PINS.context[0]) ||
    decision.authorizationContext.sha256 !== AUTHORITY_PINS.context[1] ||
    decision.manifestDigest !== MANIFEST_DIGEST ||
    decision.manifestFileSha256 !== MANIFEST_SHA ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    decision.historicalAvailabilitySha256 !== sha(JSON.stringify(prepared.manifest.historicalAvailability)) ||
    review.schema !== 'appraise.m02-ta-t2-r51-exact-review/v1' ||
    review.verdict !== 'ACCEPT_ONE_FIXED_FULL_T2_R51_INVOCATION' ||
    review.exactArtifactUserApprovalClaimed !== false ||
    review.manifest.path !== MANIFEST ||
    review.manifest.root !== OLD_ROOT ||
    review.manifest.phase !== 'T2' ||
    review.manifest.fileSha256 !== MANIFEST_SHA ||
    review.manifest.manifestDigest !== MANIFEST_DIGEST ||
    !isDeepStrictEqual(review.manifest.cases, prepared.manifest.cases) ||
    review.canonicalSha256 !== CANONICAL_SHA ||
    review.entrypointSha256 !== prepared.manifest.artifacts.find(row => row.path === expectedPrefix[5])?.sha256 ||
    review.recoveryProposalSha256 !== prepared.manifest.recoveryProposalSha256 ||
    review.historicalAvailabilitySha256 !== decision.historicalAvailabilitySha256 ||
    review.independentReportSha256 !== AUTHORITY_PINS.focused[1] ||
    focused.verdict !==
      'ACCEPT_EXACT_R51_ARTIFACTS_FOR_PROPOSED_FRESH_FULL_T2_INVOCATION_SUBJECT_TO_EXACT_USER_AUTHORIZATION' ||
    focused.runtimeAuthority !== false ||
    focused.pins.sourceSnapshot.sha256 !== AUTHORITY_PINS.snapshot[1] ||
    !isDeepStrictEqual(review.exactInvocationPrefix, expectedPrefix) ||
    !isDeepStrictEqual(decision.exactInvocationPrefix, [...expectedPrefix, AUTHORITY_PINS.review[1]]) ||
    !isDeepStrictEqual(fixed.argv, [...decision.exactInvocationPrefix, AUTHORITY_PINS.decision[1]]) ||
    fixed.runtimeAuthority !== false ||
    submission.schema !== 'appraise.m02-r51-approved-native-submission/v1' ||
    submission.nativeInvocationMaximum !== 1 ||
    submission.root !== OLD_ROOT ||
    submission.noReplayOrResume !== true ||
    submission.historicalAllocationsReset !== false ||
    submission.fixedCommandSha256 !== AUTHORITY_PINS.fixed[1] ||
    !isDeepStrictEqual(submission.argv, fixed.argv) ||
    submission.command !== fixed.command ||
    submitted.toolSession !== 96343 ||
    submitted.nativeCommandConsumed !== true ||
    submitted.retryOrResumeAuthorized !== false ||
    submitted.exactCommandPath !== join(REPO, AUTHORITY_PINS.fixed[0]) ||
    toolTerminal.toolSession !== 96343 ||
    toolTerminal.exitCode !== 0 ||
    toolTerminal.result.status !== 'T2_CASES_COMPLETED_NOT_CONTAINMENT' ||
    toolTerminal.result.completed !== 24 ||
    toolTerminal.result.failedCase !== null ||
    toolTerminal.consumedCommandReusable !== false ||
    precheck.exitCode !== 0 ||
    precheck.result.status !== 'PRECHECK_PASSED_NO_RUNTIME_AUTHORITY' ||
    precheck.externalEffectAttempts !== 0 ||
    precheck.result.manifestDigest !== MANIFEST_DIGEST ||
    precheck.result.manifestFileSha256 !== MANIFEST_SHA ||
    precheck.result.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    precheck.result.decisionSha256 !== AUTHORITY_PINS.decision[1]
  )
    fail('authority or consumed submission drift')
  for (const pin of [context.proposal, context.standingAuthorization, decision.continuingImplementationAuthority])
    await readStableFile(pin.path, pin.sha256)
  const sourceDir = join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r51')
  if (
    snapshot.schema !== 'appraise.m02-r51-source-snapshot/v1' ||
    snapshot.runtimeAuthority !== false ||
    snapshot.files?.length !== 50 ||
    !isDeepStrictEqual(
      (await fs.readdir(sourceDir)).sort(),
      snapshot.files.map(row => row.path.slice(sourceDir.length + 1)).sort(),
    )
  )
    fail('R51 source membership drift')
  const tree = createHash('sha256')
  for (const row of snapshot.files) {
    if (
      dirname(row.path) !== sourceDir ||
      !/^[a-z0-9-]+\.mjs$/.test(row.path.slice(sourceDir.length + 1)) ||
      prepared.manifest.artifacts.find(item => item.path === row.path)?.sha256 !== row.sha256
    )
      fail('R51 source linkage drift')
    const bytes = await readStableFile(row.path, row.sha256)
    if (bytes.length !== row.bytes) fail('R51 source length drift')
    tree.update(row.path).update('\0').update(row.sha256).update('\n')
  }
  if (tree.digest('hex') !== snapshot.treeSha256 || snapshot.treeSha256 !== focused.pins.sourceSnapshot.treeSha256)
    fail('R51 source tree digest drift')
  if (
    approval.schema !== 'appraise.m02-r51-exact-user-approval/v1' ||
    approval.verdict !== 'APPROVE_ONE_FRESH_EXACT_R51_P28_FULL_T2_INVOCATION' ||
    approval.noReplayOrResume !== true ||
    approval.historicalAllocationsReset !== false ||
    approval.regressionTestsAuthorizedNow !== false ||
    approval.request.path !==
      join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t2-r51-exact-authorization-request-01.md') ||
    approval.request.sha256 !== '598491d10ba872802626aaf2ea52af8cb3aa0715db405cff89773b5553eac86d' ||
    approval.conditionalT3 !== 'AUTHORIZED_ONLY_AFTER_OWN_FULL24_PASS_AND_FRESH_EXACT_REVIEWED_N01_N02_ARTIFACTS' ||
    !isDeepStrictEqual(
      approval.cumulativeWholeCampaignCeilings,
      prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    ) ||
    approval.combinedListenerAllocationCeilingIncludingR16 !== 258 ||
    submission.exactUserApproval.path !== join(REPO, AUTHORITY_PINS.approval[0]) ||
    submission.exactUserApproval.sha256 !== AUTHORITY_PINS.approval[1] ||
    toolTerminal.result.closure.status !== 'CLOSED_TERMINAL_CHECKPOINT_VERIFIED' ||
    toolTerminal.result.closure.seq !== 922 ||
    toolTerminal.result.closure.fileSha256 !== '41d0d34648551fc2cee1756cdb3c61d6f02f8960e3cead0dfb4c1b5478af2c77' ||
    toolTerminal.result.closure.terminalHash !== 'd11f8a5525a39815a2ddeab0e8f839422614702989fd4181aa2da13ee1b909b8'
  )
    fail('exact user approval or tool closure drift')
  await readStableFile(approval.request.path, approval.request.sha256)
  return values
}

function countsValid(counts, item = null) {
  return (
    isDeepStrictEqual(Object.keys(counts ?? {}).sort(), [...KINDS].sort()) &&
    KINDS.every(kind => {
      const maximum = !item
        ? Infinity
        : kind === 'outerCalls'
          ? outerMaximum(item)
          : kind === 'auditRequests'
            ? auditRequestMaximum(item)
            : item.limits[kind]
      return nonnegative(counts[kind]) && counts[kind] <= maximum
    })
  )
}

function verifyJournal(bytes, terminal, index, prepared) {
  const text = bytes.toString('utf8')
  if (!text.endsWith('\n')) fail('journal partial line')
  const records = text
    .slice(0, -1)
    .split('\n')
    .map(line => JSON.parse(line))
  const totals = Object.fromEntries(KINDS.map(kind => [kind, 0]))
  const reserved = new Set(),
    pending = new Set(),
    finished = new Map()
  let previous = '0'.repeat(64),
    active = null,
    begun = 0,
    source = 0,
    acknowledgements = 0,
    checkpoints = 0,
    counts = null
  for (const [position, row] of records.entries()) {
    if (
      row.seq !== position + 1 ||
      row.previous !== previous ||
      row.hash !== sha(JSON.stringify({ seq: row.seq, previous: row.previous, event: row.event }))
    )
      fail('journal chain drift')
    previous = row.hash
    const event = row.event
    if (!['init', 'begin', 'reserve', 'ack', 'finish', 'checkpoint'].includes(event.type))
      fail('UNKNOWN or unplanned journal event')
    if (
      event.type === 'init' &&
      (position !== 0 ||
        event.phase !== 'T2' ||
        event.policyDigest !== prepared.manifest.journalBasePolicyDigest ||
        !same(event.directoryIdentity, index.rootIdentity) ||
        !same(event.fileIdentity, index.files.find(item => item.copy === 'phase-journal.jsonl')?.originalIdentity))
    )
      fail('journal init drift')
    if (event.type !== 'init' && position === 0) fail('journal init missing')
    if (event.type === 'begin') {
      const item = CASES[begun]
      if (
        active !== null ||
        !item ||
        event.caseId !== item.id ||
        event.sourceHostCapacity !== conservativeHostBudget(item.id).sourceMaximum ||
        event.evidenceClass !== 'SOURCE_BOUND_CAPACITY_RESERVED'
      )
        fail('begin order or source allocation drift')
      active = item
      begun++
      source += event.sourceHostCapacity
      counts = Object.fromEntries(KINDS.map(kind => [kind, 0]))
    }
    if (event.type === 'reserve') {
      if (
        !active ||
        !KINDS.includes(event.kind) ||
        typeof event.id !== 'string' ||
        reserved.has(event.id) ||
        (event.kind === 'scopedCalls'
          ? event.id !== `m02_${active.id.replaceAll('-', '_')}_${counts.scopedCalls}`
          : event.kind === 'permissionReplies'
            ? active.id !== 'B14' || event.id !== 'permission-0'
            : !event.id.startsWith(`${active.id}-`))
      )
        fail('reservation drift')
      reserved.add(event.id)
      pending.add(event.id)
      counts[event.kind]++
      totals[event.kind]++
      if (!countsValid(counts, active)) fail('per-case reservation ceiling drift')
    }
    if (event.type === 'ack') {
      if (!active || !pending.delete(event.id)) fail('ACK without bound pending reservation')
      acknowledgements++
    }
    if (event.type === 'finish') {
      const completed = terminal.completedCases[finished.size]
      if (
        !active ||
        active.id !== CASES[finished.size]?.id ||
        completed?.caseId !== active.id ||
        pending.size ||
        event.cleanupKnown !== true ||
        event.outcome !== active.expected ||
        completed.outcome !== active.expected ||
        !SHA256.test(event.caseWitnessSha256 ?? '') ||
        event.caseWitnessSha256 !== completed.caseWitnessSha256 ||
        !isDeepStrictEqual(counts, completed.counts)
      )
        fail('finish witness or count drift')
      finished.set(active.id, { sha256: event.caseWitnessSha256, journalSeq: row.seq - 1 })
      active = null
    }
    if (event.type === 'checkpoint') {
      if (
        position !== records.length - 1 ||
        begun !== 24 ||
        finished.size !== 24 ||
        active !== null ||
        pending.size ||
        !isDeepStrictEqual(event, { type: 'checkpoint' })
      )
        fail('terminal checkpoint drift')
      checkpoints++
    }
  }
  if (
    records.length !== index.journalRecords ||
    records.length !== terminal.journal.records ||
    previous !== index.journalLastHash ||
    previous !== terminal.journal.terminalHash ||
    records.length !== 922 ||
    reserved.size !== 436 ||
    acknowledgements !== 436 ||
    begun !== 24 ||
    finished.size !== 24 ||
    source !== 58 ||
    active !== null ||
    reserved.size !== acknowledgements ||
    acknowledgements !== terminal.journal.ACKs ||
    reserved.size !== terminal.journal.reservations ||
    records.length !== 50 + 2 * reserved.size ||
    pending.size ||
    checkpoints !== 1 ||
    records.at(-1).event.type !== 'checkpoint' ||
    !isDeepStrictEqual(totals, terminal.consumed)
  )
    fail('terminal journal accounting drift')
  return finished
}

function expectedNames() {
  const names = new Set(['phase-journal.jsonl', 'stage-progress.jsonl'])
  for (const item of CASES) {
    const providerRequests = item.id === 'P00' ? 0 : item.id === 'B14' ? 2 : item.script.operations.length + 1
    const files = ['mcp-startup.json', 'mcp-exit.json', 'case-outcome.json']
    if (item.id !== 'P00') files.push('script-plan.json')
    files.push(...Array.from({ length: providerRequests }, (_, index) => `provider-response-${index + 1}.json`))
    for (const name of files) names.add(`${item.id}--${name}`)
  }
  return names
}

function verifyCase(item, completed, receipts, witness) {
  const value = receipts.get(`${item.id}--case-outcome.json`)
  const startup = receipts.get(`${item.id}--mcp-startup.json`),
    exit = receipts.get(`${item.id}--mcp-exit.json`)
  if (
    !value ||
    !startup ||
    !exit ||
    value.schema !== 'appraise.m02-ta-matrix-supervisor-receipt/v1' ||
    value.evidenceClass !== 'TRUSTED_SUPERVISOR_OBSERVATION' ||
    value.name !== 'case-outcome' ||
    value.status !== 'OBSERVED_BEFORE_CASE_COMMIT' ||
    value.outcomeEvidenceClass !== 'TRUSTED_SCRIPTED_CONFORMANCE_NOT_CONTAINMENT' ||
    value.caseId !== item.id ||
    value.manifestDigest !== MANIFEST_DIGEST ||
    value.expected !== item.expected ||
    !consistentOwnedExit(value.ownedCodex) ||
    value.listenerClosed !== true ||
    value.pending !== 0 ||
    value.journalSeq !== witness.journalSeq ||
    completed.cleanupKnown !== true ||
    completed.canonicalAccepted !== true ||
    completed.listenerClosed !== true ||
    !countsValid(value.counts, item) ||
    !isDeepStrictEqual(value.counts, completed.counts) ||
    !isDeepStrictEqual(value.gitReadiness, completed.gitReadiness) ||
    !isDeepStrictEqual(value.environmentProfile, completed.environmentProfile) ||
    !isDeepStrictEqual(value.processStates, completed.processStates) ||
    !isDeepStrictEqual(validateChildPathDiagnostics(value.childPaths), value.childPaths) ||
    value.childPaths.firstUnreviewedPath !== null ||
    !isDeepStrictEqual(validateProcessStateDiagnostic(value.processStates), value.processStates) ||
    value.childEvidence?.evidenceClass !== 'TRUSTED_CHILD_SELF_REPORT' ||
    !isDeepStrictEqual(value.childEvidence.receipt, exit) ||
    value.childEvidence.sha256 !== sha(JSON.stringify(exit))
  )
    fail(`${item.id} completed witness drift`)
  const environment = value.environmentProfile
  if (
    environment?.profile !== 'appraise.m02-r51-explicit-launch-environment/v1' ||
    environment.empty !== true ||
    environment.observation !== 'TRUSTED_DIRECTORY_CHECK_NOT_FILESYSTEM_CONTAINMENT' ||
    !nonnegative(environment.directoryIdentity?.dev) ||
    !nonnegative(environment.directoryIdentity?.ino)
  )
    fail(`${item.id} PATH snapshot drift`)
  const canonical = value.canonical
  const expectedCanonical = item.expected === 'accepted' ? 1 : 0
  if (
    canonical?.accepted !== true ||
    canonical.acceptances !== expectedCanonical ||
    canonical.artifacts !== expectedCanonical ||
    canonical.effects !== expectedCanonical ||
    canonical.evidenceClass !== (item.id === 'P00' ? 'NO_CANONICAL_START' : 'DISPOSABLE_CANONICAL_DATABASE_READ') ||
    (expectedCanonical &&
      (typeof canonical.receiptId !== 'string' ||
        !canonical.receiptId ||
        canonical.artifactIds?.length !== 1 ||
        typeof canonical.artifactIds[0] !== 'string' ||
        !canonical.artifactIds[0]))
  )
    fail(`${item.id} canonical witness drift`)
  const counts = value.counts
  if (
    counts.codexStarts !== 1 ||
    counts.mcpStarts !== 1 ||
    counts.listenerStarts !== 1 ||
    counts.threadStarts !== 1 ||
    counts.workspaceActions !== 0 ||
    counts.helperStarts !== 0
  )
    fail(`${item.id} native journal counts drift`)
  if (item.id === 'P00') {
    if (
      !isDeepStrictEqual(startup, {
        schema: 'appraise.m02-ta-matrix-child-receipt/v1',
        caseId: 'P00',
        evidenceClass: 'TRUSTED_CHILD_SELF_REPORT',
        event: 'required-failure-selected',
      }) ||
      !isDeepStrictEqual(exit, {
        schema: 'appraise.m02-ta-matrix-child-receipt/v1',
        caseId: 'P00',
        evidenceClass: 'TRUSTED_CHILD_SELF_REPORT',
        event: 'node-exit-handler',
        exitCode: 1,
      }) ||
      value.hostObservation !== null ||
      value.hostCleanup !== null ||
      [
        'turnStarts',
        'providerRequests',
        'scopedCalls',
        'canonicalRequests',
        'auditRequests',
        'permissionReplies',
        'outerCalls',
      ].some(kind => counts[kind] !== 0)
    )
      fail('P00 required-MCP failure witness drift')
    // The runner's RPC/telemetry conjunction precedes this trusted supervisor witness; raw RPC/telemetry was not persisted.
    return
  }
  const proof = { capabilityHash: startup.capabilityHash, bootstrapHash: startup.bootstrapHash }
  if (
    !verifyMcpChildReceipt({
      receipt: startup,
      event: 'sdk-connect-returned',
      caseId: item.id,
      bootstrapProof: proof,
      profileDigest: startup.profileDigest,
    }) ||
    !verifyMcpChildReceipt({
      receipt: exit,
      event: 'node-exit-handler',
      caseId: item.id,
      bootstrapProof: proof,
      profileDigest: startup.profileDigest,
    })
  )
    fail(`${item.id} MCP correlation drift`)
  const readiness = value.gitReadiness
  if (
    !readiness ||
    !Number.isSafeInteger(readiness.samples) ||
    readiness.samples < 1 ||
    readiness.samples > 50 ||
    readiness.readinessComplete !== true ||
    readiness.hostObserved !== true ||
    readiness.hostIdentityStable !== true ||
    readiness.gitPidReused !== false ||
    !nonnegative(readiness.gitIdentityCount) ||
    readiness.gitIdentityCount > 4 ||
    (readiness.gitObserved === true && (readiness.gitIdentityCount === 0 || readiness.gitGone !== true)) ||
    (readiness.gitObserved === false && readiness.gitIdentityCount !== 0) ||
    value.hostCleanup?.originalHostGone !== true ||
    value.hostCleanup.pidReused !== false ||
    !value.hostObservation ||
    ['pid', 'ppid', 'birthSec', 'birthUsec', 'path'].some(
      key => value.hostObservation[key] !== value.hostCleanup.observedHost?.[key],
    )
  )
    fail(`${item.id} bounded host cleanup or Git readiness drift`)
  const expectedScoped = item.id === 'B14' || /^B07-A(?:09|1[0-4])$/.test(item.id) ? 0 : item.script.operations.length
  const expectedProvider = item.id === 'B14' ? 2 : item.script.operations.length + 1
  if (
    counts.turnStarts !== 1 ||
    counts.providerRequests !== expectedProvider ||
    counts.outerCalls !== (item.id === 'B14' ? 1 : item.script.operations.length) ||
    counts.scopedCalls !== expectedScoped ||
    counts.auditRequests !== 2 * expectedScoped ||
    counts.permissionReplies !== (item.id === 'B14' ? 1 : 0)
  )
    fail(`${item.id} case effect counts drift`)
  if (item.id === 'B14') {
    const plan = receipts.get('B14--script-plan.json'),
      request = receipts.get('B14--permission-request.json'),
      first = receipts.get('B14--provider-response-1.json'),
      continuation = receipts.get('B14--provider-response-2.json'),
      terminal = receipts.get('B14--permission-terminal.json')
    for (const [name, receipt] of [
      ['script-plan', plan],
      ['permission-request', request],
      ['provider-response-1', first],
      ['provider-response-2', continuation],
      ['permission-terminal', terminal],
    ]) {
      if (
        receipt?.schema !== value.schema ||
        receipt.evidenceClass !== value.evidenceClass ||
        receipt.name !== name ||
        receipt.caseId !== 'B14' ||
        receipt.grants !== 0
      )
        fail('B14 permission receipt envelope drift')
    }
    if (
      plan.callId !== 'm02_B14_0' ||
      plan.operation !== 'request_permissions' ||
      plan.scriptSha256 !== '5c5b2a87b8d21c7eb374325fd19c98e80f2a909e6a3029ec9307ec54c31b0701' ||
      request.event !== 'permission-request-observed' ||
      request.requestedNetworkEnabled !== true ||
      request.threadTurnCorrelated !== true ||
      first.requestIndex !== 1 ||
      first.nativeStatus !== null ||
      continuation.requestIndex !== 2 ||
      continuation.nativeStatus !== 'EMPTY_PERMISSION_DENIAL_CORRELATED' ||
      first.permissionDeclarationHash !== continuation.permissionDeclarationHash ||
      first.descriptorHash !== continuation.descriptorHash ||
      first.wrapperDescriptorHash !== continuation.wrapperDescriptorHash ||
      terminal.event !== 'permission-denial-terminal' ||
      terminal.resolved !== true
    )
      fail('B14 empty-permission denial witness drift')
  }
}

function verifyOrdinaryPlan(item, receipts) {
  if (item.id === 'P00' || item.id === 'B14') return
  const plan = receipts.get(`${item.id}--script-plan.json`)
  const reject = /^B07-A(?:09|1[0-4])$/.test(item.id)
  if (
    plan?.schema !== 'appraise.m02-ta-matrix-supervisor-receipt/v1' ||
    plan.evidenceClass !== 'TRUSTED_SUPERVISOR_OBSERVATION' ||
    plan.name !== 'script-plan' ||
    plan.caseId !== item.id ||
    !SHA256.test(plan.planSha256 ?? '') ||
    plan.calls?.length !== item.script.operations.length ||
    plan.calls.some(
      (call, i) =>
        call.callId !== `m02_${item.id.replaceAll('-', '_')}_${i}` ||
        call.operation !== item.script.operations[i].toolName ||
        call.rejection !== reject ||
        !SHA256.test(call.argumentsHash ?? '') ||
        !SHA256.test(call.scriptSha256 ?? ''),
    )
  )
    fail(`${item.id} script plan drift`)
  let descriptor = null,
    wrapper = null
  for (let at = 1; at <= item.script.operations.length + 1; at++) {
    const response = receipts.get(`${item.id}--provider-response-${at}.json`)
    if (
      response?.schema !== plan.schema ||
      response.evidenceClass !== plan.evidenceClass ||
      response.name !== `provider-response-${at}` ||
      response.caseId !== item.id ||
      response.requestIndex !== at ||
      response.planSha256 !== plan.planSha256 ||
      !SHA256.test(response.responseSha256 ?? '') ||
      !/^sha256:[a-f0-9]{64}$/.test(response.requestByteHash ?? '') ||
      !/^sha256:[a-f0-9]{64}$/.test(response.descriptorHash ?? '') ||
      !/^sha256:[a-f0-9]{64}$/.test(response.wrapperDescriptorHash ?? '') ||
      (at === 1
        ? response.decodedStatus !== null || response.decodedResultHash !== null
        : reject
          ? response.decodedStatus !== 'NO_MCP_DISPATCH' || response.decodedResultHash !== null
          : response.decodedStatus !== 'RESULT_CORRELATED' || !SHA256.test(response.decodedResultHash ?? '')) ||
      (at > 1 && (response.descriptorHash !== descriptor || response.wrapperDescriptorHash !== wrapper))
    )
      fail(`${item.id} provider correlation drift`)
    descriptor = response.descriptorHash
    wrapper = response.wrapperDescriptorHash
  }
}

export async function verifyFullT2Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR48Predecessor({ requireNewRootAbsent: false })
  const prepared = await readPrepared()
  await verifyAuthority(prepared)
  const terminal = JSON.parse(await readStableFile(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readStableFile(INDEX, INDEX_SHA))
  if (
    terminal.schema !== 'appraise.m02-r51-native-terminal/v1' ||
    terminal.evidenceClass !==
      'NATIVE_EXEC_TOOL_TERMINAL_TRANSCRIPTION_CORROBORATED_BY_HASH_VERIFIED_JOURNAL_AND_CASE_WITNESSES' ||
    terminal.toolSession !== 96343 ||
    terminal.exitCode !== 0 ||
    terminal.status !== 'T2_CASES_COMPLETED_NOT_CONTAINMENT' ||
    terminal.completed !== 24 ||
    terminal.failedCase !== null ||
    terminal.runtimeQualified !== false ||
    terminal.root !== OLD_ROOT ||
    terminal.manifestDigest !== MANIFEST_DIGEST ||
    terminal.manifestFileSha256 !== MANIFEST_SHA ||
    terminal.sourceHostCapacityReserved !== 58 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(terminal.pending, []) ||
    !isDeepStrictEqual(terminal.lateCaseDiagnostics, []) ||
    !isDeepStrictEqual(terminal.protocolFailures, []) ||
    terminal.completedCases?.length !== 24 ||
    terminal.cleanupQualification !== 'ALL24_BOUNDED_CASE_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED' ||
    !countsValid(terminal.consumed) ||
    terminal.journal?.chainVerified !== true ||
    terminal.noResendOrResume !== true ||
    terminal.T2 !== 'FULL24_CLOSED_NATIVE_CAMPAIGN_OBSERVED' ||
    terminal.T3 !== 'INCOMPLETE' ||
    terminal.M02 !== 'INCOMPLETE' ||
    index.schema !== 'appraise.m02-r51-native-terminal-evidence-index/v1' ||
    index.root !== OLD_ROOT ||
    !isDeepStrictEqual(index.rootIdentity, terminal.rootIdentity) ||
    !isDeepStrictEqual(index.rootIdentity, ROOT_IDENTITY) ||
    !nonnegative(index.rootIdentity?.dev) ||
    !nonnegative(index.rootIdentity?.ino) ||
    index.journalChainVerified !== true ||
    index.runtimeAuthority !== false ||
    index.rawProviderAccountAuthHistoryOrDatabaseCopied !== false ||
    index.originalsRewritten !== false ||
    terminal.evidenceIndex?.path !== INDEX ||
    terminal.evidenceIndex.sha256 !== INDEX_SHA
  )
    fail('terminal or index drift')
  const supplement = JSON.parse(await readStableFile(SUPPLEMENT, SUPPLEMENT_SHA))
  if (
    supplement.schema !== 'appraise.m02-r51-b14-supplemental-evidence-index/v1' ||
    supplement.root !== OLD_ROOT ||
    !isDeepStrictEqual(supplement.rootIdentity, ROOT_IDENTITY) ||
    supplement.originalEvidenceIndex.path !== INDEX ||
    supplement.originalEvidenceIndex.sha256 !== INDEX_SHA ||
    supplement.originalEvidenceIndex.files !== 151 ||
    supplement.originalEvidenceIndex.originalBytesPreserved !== true ||
    supplement.originalsRewritten !== false ||
    supplement.nativeRunAttempted !== false ||
    supplement.runtimeAuthority !== false ||
    supplement.globalCleanupEstablished !== false ||
    !isDeepStrictEqual(supplement.files?.map(row => row.copy).sort(), [...SUPPLEMENT_NAMES].sort())
  )
    fail('B14 supplemental membership or provenance drift')
  const names = expectedNames()
  if (
    index.files?.length !== 151 ||
    names.size !== 151 ||
    !Array.isArray(index.files) ||
    !isDeepStrictEqual(index.files.map(row => row.copy).sort(), [...names].sort())
  )
    fail('closed sanitized membership drift')
  const directories = [
    OLD_ROOT,
    join(OLD_ROOT, 'cases'),
    dirname(INDEX),
    dirname(SUPPLEMENT),
    ...CASES.flatMap(item => [join(OLD_ROOT, 'cases', item.id), join(OLD_ROOT, 'cases', item.id, 'supervisor')]),
  ]
  const parents = []
  for (const directory of directories) {
    const stat = await fs.lstat(directory)
    if (!privateDirectory(stat)) fail('ancestor ownership or mode drift')
    parents.push({ directory, stat })
  }
  if (!same(parents[0].stat, index.rootIdentity)) fail('root identity drift')
  const receipts = new Map()
  let finished = null
  for (const row of [...index.files, ...supplement.files]) {
    const supplemental = supplement.files.includes(row)
    const [caseId, name] = row.copy.split('--')
    const expected = ['phase-journal.jsonl', 'stage-progress.jsonl'].includes(row.copy)
      ? join(OLD_ROOT, row.copy)
      : join(OLD_ROOT, 'cases', caseId, 'supervisor', name)
    if (row.originalPath !== expected || !SHA256.test(row.sha256 ?? '') || !nonnegative(row.bytes))
      fail('sanitized path or pin drift')
    const before = await fs.lstat(expected),
      copyPath = join(dirname(supplemental ? SUPPLEMENT : INDEX), row.copy),
      copyBefore = await fs.lstat(copyPath)
    if (
      !ownedFile(before) ||
      !ownedFile(copyBefore) ||
      ['dev', 'ino', 'uid', 'mode'].some(key => before[key] !== row.originalIdentity?.[key]) ||
      (supplemental &&
        (row.copyPath !== copyPath ||
          ['dev', 'ino', 'uid', 'mode', 'nlink'].some(key => copyBefore[key] !== row.copyIdentity?.[key]) ||
          before.nlink !== row.originalIdentity.nlink))
    )
      fail('original or sanitized file identity drift')
    const original = await readStableFile(expected, row.sha256),
      copy = await readStableFile(copyPath, row.sha256)
    if (
      !sameFile(before, await fs.lstat(expected)) ||
      !sameFile(copyBefore, await fs.lstat(copyPath)) ||
      !original.equals(copy) ||
      copy.length !== row.bytes
    )
      fail('original or sanitized bytes drift')
    if (row.copy === 'phase-journal.jsonl') {
      if (row.sha256 !== terminal.journal.sha256) fail('journal pin drift')
      finished = verifyJournal(copy, terminal, index, prepared)
    } else if (row.copy === 'stage-progress.jsonl') {
      const stages = validateStageProgress(copy, { requireComplete: true })
      if (
        stages.records !== 336 ||
        !stages.complete ||
        terminal.stageProgress.records !== 336 ||
        terminal.stageProgress.diagnosticAuthority !== false ||
        !isDeepStrictEqual(stages.last, terminal.stageProgress.last)
      )
        fail('stage-progress diagnostic drift')
    } else {
      receipts.set(row.copy, JSON.parse(copy))
      if (
        name === 'case-outcome.json' &&
        row.sha256 !== terminal.completedCases.find(item => item.caseId === caseId)?.caseWitnessSha256
      )
        fail('case-outcome pin drift')
    }
  }
  if (!finished) fail('journal missing')
  for (const [at, item] of CASES.entries()) {
    verifyCase(item, terminal.completedCases[at], receipts, finished.get(item.id))
    verifyOrdinaryPlan(item, receipts)
  }
  for (const { directory, stat } of parents) {
    const after = await fs.lstat(directory)
    if (!privateDirectory(after) || !sameFile(stat, after)) fail('ancestor changed')
  }
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({
    ...old,
    prepared,
    r51TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: TERMINAL_SHA,
      indexPath: INDEX,
      indexSha256: INDEX_SHA,
      supplementalEvidence: Object.freeze({
        indexPath: SUPPLEMENT,
        indexSha256: SUPPLEMENT_SHA,
        files: Object.freeze(SUPPLEMENT_NAMES.map(name => join(dirname(SUPPLEMENT), name))),
        liveOriginalsRequired: true,
      }),
      manifestFileSha256: MANIFEST_SHA,
      manifestDigest: MANIFEST_DIGEST,
      status: 'T2_CASES_COMPLETED_NOT_CONTAINMENT',
      casesCompleted: 24,
      failedCase: null,
      completedCases: Object.freeze(
        terminal.completedCases.map(row =>
          Object.freeze({
            caseId: row.caseId,
            outcome: row.outcome,
            caseWitnessSha256: row.caseWitnessSha256,
            cleanupKnown: true,
          }),
        ),
      ),
      cleanup: 'ALL24_BOUNDED_CASE_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED',
      root: OLD_ROOT,
      rootIdentity: Object.freeze({ ...index.rootIdentity }),
      consumed: Object.freeze({ ...terminal.consumed }),
      sourceCapacityReserved: 58,
      actualSourceHostCount: 'UNATTESTED',
      pending: Object.freeze([]),
      boundedCleanupOnlyNotGlobalProcessAbsence: true,
      p00RpcAndTelemetryEvidence: 'RUNNER_CONJUNCTION_NOT_INDEPENDENTLY_PERSISTED_RAW_RPC_OR_TELEMETRY',
      fullT2Qualification: true,
      acceptanceStatus: 'FULL24_CLOSED_NATIVE_CAMPAIGN_OBSERVED',
      runtimeQualified: false,
    }),
  })
}
