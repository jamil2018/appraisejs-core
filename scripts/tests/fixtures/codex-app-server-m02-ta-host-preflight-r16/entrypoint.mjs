/** Fixed command boundary. Import and --prepare cannot bind a listener. */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PREFLIGHT, reviewedEnvironment, sha256 } from '../codex-app-server-m02-ta-host-preflight-r14/policy.mjs'
import {
  MANIFEST,
  PROPOSAL,
  PROPOSAL_SHA,
  R16_POLICY,
  assertReadDeadline,
  verifyHostPreflightPreparation,
  writeHostPreflightPreparation,
} from './preparation.mjs'
import { runHostPreflight } from '../codex-app-server-m02-ta-host-preflight-r14/runner.mjs'
import { R16_ROOT, productionHostPreflightIo } from './filesystem-io.mjs'

const ENTRY = fileURLToPath(import.meta.url)
const REPO = resolve(dirname(ENTRY), '../../../../')
const REVIEW = join(REPO, '.appraisejs/m02-host-preflight-r16-exact-review.json')
const DECISION = join(REPO, '.appraisejs/m02-host-preflight-r16-user-decision.json')
const SHA = /^[a-f0-9]{64}$/

function prefix(digest, manifestSha) {
  return [
    '/usr/bin/env',
    '-i',
    'PATH=/usr/bin:/bin',
    'LANG=C',
    PREFLIGHT.node,
    ENTRY,
    '--run',
    MANIFEST,
    digest,
    manifestSha,
  ]
}

async function privateJson(file, { deadline, now = Date.now } = {}) {
  assertReadDeadline(deadline, now)
  const before = await fs.lstat(file)
  assertReadDeadline(deadline, now)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== process.getuid() ||
    before.nlink !== 1 ||
    (before.mode & 0o777) !== 0o600 ||
    before.size < 2 ||
    before.size > 65536
  )
    throw new Error('R16 approval file identity')
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    assertReadDeadline(deadline, now)
    const held = await handle.stat()
    assertReadDeadline(deadline, now)
    if (held.dev !== before.dev || held.ino !== before.ino || held.size !== before.size)
      throw new Error('R16 approval file replaced')
    const bytes = await handle.readFile()
    assertReadDeadline(deadline, now)
    const after = await handle.stat()
    assertReadDeadline(deadline, now)
    if (
      bytes.length !== before.size ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size
    )
      throw new Error('R16 approval file changed during read')
    return { value: JSON.parse(bytes), sha256: sha256(bytes) }
  } finally {
    await handle.close()
  }
}

export function assertExactApproval({ prepared, review, decision, requested, sourceSha256 }) {
  const [manifestDigest, manifestSha, reviewSha, decisionSha] = requested
  const base = prefix(manifestDigest, manifestSha)
  const source = prepared.manifest.sources.find(item => item.path === ENTRY)
  if (
    prepared.manifestDigest !== manifestDigest ||
    prepared.manifestFileSha256 !== manifestSha ||
    source?.sha256 !== sourceSha256 ||
    review.sha256 !== reviewSha ||
    decision.sha256 !== decisionSha ||
    prepared.manifest.version !== 'appraise.m02-ta-host-preflight-r16/v1' ||
    prepared.manifest.reusedResultSchema !== 'appraise.m02-ta-host-preflight-r14-result/v1' ||
    prepared.manifest.root !== R16_ROOT ||
    prepared.manifest.policy.root !== R16_ROOT ||
    JSON.stringify(prepared.manifest.policy) !== JSON.stringify(R16_POLICY) ||
    review.value?.schema !== 'appraise.m02-ta-host-preflight-r16-exact-review/v1' ||
    review.value.verdict !== 'ACCEPT_ONE_FIXED_R16_HOST_PREFLIGHT_INVOCATION' ||
    review.value.runtimeVerdict !== 'NOT_RUN' ||
    review.value.manifest?.path !== MANIFEST ||
    review.value.manifest.manifestDigest !== manifestDigest ||
    review.value.manifest.fileSha256 !== manifestSha ||
    review.value.proposal?.path !== PROPOSAL ||
    review.value.proposal.sha256 !== PROPOSAL_SHA ||
    review.value.root !== R16_ROOT ||
    review.value.requiredHostExecutionPermission !== 'exec_command sandbox_permissions=require_escalated' ||
    review.value.sourceEnforcementOfSandboxMode !== 'UNATTESTED' ||
    JSON.stringify(review.value.exactInvocationPrefix) !== JSON.stringify(base) ||
    decision.value?.schema !== 'appraise.m02-ta-host-preflight-r16-user-decision/v1' ||
    decision.value.decision !== 'APPROVE_ONE_FIXED_R16_HOST_PREFLIGHT' ||
    decision.value.evidenceClass !== 'VISIBLE_HOST_CONVERSATION_DECISION_TRANSCRIBED_NOT_CRYPTOGRAPHIC_ATTESTATION' ||
    decision.value.manifestDigest !== manifestDigest ||
    decision.value.manifestFileSha256 !== manifestSha ||
    decision.value.exactReviewSha256 !== reviewSha ||
    decision.value.proposal?.path !== PROPOSAL ||
    decision.value.proposal.sha256 !== PROPOSAL_SHA ||
    decision.value.requiredHostExecutionPermission !== 'exec_command sandbox_permissions=require_escalated' ||
    decision.value.noAutomaticT2Followon !== true ||
    JSON.stringify(decision.value.exactInvocationPrefix) !== JSON.stringify([...base, reviewSha])
  )
    throw new Error('R16 exact review or distinct user decision absent')
}

export async function runFixedPreflight({ verifyAuthorization, deadline, now, run = runHostPreflight }) {
  return await run({ verifyAuthorization, deadline, now, io: productionHostPreflightIo })
}

export async function dispatchHostPreflight(argv, ports = {}) {
  if (argv.length === 1 && argv[0] === '--prepare') return await (ports.prepare ?? writeHostPreflightPreparation)()
  if (argv.length !== 6 || argv[0] !== '--run' || argv[1] !== MANIFEST || argv.slice(2).some(value => !SHA.test(value)))
    throw new Error('R16 inert default; exact --run command required')
  const now = ports.now ?? Date.now
  const deadline = now() + PREFLIGHT.deadlineMs
  if (
    process.platform !== PREFLIGHT.platform ||
    process.arch !== PREFLIGHT.arch ||
    process.version !== `v${PREFLIGHT.nodeVersion}` ||
    process.execPath !== PREFLIGHT.node ||
    !reviewedEnvironment(process.env) ||
    process.cwd() !== REPO
  )
    throw new Error('R16 host tuple or clean environment changed')
  assertReadDeadline(deadline, now)
  const prepared = await (ports.verifyPrepared ?? verifyHostPreflightPreparation)({ deadline, now })
  assertReadDeadline(deadline, now)
  const sourceSha256 = prepared.manifest.sources.find(item => item.path === ENTRY)?.sha256
  if (!sourceSha256) throw new Error('R16 entry source pin missing')
  const [review, decision] = await Promise.all([
    (ports.readReview ?? (options => privateJson(REVIEW, options)))({ deadline, now }),
    (ports.readDecision ?? (options => privateJson(DECISION, options)))({ deadline, now }),
  ])
  assertReadDeadline(deadline, now)
  assertExactApproval({ prepared, review, decision, requested: argv.slice(2), sourceSha256 })
  const verifyAuthorization = async phase => {
    assertReadDeadline(deadline, now)
    if (phase === 'PRE_BIND') {
      const current = await (ports.verifyPrepared ?? verifyHostPreflightPreparation)({ deadline, now })
      assertReadDeadline(deadline, now)
      if (
        current.manifestDigest !== prepared.manifestDigest ||
        current.manifestFileSha256 !== prepared.manifestFileSha256 ||
        JSON.stringify(current.manifest) !== JSON.stringify(prepared.manifest)
      )
        throw new Error('R16 complete pinned closure changed before bind')
    }
    const [currentReview, currentDecision] = await Promise.all([
      (ports.readReview ?? (options => privateJson(REVIEW, options)))({ deadline, now }),
      (ports.readDecision ?? (options => privateJson(DECISION, options)))({ deadline, now }),
    ])
    assertReadDeadline(deadline, now)
    assertExactApproval({
      prepared,
      review: currentReview,
      decision: currentDecision,
      requested: argv.slice(2),
      sourceSha256,
    })
    return true
  }
  const result = await runFixedPreflight({
    verifyAuthorization,
    deadline,
    now,
    run: ports.run ?? runHostPreflight,
  })
  if (result?.status === 'OBSERVED_PERMISSION_CHECK_ONLY') {
    try {
      assertReadDeadline(deadline, now)
    } catch {
      return Object.freeze({
        schema: 'appraise.m02-ta-host-preflight-r14-result/v1',
        status: 'UNKNOWN',
        failure: { stage: 'FINAL_COMPLETION', errno: 'ETIMEDOUT' },
        resultFileCandidateOnly: true,
        resultFileAuthoritative: false,
        runtimeQualified: false,
        t2Authorized: false,
      })
    }
  }
  return result
}

if (process.argv[1] === ENTRY) {
  try {
    const result = await dispatchHostPreflight(process.argv.slice(2))
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (result?.status === 'UNKNOWN') process.exitCode = 1
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        schema: 'appraise.m02-ta-host-preflight-r16-blocked/v1',
        status: 'BLOCKED_NO_EFFECT',
        failure: error?.safeReceipt ?? { stage: 'APPROVAL_CHECK', errno: 'OTHER' },
        runtimeQualified: false,
        t2Authorized: false,
      })}\n`,
    )
    process.exitCode = 1
  }
}
