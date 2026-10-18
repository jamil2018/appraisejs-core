/** Read-only full T2 predecessor evidence. Closed terminal pins refuse until supplied after the native run. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { verifyR33Predecessor } from '../codex-app-server-m02-ta-matrix-r34/r33-evidence.mjs'
import { serializeR34Preparation } from '../codex-app-server-m02-ta-matrix-r34/preparation.mjs'
import { verifyR34HistoricalClosure } from '../codex-app-server-m02-ta-matrix-r34/runtime-effects.mjs'
import { readStableFile } from '../codex-app-server-m02-ta-matrix-r34/r21-evidence.mjs'
import { requireTA04Absent } from '../codex-app-server-m02-ta-matrix-r34/prior-evidence.mjs'
import { POLICY as R34_POLICY } from '../codex-app-server-m02-ta-matrix-r34/policy.mjs'
import { validateProcessStateDiagnostic } from '../codex-app-server-m02-ta-matrix-r34/process-state-diagnostic.mjs'
import { verifyMcpChildReceipt } from '../codex-app-server-m02-ta-matrix-r10/mcp-readiness.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { digest, ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const OLD_ROOT = '/private/tmp/appraise-m02-ta-matrix-p19'
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r34/manifest.json')
const MANIFEST_SHA = '9ddda98294918b30a2bec4778f2e9d292eb06ca550a0b7c2a86c79a3c862b131'
const MANIFEST_DIGEST = 'bb189ea4e7beeea8e7043dbca368c9bf6bb18ec868b1b8e0c80f4d03fe4fb624'
const TERMINAL = join(REPO, '.appraisejs/m02-r34-native-terminal-01.json')
const TERMINAL_SHA = 'CLOSED_TERMINAL_PIN_NOT_YET_SUPPLIED'
const INDEX = join(REPO, '.appraisejs/m02-r34-native-terminal-evidence-01/index.json')
const INDEX_SHA = 'CLOSED_TERMINAL_PIN_NOT_YET_SUPPLIED'
const CASES = Object.freeze(R34_POLICY.cases.filter(item => item.phase === 'T2'))
const SHA256 = /^[a-f0-9]{64}$/
const KINDS = Object.freeze([...Object.keys(R34_POLICY.aggregate), 'outerCalls', 'auditRequests'])
const same = (a, b) => a?.dev === b?.dev && a?.ino === b?.ino
const sameFile = (a, b) =>
  ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key])
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = reason => {
  throw new Error(`R31 full T2 predecessor ${reason}`)
}
const privateDirectory = value =>
  value.isDirectory() && !value.isSymbolicLink() && value.uid === process.getuid() && (value.mode & 0o777) === 0o700
const ownedFile = value =>
  value.isFile() &&
  !value.isSymbolicLink() &&
  value.uid === process.getuid() &&
  value.nlink === 1 &&
  (value.mode & 0o777) === 0o600
const nonnegative = value => Number.isSafeInteger(value) && value >= 0
const consistentOwnedExit = value =>
  value?.exit &&
  value?.close &&
  isDeepStrictEqual(value.exit, value.close) &&
  ((value.exit.code === 0 && value.exit.signal === null) ||
    (value.exit.code === null && value.exit.signal === 'SIGTERM'))
const AUTHORITY_PINS = Object.freeze({
  context: [
    '.appraisejs/m02-r34-user-authorization-context-01.json',
    '953a31dc0b99d13b4f33a61c4a9779a242c6053771ce9588f42107bd7ac6b1f0',
  ],
  decision: [
    '.appraisejs/m02-t2-r34-recovery-user-decision.json',
    '2b00329b62b3421d4b83b9df10792073eef60d37c8c882b11202e0a5dded50cf',
  ],
  review: [
    '.appraisejs/m02-t2-r34-exact-review.json',
    'cb1dccbebc446408113bcae371900704c73db7a30178192fb464f66aeee85345',
  ],
  focused: [
    '.appraisejs/m02-r34-focused-review-01.json',
    '0894d147e8cadc055633fd5b1021ca394061ff9d9b503110a8f56e47758a6c95',
  ],
  submission: [
    '.appraisejs/m02-r34-approved-native-submission-01.json',
    '30d15c1b504efe5143550c976c762916ee4a949f98944489597cbb2db9891b35',
  ],
})
const FIXED_COMMAND =
  "/usr/bin/env -i PATH=/usr/bin:/bin LANG=C /opt/homebrew/Cellar/node/26.11.0/bin/node '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r34/entrypoint.mjs' --run '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r34/manifest.json' bb189ea4e7beeea8e7043dbca368c9bf6bb18ec868b1b8e0c80f4d03fe4fb624 9ddda98294918b30a2bec4778f2e9d292eb06ca550a0b7c2a86c79a3c862b131 cb1dccbebc446408113bcae371900704c73db7a30178192fb464f66aeee85345 2b00329b62b3421d4b83b9df10792073eef60d37c8c882b11202e0a5dded50cf"

async function readPrepared() {
  const bytes = await readStableFile(MANIFEST, MANIFEST_SHA)
  const prepared = JSON.parse(bytes)
  if (
    prepared.schema !== 'appraise.m02-ta-matrix-r34-preparation/v1' ||
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
    prepared.canonicalSha256 !== '5e9a1c75cb6042633c85b370f1aeb2e7ad7e79f587347515e1c34d8129f81866'
  )
    fail('preparation drift')
  const history = await verifyR34HistoricalClosure(prepared.manifest)
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
  if (current !== 7483 || history.size !== 23 || paths.size !== 7506) fail('closure drift')
  const canonicalBytes = await readStableFile(join(dirname(MANIFEST), 'canonical-bridge.mjs'), prepared.canonicalSha256)
  if (!bytes.equals(serializeR34Preparation({ ...prepared, canonicalBytes }))) fail('serialized preparation drift')
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
    context.schema !== 'appraise.m02-r34-user-authorization-context/v1' ||
    context.authorizedAction !== 'ONE_FRESH_R34_P19_FULL_T2_INVOCATION' ||
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
    decision.verdict !== 'AUTHORIZE_ONE_FIXED_FULL_T2_R34_INVOCATION' ||
    decision.exactArtifactUserApprovalClaimed !== false ||
    decision.authorizationContext?.path !== join(REPO, AUTHORITY_PINS.context[0]) ||
    decision.authorizationContext.sha256 !== AUTHORITY_PINS.context[1] ||
    decision.manifestDigest !== MANIFEST_DIGEST ||
    decision.manifestFileSha256 !== MANIFEST_SHA ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    review.verdict !== 'ACCEPT_ONE_FIXED_FULL_T2_R34_INVOCATION' ||
    review.exactArtifactUserApprovalClaimed !== false ||
    review.manifest.fileSha256 !== MANIFEST_SHA ||
    review.manifest.manifestDigest !== MANIFEST_DIGEST ||
    review.independentReportSha256 !== AUTHORITY_PINS.focused[1] ||
    focused.verdict !== 'ACCEPT_R34_FULL_T2_CASE_BUDGET_READINESS_CANDIDATE_ONLY' ||
    !isDeepStrictEqual(
      context.cumulativeWholeCampaignCeilings,
      prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    ) ||
    submission.schema !== 'appraise.m02-native-submission/v1' ||
    submission.campaign !== 'R34' ||
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
  const names = new Set(['phase-journal.jsonl'])
  for (const item of CASES) {
    const providerRequests = item.id === 'P00' ? 0 : item.id === 'B14' ? 2 : item.script.operations.length + 1
    const files = ['mcp-startup.json', 'mcp-exit.json', 'case-outcome.json']
    if (item.id !== 'P00') files.push('script-plan.json')
    files.push(...Array.from({ length: providerRequests }, (_, index) => `provider-response-${index + 1}.json`))
    if (item.id === 'B14') files.push('permission-request.json', 'permission-terminal.json')
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
    !isDeepStrictEqual(validateProcessStateDiagnostic(value.processStates), value.processStates) ||
    value.childEvidence?.evidenceClass !== 'TRUSTED_CHILD_SELF_REPORT' ||
    !isDeepStrictEqual(value.childEvidence.receipt, exit) ||
    value.childEvidence.sha256 !== sha(JSON.stringify(exit))
  )
    fail(`${item.id} completed witness drift`)
  const environment = value.environmentProfile
  if (
    environment?.profile !== 'appraise.m02-r34-explicit-launch-environment/v1' ||
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
    const request = receipts.get('B14--permission-request.json'),
      terminal = receipts.get('B14--permission-terminal.json')
    if (
      request?.caseId !== 'B14' ||
      request.event !== 'permission-request-observed' ||
      request.requestedNetworkEnabled !== true ||
      request.threadTurnCorrelated !== true ||
      request.grants !== 0 ||
      terminal?.caseId !== 'B14' ||
      terminal.event !== 'permission-denial-terminal' ||
      terminal.resolved !== true ||
      terminal.grants !== 0
    )
      fail('B14 empty-permission denial witness drift')
  }
}

export async function verifyFullT2Predecessor({ requireNewRootAbsent = true } = {}) {
  if (!SHA256.test(TERMINAL_SHA) || !SHA256.test(INDEX_SHA)) fail('CLOSED_TERMINAL_PIN_NOT_YET_SUPPLIED')
  const old = await verifyR33Predecessor({ requireNewRootAbsent: false })
  const prepared = await readPrepared()
  await verifyAuthority(prepared)
  const terminal = JSON.parse(await readStableFile(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readStableFile(INDEX, INDEX_SHA))
  if (
    terminal.schema !== 'appraise.m02-r34-native-terminal/v1' ||
    terminal.exitCode !== 0 ||
    terminal.status !== 'T2_CASES_COMPLETED' ||
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
    terminal.completedCases?.length !== 24 ||
    terminal.cleanupQualification !== 'ALL_24_BOUNDED_CASE_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED' ||
    !countsValid(terminal.consumed) ||
    terminal.journal?.chainVerified !== true ||
    terminal.noResendOrResume !== true ||
    terminal.T2 !== 'ALL_24_NATIVE_CONJUNCTIONS_VERIFIED_PENDING_ACCEPTANCE' ||
    terminal.T3 !== 'INCOMPLETE' ||
    terminal.M02 !== 'INCOMPLETE' ||
    index.schema !== 'appraise.m02-r34-native-terminal-evidence-index/v1' ||
    index.root !== OLD_ROOT ||
    !isDeepStrictEqual(index.rootIdentity, terminal.rootIdentity) ||
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
  const names = expectedNames()
  if (!Array.isArray(index.files) || !isDeepStrictEqual(index.files.map(row => row.copy).sort(), [...names].sort()))
    fail('closed sanitized membership drift')
  const directories = [
    OLD_ROOT,
    join(OLD_ROOT, 'cases'),
    dirname(INDEX),
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
  for (const row of index.files) {
    const [caseId, name] = row.copy.split('--')
    const expected =
      row.copy === 'phase-journal.jsonl'
        ? join(OLD_ROOT, row.copy)
        : join(OLD_ROOT, 'cases', caseId, 'supervisor', name)
    if (row.originalPath !== expected || !SHA256.test(row.sha256 ?? '') || !nonnegative(row.bytes))
      fail('sanitized path or pin drift')
    const before = await fs.lstat(expected),
      copyPath = join(dirname(INDEX), row.copy),
      copyBefore = await fs.lstat(copyPath)
    if (
      !ownedFile(before) ||
      !ownedFile(copyBefore) ||
      ['dev', 'ino', 'uid'].some(key => before[key] !== row.originalIdentity?.[key]) ||
      (before.mode & 0o777) !== (row.originalIdentity.mode & 0o777)
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
  for (const [at, item] of CASES.entries())
    verifyCase(item, terminal.completedCases[at], receipts, finished.get(item.id))
  for (const { directory, stat } of parents) {
    const after = await fs.lstat(directory)
    if (!privateDirectory(after) || !same(stat, after)) fail('ancestor changed')
  }
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({
    ...old,
    prepared,
    r34TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: TERMINAL_SHA,
      indexPath: INDEX,
      indexSha256: INDEX_SHA,
      manifestFileSha256: MANIFEST_SHA,
      manifestDigest: MANIFEST_DIGEST,
      status: 'T2_CASES_COMPLETED',
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
      cleanup: 'ALL_24_BOUNDED_CASE_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED',
      root: OLD_ROOT,
      rootIdentity: Object.freeze({ ...index.rootIdentity }),
      consumed: Object.freeze({ ...terminal.consumed }),
      sourceCapacityReserved: 58,
      actualSourceHostCount: 'UNATTESTED',
      pending: Object.freeze([]),
      boundedCleanupOnlyNotGlobalProcessAbsence: true,
      p00RpcAndTelemetryEvidence: 'RUNNER_CONJUNCTION_NOT_INDEPENDENTLY_PERSISTED_RAW_RPC_OR_TELEMETRY',
      fullT2Qualification: 'BOUNDED_CASES_ONLY_NOT_T3_OR_M02',
      acceptanceStatus: 'ALL_24_NATIVE_CONJUNCTIONS_VERIFIED_PENDING_ACCEPTANCE',
      runtimeQualified: false,
    }),
  })
}
