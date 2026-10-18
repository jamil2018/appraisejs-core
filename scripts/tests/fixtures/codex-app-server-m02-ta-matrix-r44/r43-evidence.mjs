/** Exact consumed R43 single A12 completion; bounded cleanup only, never full T2 or global inventory proof. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { verifyR41Predecessor } from '../codex-app-server-m02-ta-matrix-r43/r41-evidence.mjs'
import { serializeR43Preparation } from '../codex-app-server-m02-ta-matrix-r43/preparation.mjs'
import { verifyR43HistoricalClosure } from '../codex-app-server-m02-ta-matrix-r43/runtime-effects.mjs'
import { readStableFile } from '../codex-app-server-m02-ta-matrix-r43/r21-evidence.mjs'
import { requireTA04Absent } from '../codex-app-server-m02-ta-matrix-r43/prior-evidence.mjs'
import { POLICY as R43_POLICY } from '../codex-app-server-m02-ta-matrix-r43/policy.mjs'
import { validateChildPathDiagnostics } from '../codex-app-server-m02-ta-matrix-r43/child-path-diagnostic.mjs'
import { validateProcessStateDiagnostic } from '../codex-app-server-m02-ta-matrix-r43/process-state-diagnostic.mjs'
import { verifyMcpChildReceipt } from '../codex-app-server-m02-ta-matrix-r10/mcp-readiness.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { digest, ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const OLD_ROOT = '/private/tmp/appraise-m02-ta-matrix-p25'
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r43/manifest.json')
const MANIFEST_SHA = 'c8ae4b630f1119e1e15ed1b0111391e936a07645d62d63c867328bf26cebe2dc'
const MANIFEST_DIGEST = 'b08040ca5bdef5e6f33e7b8b3d8981591b81f3bbc468188bfeb06e3267e3a26e'
const TERMINAL = join(REPO, '.appraisejs/m02-r43-native-terminal-01.json')
const TERMINAL_SHA = '98e54f7a3b7d9d10e957c0f48b59f9cd6f7619ad9c6e7981ad785af4c0ab6421'
const INDEX = join(REPO, '.appraisejs/m02-r43-native-terminal-evidence-01/index.json')
const INDEX_SHA = 'f5d4e7ade6370e0209e84cc37ea2d787fc7923abc63a69fdb7b3974d21ada1ad'
const CASES = Object.freeze(R43_POLICY.cases.filter(item => item.phase === 'T2'))
export const R43_COUNTS = Object.freeze({
  listenerStarts: 1,
  controlWrites: 3,
  codexStarts: 1,
  mcpStarts: 1,
  threadStarts: 1,
  canonicalRequests: 2,
  turnStarts: 1,
  providerRequests: 2,
  outerCalls: 1,
  scopedCalls: 0,
  workspaceActions: 0,
  permissionReplies: 0,
  helperStarts: 0,
  auditRequests: 0,
})
const SHA256 = /^[a-f0-9]{64}$/
const KINDS = Object.freeze([...Object.keys(R43_POLICY.aggregate), 'outerCalls', 'auditRequests'])
const same = (a, b) => a?.dev === b?.dev && a?.ino === b?.ino
const sameFile = (a, b) =>
  ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key])
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = reason => {
  throw new Error(`R44 consumed R43 ${reason}`)
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
const AUTHORITY_PINS = Object.freeze({
  context: [
    '.appraisejs/m02-r43-user-authorization-context-01.json',
    'ac330d7953ddb087e25770fc43c0fd3f9036997df16ec65633b458b3a466bb79',
  ],
  decision: [
    '.appraisejs/m02-t2-r43-recovery-user-decision.json',
    '46812257ea8aca0aafa58beb567f79f40e958c54a3d34bbbafb906214cc212b8',
  ],
  review: [
    '.appraisejs/m02-t2-r43-exact-review.json',
    '614652bd72596b9bba049f8a16c59385b7715d70452096a486149cfc2f352bac',
  ],
  focused: [
    '.appraisejs/m02-r43-focused-review-01.json',
    'dc54a8ee05df7067c3ec627a8939d5a724d96e0a57161d9dbee0c918c626cde9',
  ],
  submission: [
    '.appraisejs/m02-r43-approved-native-submission-01.json',
    '712ea04e5ec9c60ce2d96224c427a969688717122d3fcbb66bc3e70e83b9543c',
  ],
})
const FIXED_COMMAND =
  "/usr/bin/env -i PATH=/usr/bin:/bin LANG=C /opt/homebrew/Cellar/node/26.11.0/bin/node '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r43/entrypoint.mjs' --run '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r43/manifest.json' b08040ca5bdef5e6f33e7b8b3d8981591b81f3bbc468188bfeb06e3267e3a26e c8ae4b630f1119e1e15ed1b0111391e936a07645d62d63c867328bf26cebe2dc 614652bd72596b9bba049f8a16c59385b7715d70452096a486149cfc2f352bac 46812257ea8aca0aafa58beb567f79f40e958c54a3d34bbbafb906214cc212b8"

async function readPrepared() {
  const bytes = await readStableFile(MANIFEST, MANIFEST_SHA)
  const prepared = JSON.parse(bytes)
  if (
    prepared.schema !== 'appraise.m02-ta-matrix-r43-preparation/v1' ||
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
    prepared.canonicalSha256 !== '99ad21be9a11487d82036d0b3c71cda3fd2146d24265cd54f822b1d665b869ef'
  )
    fail('preparation drift')
  const history = await verifyR43HistoricalClosure(prepared.manifest)
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
  if (current !== 8661 || history.size !== 23 || paths.size !== 8684) fail('closure drift')
  const canonicalBytes = await readStableFile(join(dirname(MANIFEST), 'canonical-bridge.mjs'), prepared.canonicalSha256)
  if (!bytes.equals(serializeR43Preparation({ ...prepared, canonicalBytes }))) fail('serialized preparation drift')
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
    context.schema !== 'appraise.m02-r43-user-authorization-context/v1' ||
    context.authorizedAction !== 'ONE_FRESH_R43_P25_A12_INVOCATION' ||
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
    decision.verdict !== 'AUTHORIZE_ONE_FIXED_A12_R43_INVOCATION' ||
    decision.exactArtifactUserApprovalClaimed !== false ||
    decision.authorizationContext?.path !== join(REPO, AUTHORITY_PINS.context[0]) ||
    decision.authorizationContext.sha256 !== AUTHORITY_PINS.context[1] ||
    decision.manifestDigest !== MANIFEST_DIGEST ||
    decision.manifestFileSha256 !== MANIFEST_SHA ||
    decision.exactReviewSha256 !== AUTHORITY_PINS.review[1] ||
    decision.historicalAvailabilitySha256 !== sha(JSON.stringify(prepared.manifest.historicalAvailability)) ||
    review.verdict !== 'ACCEPT_ONE_FIXED_A12_R43_INVOCATION' ||
    review.exactArtifactUserApprovalClaimed !== false ||
    review.manifest.fileSha256 !== MANIFEST_SHA ||
    review.manifest.manifestDigest !== MANIFEST_DIGEST ||
    review.historicalAvailabilitySha256 !== sha(JSON.stringify(prepared.manifest.historicalAvailability)) ||
    review.independentReportSha256 !== AUTHORITY_PINS.focused[1] ||
    focused.verdict !== 'ACCEPT_R43_A12_FIRST_PATH_DIAGNOSTIC_CANDIDATE_ONLY' ||
    !isDeepStrictEqual(
      context.cumulativeWholeCampaignCeilings,
      prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    ) ||
    submission.schema !== 'appraise.m02-native-submission/v1' ||
    submission.campaign !== 'R43' ||
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

const WITNESS = '7c001722bf900b6dd55425b2f0dc581a41eb1d40c6ef230c12b3cff4d812d60f'
const GIT_READINESS = Object.freeze({
  samples: 9,
  gitObserved: true,
  gitIdentityCount: 3,
  gitGone: true,
  gitPidReused: false,
  hostObserved: true,
  hostIdentityStable: true,
  readinessComplete: true,
})
const ENVIRONMENT_PROFILE = Object.freeze({
  profile: 'appraise.m02-r43-explicit-launch-environment/v1',
  directoryIdentity: {
    dev: 16777233,
    ino: 71199512,
  },
  empty: true,
  observation: 'TRUSTED_DIRECTORY_CHECK_NOT_FILESYSTEM_CONTAINMENT',
})
const STATE_OBSERVATIONS = Object.freeze({
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
        RUNNABLE: 12,
        SLEEPING: 0,
        STOPPED: 0,
        ZOMBIE: 0,
        OTHER: 0,
      },
      goneObserved: true,
    },
    {
      ordinal: 3,
      counts: {
        RUNNABLE: 2,
        SLEEPING: 0,
        STOPPED: 0,
        ZOMBIE: 0,
        OTHER: 0,
      },
      goneObserved: true,
    },
  ],
  overflow: false,
  unavailable: false,
  additionalOsQueries: 0,
  rawArgumentsOrEnvironmentRead: false,
})
const CHILD_PATH_OBSERVATIONS = Object.freeze({
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
  firstUnreviewedPath: null,
  overflow: true,
  unavailable: false,
  additionalOsQueries: 0,
  rawPathRetained: false,
})

function verifyJournal(bytes, terminal, index, prepared) {
  const text = bytes.toString('utf8')
  if (!text.endsWith('\n')) fail('journal partial line')
  const records = text
    .slice(0, -1)
    .split('\n')
    .map(line => JSON.parse(line))
  const counts = Object.fromEntries(KINDS.map(kind => [kind, 0]))
  const reserved = new Set(),
    pending = new Set(),
    types = new Map()
  let previous = '0'.repeat(64),
    begun = 0,
    finished = 0,
    source = 0,
    active = null,
    acknowledgements = 0
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
      fail('unexpected journal event')
    types.set(event.type, (types.get(event.type) ?? 0) + 1)
    if (
      event.type === 'init' &&
      (position !== 0 ||
        event.phase !== 'T2' ||
        event.policyDigest !== prepared.manifest.journalBasePolicyDigest ||
        !same(event.directoryIdentity, index.rootIdentity) ||
        !same(event.fileIdentity, { dev: 16777233, ino: 71193090 }) ||
        !same(event.fileIdentity, index.files.find(item => item.copy === 'phase-journal.jsonl')?.originalIdentity))
    )
      fail('journal init drift')
    if (event.type !== 'init' && position === 0) fail('journal init missing')
    if (event.type === 'begin') {
      if (
        active !== null ||
        begun !== 0 ||
        event.caseId !== 'B07-A12' ||
        event.sourceHostCapacity !== 2 ||
        event.evidenceClass !== 'SOURCE_BOUND_CAPACITY_RESERVED'
      )
        fail('begin or source allocation drift')
      active = event.caseId
      begun++
      source += event.sourceHostCapacity
    }
    if (event.type === 'reserve') {
      if (
        active !== 'B07-A12' ||
        !KINDS.includes(event.kind) ||
        typeof event.id !== 'string' ||
        reserved.has(event.id) ||
        !event.id.startsWith('B07-A12-')
      )
        fail('reservation drift')
      reserved.add(event.id)
      pending.add(event.id)
      counts[event.kind]++
      if (!countsValid(counts, CASES[0])) fail('per-case reservation ceiling drift')
    }
    if (event.type === 'ack') {
      if (active !== 'B07-A12' || !pending.delete(event.id)) fail('ACK without bound pending reservation')
      acknowledgements++
    }
    if (event.type === 'finish') {
      if (
        position !== records.length - 2 ||
        active !== 'B07-A12' ||
        finished !== 0 ||
        pending.size ||
        event.cleanupKnown !== true ||
        event.outcome !== 'no-effect' ||
        event.caseWitnessSha256 !== WITNESS ||
        !isDeepStrictEqual(counts, terminal.completedCases[0].counts)
      )
        fail('finish witness drift')
      active = null
      finished++
    }
    if (
      event.type === 'checkpoint' &&
      (position !== records.length - 1 ||
        active !== null ||
        finished !== 1 ||
        pending.size ||
        !isDeepStrictEqual(event, { type: 'checkpoint' }))
    )
      fail('terminal checkpoint drift')
  }
  if (
    records.length !== 30 ||
    index.journalRecords !== 30 ||
    terminal.journal.records !== 30 ||
    previous !== index.journalLastHash ||
    previous !== terminal.journal.terminalHash ||
    begun !== 1 ||
    finished !== 1 ||
    source !== 2 ||
    active !== null ||
    reserved.size !== 13 ||
    acknowledgements !== 13 ||
    pending.size ||
    !isDeepStrictEqual(counts, R43_COUNTS) ||
    !isDeepStrictEqual(counts, terminal.consumed) ||
    !isDeepStrictEqual(Object.fromEntries(types), {
      init: 1,
      begin: 1,
      reserve: 13,
      ack: 13,
      finish: 1,
      checkpoint: 1,
    }) ||
    records.at(-2).event.type !== 'finish' ||
    records.at(-1).event.type !== 'checkpoint'
  )
    fail('terminal journal accounting drift')
  return true
}

function expectedNames() {
  return new Set([
    'phase-journal.jsonl',
    ...[
      'script-plan.json',
      'provider-response-1.json',
      'provider-response-2.json',
      'mcp-startup.json',
      'mcp-exit.json',
      'case-outcome.json',
    ].map(name => `B07-A12--${name}`),
  ])
}

function verifyCompletedWitness(receipts, terminal) {
  const completed = terminal.completedCases[0],
    outcome = receipts.get('B07-A12--case-outcome.json')
  if (
    completed.caseId !== 'B07-A12' ||
    completed.outcome !== 'no-effect' ||
    completed.caseWitnessSha256 !== WITNESS ||
    completed.cleanupKnown !== true ||
    !isDeepStrictEqual(completed.counts, R43_COUNTS) ||
    !isDeepStrictEqual(completed.gitReadiness, GIT_READINESS) ||
    !isDeepStrictEqual(completed.environmentProfile, ENVIRONMENT_PROFILE) ||
    !isDeepStrictEqual(completed.processStates, STATE_OBSERVATIONS) ||
    completed.permissionRequestDiagnostic !== null ||
    completed.canonicalAccepted !== true ||
    completed.listenerClosed !== true ||
    outcome?.schema !== 'appraise.m02-ta-matrix-supervisor-receipt/v1' ||
    outcome.evidenceClass !== 'TRUSTED_SUPERVISOR_OBSERVATION' ||
    outcome.name !== 'case-outcome' ||
    outcome.status !== 'OBSERVED_BEFORE_CASE_COMMIT' ||
    outcome.caseId !== 'B07-A12' ||
    outcome.manifestDigest !== MANIFEST_DIGEST ||
    outcome.expected !== completed.outcome ||
    outcome.outcomeEvidenceClass !== 'TRUSTED_SCRIPTED_CONFORMANCE_NOT_CONTAINMENT' ||
    !isDeepStrictEqual(outcome.canonical, {
      acceptances: 0,
      artifacts: 0,
      effects: 0,
      evidenceClass: 'DISPOSABLE_CANONICAL_DATABASE_READ',
      accepted: true,
    }) ||
    !isDeepStrictEqual(outcome.ownedCodex, { exit: { code: 0, signal: null }, close: { code: 0, signal: null } }) ||
    outcome.hostCleanup?.pidReused !== false ||
    outcome.hostCleanup.originalHostGone !== true ||
    !isDeepStrictEqual(outcome.hostObservation, outcome.hostCleanup.observedHost) ||
    !isDeepStrictEqual(outcome.environmentProfile, completed.environmentProfile) ||
    !isDeepStrictEqual(outcome.processStates, completed.processStates) ||
    outcome.permissionRequestDiagnostic !== undefined ||
    !isDeepStrictEqual(outcome.childPaths, CHILD_PATH_OBSERVATIONS) ||
    !isDeepStrictEqual(validateChildPathDiagnostics(outcome.childPaths), outcome.childPaths) ||
    outcome.childPaths.firstUnreviewedPath !== null ||
    !isDeepStrictEqual(validateProcessStateDiagnostic(outcome.processStates), outcome.processStates) ||
    outcome.journalSeq !== 28 ||
    outcome.listenerClosed !== true ||
    outcome.pending !== 0 ||
    !isDeepStrictEqual(outcome.counts, completed.counts) ||
    !isDeepStrictEqual(outcome.gitReadiness, completed.gitReadiness)
  )
    fail('completed canonical or bounded-cleanup witness drift')
  const plan = receipts.get('B07-A12--script-plan.json'),
    first = receipts.get('B07-A12--provider-response-1.json'),
    continuation = receipts.get('B07-A12--provider-response-2.json')
  for (const [name, receipt] of [
    ['script-plan', plan],
    ['provider-response-1', first],
    ['provider-response-2', continuation],
  ])
    if (
      receipt?.schema !== outcome.schema ||
      receipt.evidenceClass !== outcome.evidenceClass ||
      receipt.name !== name ||
      receipt.caseId !== 'B07-A12'
    )
      fail('A12 script or provider receipt envelope drift')
  if (
    plan.planSha256 !== 'a2bd70b2a667ee2782d34a57507db8750bc5eec3d96de54b507d2f8877ff307f' ||
    !isDeepStrictEqual(plan.calls, [
      {
        callId: 'm02_B07_A12_0',
        operation: 'quality_journey_execution_start',
        argumentsHash: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
        scriptSha256: 'a0fa7d430b6e15868e974a7ee77bbf84efd1f04c541265c4ca6c298986b19570',
        rejection: true,
      },
    ]) ||
    first.requestIndex !== 1 ||
    first.decodedStatus !== null ||
    first.decodedResultHash !== null ||
    continuation.requestIndex !== 2 ||
    continuation.decodedStatus !== 'NO_MCP_DISPATCH' ||
    continuation.decodedResultHash !== null ||
    [first, continuation].some(
      value =>
        value.planSha256 !== plan.planSha256 ||
        !SHA256.test(value.responseSha256 ?? '') ||
        !/^sha256:[a-f0-9]{64}$/.test(value.requestByteHash ?? '') ||
        !/^sha256:[a-f0-9]{64}$/.test(value.descriptorHash ?? '') ||
        !/^sha256:[a-f0-9]{64}$/.test(value.wrapperDescriptorHash ?? ''),
    ) ||
    first.descriptorHash !== continuation.descriptorHash ||
    first.wrapperDescriptorHash !== continuation.wrapperDescriptorHash
  )
    fail('A12 pinned rejection plan or NO_MCP_DISPATCH continuation drift')
  const startup = receipts.get('B07-A12--mcp-startup.json'),
    exit = receipts.get('B07-A12--mcp-exit.json')
  const proof = { capabilityHash: startup?.capabilityHash, bootstrapHash: startup?.bootstrapHash }
  if (
    !verifyMcpChildReceipt({
      receipt: startup,
      event: 'sdk-connect-returned',
      caseId: 'B07-A12',
      bootstrapProof: proof,
      profileDigest: startup?.profileDigest,
    }) ||
    !verifyMcpChildReceipt({
      receipt: exit,
      event: 'node-exit-handler',
      caseId: 'B07-A12',
      bootstrapProof: proof,
      profileDigest: startup?.profileDigest,
    }) ||
    outcome.childEvidence?.evidenceClass !== 'TRUSTED_CHILD_SELF_REPORT' ||
    !isDeepStrictEqual(outcome.childEvidence.receipt, exit) ||
    outcome.childEvidence.sha256 !== sha(JSON.stringify(exit))
  )
    fail('MCP startup or exit self-report witness drift')
}

export async function verifyR43Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR41Predecessor({ requireNewRootAbsent: false })
  const prepared = await readPrepared()
  await verifyAuthority(prepared)
  const terminal = JSON.parse(await readStableFile(TERMINAL, TERMINAL_SHA))
  const index = JSON.parse(await readStableFile(INDEX, INDEX_SHA))
  if (
    terminal.schema !== 'appraise.m02-r43-native-terminal/v1' ||
    terminal.evidenceClass !==
      'NATIVE_EXEC_TOOL_TERMINAL_TRANSCRIPTION_CORROBORATED_BY_HASH_VERIFIED_JOURNAL_AND_CASE_WITNESSES' ||
    terminal.toolSession !== 83875 ||
    terminal.exitCode !== 0 ||
    terminal.status !== 'A12_DIAGNOSTIC_CASE_COMPLETED_NOT_FULL_T2' ||
    terminal.completed !== 1 ||
    terminal.failedCase !== null ||
    terminal.runtimeQualified !== false ||
    terminal.root !== OLD_ROOT ||
    terminal.manifestDigest !== MANIFEST_DIGEST ||
    terminal.manifestFileSha256 !== MANIFEST_SHA ||
    terminal.sourceHostCapacityReserved !== 2 ||
    terminal.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(terminal.pending, []) ||
    !isDeepStrictEqual(terminal.lateCaseDiagnostics, []) ||
    !isDeepStrictEqual(terminal.protocolFailures, []) ||
    terminal.completedCases?.length !== 1 ||
    terminal.cleanupQualification !== 'A12_BOUNDED_CASE_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED' ||
    !isDeepStrictEqual(terminal.consumed, R43_COUNTS) ||
    terminal.journal?.chainVerified !== true ||
    terminal.journal.reservations !== 13 ||
    terminal.journal.ACKs !== 13 ||
    terminal.noResendOrResume !== true ||
    terminal.T2 !== 'INCOMPLETE' ||
    terminal.T3 !== 'INCOMPLETE' ||
    terminal.M02 !== 'INCOMPLETE' ||
    index.schema !== 'appraise.m02-r43-native-terminal-evidence-index/v1' ||
    index.root !== OLD_ROOT ||
    !isDeepStrictEqual(index.rootIdentity, terminal.rootIdentity) ||
    index.rootIdentity?.dev !== 16777233 ||
    index.rootIdentity?.ino !== 71193089 ||
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
    index.files.length !== 7 ||
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
  let journalVerified = false
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
      journalVerified = verifyJournal(copy, terminal, index, prepared)
    } else {
      if (name === 'case-outcome.json' && row.sha256 !== WITNESS) fail('case witness pin drift')
      receipts.set(row.copy, JSON.parse(copy))
    }
  }
  if (!journalVerified) fail('journal missing')
  verifyCompletedWitness(receipts, terminal)
  for (const { directory, stat } of parents) {
    const after = await fs.lstat(directory)
    if (!privateDirectory(after) || !same(stat, after)) fail('ancestor changed')
  }
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({
    ...old,
    prepared,
    r43TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: TERMINAL_SHA,
      indexPath: INDEX,
      indexSha256: INDEX_SHA,
      manifestFileSha256: MANIFEST_SHA,
      manifestDigest: MANIFEST_DIGEST,
      status: 'A12_DIAGNOSTIC_CASE_COMPLETED_NOT_FULL_T2',
      casesCompleted: 1,
      completedCases: Object.freeze([
        Object.freeze({ caseId: 'B07-A12', outcome: 'no-effect', caseWitnessSha256: WITNESS, cleanupKnown: true }),
      ]),
      failedCase: null,
      cleanup: 'A12_BOUNDED_CASE_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED',
      cleanupQualification: 'A12_BOUNDED_CASE_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED',
      root: OLD_ROOT,
      rootIdentity: Object.freeze({ ...index.rootIdentity }),
      consumed: R43_COUNTS,
      sourceCapacityReserved: 2,
      actualSourceHostCount: 'UNATTESTED',
      pending: Object.freeze([]),
      caseWitnessSha256: WITNESS,
      boundedCleanupOnlyNotGlobalProcessAbsence: true,
      gitReadiness: structuredClone(GIT_READINESS),
      environmentProfile: structuredClone(ENVIRONMENT_PROFILE),
      processStates: structuredClone(STATE_OBSERVATIONS),
      childPaths: structuredClone(CHILD_PATH_OBSERVATIONS),
      firstUnreviewedPath: null,
      nativeContinuationStatus: 'NO_MCP_DISPATCH',
      permissionRequestDiagnostic: null,
      r41HistoricalCause: 'UNKNOWN',
      runtimeQualified: false,
      fullT2Qualification: false,
    }),
  })
}
