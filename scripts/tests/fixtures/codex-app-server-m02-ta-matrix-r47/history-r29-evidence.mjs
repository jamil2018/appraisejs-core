/** TA06 additive archival semantic replay. Recorded original identities remain historical; current original identity is UNKNOWN. */
/** Exact partial R29 evidence: seven accepted cases, failed A02 UNKNOWN, no replay or cleanup inference. */
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
import { verifyR28Predecessor } from './history-r28-success-evidence.mjs'
import { serializeR29Preparation } from '../codex-app-server-m02-ta-matrix-r29/preparation.mjs'

import { requireTA04Absent } from '../codex-app-server-m02-ta-matrix-r30/prior-evidence.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { digest, ROOT } from '../codex-app-server-m02-ta-matrix-r30/policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const OLD_ROOT = '/private/tmp/appraise-m02-ta-matrix-p15'
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r29-02/manifest.json')
const MANIFEST_SHA = 'aa41fe39b5c72d2eb8d14bc2493e7c3405543af03e186645bead4148400a629e'
const MANIFEST_DIGEST = '9aa36fb47357e2c5780c52ea844644506c2202fa27219f5265bb83beab368170'
const TERMINAL = join(REPO, '.appraisejs/m02-r29-native-terminal-01.json')
const TERMINAL_SHA = 'c2e1e3d5a210325341ef19c51e6a35a279742d2e5ff769b365d9f99b480b7717'
const INDEX = join(REPO, '.appraisejs/m02-r29-native-terminal-evidence-01/index.json')
const INDEX_SHA = '8e41f88b999f6455383a937645845172f62d926be4fb0c1deb9ab04f822c9445'
const CASES = Object.freeze(['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07-A01', 'B07-A02'])
const WITNESSES = Object.freeze([
  'efc5aa1e0871e027dd4b818722f284519db01d663fdbeeeffd881fe1bb278aa6',
  '828cd4ae0443ccdd1b730d947f0127112170437da5c62905e3faf257c60813f4',
  'fd5964bd4cdf9cedcdda20cb5a5e69c25daf76d4eabc102b116e41d41bc1b731',
  'e11f8a5f75ff04e04b6ca27b6faec3b43d84429a7bc463638869ebae554a41ee',
  'df71c11f01b3c3ed429bb77ee7c9e804cd0f12f7e61ae9af8674a4183d1c180b',
  '56a43546a88514748d856037fd0f3a2dccd07b3d767d2887f7636a48fd3d4336',
  'd6457769b7c4cd2cc58d3324c548aaf5fa7dad7f9fc67e845b63963f577b4b63',
])
const AUTHORITY_PINS = Object.freeze({
  context: [
    '.appraisejs/m02-r29-user-authorization-context-01.json',
    '1835c2fd4f7b50f380360d3aaec9a508cf441aee58cc5201307c42ddbfccae55',
  ],
  decision: [
    '.appraisejs/m02-t2-r29-recovery-user-decision.json',
    '5b461ce0f35c6e57151338cc5515a2c6e0df7e450fed29a79a7866d6bf618fc9',
  ],
  review: [
    '.appraisejs/m02-t2-r29-exact-review.json',
    '5f97b9686d56b501ad9e5a3f9f619ff685c29ff8d49a42efaaf2c21fa48f14f8',
  ],
  focused: [
    '.appraisejs/m02-r29-focused-review-02.json',
    'ec22d601586f91dedd955eb05440de1cb97cfc6094abfeacc49fe32586db3f67',
  ],
  submission: [
    '.appraisejs/m02-r29-approved-native-submission-01.json',
    '9ce75c67fe2b2521375dd83ff97b4cb70c9a41f3123d547be68cf614a107ec2d',
  ],
})
export const R29_COUNTS = Object.freeze({
  listenerStarts: 8,
  controlWrites: 24,
  codexStarts: 8,
  mcpStarts: 8,
  threadStarts: 8,
  canonicalRequests: 56,
  turnStarts: 8,
  providerRequests: 24,
  outerCalls: 16,
  auditRequests: 32,
  scopedCalls: 16,
  workspaceActions: 0,
  permissionReplies: 0,
  helperStarts: 0,
})
const fail = reason => {
  throw new Error(`R30 consumed R29 ${reason}`)
}
const same = (a, b) => a.dev === b.dev && a.ino === b.ino
const privateDirectory = value =>
  value.isDirectory() && !value.isSymbolicLink() && value.uid === process.getuid() && (value.mode & 0o777) === 0o700

async function readPrepared() {
  const bytes = await readClaimBytes(MANIFEST, MANIFEST_SHA)
  const prepared = JSON.parse(bytes)
  if (
    prepared.schema !== 'appraise.m02-ta-matrix-r29-preparation/v1' ||
    prepared.manifestDigest !== MANIFEST_DIGEST ||
    digest(prepared.manifest) !== MANIFEST_DIGEST ||
    prepared.manifest.root !== OLD_ROOT ||
    prepared.manifest.phase !== 'T2' ||
    prepared.manifest.cases.length !== 24 ||
    prepared.blockers?.length !== 0 ||
    prepared.runtimeEligible !== false
  )
    fail('preparation drift')
  const history = await verifyLegacyHistoricalClosure(prepared.manifest)
  const paths = new Set()
  let ancestralClaimsChecked = 0
  for (const row of prepared.manifest.artifacts) {
    if (paths.has(row.path)) fail('artifact duplicate')
    paths.add(row.path)
    if (history.has(row.path)) continue
    await readClaimBytes(row.path, row.sha256)
    ancestralClaimsChecked++
  }
  if (ancestralClaimsChecked !== 6959 || history.size !== 23 || paths.size !== 6982) fail('closure drift')
  const canonicalBytes = await readClaimBytes(join(dirname(MANIFEST), 'canonical-bridge.mjs'), prepared.canonicalSha256)
  if (!bytes.equals(serializeR29Preparation({ ...prepared, canonicalBytes }))) fail('serialized preparation drift')
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
    context.schema !== 'appraise.m02-r29-user-authorization-context/v1' ||
    context.authorizedAction !== 'ONE_FRESH_R29_P15_FULL_T2_INVOCATION' ||
    context.literalHashSpecificApprovalQuoteClaimed !== false ||
    context.manifest.path !== MANIFEST ||
    context.manifest.sha256 !== MANIFEST_SHA ||
    context.manifest.manifestDigest !== MANIFEST_DIGEST ||
    decision.verdict !== 'AUTHORIZE_ONE_FIXED_FULL_T2_R29_INVOCATION' ||
    decision.exactArtifactUserApprovalClaimed !== false ||
    decision.authorizationContext?.path !== join(REPO, AUTHORITY_PINS.context[0]) ||
    decision.authorizationContext.sha256 !== AUTHORITY_PINS.context[1] ||
    decision.manifestDigest !== MANIFEST_DIGEST ||
    decision.manifestFileSha256 !== MANIFEST_SHA ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    review.verdict !== 'ACCEPT_ONE_FIXED_FULL_T2_R29_INVOCATION' ||
    review.manifest.fileSha256 !== MANIFEST_SHA ||
    review.manifest.manifestDigest !== MANIFEST_DIGEST ||
    review.independentReportSha256 !== AUTHORITY_PINS.focused[1] ||
    focused.verdict !== 'ACCEPT_R29_FULL_T2_CANDIDATE_ONLY' ||
    !isDeepStrictEqual(
      context.cumulativeWholeCampaignCeilings,
      prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    ) ||
    submission.authorityContext !== join(REPO, AUTHORITY_PINS.context[0]) ||
    submission.oneFreshR29Only !== true ||
    !isDeepStrictEqual(submission.exactArgv, [...decision.exactInvocationPrefix, AUTHORITY_PINS.decision[1]])
  )
    fail('standing authority or review drift')
  await readClaimBytes(context.proposal.path, context.proposal.sha256)
  await readClaimBytes(context.standingAuthorization.path, context.standingAuthorization.sha256)
}

function verifyJournal(bytes, terminal, index, prepared) {
  const records = bytes
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line))
  let previous = '0'.repeat(64),
    begun = 0,
    finished = 0,
    source = 0,
    active = null,
    acknowledgements = 0
  const reserved = new Set(),
    pending = new Set()
  const counts = Object.fromEntries(Object.keys(R29_COUNTS).map(kind => [kind, 0]))
  const types = new Map()
  for (const [position, row] of records.entries()) {
    const hash = createHash('sha256')
      .update(JSON.stringify({ seq: row.seq, previous: row.previous, event: row.event }))
      .digest('hex')
    if (row.seq !== position + 1 || row.previous !== previous || row.hash !== hash) fail('journal chain drift')
    previous = row.hash
    const event = row.event
    if (!['init', 'begin', 'reserve', 'ack', 'finish', 'unknown', 'recovery'].includes(event.type))
      fail('unexpected journal event')
    types.set(event.type, (types.get(event.type) ?? 0) + 1)
    if (
      event.type === 'init' &&
      (position !== 0 ||
        event.phase !== 'T2' ||
        event.policyDigest !== prepared.manifest.journalBasePolicyDigest ||
        !same(event.directoryIdentity, index.rootIdentity))
    )
      fail('journal init drift')
    if (event.type === 'begin') {
      if (active !== null || event.caseId !== CASES[begun] || event.sourceHostCapacity !== (begun < 6 ? 4 : 2))
        fail('begin order or source allocation drift')
      active = event.caseId
      source += event.sourceHostCapacity
      begun++
    }
    if (event.type === 'reserve') {
      if (!active || !Object.hasOwn(counts, event.kind) || typeof event.id !== 'string' || reserved.has(event.id))
        fail('reservation drift')
      reserved.add(event.id)
      pending.add(event.id)
      counts[event.kind]++
    }
    if (event.type === 'ack') {
      if (!pending.delete(event.id)) fail('ACK drift')
      acknowledgements++
    }
    if (event.type === 'finish') {
      const completed = terminal.completedCases[finished]
      if (
        active !== CASES[finished] ||
        completed.caseId !== active ||
        pending.size ||
        event.cleanupKnown !== true ||
        event.outcome !== completed.outcome ||
        event.caseWitnessSha256 !== WITNESSES[finished]
      )
        fail('finish witness drift')
      active = null
      finished++
    }
    if (event.type === 'unknown' && (active !== 'B07-A02' || event.reason !== 'AMBIGUOUS_EFFECT'))
      fail('UNKNOWN outcome drift')
  }
  if (
    records.length !== 435 ||
    index.journalRecords !== 435 ||
    terminal.journal.records !== 435 ||
    previous !== index.journalLastHash ||
    previous !== terminal.journal.terminalHash ||
    begun !== 8 ||
    finished !== 7 ||
    source !== 28 ||
    active !== 'B07-A02' ||
    reserved.size !== 208 ||
    acknowledgements !== 208 ||
    pending.size ||
    !isDeepStrictEqual(counts, R29_COUNTS) ||
    !isDeepStrictEqual(Object.fromEntries(types), {
      init: 1,
      begin: 8,
      reserve: 208,
      ack: 208,
      finish: 7,
      unknown: 1,
      recovery: 2,
    }) ||
    records.at(-3).event.type !== 'unknown' ||
    records.at(-2).event.action !== 'owned-stop-intent' ||
    records.at(-1).event.action !== 'owned-stop-observed'
  )
    fail('terminal journal accounting drift')
}

export async function verifyR29Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR28Predecessor({ requireNewRootAbsent: false })
  const prepared = await readPrepared()
  await verifyAuthority(prepared)
  const terminal = JSON.parse(await readClaimBytes(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readClaimBytes(INDEX, INDEX_SHA))
  if (
    terminal.schema !== 'appraise.m02-r29-native-terminal/v1' ||
    terminal.status !== 'UNKNOWN' ||
    terminal.completed !== 7 ||
    terminal.failedCase !== 'B07-A02' ||
    terminal.runtimeQualified !== false ||
    terminal.root !== OLD_ROOT ||
    terminal.manifestDigest !== MANIFEST_DIGEST ||
    terminal.manifestFileSha256 !== MANIFEST_SHA ||
    terminal.sourceHostCapacityReserved !== 28 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(terminal.consumed, R29_COUNTS) ||
    !isDeepStrictEqual(terminal.pending, []) ||
    terminal.completedCases?.length !== 7 ||
    terminal.lateCaseDiagnostics?.length !== 1 ||
    terminal.cleanupQualification !== 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN' ||
    index.root !== OLD_ROOT ||
    index.schema !== 'appraise.m02-r29-native-terminal-evidence-index/v1' ||
    index.rootIdentity.dev !== 16777233 ||
    index.rootIdentity.ino !== 70309642 ||
    !isDeepStrictEqual(index.rootIdentity, terminal.rootIdentity) ||
    index.files?.length !== 57 ||
    index.journalChainVerified !== true ||
    index.runtimeAuthority !== false ||
    index.rawProviderAccountAuthHistoryOrDatabaseCopied !== false ||
    index.originalsRewritten !== false ||
    terminal.evidenceIndex.path !== INDEX ||
    terminal.evidenceIndex.sha256 !== INDEX_SHA
  )
    fail('terminal or index drift')
  const failed = terminal.lateCaseDiagnostics[0]
  if (
    failed.caseId !== 'B07-A02' ||
    failed.stage !== 'GIT_READINESS' ||
    failed.reason !== 'GIT_READINESS_POLL_BUDGET_EXHAUSTED' ||
    !isDeepStrictEqual(failed.gitReadiness, {
      samples: 11,
      gitObserved: true,
      gitIdentityCount: 1,
      gitGone: false,
      gitPidReused: false,
      hostObserved: true,
      hostIdentityStable: true,
      readinessComplete: false,
    })
  )
    fail('failed readiness observation drift')
  await assertHistoricalRoot(OLD_ROOT, index.rootIdentity)
  const directories = [dirname(INDEX)]
  const parents = []
  for (const directory of directories) {
    const stat = await fs.lstat(directory)
    if (!privateDirectory(stat)) fail('ancestor ownership or mode drift')
    parents.push({ directory, stat })
  }
  const names = new Set(['phase-journal.jsonl'])
  for (const [i, caseId] of CASES.entries()) {
    const requests = [3, 3, 4, 3, 3, 4, 2, 2][i]
    for (const name of [
      'script-plan.json',
      'mcp-startup.json',
      'mcp-exit.json',
      ...Array.from({ length: requests }, (_, at) => `provider-response-${at + 1}.json`),
      i < 7 ? 'case-outcome.json' : 'late-case-failure.json',
    ])
      names.add(`${caseId}--${name}`)
  }
  if (!isDeepStrictEqual(index.files.map(row => row.copy).sort(), [...names].sort())) fail('sanitized membership drift')
  for (const row of index.files) {
    const [caseId, name] = row.copy.split('--')
    const expected =
      row.copy === 'phase-journal.jsonl'
        ? join(OLD_ROOT, row.copy)
        : join(OLD_ROOT, 'cases', caseId, 'supervisor', name)
    if (row.originalPath !== expected) fail('sanitized path drift')
    const copy = await readHistoricalPair(row, INDEX, expected)
    if (row.copy === 'phase-journal.jsonl') {
      if (row.sha256 !== terminal.journal.sha256) fail('journal pin drift')
      verifyJournal(copy, terminal, index, prepared)
    }
    if (name === 'case-outcome.json') {
      const at = CASES.indexOf(caseId),
        value = JSON.parse(copy),
        completed = terminal.completedCases[at]
      if (
        row.sha256 !== WITNESSES[at] ||
        completed.caseId !== caseId ||
        completed.caseWitnessSha256 !== row.sha256 ||
        completed.cleanupKnown !== true ||
        completed.canonicalAccepted !== true ||
        completed.listenerClosed !== true ||
        value.caseId !== caseId ||
        value.manifestDigest !== MANIFEST_DIGEST ||
        value.expected !== completed.outcome ||
        value.canonical?.accepted !== true ||
        value.hostCleanup?.originalHostGone !== true ||
        value.listenerClosed !== true ||
        value.pending !== 0 ||
        !isDeepStrictEqual(value.counts, completed.counts) ||
        !isDeepStrictEqual(value.gitReadiness, completed.gitReadiness)
      )
        fail('completed witness drift')
    }
    if (name === 'late-case-failure.json' && !isDeepStrictEqual(JSON.parse(copy), failed)) fail('late failure drift')
  }
  for (const { directory, stat } of parents) {
    const after = await fs.lstat(directory)
    if (!privateDirectory(after) || !same(stat, after)) fail('ancestor changed')
  }
  await assertHistoricalRoot(OLD_ROOT, index.rootIdentity)
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({
    ...old,
    prepared,
    r29TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: TERMINAL_SHA,
      indexPath: INDEX,
      indexSha256: INDEX_SHA,
      status: 'UNKNOWN',
      casesCompleted: 7,
      completedCases: Object.freeze(
        terminal.completedCases.map((row, at) =>
          Object.freeze({
            caseId: CASES[at],
            outcome: row.outcome,
            caseWitnessSha256: WITNESSES[at],
            cleanupKnown: true,
          }),
        ),
      ),
      failedCase: 'B07-A02',
      cleanup: 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN',
      failedCaseCleanup: 'UNKNOWN',
      root: OLD_ROOT,
      rootIdentity: Object.freeze({ ...index.rootIdentity }),
      currentOriginalRootIdentity: 'UNKNOWN',
      consumed: R29_COUNTS,
      sourceCapacityReserved: 28,
      actualSourceHostCount: 'UNATTESTED',
      pending: Object.freeze([]),
      failureStage: 'GIT_READINESS',
      failureReason: 'GIT_READINESS_POLL_BUDGET_EXHAUSTED',
    }),
  })
}
