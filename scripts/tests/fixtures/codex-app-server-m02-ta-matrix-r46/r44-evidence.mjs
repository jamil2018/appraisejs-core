/** Exact consumed R44 UNKNOWN prefix; four completed cases do not establish a closed full T2 campaign. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { verifyR43Predecessor } from '../codex-app-server-m02-ta-matrix-r44/r43-evidence.mjs'
import { serializeR44Preparation } from '../codex-app-server-m02-ta-matrix-r44/preparation.mjs'
import { verifyR44HistoricalClosure } from '../codex-app-server-m02-ta-matrix-r44/runtime-effects.mjs'
import { readStableFile } from '../codex-app-server-m02-ta-matrix-r44/r21-evidence.mjs'
import { requireTA04Absent } from '../codex-app-server-m02-ta-matrix-r44/prior-evidence.mjs'
import { POLICY as R44_POLICY } from '../codex-app-server-m02-ta-matrix-r44/policy.mjs'
import { validateChildPathDiagnostics } from '../codex-app-server-m02-ta-matrix-r44/child-path-diagnostic.mjs'
import { validateProcessStateDiagnostic } from '../codex-app-server-m02-ta-matrix-r44/process-state-diagnostic.mjs'
import { verifyMcpChildReceipt } from '../codex-app-server-m02-ta-matrix-r10/mcp-readiness.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { digest, ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const OLD_ROOT = '/private/tmp/appraise-m02-ta-matrix-p26'
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r44/manifest.json')
const MANIFEST_SHA = '22095597b02883fb421f42d908a29cb54c49de5174d0857b6d91305dd4c856ff'
const MANIFEST_DIGEST = 'baa64e1935fd5c4abc21c21485275168b4130e93840b1f95e4330b36bfa3b7c0'
const TERMINAL = join(REPO, '.appraisejs/m02-r44-native-terminal-01.json')
const TERMINAL_SHA = '286249ba8b8921baa833a0b1885373d78714095d351fbd3983c99480a8909a84'
const INDEX = join(REPO, '.appraisejs/m02-r44-native-terminal-evidence-01/index.json')
const INDEX_SHA = '5621aa1803ff639de9b4ae46cdd63e3ebfdb8e5080cf6446bddabf398c279c0d'
const CASES = Object.freeze(R44_POLICY.cases.filter(item => item.phase === 'T2'))
const COMPLETED_CASES = Object.freeze(CASES.slice(0, 4))
export const R44_COUNTS = Object.freeze({
  listenerStarts: 4,
  controlWrites: 12,
  codexStarts: 4,
  mcpStarts: 4,
  threadStarts: 4,
  canonicalRequests: 34,
  turnStarts: 4,
  providerRequests: 13,
  outerCalls: 9,
  auditRequests: 18,
  scopedCalls: 9,
  workspaceActions: 0,
  permissionReplies: 0,
  helperStarts: 0,
})
const WITNESS_PINS = Object.freeze({
  B01: '947838a34bf6aa3d462a38cbb49ccf71c122b7970638e150635e0ef865dfb0c6',
  B02: 'a748f16336341702ff0b026834b9880cc286c689d782dc903a5ecc7bf5014768',
  B03: '95c31b9036e38efe666f4fc024753fc0cd35f083bf5cd351fd195f44783c9e9b',
  B04: '7c01eef5a618bf69a81968603f2665dcf8d988f416381d12b8fafabb5f58a635',
})
const SHA256 = /^[a-f0-9]{64}$/
const KINDS = Object.freeze([...Object.keys(R44_POLICY.aggregate), 'outerCalls', 'auditRequests'])
const same = (a, b) => a?.dev === b?.dev && a?.ino === b?.ino
const sameFile = (a, b) =>
  ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key])
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = reason => {
  throw new Error(`R46 consumed R44 ${reason}`)
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
    '.appraisejs/m02-r44-user-authorization-context-01.json',
    '92789174be0c987072496424a96851bdb288724d8bfa8e81a50728b4a717f677',
  ],
  decision: [
    '.appraisejs/m02-t2-r44-recovery-user-decision.json',
    '160a118ff5a450540b03cb00be25bd293431a0a80cc66192244d94263b3215a2',
  ],
  review: [
    '.appraisejs/m02-t2-r44-exact-review.json',
    '56d32ee3d70fbdf45cc4152fa79398a8de27300e9bd36e9f77e0544a61567b34',
  ],
  focused: [
    '.appraisejs/m02-r44-focused-review-01.json',
    'd38192a5cef74b6de71bca7d54aeb7235ac86705b894b6ceb5b5a245a1a4cec6',
  ],
  submission: [
    '.appraisejs/m02-r44-approved-native-submission-01.json',
    'a090199ed17748646b85c59fb94a666b1b9e18b4059a663cc1c4b41084fe26f7',
  ],
})
const FOCUSED_VERDICT = 'ACCEPT_R44_FULL_T2_FIRST_PATH_DIAGNOSTIC_CANDIDATE_ONLY'
const FIXED_COMMAND =
  "/usr/bin/env -i PATH=/usr/bin:/bin LANG=C /opt/homebrew/Cellar/node/26.11.0/bin/node '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r44/entrypoint.mjs' --run '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r44/manifest.json' baa64e1935fd5c4abc21c21485275168b4130e93840b1f95e4330b36bfa3b7c0 22095597b02883fb421f42d908a29cb54c49de5174d0857b6d91305dd4c856ff 56d32ee3d70fbdf45cc4152fa79398a8de27300e9bd36e9f77e0544a61567b34 160a118ff5a450540b03cb00be25bd293431a0a80cc66192244d94263b3215a2"

async function readPrepared() {
  const bytes = await readStableFile(MANIFEST, MANIFEST_SHA)
  const prepared = JSON.parse(bytes)
  if (
    prepared.schema !== 'appraise.m02-ta-matrix-r44-preparation/v1' ||
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
    prepared.canonicalSha256 !== '647ed5c99199818240bb0f7359ddbaa90d5d45310d2148ad75e304d980098b2c'
  )
    fail('preparation drift')
  const history = await verifyR44HistoricalClosure(prepared.manifest)
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
  if (current !== 8733 || history.size !== 23 || paths.size !== 8756) fail('closure drift')
  const canonicalBytes = await readStableFile(join(dirname(MANIFEST), 'canonical-bridge.mjs'), prepared.canonicalSha256)
  if (!bytes.equals(serializeR44Preparation({ ...prepared, canonicalBytes }))) fail('serialized preparation drift')
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
    context.schema !== 'appraise.m02-r44-user-authorization-context/v1' ||
    context.authorizedAction !== 'ONE_FRESH_R44_P26_FULL_T2_INVOCATION' ||
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
    decision.schema !== 'appraise.m02-ta-t2-r44-recovery-user-decision/v1' ||
    decision.verdict !== 'AUTHORIZE_ONE_FIXED_FULL_T2_R44_INVOCATION' ||
    decision.exactArtifactUserApprovalClaimed !== false ||
    decision.authorizationContext?.path !== join(REPO, AUTHORITY_PINS.context[0]) ||
    decision.authorizationContext.sha256 !== AUTHORITY_PINS.context[1] ||
    decision.manifestDigest !== MANIFEST_DIGEST ||
    decision.manifestFileSha256 !== MANIFEST_SHA ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    decision.historicalAvailabilitySha256 !== sha(JSON.stringify(prepared.manifest.historicalAvailability)) ||
    review.schema !== 'appraise.m02-ta-t2-r44-exact-review/v1' ||
    review.manifest.path !== MANIFEST ||
    review.manifest.root !== OLD_ROOT ||
    review.manifest.phase !== 'T2' ||
    !isDeepStrictEqual(review.manifest.cases, prepared.manifest.cases) ||
    review.entrypointSha256 !==
      prepared.manifest.artifacts.find(
        row => row.path === join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r44/entrypoint.mjs'),
      )?.sha256 ||
    review.canonicalSha256 !== prepared.canonicalSha256 ||
    review.recoveryProposalSha256 !== prepared.manifest.recoveryProposalSha256 ||
    review.verdict !== 'ACCEPT_ONE_FIXED_FULL_T2_R44_INVOCATION' ||
    review.exactArtifactUserApprovalClaimed !== false ||
    review.manifest.fileSha256 !== MANIFEST_SHA ||
    review.manifest.manifestDigest !== MANIFEST_DIGEST ||
    review.historicalAvailabilitySha256 !== sha(JSON.stringify(prepared.manifest.historicalAvailability)) ||
    review.independentReportSha256 !== AUTHORITY_PINS.focused[1] ||
    focused.schema !== 'appraise.m02-r44-focused-review/v1' ||
    focused.runtimeAuthority !== false ||
    focused.verdict !== FOCUSED_VERDICT ||
    !isDeepStrictEqual(
      context.cumulativeWholeCampaignCeilings,
      prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    ) ||
    submission.schema !== 'appraise.m02-native-submission/v1' ||
    submission.campaign !== 'R44' ||
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
    if (!['init', 'begin', 'reserve', 'ack', 'finish'].includes(event.type)) fail('UNKNOWN or unplanned journal event')
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
      const item = COMPLETED_CASES[begun]
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
        active.id !== COMPLETED_CASES[finished.size]?.id ||
        completed?.caseId !== active.id ||
        pending.size ||
        event.cleanupKnown !== true ||
        event.outcome !== active.expected ||
        completed.outcome !== active.expected ||
        !SHA256.test(event.caseWitnessSha256 ?? '') ||
        event.caseWitnessSha256 !== completed.caseWitnessSha256 ||
        event.caseWitnessSha256 !== WITNESS_PINS[active.id] ||
        !isDeepStrictEqual(counts, completed.counts)
      )
        fail('finish witness or count drift')
      finished.set(active.id, { sha256: event.caseWitnessSha256, journalSeq: row.seq - 1 })
      active = null
    }
  }
  if (
    records.length !== index.journalRecords ||
    records.length !== terminal.journal.records ||
    previous !== index.journalLastHash ||
    previous !== terminal.journal.terminalHash ||
    records.length !== 239 ||
    begun !== 4 ||
    finished.size !== 4 ||
    source !== 16 ||
    active !== null ||
    reserved.size !== acknowledgements ||
    acknowledgements !== terminal.journal.ACKs ||
    reserved.size !== terminal.journal.reservations ||
    reserved.size !== 115 ||
    acknowledgements !== 115 ||
    records.length !== 9 + 2 * reserved.size ||
    pending.size ||
    records.at(-1).event.type !== 'finish' ||
    records.at(-1).event.caseId !== 'B04' ||
    !isDeepStrictEqual(totals, terminal.consumed)
  )
    fail('terminal journal accounting drift')
  return finished
}

function expectedNames() {
  const names = new Set(['phase-journal.jsonl'])
  for (const item of COMPLETED_CASES) {
    const providerRequests = item.script.operations.length + 1
    const files = ['mcp-startup.json', 'mcp-exit.json', 'case-outcome.json', 'script-plan.json']
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
    completed.permissionRequestDiagnostic !== null ||
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
    environment?.profile !== 'appraise.m02-r44-explicit-launch-environment/v1' ||
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
    canonical.evidenceClass !== 'DISPOSABLE_CANONICAL_DATABASE_READ' ||
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
  const expectedScoped = item.script.operations.length
  const expectedProvider = item.script.operations.length + 1
  if (
    counts.turnStarts !== 1 ||
    counts.providerRequests !== expectedProvider ||
    counts.outerCalls !== item.script.operations.length ||
    counts.scopedCalls !== expectedScoped ||
    counts.auditRequests !== 2 * expectedScoped ||
    counts.permissionReplies !== 0
  )
    fail(`${item.id} case effect counts drift`)
  const plan = receipts.get(`${item.id}--script-plan.json`)
  if (
    plan?.schema !== value.schema ||
    plan.evidenceClass !== value.evidenceClass ||
    plan.name !== 'script-plan' ||
    plan.caseId !== item.id ||
    !SHA256.test(plan.planSha256 ?? '') ||
    plan.calls?.length !== expectedScoped ||
    plan.calls.some(
      (call, at) =>
        call.callId !== `m02_${item.id}_${at}` ||
        call.operation !== item.script.operations[at].toolName ||
        !SHA256.test(call.argumentsHash ?? '') ||
        !SHA256.test(call.scriptSha256 ?? '') ||
        call.rejection !== false,
    )
  )
    fail(`${item.id} script plan drift`)
  let descriptor = null,
    wrapper = null
  for (let at = 1; at <= expectedProvider; at++) {
    const response = receipts.get(`${item.id}--provider-response-${at}.json`)
    if (
      response?.schema !== value.schema ||
      response.evidenceClass !== value.evidenceClass ||
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
        : response.decodedStatus !== 'RESULT_CORRELATED' || !SHA256.test(response.decodedResultHash ?? '')) ||
      (at > 1 && (response.descriptorHash !== descriptor || response.wrapperDescriptorHash !== wrapper))
    )
      fail(`${item.id} provider correlation drift`)
    descriptor = response.descriptorHash
    wrapper = response.wrapperDescriptorHash
  }
}

export async function verifyR44Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR43Predecessor({ requireNewRootAbsent: false })
  const prepared = await readPrepared()
  await verifyAuthority(prepared)
  const terminal = JSON.parse(await readStableFile(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readStableFile(INDEX, INDEX_SHA))
  if (
    terminal.schema !== 'appraise.m02-r44-native-terminal/v1' ||
    terminal.evidenceClass !==
      'NATIVE_EXEC_TOOL_TERMINAL_TRANSCRIPTION_CORROBORATED_BY_HASH_VERIFIED_JOURNAL_AND_CASE_WITNESSES' ||
    terminal.toolSession !== 85962 ||
    terminal.exitCode !== 130 ||
    terminal.status !== 'UNKNOWN' ||
    terminal.completed !== 4 ||
    terminal.failedCase !== null ||
    terminal.runtimeQualified !== false ||
    terminal.root !== OLD_ROOT ||
    terminal.manifestDigest !== MANIFEST_DIGEST ||
    terminal.manifestFileSha256 !== MANIFEST_SHA ||
    terminal.sourceHostCapacityReserved !== 16 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(terminal.pending, []) ||
    !isDeepStrictEqual(terminal.lateCaseDiagnostics, []) ||
    !isDeepStrictEqual(terminal.protocolFailures, []) ||
    terminal.completedCases?.length !== 4 ||
    terminal.cleanupQualification !== 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN' ||
    !isDeepStrictEqual(terminal.consumed, R44_COUNTS) ||
    terminal.journal?.chainVerified !== true ||
    terminal.noResendOrResume !== true ||
    terminal.T2 !== 'INCOMPLETE' ||
    terminal.waitLocation !== 'UNKNOWN' ||
    terminal.journalUnknownFenceObserved !== false ||
    terminal.journalTerminalCheckpointObserved !== false ||
    !isDeepStrictEqual(terminal.externalOwnedToolStop, {
      toolSession: 85962,
      operation: 'write_stdin_CONTROL_C_ON_ORIGINAL_SESSION',
      observedToolExitCode: 130,
      trigger: 'FIRST_UNCERTAINTY_STALL_AFTER_B04',
      cleanupEstablished: false,
    }) ||
    terminal.T3 !== 'INCOMPLETE' ||
    terminal.M02 !== 'INCOMPLETE' ||
    index.schema !== 'appraise.m02-r44-native-terminal-evidence-index/v1' ||
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
  if (
    !Array.isArray(index.files) ||
    index.files.length !== 30 ||
    names.size !== 30 ||
    !isDeepStrictEqual(index.files.map(row => row.copy).sort(), [...names].sort())
  )
    fail('closed sanitized membership drift')
  const directories = [
    OLD_ROOT,
    join(OLD_ROOT, 'cases'),
    dirname(INDEX),
    ...COMPLETED_CASES.flatMap(item => [
      join(OLD_ROOT, 'cases', item.id),
      join(OLD_ROOT, 'cases', item.id, 'supervisor'),
    ]),
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
  for (const [at, item] of COMPLETED_CASES.entries())
    verifyCase(item, terminal.completedCases[at], receipts, finished.get(item.id))
  for (const { directory, stat } of parents) {
    const after = await fs.lstat(directory)
    if (!privateDirectory(after) || !same(stat, after)) fail('ancestor changed')
  }
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({
    ...old,
    prepared,
    r44TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: TERMINAL_SHA,
      indexPath: INDEX,
      indexSha256: INDEX_SHA,
      manifestFileSha256: MANIFEST_SHA,
      manifestDigest: MANIFEST_DIGEST,
      status: 'UNKNOWN',
      casesCompleted: 4,
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
      cleanup: 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN',
      cleanupQualification: 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN',
      waitLocation: 'UNKNOWN',
      globalCleanup: 'UNKNOWN',
      journalUnknownFenceObserved: false,
      journalTerminalCheckpointObserved: false,
      externalOwnedToolStop: Object.freeze({ ...terminal.externalOwnedToolStop }),
      root: OLD_ROOT,
      rootIdentity: Object.freeze({ ...index.rootIdentity }),
      consumed: Object.freeze({ ...terminal.consumed }),
      sourceCapacityReserved: 16,
      actualSourceHostCount: 'UNATTESTED',
      pending: Object.freeze([]),
      boundedCleanupOnlyNotGlobalProcessAbsence: true,
      fullT2Qualification: false,
      acceptanceStatus: 'INCOMPLETE',
      runtimeQualified: false,
    }),
  })
}
