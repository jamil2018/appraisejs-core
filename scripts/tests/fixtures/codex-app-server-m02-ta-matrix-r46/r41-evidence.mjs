/** Exact consumed R41 partial evidence: seventeen completed cases and failed A12 UNKNOWN; no cleanup inference. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { verifyR37Predecessor } from '../codex-app-server-m02-ta-matrix-r41/r37-evidence.mjs'
import { serializeR41Preparation } from '../codex-app-server-m02-ta-matrix-r41/preparation.mjs'
import { verifyR41HistoricalClosure } from '../codex-app-server-m02-ta-matrix-r41/runtime-effects.mjs'
import { readStableFile } from '../codex-app-server-m02-ta-matrix-r41/r21-evidence.mjs'
import { requireTA04Absent } from '../codex-app-server-m02-ta-matrix-r41/prior-evidence.mjs'
import { POLICY as R41_POLICY } from '../codex-app-server-m02-ta-matrix-r41/policy.mjs'
import { validateProcessStateDiagnostic } from '../codex-app-server-m02-ta-matrix-r41/process-state-diagnostic.mjs'
import { verifyMcpChildReceipt } from '../codex-app-server-m02-ta-matrix-r10/mcp-readiness.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { digest, ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const OLD_ROOT = '/private/tmp/appraise-m02-ta-matrix-p24'
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r41/manifest.json')
const MANIFEST_SHA = 'a70fba8c2eb3ed3dd06cf735f9433c1368075d6aee65b3ca4a8aef6162abe1b2'
const MANIFEST_DIGEST = '6f6daf0b90e075f459d03f2106acd2051fcf3ed5eee3a8aa3c790bfd74e5171e'
const TERMINAL = join(REPO, '.appraisejs/m02-r41-native-terminal-01.json')
const TERMINAL_SHA = '3752302d0886b568a699da02e7d771c85779c1f02c707c4d08489f9d706bd49d'
const INDEX = join(REPO, '.appraisejs/m02-r41-native-terminal-evidence-01/index.json')
const INDEX_SHA = '5d099e7c9d5359f25092bf6b98313415cca8cc399bc719ea1a5047eccb08194c'
const CASES = Object.freeze(R41_POLICY.cases.filter(item => item.phase === 'T2'))
export const R41_COUNTS = Object.freeze({
  listenerStarts: 18,
  controlWrites: 54,
  codexStarts: 18,
  mcpStarts: 18,
  threadStarts: 18,
  canonicalRequests: 76,
  turnStarts: 18,
  providerRequests: 44,
  outerCalls: 26,
  auditRequests: 44,
  scopedCalls: 22,
  workspaceActions: 0,
  permissionReplies: 0,
  helperStarts: 0,
})
const WITNESS_PINS = Object.freeze({
  B01: '2e25164289d673870af2120cb0f27116ba1840a710c811488fd07acf53f455db',
  B02: '582bf3e7e451086b5c13701c77afe5fecb2bed29d00a5941617d59b9d41c8900',
  B03: 'c53959f27460b4ca3890a9bf4f5ca017d79b94cb00812eaf36925f1290342e01',
  B04: 'babb9e5f349205b804a0476c27a53ea22f2076cc0bf28e24334bec4254fc8870',
  B05: 'c6b348c1762dc632fa281096a28cfb487ce64145636eb3eac1ff85334f76c383',
  B06: '259bc76cad2c108639b8cfffe0eadbfa7b0cc74a8da5a17fd3bd5249235139d2',
  'B07-A01': '625eda058d3bb6ff96d293c927101400545dbc4c6a5895b4834587e89c183ff6',
  'B07-A02': '444d8a93eca472f0ed8baf22d86a4591953b62c51c0f9d1f513f775da22f064d',
  'B07-A03': 'fd9ff8aa453383a44938822e703fe047e138d77341caf69d08411080c627dfbf',
  'B07-A04': 'c30e88ed3c4e5cf559ca50f75e7df3208ffca26904eae3620c48ef2c895b0b36',
  'B07-A05': '4049019fde61198bd745a3ef5219c0f440263b99c1ca4669602707f9ea90f2b3',
  'B07-A06': 'f2c168c50e0f89cf269087b67d3538c520a232a1694dddca86bdac5c6e6ad28c',
  'B07-A07': 'c9e9f77e099213a2f0f4c8b3b6b9518b09f31dde8bf1806bd1a1b5726d334124',
  'B07-A08': '16951acd4da4d31bac696f9a014927b232c47c6b0524dd055dfb0eca6332b393',
  'B07-A09': 'bd2ab1c8d9acfe413b31e75be60a8735748553daa1ef4c1a9cd80810b4221a58',
  'B07-A10': '916e798a180885227bfcd039ba7ac46920a09ed46fa2785a5ef1bffe1d561581',
  'B07-A11': 'ce844d1c5963d0c36930d8214cfe431c63e1eb8877baf080a166bfc7072eef50',
})
// Exact sanitized observation only; no historical timing or process-cause attribution.
const FAILED_DIAGNOSTIC = Object.freeze({
  schema: 'appraise.m02-ta-matrix-r41-late-case-failure/v1',
  caseId: 'B07-A12',
  stage: 'GIT_READINESS',
  reason: 'GIT_READINESS_UNREVIEWED_CHILD_PATH',
  gates: {
    lifecycle: 'NOT_REACHED',
    child: 'NOT_REACHED',
    canonical: 'NOT_REACHED',
    effectCounts: 'NOT_REACHED',
    script: 'NOT_REACHED',
    pendingEmpty: 'NOT_REACHED',
    unfenced: 'NOT_REACHED',
  },
  childPaths: {
    observations: [
      {
        pathClass: 'EXPECTED_HOST',
        basenameClass: 'CODE_MODE_HOST',
        expectedHostMatch: true,
        interpreterMatch: false,
        codexMatch: false,
      },
      {
        pathClass: 'MANIFEST_INTERPRETER',
        basenameClass: 'NODE',
        expectedHostMatch: false,
        interpreterMatch: true,
        codexMatch: false,
      },
      {
        pathClass: 'HOMEBREW',
        basenameClass: 'GIT',
        expectedHostMatch: false,
        interpreterMatch: false,
        codexMatch: false,
      },
      {
        pathClass: 'HOMEBREW',
        basenameClass: 'GIT',
        expectedHostMatch: false,
        interpreterMatch: false,
        codexMatch: false,
      },
      {
        pathClass: 'EXPECTED_HOST',
        basenameClass: 'CODE_MODE_HOST',
        expectedHostMatch: true,
        interpreterMatch: false,
        codexMatch: false,
      },
      {
        pathClass: 'MANIFEST_INTERPRETER',
        basenameClass: 'NODE',
        expectedHostMatch: false,
        interpreterMatch: true,
        codexMatch: false,
      },
      {
        pathClass: 'HOMEBREW',
        basenameClass: 'GIT',
        expectedHostMatch: false,
        interpreterMatch: false,
        codexMatch: false,
      },
      {
        pathClass: 'EXPECTED_HOST',
        basenameClass: 'CODE_MODE_HOST',
        expectedHostMatch: true,
        interpreterMatch: false,
        codexMatch: false,
      },
      {
        pathClass: 'MANIFEST_INTERPRETER',
        basenameClass: 'NODE',
        expectedHostMatch: false,
        interpreterMatch: true,
        codexMatch: false,
      },
      {
        pathClass: 'HOMEBREW',
        basenameClass: 'GIT',
        expectedHostMatch: false,
        interpreterMatch: false,
        codexMatch: false,
      },
      {
        pathClass: 'EXPECTED_HOST',
        basenameClass: 'CODE_MODE_HOST',
        expectedHostMatch: true,
        interpreterMatch: false,
        codexMatch: false,
      },
      {
        pathClass: 'MANIFEST_INTERPRETER',
        basenameClass: 'NODE',
        expectedHostMatch: false,
        interpreterMatch: true,
        codexMatch: false,
      },
      {
        pathClass: 'HOMEBREW',
        basenameClass: 'GIT',
        expectedHostMatch: false,
        interpreterMatch: false,
        codexMatch: false,
      },
      {
        pathClass: 'EXPECTED_HOST',
        basenameClass: 'CODE_MODE_HOST',
        expectedHostMatch: true,
        interpreterMatch: false,
        codexMatch: false,
      },
      {
        pathClass: 'MANIFEST_INTERPRETER',
        basenameClass: 'NODE',
        expectedHostMatch: false,
        interpreterMatch: true,
        codexMatch: false,
      },
    ],
    overflow: true,
    unavailable: false,
    additionalOsQueries: 0,
    rawPathRetained: false,
  },
  gitReadiness: {
    samples: 10,
    gitObserved: true,
    gitIdentityCount: 2,
    gitGone: false,
    gitPidReused: false,
    hostObserved: true,
    hostIdentityStable: true,
    readinessComplete: false,
  },
  processStates: {
    identities: [
      {
        ordinal: 1,
        counts: {
          RUNNABLE: 2,
          SLEEPING: 0,
          STOPPED: 0,
          ZOMBIE: 0,
          OTHER: 0,
        },
        goneObserved: true,
      },
      {
        ordinal: 2,
        counts: {
          RUNNABLE: 16,
          SLEEPING: 0,
          STOPPED: 0,
          ZOMBIE: 0,
          OTHER: 0,
        },
        goneObserved: false,
      },
    ],
    overflow: false,
    unavailable: false,
    additionalOsQueries: 0,
    rawArgumentsOrEnvironmentRead: false,
  },
  evidenceClass: 'TRUSTED_SUPERVISOR_SANITIZED_LATE_CASE_FAILURE',
  rawExceptionRetained: false,
})

const SHA256 = /^[a-f0-9]{64}$/
const KINDS = Object.freeze([...Object.keys(R41_POLICY.aggregate), 'outerCalls', 'auditRequests'])
const same = (a, b) => a?.dev === b?.dev && a?.ino === b?.ino
const sameFile = (a, b) =>
  ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key])
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = reason => {
  throw new Error(`R43 consumed R41 ${reason}`)
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
    '.appraisejs/m02-r41-user-authorization-context-01.json',
    '7eeefb31e0ed827e6cd3d6bc77e3b915321c859a3840f2d11320082642c4f0a8',
  ],
  decision: [
    '.appraisejs/m02-t2-r41-recovery-user-decision.json',
    'e425ee6596091cc7263c61b2ea90595d0e16795758f7e2aad545e83f3ef4b074',
  ],
  review: [
    '.appraisejs/m02-t2-r41-exact-review.json',
    '3cda4fba4a105dc64eb9a847d5168521e599c053e32a6491f1a8a1549de99a12',
  ],
  focused: [
    '.appraisejs/m02-r41-focused-review-01.json',
    'c3f2e469d2676eb58220d09d6050537e644a8c1a1b0f75e0ece337d441a76513',
  ],
  submission: [
    '.appraisejs/m02-r41-approved-native-submission-01.json',
    '3833c4e3a79ee5693bc1c1ea064f4c9a4a3a3dbf2e07255245c5dbd687bf1270',
  ],
})
const FIXED_COMMAND =
  "/usr/bin/env -i PATH=/usr/bin:/bin LANG=C /opt/homebrew/Cellar/node/26.11.0/bin/node '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r41/entrypoint.mjs' --run '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r41/manifest.json' 6f6daf0b90e075f459d03f2106acd2051fcf3ed5eee3a8aa3c790bfd74e5171e a70fba8c2eb3ed3dd06cf735f9433c1368075d6aee65b3ca4a8aef6162abe1b2 3cda4fba4a105dc64eb9a847d5168521e599c053e32a6491f1a8a1549de99a12 e425ee6596091cc7263c61b2ea90595d0e16795758f7e2aad545e83f3ef4b074"

async function readPrepared() {
  const bytes = await readStableFile(MANIFEST, MANIFEST_SHA)
  const prepared = JSON.parse(bytes)
  if (
    prepared.schema !== 'appraise.m02-ta-matrix-r41-preparation/v1' ||
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
    prepared.canonicalSha256 !== '9f44ae8e82c9eab4b53292e1e4247fe0cafb7b0d9e7a3b6c34aa2d917ca94052'
  )
    fail('preparation drift')
  const history = await verifyR41HistoricalClosure(prepared.manifest)
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
  if (current !== 8370 || history.size !== 23 || paths.size !== 8393) fail('closure drift')
  const canonicalBytes = await readStableFile(join(dirname(MANIFEST), 'canonical-bridge.mjs'), prepared.canonicalSha256)
  if (!bytes.equals(serializeR41Preparation({ ...prepared, canonicalBytes }))) fail('serialized preparation drift')
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
    context.schema !== 'appraise.m02-r41-user-authorization-context/v1' ||
    context.authorizedAction !== 'ONE_FRESH_R41_P24_FULL_T2_INVOCATION' ||
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
    decision.verdict !== 'AUTHORIZE_ONE_FIXED_FULL_T2_R41_INVOCATION' ||
    decision.exactArtifactUserApprovalClaimed !== false ||
    decision.authorizationContext?.path !== join(REPO, AUTHORITY_PINS.context[0]) ||
    decision.authorizationContext.sha256 !== AUTHORITY_PINS.context[1] ||
    decision.manifestDigest !== MANIFEST_DIGEST ||
    decision.manifestFileSha256 !== MANIFEST_SHA ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    decision.historicalAvailabilitySha256 !== sha(JSON.stringify(prepared.manifest.historicalAvailability)) ||
    review.verdict !== 'ACCEPT_ONE_FIXED_FULL_T2_R41_INVOCATION' ||
    review.exactArtifactUserApprovalClaimed !== false ||
    review.manifest.fileSha256 !== MANIFEST_SHA ||
    review.manifest.manifestDigest !== MANIFEST_DIGEST ||
    review.historicalAvailabilitySha256 !== sha(JSON.stringify(prepared.manifest.historicalAvailability)) ||
    review.independentReportSha256 !== AUTHORITY_PINS.focused[1] ||
    focused.verdict !== 'ACCEPT_R41_RECEIPT_HASH_FULL_T2_CANDIDATE_ONLY' ||
    !isDeepStrictEqual(
      context.cumulativeWholeCampaignCeilings,
      prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    ) ||
    submission.schema !== 'appraise.m02-native-submission/v1' ||
    submission.campaign !== 'R41' ||
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
        finished.size >= 17 ||
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
        active?.id !== 'B07-A12' ||
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
        active?.id !== 'B07-A12' ||
        !action ||
        !isDeepStrictEqual(event, { type: 'recovery', id: `B07-A12-${action}`, action })
      )
        fail('owned-stop recovery witness drift')
    }
  }
  if (
    records.length !== 751 ||
    index.journalRecords !== 751 ||
    terminal.journal.records !== 751 ||
    previous !== index.journalLastHash ||
    previous !== terminal.journal.terminalHash ||
    begun !== 18 ||
    finished.size !== 17 ||
    source !== 48 ||
    active?.id !== 'B07-A12' ||
    reserved.size !== 356 ||
    acknowledgements !== 356 ||
    pending.size ||
    !unknown ||
    !isDeepStrictEqual(totals, R41_COUNTS) ||
    !isDeepStrictEqual(totals, terminal.consumed) ||
    !isDeepStrictEqual(Object.fromEntries(types), {
      init: 1,
      begin: 18,
      reserve: 356,
      ack: 356,
      finish: 17,
      unknown: 1,
      recovery: 2,
    })
  )
    fail('terminal journal accounting drift')
  return finished
}

function expectedNames() {
  const names = new Set(['phase-journal.jsonl'])
  for (const item of CASES.slice(0, 17)) {
    const requests = item.script.operations.length + 1
    const files = ['script-plan.json', 'mcp-startup.json', 'mcp-exit.json', 'case-outcome.json']
    files.push(...Array.from({ length: requests }, (_, at) => `provider-response-${at + 1}.json`))
    for (const name of files) names.add(`${item.id}--${name}`)
  }
  for (const name of [
    'script-plan.json',
    'provider-response-1.json',
    'provider-response-2.json',
    'mcp-startup.json',
    'mcp-exit.json',
    'late-case-failure.json',
  ])
    names.add(`B07-A12--${name}`)
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
    environment?.profile !== 'appraise.m02-r41-explicit-launch-environment/v1' ||
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

export async function verifyR41Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR37Predecessor({ requireNewRootAbsent: false })
  const prepared = await readPrepared()
  await verifyAuthority(prepared)
  const terminal = JSON.parse(await readStableFile(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readStableFile(INDEX, INDEX_SHA))
  if (
    terminal.schema !== 'appraise.m02-r41-native-terminal/v1' ||
    terminal.exitCode !== 1 ||
    terminal.status !== 'UNKNOWN' ||
    terminal.completed !== 17 ||
    terminal.failedCase !== 'B07-A12' ||
    terminal.runtimeQualified !== false ||
    terminal.root !== OLD_ROOT ||
    terminal.manifestDigest !== MANIFEST_DIGEST ||
    terminal.manifestFileSha256 !== MANIFEST_SHA ||
    terminal.sourceHostCapacityReserved !== 48 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(terminal.pending, []) ||
    !isDeepStrictEqual(terminal.lateCaseDiagnostics, [FAILED_DIAGNOSTIC]) ||
    terminal.completedCases?.length !== 17 ||
    terminal.cleanupQualification !== 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN' ||
    !isDeepStrictEqual(terminal.consumed, R41_COUNTS) ||
    terminal.journal?.chainVerified !== true ||
    terminal.journal.records !== 751 ||
    terminal.journal.reservations !== 356 ||
    terminal.journal.ACKs !== 356 ||
    !isDeepStrictEqual(terminal.protocolFailures, []) ||
    terminal.noResendOrResume !== true ||
    terminal.T2 !== 'INCOMPLETE' ||
    terminal.T3 !== 'INCOMPLETE' ||
    terminal.M02 !== 'INCOMPLETE' ||
    index.schema !== 'appraise.m02-r41-native-terminal-evidence-index/v1' ||
    index.root !== OLD_ROOT ||
    !isDeepStrictEqual(index.rootIdentity, terminal.rootIdentity) ||
    index.rootIdentity?.dev !== 16777233 ||
    index.rootIdentity?.ino !== 71066799 ||
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
    index.files.length !== 117 ||
    !isDeepStrictEqual(index.files.map(row => row.copy).sort(), [...names].sort())
  )
    fail('closed sanitized membership drift')
  const directories = [
    OLD_ROOT,
    join(OLD_ROOT, 'cases'),
    dirname(INDEX),
    ...CASES.slice(0, 18).flatMap(item => [
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
  for (const [at, item] of CASES.slice(0, 17).entries())
    verifyCase(item, terminal.completedCases[at], receipts, finished.get(item.id))
  const failedPlan = receipts.get('B07-A12--script-plan.json'),
    first = receipts.get('B07-A12--provider-response-1.json'),
    continuation = receipts.get('B07-A12--provider-response-2.json'),
    failedStartup = receipts.get('B07-A12--mcp-startup.json'),
    failedExit = receipts.get('B07-A12--mcp-exit.json')
  const bootstrapProof = {
    capabilityHash: failedStartup?.capabilityHash,
    bootstrapHash: failedStartup?.bootstrapHash,
  }
  for (const [name, value] of [
    ['script-plan', failedPlan],
    ['provider-response-1', first],
    ['provider-response-2', continuation],
  ])
    if (
      value?.schema !== 'appraise.m02-ta-matrix-supervisor-receipt/v1' ||
      value.evidenceClass !== 'TRUSTED_SUPERVISOR_OBSERVATION' ||
      value.name !== name ||
      value.caseId !== 'B07-A12'
    )
      fail('failed A12 receipt envelope drift')
  if (
    !isDeepStrictEqual(receipts.get('B07-A12--late-case-failure.json'), FAILED_DIAGNOSTIC) ||
    !isDeepStrictEqual(
      validateProcessStateDiagnostic(FAILED_DIAGNOSTIC.processStates),
      FAILED_DIAGNOSTIC.processStates,
    ) ||
    failedPlan.planSha256 !== 'a2bd70b2a667ee2782d34a57507db8750bc5eec3d96de54b507d2f8877ff307f' ||
    !Array.isArray(failedPlan.calls) ||
    failedPlan.calls.length !== 1 ||
    !isDeepStrictEqual(failedPlan.calls[0], {
      callId: 'm02_B07_A12_0',
      operation: 'quality_journey_execution_start',
      argumentsHash: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
      scriptSha256: 'a0fa7d430b6e15868e974a7ee77bbf84efd1f04c541265c4ca6c298986b19570',
      rejection: true,
    }) ||
    first.requestIndex !== 1 ||
    first.decodedStatus !== null ||
    first.decodedResultHash !== null ||
    continuation.requestIndex !== 2 ||
    continuation.decodedStatus !== 'NO_MCP_DISPATCH' ||
    continuation.decodedResultHash !== null ||
    [first, continuation].some(
      value =>
        value.planSha256 !== failedPlan.planSha256 ||
        !SHA256.test(value.responseSha256 ?? '') ||
        !/^sha256:[a-f0-9]{64}$/.test(value.requestByteHash ?? '') ||
        !/^sha256:[a-f0-9]{64}$/.test(value.descriptorHash ?? '') ||
        !/^sha256:[a-f0-9]{64}$/.test(value.wrapperDescriptorHash ?? ''),
    ) ||
    first.descriptorHash !== continuation.descriptorHash ||
    first.wrapperDescriptorHash !== continuation.wrapperDescriptorHash ||
    !verifyMcpChildReceipt({
      receipt: failedStartup,
      event: 'sdk-connect-returned',
      caseId: 'B07-A12',
      bootstrapProof,
      profileDigest: failedStartup?.profileDigest,
    }) ||
    !verifyMcpChildReceipt({
      receipt: failedExit,
      event: 'node-exit-handler',
      caseId: 'B07-A12',
      bootstrapProof,
      profileDigest: failedStartup?.profileDigest,
    })
  )
    fail('failed A12 observed diagnostic, script, continuation, or MCP drift')
  for (const { directory, stat } of parents) {
    const after = await fs.lstat(directory)
    if (!privateDirectory(after) || !same(stat, after)) fail('ancestor changed')
  }
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({
    ...old,
    prepared,
    r41TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: TERMINAL_SHA,
      indexPath: INDEX,
      indexSha256: INDEX_SHA,
      manifestFileSha256: MANIFEST_SHA,
      manifestDigest: MANIFEST_DIGEST,
      status: 'UNKNOWN',
      casesCompleted: 17,
      failedCase: 'B07-A12',
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
      consumed: R41_COUNTS,
      sourceCapacityReserved: 48,
      actualSourceHostCount: 'UNATTESTED',
      pending: Object.freeze([]),
      boundedCleanupOnlyNotGlobalProcessAbsence: true,
      failureStage: 'GIT_READINESS',
      failureReason: 'GIT_READINESS_UNREVIEWED_CHILD_PATH',
      childPaths: structuredClone(FAILED_DIAGNOSTIC.childPaths),
      actualUnreviewedChildPath: 'UNKNOWN',
      gitReadiness: Object.freeze({ ...FAILED_DIAGNOSTIC.gitReadiness }),
      processStates: structuredClone(FAILED_DIAGNOSTIC.processStates),
      historicalCause: 'UNKNOWN',
      fullT2Qualification: false,
      runtimeQualified: false,
    }),
  })
}
