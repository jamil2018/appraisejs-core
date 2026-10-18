/** TA06 additive archival semantic replay. Recorded original identities remain historical; current original identity is UNKNOWN. */
/** Exact consumed R37 partial evidence: twenty completed cases and failed D01 UNKNOWN; no cleanup inference. */
import fs from 'node:fs/promises'
import {
  readClaimBytes,
  assertHistoricalRoot,
  readHistoricalPair,
  verifyLegacyHistoricalClosure,
} from './ta06-archive.mjs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { verifyR36Predecessor } from './history-r36-evidence.mjs'
import { serializeR37Preparation } from '../codex-app-server-m02-ta-matrix-r37/preparation.mjs'

import { requireTA04Absent } from '../codex-app-server-m02-ta-matrix-r37/prior-evidence.mjs'
import { POLICY as R37_POLICY } from '../codex-app-server-m02-ta-matrix-r37/policy.mjs'
import { validateProcessStateDiagnostic } from '../codex-app-server-m02-ta-matrix-r37/process-state-diagnostic.mjs'
import { verifyMcpChildReceipt } from '../codex-app-server-m02-ta-matrix-r10/mcp-readiness.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { digest, ROOT } from '../codex-app-server-m02-ta-matrix-r41/policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const OLD_ROOT = '/private/tmp/appraise-m02-ta-matrix-p22'
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r37/manifest.json')
const MANIFEST_SHA = '02731361b8beaabd6ca4cec43c2a7e190ac0f42eeb0e07e0094717eb86142bf0'
const MANIFEST_DIGEST = '3c89c11296511c6064dc290268d16956c9f8252df5e3a2cf12661fef67c90754'
const TERMINAL = join(REPO, '.appraisejs/m02-r37-native-terminal-01.json')
const TERMINAL_SHA = '55f3b0d9f869922fdf71664688a03cca6e0070e0392afa7af737d65c507c2db0'
const INDEX = join(REPO, '.appraisejs/m02-r37-native-terminal-evidence-01/index.json')
const INDEX_SHA = '8413538f9e1052a63196721a6e52e55d7b1bbb7291700071eba88cf05efbbe25'
const CASES = Object.freeze(R37_POLICY.cases.filter(item => item.phase === 'T2'))
export const R37_COUNTS = Object.freeze({
  listenerStarts: 21,
  controlWrites: 63,
  codexStarts: 21,
  mcpStarts: 21,
  threadStarts: 21,
  canonicalRequests: 82,
  turnStarts: 21,
  providerRequests: 50,
  outerCalls: 29,
  auditRequests: 46,
  scopedCalls: 23,
  workspaceActions: 0,
  permissionReplies: 0,
  helperStarts: 0,
})
const WITNESS_PINS = Object.freeze({
  B01: '5b0073c368a7113e213dc5e96d74af2d5576d5da4f30ea5cd01cdecc4765fadc',
  B02: 'c88905e33f6fc51d94ef0914e294b941eacd5cb9903961fdfca1f70e62594712',
  B03: '2a70de22a25106f524e78c586b7118933b52e7a912e2f5233547815327300657',
  B04: '33ac08d26cd29e59bd6eb038566528a5996c94768a1e26501c698b8ef756b6e2',
  B05: '172bd221d5c9b4a541c366c39dd01d6667b32aa1a955f0886cda557e1f3da6d4',
  B06: 'df56ba80cdb86836414c5f15e78f01b0da7051c71a35f1c2b04538f419db9269',
  'B07-A01': '9aa72f70a916c7892299b0415e939dc1bfa4580b3191588c275de0b3d03ab953',
  'B07-A02': '21b5a35f0ad56dae2c8f2fdbdeb34017bc222054c014195c332b02ed1f9560ac',
  'B07-A03': 'dd6efa0505ef8c40522caf5592e7d698e57f19bd1b4e6ea657202f9ac4391a64',
  'B07-A04': 'b18ddf5577f4a6d9365c2a4c1aeb85da088a4bc25d40ab0ce059e384f69fda9f',
  'B07-A05': '3d33fd38886440a92ec0e2a7be634a6a23723d68ef70b6890762ce99ef7f75bd',
  'B07-A06': '5b44b5deeb10b3dea5ab8934179b209745576bd2d9d4edb4fb58d6282dd59154',
  'B07-A07': '582c20ad03d526cd55d91488ea17d6eac7ed733559c632bb0b726dfe2031d3f4',
  'B07-A08': '33c5936e863eda528d1ed16d5ba2a40f1a12d5ec94e29946acebf7e1cd2cba71',
  'B07-A09': '08c0bf15aeb40d75826587cb69b83542ed0404ec7313bd69f615d8db0741a706',
  'B07-A10': 'd6f10f8cce735df903e024edb8b6a46323c58c40d0e71794182a69926130d670',
  'B07-A11': 'a8c05bcbc5af837a61aa46b7320603a4acefc1d6e53d4e5a75531f4cecc555af',
  'B07-A12': '0f0bf40baf1e50aad16937c08e11045ef8865306c60e07e2b2491159745216f8',
  'B07-A13': '428411d588230e6c41870f650fb0e6bc068e4cc99284ddf3da394f888c2589c3',
  'B07-A14': '5eebb14f9de3f8fcd2e25548ff581aa3c24e74cd0480be265229c9f92f991604',
})
// Exact sanitized observation only; no historical timing or process-cause attribution.
const FAILED_DIAGNOSTIC = Object.freeze({
  schema: 'appraise.m02-ta-matrix-r37-late-case-failure/v1',
  caseId: 'B07-D01',
  stage: 'GIT_READINESS',
  reason: 'GIT_READINESS_CASE_BUDGET_EXHAUSTED',
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
    overflow: false,
    unavailable: false,
    additionalOsQueries: 0,
    rawPathRetained: false,
  },
  gitReadiness: {
    samples: 5,
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
          RUNNABLE: 8,
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
const KINDS = Object.freeze([...Object.keys(R37_POLICY.aggregate), 'outerCalls', 'auditRequests'])
const same = (a, b) => a?.dev === b?.dev && a?.ino === b?.ino
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = reason => {
  throw new Error(`R39 consumed R37 ${reason}`)
}
const privateDirectory = value =>
  value.isDirectory() && !value.isSymbolicLink() && value.uid === process.getuid() && (value.mode & 0o777) === 0o700
const nonnegative = value => Number.isSafeInteger(value) && value >= 0
const consistentOwnedExit = value =>
  value?.exit &&
  value?.close &&
  isDeepStrictEqual(value.exit, value.close) &&
  ((value.exit.code === 0 && value.exit.signal === null) ||
    (value.exit.code === null && value.exit.signal === 'SIGTERM'))
const AUTHORITY_PINS = Object.freeze({
  context: [
    '.appraisejs/m02-r37-user-authorization-context-01.json',
    'b2f404d88863d9024d06a7473f23c6b32fc5e695ad05a16428ee4aad85c8841f',
  ],
  decision: [
    '.appraisejs/m02-t2-r37-recovery-user-decision.json',
    '2b9d86c28cb2f8b00fcde94849e0cc8dd735df3fe087c918a35e773bbbe4a860',
  ],
  review: [
    '.appraisejs/m02-t2-r37-exact-review.json',
    '95a09988132a4c916046085df56be8be3d45fc7ef30bc8fb8255c82a5ebe0d2a',
  ],
  focused: [
    '.appraisejs/m02-r37-focused-review-01.json',
    '45431fca369b2f48fa8f2a58b381e21c4f540913087d1b1c9aaacb05f04fc72f',
  ],
  submission: [
    '.appraisejs/m02-r37-approved-native-submission-01.json',
    '68c22d1c52426f1aeecd414995e9cc9975ca6c5b283029b395d62e9237e791bd',
  ],
})
const FIXED_COMMAND =
  "/usr/bin/env -i PATH=/usr/bin:/bin LANG=C /opt/homebrew/Cellar/node/26.11.0/bin/node '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r37/entrypoint.mjs' --run '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r37/manifest.json' 3c89c11296511c6064dc290268d16956c9f8252df5e3a2cf12661fef67c90754 02731361b8beaabd6ca4cec43c2a7e190ac0f42eeb0e07e0094717eb86142bf0 95a09988132a4c916046085df56be8be3d45fc7ef30bc8fb8255c82a5ebe0d2a 2b9d86c28cb2f8b00fcde94849e0cc8dd735df3fe087c918a35e773bbbe4a860"

async function readPrepared() {
  const bytes = await readClaimBytes(MANIFEST, MANIFEST_SHA)
  const prepared = JSON.parse(bytes)
  if (
    prepared.schema !== 'appraise.m02-ta-matrix-r37-preparation/v1' ||
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
    prepared.canonicalSha256 !== '30d1839ca639becc1aa43eb7742a015576fd60ed5f562a64f01c16d9ef75a55c'
  )
    fail('preparation drift')
  const history = await verifyLegacyHistoricalClosure(prepared.manifest)
  const paths = new Set()
  let ancestralClaimsChecked = 0
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
    if (row.availability !== undefined) fail('ancestral artifact availability drift')
    await readClaimBytes(row.path, row.sha256)
    ancestralClaimsChecked++
  }
  if (ancestralClaimsChecked !== 7994 || history.size !== 23 || paths.size !== 8017) fail('closure drift')
  const canonicalBytes = await readClaimBytes(join(dirname(MANIFEST), 'canonical-bridge.mjs'), prepared.canonicalSha256)
  if (!bytes.equals(serializeR37Preparation({ ...prepared, canonicalBytes }))) fail('serialized preparation drift')
  const seal = loadSealedRouteEvidence()
  if (seal.status !== 'SEALED_OFFLINE_ONLY') fail('sealed evidence invalid')
  return { ...prepared, canonicalBytes, seal, manifestFileSha256: MANIFEST_SHA }
}

async function verifyAuthority(prepared) {
  const values = {}
  for (const [key, [file, sha256]] of Object.entries(AUTHORITY_PINS))
    values[key] = JSON.parse(await readClaimBytes(join(REPO, file), sha256))
  const { context, decision, review, focused, submission } = values
  if (
    context.schema !== 'appraise.m02-r37-user-authorization-context/v1' ||
    context.authorizedAction !== 'ONE_FRESH_R37_P22_FULL_T2_INVOCATION' ||
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
    decision.verdict !== 'AUTHORIZE_ONE_FIXED_FULL_T2_R37_INVOCATION' ||
    decision.exactArtifactUserApprovalClaimed !== false ||
    decision.authorizationContext?.path !== join(REPO, AUTHORITY_PINS.context[0]) ||
    decision.authorizationContext.sha256 !== AUTHORITY_PINS.context[1] ||
    decision.manifestDigest !== MANIFEST_DIGEST ||
    decision.manifestFileSha256 !== MANIFEST_SHA ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    review.verdict !== 'ACCEPT_ONE_FIXED_FULL_T2_R37_INVOCATION' ||
    review.exactArtifactUserApprovalClaimed !== false ||
    review.manifest.fileSha256 !== MANIFEST_SHA ||
    review.manifest.manifestDigest !== MANIFEST_DIGEST ||
    review.independentReportSha256 !== AUTHORITY_PINS.focused[1] ||
    focused.verdict !== 'ACCEPT_R37_FULL_T2_CORRECTED_PROTOCOL_CANDIDATE_ONLY' ||
    !isDeepStrictEqual(
      context.cumulativeWholeCampaignCeilings,
      prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    ) ||
    submission.schema !== 'appraise.m02-native-submission/v1' ||
    submission.campaign !== 'R37' ||
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
  await readClaimBytes(context.proposal.path, context.proposal.sha256)
  await readClaimBytes(context.standingAuthorization.path, context.standingAuthorization.sha256)
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
        finished.size >= 20 ||
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
        active?.id !== 'B07-D01' ||
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
        active?.id !== 'B07-D01' ||
        !action ||
        !isDeepStrictEqual(event, { type: 'recovery', id: `B07-D01-${action}`, action })
      )
        fail('owned-stop recovery witness drift')
    }
  }
  if (
    records.length !== 841 ||
    index.journalRecords !== 841 ||
    terminal.journal.records !== 841 ||
    previous !== index.journalLastHash ||
    previous !== terminal.journal.terminalHash ||
    begun !== 21 ||
    finished.size !== 20 ||
    source !== 54 ||
    active?.id !== 'B07-D01' ||
    reserved.size !== 398 ||
    acknowledgements !== 398 ||
    pending.size ||
    !unknown ||
    !isDeepStrictEqual(totals, R37_COUNTS) ||
    !isDeepStrictEqual(totals, terminal.consumed) ||
    !isDeepStrictEqual(Object.fromEntries(types), {
      init: 1,
      begin: 21,
      reserve: 398,
      ack: 398,
      finish: 20,
      unknown: 1,
      recovery: 2,
    })
  )
    fail('terminal journal accounting drift')
  return finished
}

function expectedNames() {
  const names = new Set(['phase-journal.jsonl'])
  for (const item of CASES.slice(0, 20)) {
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
    names.add(`B07-D01--${name}`)
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
    environment?.profile !== 'appraise.m02-r37-explicit-launch-environment/v1' ||
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

export async function verifyR37Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR36Predecessor({ requireNewRootAbsent: false })
  const prepared = await readPrepared()
  await verifyAuthority(prepared)
  const terminal = JSON.parse(await readClaimBytes(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readClaimBytes(INDEX, INDEX_SHA))
  if (
    terminal.schema !== 'appraise.m02-r37-native-terminal/v1' ||
    terminal.exitCode !== 1 ||
    terminal.status !== 'UNKNOWN' ||
    terminal.completed !== 20 ||
    terminal.failedCase !== 'B07-D01' ||
    terminal.runtimeQualified !== false ||
    terminal.root !== OLD_ROOT ||
    terminal.manifestDigest !== MANIFEST_DIGEST ||
    terminal.manifestFileSha256 !== MANIFEST_SHA ||
    terminal.sourceHostCapacityReserved !== 54 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(terminal.pending, []) ||
    !isDeepStrictEqual(terminal.lateCaseDiagnostics, [FAILED_DIAGNOSTIC]) ||
    terminal.completedCases?.length !== 20 ||
    terminal.cleanupQualification !== 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN' ||
    !isDeepStrictEqual(terminal.consumed, R37_COUNTS) ||
    terminal.journal?.chainVerified !== true ||
    terminal.journal.records !== 841 ||
    terminal.journal.reservations !== 398 ||
    terminal.journal.ACKs !== 398 ||
    !isDeepStrictEqual(terminal.protocolFailures, []) ||
    terminal.noResendOrResume !== true ||
    terminal.T2 !== 'INCOMPLETE' ||
    terminal.T3 !== 'INCOMPLETE' ||
    terminal.M02 !== 'INCOMPLETE' ||
    index.schema !== 'appraise.m02-r37-native-terminal-evidence-index/v1' ||
    index.root !== OLD_ROOT ||
    !isDeepStrictEqual(index.rootIdentity, terminal.rootIdentity) ||
    index.rootIdentity?.dev !== 16777233 ||
    index.rootIdentity?.ino !== 70735585 ||
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
    index.files.length !== 135 ||
    !isDeepStrictEqual(index.files.map(row => row.copy).sort(), [...names].sort())
  )
    fail('closed sanitized membership drift')
  await assertHistoricalRoot(OLD_ROOT, index.rootIdentity)
  const directories = [dirname(INDEX)]
  const parents = []
  for (const directory of directories) {
    const stat = await fs.lstat(directory)
    if (!privateDirectory(stat)) fail('ancestor ownership or mode drift')
    parents.push({ directory, stat })
  }
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
    const copy = await readHistoricalPair(row, INDEX, expected)
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
  for (const [at, item] of CASES.slice(0, 20).entries())
    verifyCase(item, terminal.completedCases[at], receipts, finished.get(item.id))
  const failedPlan = receipts.get('B07-D01--script-plan.json'),
    first = receipts.get('B07-D01--provider-response-1.json'),
    continuation = receipts.get('B07-D01--provider-response-2.json'),
    failedStartup = receipts.get('B07-D01--mcp-startup.json'),
    failedExit = receipts.get('B07-D01--mcp-exit.json')
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
      value.caseId !== 'B07-D01'
    )
      fail('failed D01 receipt envelope drift')
  if (
    !isDeepStrictEqual(receipts.get('B07-D01--late-case-failure.json'), FAILED_DIAGNOSTIC) ||
    !isDeepStrictEqual(
      validateProcessStateDiagnostic(FAILED_DIAGNOSTIC.processStates),
      FAILED_DIAGNOSTIC.processStates,
    ) ||
    failedPlan.planSha256 !== 'bafbcf0a46f653647ed53b60675d3380bc556cdd02acb0b6bae66a517b96645d' ||
    !Array.isArray(failedPlan.calls) ||
    failedPlan.calls.length !== 1 ||
    !isDeepStrictEqual(failedPlan.calls[0], {
      callId: 'm02_B07_D01_0',
      operation: 'quality_journey_external_scenarios_submit_v1',
      argumentsHash: '5a2c106abbd64c1ca0adcef50b4f4cd67307f53d0974665178ee45cf55c54194',
      scriptSha256: '139f493f159ba2f829bb45fb0178eeafd6e7b5cd138aa4729ecc6a844256ba8d',
      rejection: false,
    }) ||
    first.requestIndex !== 1 ||
    first.decodedStatus !== null ||
    first.decodedResultHash !== null ||
    continuation.requestIndex !== 2 ||
    continuation.decodedStatus !== 'RESULT_CORRELATED' ||
    !SHA256.test(continuation.decodedResultHash ?? '') ||
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
      caseId: 'B07-D01',
      bootstrapProof,
      profileDigest: failedStartup?.profileDigest,
    }) ||
    !verifyMcpChildReceipt({
      receipt: failedExit,
      event: 'node-exit-handler',
      caseId: 'B07-D01',
      bootstrapProof,
      profileDigest: failedStartup?.profileDigest,
    })
  )
    fail('failed D01 observed diagnostic, script, continuation, or MCP drift')
  for (const { directory, stat } of parents) {
    const after = await fs.lstat(directory)
    if (!privateDirectory(after) || !same(stat, after)) fail('ancestor changed')
  }
  await assertHistoricalRoot(OLD_ROOT, index.rootIdentity)
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({
    ...old,
    prepared,
    r37TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: TERMINAL_SHA,
      indexPath: INDEX,
      indexSha256: INDEX_SHA,
      manifestFileSha256: MANIFEST_SHA,
      manifestDigest: MANIFEST_DIGEST,
      status: 'UNKNOWN',
      casesCompleted: 20,
      failedCase: 'B07-D01',
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
      currentOriginalRootIdentity: 'UNKNOWN',
      consumed: R37_COUNTS,
      sourceCapacityReserved: 54,
      actualSourceHostCount: 'UNATTESTED',
      pending: Object.freeze([]),
      boundedCleanupOnlyNotGlobalProcessAbsence: true,
      failureStage: 'GIT_READINESS',
      failureReason: 'GIT_READINESS_CASE_BUDGET_EXHAUSTED',
      gitReadiness: Object.freeze({ ...FAILED_DIAGNOSTIC.gitReadiness }),
      processStates: structuredClone(FAILED_DIAGNOSTIC.processStates),
      historicalCause: 'UNKNOWN',
      fullT2Qualification: false,
      runtimeQualified: false,
    }),
  })
}
