/** Exact partial R34 evidence: 23 completed cases and failed B14 UNKNOWN; no replay or cleanup inference. */
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
const TERMINAL_SHA = 'eedce577803f22b10280215bf9917128d3d9ab1a39aa8b33d8404eefc7281fbf'
const INDEX = join(REPO, '.appraisejs/m02-r34-native-terminal-evidence-01/index.json')
const INDEX_SHA = 'e24ea1bbf00a12cbdcef89d06e11228a46c1be453b1017b7a099131368407cd6'
const CASES = Object.freeze(R34_POLICY.cases.filter(item => item.phase === 'T2'))
const WITNESS_PINS = Object.freeze({
  B01: '99f9f21345eadd17a9c599b193531ecb1b65b7bcb055d6b635702f0b1491ccb3',
  B02: 'fb2069e60a46555a1ce5c8e9b02dc7378d783c7cff2ff14c827935f7dcb0675b',
  B03: '6103d7ebea56628d2efede1c1be72180d6b4c44abfabd2595b78ea7ed27e635d',
  B04: '8acb0356b2a1f25c7cbbdd66a3e40c7d8fe27fd62ff118bf3bdcac6aefbc417f',
  B05: '2c1d5b6aa40fc093c45000568730199d9b544332fa61e2df2c2e62cb159be023',
  B06: '064e4123ad21d2cc659e6a3f3c15a9d24aa49d4c1d228cf8e45e8e77820369da',
  'B07-A01': '1e67d2d623b0104c26c04da4981886f04ad3bbf37d1046bc7493a158b030f64a',
  'B07-A02': '062554efdfd84c49bf42537709b30cd5d2ecb4f56a8ebd8c9b7c981d21a36060',
  'B07-A03': '3c0bfb6671cf26517ea6df99ea2d789f0c0c7ec2f3bd31e2a09d64ea4f44869a',
  'B07-A04': 'd0e6b17b4d1aab61a6664a34c4e3bbde4d2290141e80d78416e1a7c36fc3c43d',
  'B07-A05': '513f1087b83aea8aad4b65043722c39641c2b2a0eb842b0ab89e697a6d200470',
  'B07-A06': 'ebd63f34dd07ee74cf9d721baf1ef62987a3def1ed015297c401a75a74f2c53f',
  'B07-A07': 'fce32e223ff468d75fea2994b13424a050bdf5495784aa2264b19061004e94fa',
  'B07-A08': '8826d61807c0205523f2a4b1947ada8e147855a031cee716c5904cd40699e965',
  'B07-A09': '17c033a1f422551331bc642fb2ef0b5f356ae23ed666240a62556732ad5ff5a5',
  'B07-A10': 'f5ef6bd3c9819141e1a4903282a129dcb1c35dc454fe54192ffa3694b979e9de',
  'B07-A11': '7d5fb1d99b3d0c3c1b167d9dd7b58fbe1c434a29da782cfa2d2ef4dee31e530b',
  'B07-A12': '3f862d1c70eb86b69747e52e217418aed431174edc5ac2f9f688e682fd0db87e',
  'B07-A13': '7963397991ea46d35e32dd12a3afdef6a53757f5cd38422eb91e2a2b2c6c0f09',
  'B07-A14': '487b7b36ae7a54b2fed7a0cad4d127fef7ad661c6877724d2ccf3c422c3d252c',
  'B07-D01': '4865a52fb969b3ac09d8e8de3892964bfc2688791419ee617b73a49a40b6cd7e',
  'B07-T01': '937a54168d15fce4a8cbe688ae3f1b2fd1081c51c32f433fa0f7d996908e07b9',
  P00: '8da7e07bd05d31e992b299a8892d1e0302bf04241c3b028d2cd20d34a125b210',
})
export const R34_COUNTS = Object.freeze({
  listenerStarts: 24,
  controlWrites: 72,
  codexStarts: 24,
  mcpStarts: 24,
  threadStarts: 24,
  canonicalRequests: 87,
  turnStarts: 23,
  providerRequests: 53,
  outerCalls: 31,
  auditRequests: 48,
  scopedCalls: 24,
  workspaceActions: 0,
  permissionReplies: 0,
  helperStarts: 0,
})
const SHA256 = /^[a-f0-9]{64}$/
const KINDS = Object.freeze([...Object.keys(R34_POLICY.aggregate), 'outerCalls', 'auditRequests'])
const same = (a, b) => a?.dev === b?.dev && a?.ino === b?.ino
const sameFile = (a, b) =>
  ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key])
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = reason => {
  throw new Error(`R35 consumed R34 ${reason}`)
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
    finished = new Map(),
    types = new Map()
  let previous = '0'.repeat(64),
    active = null,
    begun = 0,
    source = 0,
    acknowledgements = 0,
    unknown = false,
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
    if (
      !['init', 'begin', 'reserve', 'ack', 'finish', 'unknown', 'recovery'].includes(event.type) ||
      (unknown && event.type !== 'recovery')
    )
      fail('unexpected journal event')
    types.set(event.type, (types.get(event.type) ?? 0) + 1)
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
        finished.size >= 23 ||
        active.id !== CASES[finished.size]?.id ||
        completed?.caseId !== active.id ||
        pending.size ||
        event.cleanupKnown !== true ||
        event.outcome !== active.expected ||
        completed.outcome !== active.expected ||
        event.caseWitnessSha256 !== WITNESS_PINS[active.id] ||
        event.caseWitnessSha256 !== completed.caseWitnessSha256 ||
        !isDeepStrictEqual(counts, completed.counts)
      )
        fail('finish witness or count drift')
      finished.set(active.id, { sha256: event.caseWitnessSha256, journalSeq: row.seq - 1 })
      active = null
    }
    if (event.type === 'unknown') {
      if (
        position !== records.length - 3 ||
        active?.id !== 'B14' ||
        event.reason !== 'AMBIGUOUS_EFFECT' ||
        pending.size
      )
        fail('UNKNOWN outcome drift')
      unknown = true
    }
    if (event.type === 'recovery') {
      const action =
        position === records.length - 2
          ? 'owned-stop-intent'
          : position === records.length - 1
            ? 'owned-stop-observed'
            : null
      if (
        !unknown ||
        active?.id !== 'B14' ||
        !action ||
        !isDeepStrictEqual(event, { type: 'recovery', id: `B14-${action}`, action })
      )
        fail('owned-stop recovery witness drift')
    }
  }
  if (
    records.length !== 919 ||
    index.journalRecords !== 919 ||
    terminal.journal.records !== 919 ||
    previous !== index.journalLastHash ||
    previous !== terminal.journal.terminalHash ||
    begun !== 24 ||
    finished.size !== 23 ||
    source !== 58 ||
    active?.id !== 'B14' ||
    reserved.size !== 434 ||
    acknowledgements !== 434 ||
    pending.size ||
    !unknown ||
    !isDeepStrictEqual(totals, R34_COUNTS) ||
    !isDeepStrictEqual(totals, terminal.consumed) ||
    !isDeepStrictEqual(Object.fromEntries(types), {
      init: 1,
      begin: 24,
      reserve: 434,
      ack: 434,
      finish: 23,
      unknown: 1,
      recovery: 2,
    })
  )
    fail('terminal journal accounting drift')
  return finished
}

function expectedNames() {
  const names = new Set(['phase-journal.jsonl'])
  for (const item of CASES.slice(0, 23)) {
    const requests = item.id === 'P00' ? 0 : item.script.operations.length + 1
    const files = ['mcp-startup.json', 'mcp-exit.json', 'case-outcome.json']
    if (item.id !== 'P00') files.push('script-plan.json')
    files.push(...Array.from({ length: requests }, (_, at) => `provider-response-${at + 1}.json`))
    for (const name of files) names.add(`${item.id}--${name}`)
  }
  for (const name of [
    'script-plan.json',
    'provider-response-1.json',
    'mcp-startup.json',
    'mcp-exit.json',
    'late-case-failure.json',
    'protocol-failure.json',
  ])
    names.add(`B14--${name}`)
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

export async function verifyR34Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR33Predecessor({ requireNewRootAbsent: false })
  const prepared = await readPrepared()
  await verifyAuthority(prepared)
  const terminal = JSON.parse(await readStableFile(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readStableFile(INDEX, INDEX_SHA))
  if (
    terminal.schema !== 'appraise.m02-r34-native-terminal/v1' ||
    terminal.exitCode !== 1 ||
    terminal.status !== 'UNKNOWN' ||
    terminal.completed !== 23 ||
    terminal.failedCase !== 'B14' ||
    terminal.runtimeQualified !== false ||
    terminal.root !== OLD_ROOT ||
    terminal.manifestDigest !== MANIFEST_DIGEST ||
    terminal.manifestFileSha256 !== MANIFEST_SHA ||
    terminal.sourceHostCapacityReserved !== 58 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(terminal.pending, []) ||
    terminal.lateCaseDiagnostics?.length !== 1 ||
    terminal.completedCases?.length !== 23 ||
    terminal.cleanupQualification !== 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN' ||
    !isDeepStrictEqual(terminal.consumed, R34_COUNTS) ||
    terminal.journal?.chainVerified !== true ||
    terminal.journal.reservations !== 434 ||
    terminal.journal.ACKs !== 434 ||
    terminal.noResendOrResume !== true ||
    terminal.T2 !== 'INCOMPLETE' ||
    terminal.T3 !== 'INCOMPLETE' ||
    terminal.M02 !== 'INCOMPLETE' ||
    index.schema !== 'appraise.m02-r34-native-terminal-evidence-index/v1' ||
    index.root !== OLD_ROOT ||
    !isDeepStrictEqual(index.rootIdentity, terminal.rootIdentity) ||
    index.rootIdentity?.dev !== 16777233 ||
    index.rootIdentity?.ino !== 70421109 ||
    index.journalChainVerified !== true ||
    index.runtimeAuthority !== false ||
    index.rawProviderAccountAuthHistoryOrDatabaseCopied !== false ||
    index.originalsRewritten !== false ||
    terminal.evidenceIndex?.path !== INDEX ||
    terminal.evidenceIndex.sha256 !== INDEX_SHA
  )
    fail('terminal or index drift')
  const failed = terminal.lateCaseDiagnostics[0]
  if (
    failed.schema !== 'appraise.m02-ta-matrix-r34-late-case-failure/v1' ||
    failed.caseId !== 'B14' ||
    failed.stage !== 'WAIT_TERMINAL' ||
    failed.reason !== 'DURABLE_PHASE_UNKNOWN' ||
    !isDeepStrictEqual(failed.gates, {
      lifecycle: 'NOT_REACHED',
      child: 'NOT_REACHED',
      canonical: 'NOT_REACHED',
      effectCounts: 'NOT_REACHED',
      script: 'NOT_REACHED',
      pendingEmpty: 'NOT_REACHED',
      unfenced: 'NOT_REACHED',
    }) ||
    failed.rawExceptionRetained !== false
  )
    fail('failed B14 stage drift')
  const names = expectedNames()
  if (
    !Array.isArray(index.files) ||
    index.files.length !== 150 ||
    !isDeepStrictEqual(index.files.map(row => row.copy).sort(), [...names].sort())
  )
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
  for (const [at, item] of CASES.slice(0, 23).entries())
    verifyCase(item, terminal.completedCases[at], receipts, finished.get(item.id))
  const protocol = receipts.get('B14--protocol-failure.json')
  const failedPlan = receipts.get('B14--script-plan.json'),
    failedStartup = receipts.get('B14--mcp-startup.json'),
    failedExit = receipts.get('B14--mcp-exit.json')
  const failedBootstrapProof = {
    capabilityHash: failedStartup?.capabilityHash,
    bootstrapHash: failedStartup?.bootstrapHash,
  }
  if (
    failedPlan?.caseId !== 'B14' ||
    failedPlan.operation !== 'request_permissions' ||
    failedPlan.grants !== 0 ||
    !verifyMcpChildReceipt({
      receipt: failedStartup,
      event: 'sdk-connect-returned',
      caseId: 'B14',
      bootstrapProof: failedBootstrapProof,
      profileDigest: failedStartup?.profileDigest,
    }) ||
    !verifyMcpChildReceipt({
      receipt: failedExit,
      event: 'node-exit-handler',
      caseId: 'B14',
      bootstrapProof: failedBootstrapProof,
      profileDigest: failedStartup?.profileDigest,
    })
  )
    fail('failed B14 plan or MCP self-report drift')
  if (
    !isDeepStrictEqual(receipts.get('B14--late-case-failure.json'), failed) ||
    protocol?.schema !== 'appraise.m02-ta-matrix-supervisor-receipt/v1' ||
    protocol.caseId !== 'B14' ||
    protocol.category !== 'PERMISSION_REQUEST_INVALID' ||
    protocol.phase !== 'turn' ||
    protocol.pendingKind !== null ||
    protocol.seq !== 916 ||
    protocol.frameKind !== 'request' ||
    protocol.methodSha256 !== 'b8e94ec97ca4d5b409745b2c48a2ea5f5dc7c5a53c329af5eb43181ed26342a2' ||
    protocol.envelopeFailureReason !== null ||
    terminal.consumed.permissionReplies !== 0
  )
    fail('failed B14 protocol witness drift')
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
      status: 'UNKNOWN',
      casesCompleted: 23,
      failedCase: 'B14',
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
      cleanup: 'UNKNOWN',
      cleanupQualification: 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN',
      failedCaseCleanup: 'UNKNOWN',
      root: OLD_ROOT,
      rootIdentity: Object.freeze({ ...index.rootIdentity }),
      consumed: R34_COUNTS,
      sourceCapacityReserved: 58,
      actualSourceHostCount: 'UNATTESTED',
      pending: Object.freeze([]),
      boundedCleanupOnlyNotGlobalProcessAbsence: true,
      failureStage: 'WAIT_TERMINAL',
      failureReason: 'DURABLE_PHASE_UNKNOWN',
      protocolFailureCategory: 'PERMISSION_REQUEST_INVALID',
      preciseFailedPredicate: 'UNKNOWN',
      p00RpcAndTelemetryEvidence: 'RUNNER_CONJUNCTION_NOT_INDEPENDENTLY_PERSISTED_RAW_RPC_OR_TELEMETRY',
      fullT2Qualification: false,
      runtimeQualified: false,
    }),
  })
}
