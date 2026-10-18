/** R22 recovery command boundary. Import, --verify, and --prepare are inert to native effects. */
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createRequire } from 'node:module'
import { isDeepStrictEqual } from 'node:util'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digest, POLICY } from './policy.mjs'
import { verifyR22HostFile } from './host-file.mjs'
import { verifyR21Predecessor } from './r21-evidence.mjs'
import { MATRIX_MANIFEST, verifyR22MatrixPreparation, writeR22MatrixPreparation } from './preparation.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const ENTRYPOINT = fileURLToPath(import.meta.url)
const NODE = '/opt/homebrew/Cellar/node/26.11.0/bin/node'
const REVIEW = join(REPO, '.appraisejs/m02-t2-r22-exact-review.json')
const ADDON = join(REPO, '.appraisejs/m02-owned-host-observer-build-01/mac-owned-host.node')
const DECISION = join(REPO, '.appraisejs/m02-t2-r22-recovery-user-decision.json')
const REVIEW_SCHEMA = 'appraise.m02-ta-t2-r22-exact-review/v1'
const REVIEW_VERDICT = 'ACCEPT_ONE_FIXED_T2_R22_INVOCATION'
const DECISION_SCHEMA = 'appraise.m02-ta-t2-r22-recovery-user-decision/v1'
const DECISION_VERDICT = 'APPROVE_ONE_FIXED_T2_R22_RECOVERY'
const REVIEWER = '/root/r22_review'
const requestActions = Object.freeze({
  'canonical-ipc-request': 'canonical',
  'scoped-audit-request': 'audit',
  'scripted-provider-request': 'request',
})
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const hex64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const macTextEncoding = value =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{1,8}:0x[0-9a-fA-F]{1,8}:0x[0-9a-fA-F]{1,8}(?![\s\S])/.test(value)
const invocationPrefix = (manifestDigest, manifestFileSha256) => [
  '/usr/bin/env',
  '-i',
  'PATH=/usr/bin:/bin',
  'LANG=C',
  NODE,
  ENTRYPOINT,
  '--run',
  MATRIX_MANIFEST,
  manifestDigest,
  manifestFileSha256,
]

function fail(reason) {
  throw new Error(`T2 entrypoint ${reason}`)
}

/** macOS may add this one locale metadata key after env -i; no other inherited key is accepted. */
export function reviewedHostEnvironment(environment) {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) return false
  const keys = Object.keys(environment).sort()
  const expected = Object.hasOwn(environment, '__CF_USER_TEXT_ENCODING')
    ? ['LANG', 'PATH', '__CF_USER_TEXT_ENCODING'].sort()
    : ['LANG', 'PATH']
  return (
    JSON.stringify(keys) === JSON.stringify(expected) &&
    environment.PATH === '/usr/bin:/bin' &&
    environment.LANG === 'C' &&
    (!Object.hasOwn(environment, '__CF_USER_TEXT_ENCODING') || macTextEncoding(environment.__CF_USER_TEXT_ENCODING))
  )
}

function fixedFileIdentity(stat) {
  return (
    stat.isFile() &&
    !stat.isSymbolicLink() &&
    stat.uid === process.getuid() &&
    (stat.mode & 0o7777) === 0o600 &&
    stat.nlink === 1 &&
    stat.size > 0 &&
    stat.size <= 65536
  )
}

export async function readFixedReceipt(file) {
  const before = await fs.lstat(file)
  if (!fixedFileIdentity(before)) fail('review file identity')
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const held = await handle.stat()
    if (!fixedFileIdentity(held) || held.dev !== before.dev || held.ino !== before.ino || held.size !== before.size)
      fail('review file changed before read')
    const bytes = await handle.readFile()
    const afterHeld = await handle.stat()
    const afterPath = await fs.lstat(file)
    if (
      bytes.length !== before.size ||
      !fixedFileIdentity(afterHeld) ||
      !fixedFileIdentity(afterPath) ||
      [afterHeld, afterPath].some(
        item => item.dev !== before.dev || item.ino !== before.ino || item.size !== before.size,
      )
    )
      fail('review file changed during read')
    return { receipt: JSON.parse(bytes.toString('utf8')), sha256: sha(bytes) }
  } finally {
    await handle.close()
  }
}

function assertReview({ receipt, sha256 }, { expectedReviewSha256, prepared, sourceSha256 }) {
  const expectedPrefix = invocationPrefix(prepared.manifestDigest, prepared.manifestFileSha256)
  if (
    sha256 !== expectedReviewSha256 ||
    receipt?.schema !== REVIEW_SCHEMA ||
    receipt.reviewer !== REVIEWER ||
    receipt.verdict !== REVIEW_VERDICT ||
    receipt.runtimeVerdict !== 'NOT_RUN' ||
    JSON.stringify(receipt.exactInvocationPrefix) !== JSON.stringify(expectedPrefix) ||
    receipt.manifest?.path !== MATRIX_MANIFEST ||
    receipt.manifest.fileSha256 !== prepared.manifestFileSha256 ||
    receipt.manifest.manifestDigest !== prepared.manifestDigest ||
    receipt.manifest.phase !== 'T2' ||
    receipt.manifest.root !== POLICY.roots.T2 ||
    JSON.stringify(receipt.manifest.cases) !== JSON.stringify(prepared.manifest.cases) ||
    receipt.entrypointSha256 !== sourceSha256 ||
    receipt.recoveryProposalSha256 !== prepared.manifest.recoveryProposalSha256 ||
    !isDeepStrictEqual(receipt.ta04Authority, prepared.manifest.ta04Authority) ||
    !isDeepStrictEqual(receipt.historicalAvailability, prepared.manifest.historicalAvailability) ||
    !isDeepStrictEqual(receipt.r21TerminalEvidence, prepared.manifest.r21TerminalEvidence) ||
    receipt.combinedListenerAllocationCeilingIncludingR16 !== 33 ||
    receipt.requestedHostToolMode !== 'exec_command sandbox_permissions=require_escalated' ||
    receipt.workdir !== REPO ||
    receipt.noAutomaticT2T3 !== true ||
    receipt.priorP1P2P3P4UnknownPreserved !== true ||
    !isDeepStrictEqual(receipt.preflightEvidence, prepared.manifest.preflightEvidence)
  )
    fail('independent exact R22 review absent or changed')
}

function assertDecision(
  { receipt, sha256 },
  { expectedDecisionSha256, expectedReviewSha256, prepared, allowSynthetic = false },
) {
  const prefix = [...invocationPrefix(prepared.manifestDigest, prepared.manifestFileSha256), expectedReviewSha256]
  if (
    sha256 !== expectedDecisionSha256 ||
    receipt?.schema !== DECISION_SCHEMA ||
    (receipt.specimenOnly === true && !allowSynthetic) ||
    receipt.verdict !== DECISION_VERDICT ||
    receipt.scope !== 'ONE_NEW_FULL_T2_P8_INVOCATION_NO_RESUME' ||
    receipt.evidenceClass !==
      (allowSynthetic
        ? 'SYNTHETIC_OFFLINE_SPECIMEN_NO_USER_AUTHORITY'
        : 'VISIBLE_HOST_CONVERSATION_DECISION_TRANSCRIBED_NOT_CRYPTOGRAPHIC_ATTESTATION') ||
    receipt.manifestDigest !== prepared.manifestDigest ||
    receipt.manifestFileSha256 !== prepared.manifestFileSha256 ||
    receipt.exactReviewSha256 !== expectedReviewSha256 ||
    receipt.proposal?.path !== prepared.manifest.recoveryProposalPath ||
    receipt.proposal?.sha256 !== prepared.manifest.recoveryProposalSha256 ||
    !isDeepStrictEqual(receipt.ta04Authority, prepared.manifest.ta04Authority) ||
    !isDeepStrictEqual(receipt.historicalAvailability, prepared.manifest.historicalAvailability) ||
    !isDeepStrictEqual(receipt.r21TerminalEvidence, prepared.manifest.r21TerminalEvidence) ||
    JSON.stringify(receipt.exactInvocationPrefix) !== JSON.stringify(prefix) ||
    receipt.priorP1P2P3P4UnknownPreserved !== true ||
    receipt.requestedHostToolMode !== 'exec_command sandbox_permissions=require_escalated' ||
    receipt.workdir !== REPO ||
    receipt.noAutomaticT2T3 !== true ||
    !isDeepStrictEqual(receipt.preflightEvidence, prepared.manifest.preflightEvidence) ||
    !isDeepStrictEqual(
      receipt.cumulativeWholeCampaignCeilings,
      prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    ) ||
    receipt.cumulativeWholeCampaignCeilings?.listenerStarts !== 32 ||
    receipt.cumulativeWholeCampaignCeilings?.controlWrites !== 115 ||
    receipt.cumulativeWholeCampaignCeilings?.sourceCapacity !== 82 ||
    receipt.combinedListenerAllocationCeilingIncludingR16 !== 33
  )
    fail('explicit R22 user decision absent or changed')
}

function effectCase(action, id, currentCase) {
  if (action === 'owned-stop') return currentCase
  if (typeof id !== 'string' || id.length > 160) return null
  if (action === 'owned-loopback-listener') return /^([A-Z][0-9]{2}(?:-[A-Z][0-9]{2})?)-listener$/.exec(id)?.[1] ?? null
  if (!currentCase) return null
  if (action === 'private-synthetic-bootstrap') return id === `${currentCase}-bootstrap` ? currentCase : null
  if (action === 'codex-child') return id === `${currentCase}-codex` ? currentCase : null
  if (Object.hasOwn(requestActions, action))
    return id.startsWith(`${currentCase}-listener-${requestActions[action]}-`) ? currentCase : null
  if (action === 'owned-stdio-send') {
    if (
      [
        `${currentCase}-initialize`,
        `${currentCase}-initialize-initialized`,
        `${currentCase}-thread-start`,
        `${currentCase}-turn-start`,
      ].includes(id)
    )
      return currentCase
    if (currentCase === 'B14' && /^permission-[A-Za-z0-9._:-]{1,128}$/.test(id)) return currentCase
  }
  return null
}

/**
 * The host must authorize the exact invocation including the review SHA argument. The receipt
 * hash and reviewer field bind reviewed bytes; they are not a signature or standalone approval.
 * Ports are injectable only for inert, fake-port tests. No arbitrary root or receipt path exists.
 */
export async function dispatchMatrixEntrypoint(args, ports = {}) {
  if (args.length === 1 && args[0] === '--prepare') return (ports.prepare ?? writeR22MatrixPreparation)()
  if (args.length === 1 && args[0] === '--verify') {
    const prepared = await (ports.verify ?? verifyR22MatrixPreparation)()
    return Object.freeze({
      manifestDigest: prepared.manifestDigest,
      manifestFileSha256: prepared.manifestFileSha256,
      runtimeEligible: false,
    })
  }
  const precheck = args[0] === '--precheck'
  if (args.length !== 6 || !['--run', '--precheck'].includes(args[0]) || args[1] !== MATRIX_MANIFEST)
    fail('exact --prepare, --verify, --precheck or --run invocation required')
  const [, , requestedDigest, requestedManifestSha, requestedReviewSha, requestedDecisionSha] = args
  if (![requestedDigest, requestedManifestSha, requestedReviewSha, requestedDecisionSha].every(hex64))
    fail('run digest argument')
  const environment = ports.environment ?? process.env
  const execPath = ports.execPath ?? process.execPath
  const programPath = ports.programPath ?? process.argv[1]
  const workdir = ports.cwd ?? process.cwd()
  if (execPath !== NODE || programPath !== ENTRYPOINT || workdir !== REPO || !reviewedHostEnvironment(environment))
    fail('host invocation environment changed')
  const verify = ports.verify ?? verifyR22MatrixPreparation
  const readReview = ports.readReview ?? (() => readFixedReceipt(REVIEW))
  const readDecision = ports.readDecision ?? (() => readFixedReceipt(DECISION))
  const prepared = await verify()
  const sourceSha256 = await (ports.sourceSha256 ?? (async () => sha(await fs.readFile(ENTRYPOINT))))()
  const entryPin = prepared.manifest?.artifacts?.find(item => item.path === ENTRYPOINT)
  if (
    prepared.manifest?.phase !== 'T2' ||
    prepared.manifest.root !== POLICY.roots.T2 ||
    JSON.stringify(prepared.manifest.cases) !==
      JSON.stringify(POLICY.cases.filter(item => item.phase === 'T2').map(item => item.id)) ||
    digest(prepared.manifest) !== prepared.manifestDigest ||
    prepared.manifestDigest !== requestedDigest ||
    prepared.manifestFileSha256 !== requestedManifestSha ||
    entryPin?.sha256 !== sourceSha256 ||
    prepared.blockers?.length !== 0 ||
    prepared.manifest.futureInvocation?.requestedHostToolMode !==
      'exec_command sandbox_permissions=require_escalated' ||
    prepared.manifest.futureInvocation?.workdir !== REPO ||
    prepared.manifest.futureInvocation?.noAutomaticT2T3 !== true ||
    prepared.manifest.priorEvidence?.p1?.status !== 'UNKNOWN' ||
    prepared.manifest.priorEvidence?.p2?.status !== 'UNKNOWN' ||
    prepared.manifest.priorEvidence?.p3?.status !== 'UNKNOWN' ||
    prepared.manifest.priorEvidence?.p4?.status !== 'UNKNOWN' ||
    prepared.manifest.priorEvidence?.r19?.status !== 'GATE_ONLY_REFUSED' ||
    prepared.manifest.priorEvidence?.r19?.rootAbsent !== true ||
    prepared.manifest.priorEvidence?.r19?.casesCompleted !== 0 ||
    prepared.manifest.priorEvidence?.allFourRootsRetained !== false ||
    prepared.manifest.priorEvidence?.currentOriginalRootIdentity !== 'UNKNOWN' ||
    prepared.manifest.priorEvidence?.p7?.status !== 'UNKNOWN' ||
    prepared.manifest.priorEvidence?.p7?.casesCompleted !== 0 ||
    prepared.manifest.priorEvidence?.p7?.listenerEffect !== 'UNKNOWN' ||
    prepared.manifest.priorEvidence?.p7?.cleanup !== 'UNKNOWN' ||
    prepared.manifest.priorEvidence?.p7?.sourceCapacityReserved !== 4 ||
    prepared.manifest.historicalAvailability?.currentPresentMatches !== 6498 ||
    prepared.manifest.historicalAvailability?.historicalSourceAbsentArchiveVerified !== 23 ||
    prepared.manifest.recoveryBudget?.priorR19GateOnlyNodeInvocations !== 1 ||
    prepared.manifest.recoveryBudget?.priorR21Unknown?.listenerStarts !== 1 ||
    prepared.manifest.recoveryBudget?.priorR21Unknown?.sourceCapacity !== 4 ||
    prepared.manifest.recoveryBudget?.cumulativeWholeCampaignCeilings?.listenerStarts !== 32 ||
    prepared.manifest.recoveryBudget?.cumulativeWholeCampaignCeilings?.sourceCapacity !== 82 ||
    prepared.manifest.recoveryBudget?.combinedListenerAllocationCeilingIncludingR16 !== 33 ||
    !prepared.seal
  )
    fail('prepared manifest, source, or command drift')
  assertReview(await readReview(), { expectedReviewSha256: requestedReviewSha, prepared, sourceSha256 })
  const allowSynthetic = precheck && ports.syntheticSpecimen === true && typeof ports.readDecision === 'function'
  assertDecision(await readDecision(), {
    allowSynthetic,
    expectedDecisionSha256: requestedDecisionSha,
    expectedReviewSha256: requestedReviewSha,
    prepared,
  })
  // This FILE-only compatibility check precedes addon load, root creation, listener, or native spawn.
  await (ports.verifyHostFile ?? verifyR22HostFile)()
  const verifyPrior = ports.verifyPrior ?? verifyR21Predecessor
  const prior = await verifyPrior()
  if (
    prior?.rootIdentity?.dev !== prepared.manifest.r21TerminalEvidence?.rootIdentity?.dev ||
    prior?.rootIdentity?.ino !== prepared.manifest.r21TerminalEvidence?.rootIdentity?.ino ||
    prior?.journalSha256 !== prepared.manifest.r21TerminalEvidence?.journalSha256
  )
    fail('retained R21 identity drift')
  if (precheck)
    return Object.freeze({
      status: 'PRECHECK_PASSED_NO_RUNTIME_AUTHORITY',
      manifestDigest: prepared.manifestDigest,
      manifestFileSha256: prepared.manifestFileSha256,
      exactReviewSha256: requestedReviewSha,
      decisionSha256: requestedDecisionSha,
      runtimeQualified: false,
    })
  let currentIndex = -1
  let currentCase = null
  let stopAuthorized = false
  let requestCounts = { canonical: 0, audit: 0, request: 0 }
  const recheck = async () => {
    assertReview(await readReview(), { expectedReviewSha256: requestedReviewSha, prepared, sourceSha256 })
    assertDecision(await readDecision(), {
      allowSynthetic: false,
      expectedDecisionSha256: requestedDecisionSha,
      expectedReviewSha256: requestedReviewSha,
      prepared,
    })
  }
  // Full R21 and TA04 history and host checks ran at the initial gate.
  // Re-run history before each case listener; every effect rechecks exact receipts and digest.
  const authorize = async ({ action, id, manifestDigest, manifest }) => {
    await recheck()
    if (manifestDigest !== prepared.manifestDigest || digest(manifest) !== prepared.manifestDigest) return false
    const caseId = effectCase(action, id, currentCase)
    if (!caseId) return false
    const policy = POLICY.cases.find(item => item.id === caseId && item.phase === 'T2')
    if (!policy) return false
    if (action === 'owned-loopback-listener') {
      await verifyPrior({ requireNewRootAbsent: false })
      if ((currentIndex >= 0 && !stopAuthorized) || prepared.manifest.cases[currentIndex + 1] !== caseId) return false
      currentIndex++
      currentCase = caseId
      stopAuthorized = false
      requestCounts = { canonical: 0, audit: 0, request: 0 }
    } else if (caseId !== currentCase) return false
    else if (stopAuthorized && action !== 'owned-stop') return false
    if (Object.hasOwn(requestActions, action)) {
      const channel = requestActions[action]
      const suffix = id.slice(`${caseId}-listener-${channel}-`.length)
      if (!/^[1-9][0-9]*$/.test(suffix)) return false
      const index = Number(suffix)
      const limit =
        caseId === 'P00'
          ? 0
          : channel === 'canonical'
            ? policy?.limits.canonicalRequests
            : channel === 'audit'
              ? policy?.limits.scopedCalls * 2
              : policy?.limits.providerRequests
      if (
        !Number.isSafeInteger(index) ||
        !Number.isSafeInteger(limit) ||
        index !== requestCounts[channel] + 1 ||
        index > limit
      )
        return false
      requestCounts[channel] = index
    }
    if (action === 'owned-stop') stopAuthorized = true
    return true
  }
  const verifyExactReview = async ({ manifestDigest, manifest }) => {
    await recheck()
    return manifestDigest === prepared.manifestDigest && digest(manifest) === prepared.manifestDigest
  }
  const observerOs = await (ports.loadAddon ?? (async () => createRequire(import.meta.url)(ADDON)))()
  if (
    typeof observerOs?.identity !== 'function' ||
    typeof observerOs.listDirectChildren !== 'function' ||
    typeof observerOs.directChildMetadata !== 'function'
  )
    fail('owned observer addon exports changed')
  const run = ports.run ?? (async options => (await import('./matrix-runner.mjs')).runPreparedT2Matrix(options))
  const result = await run({ prepared, verifyExactReview, authorize, observerOs })
  return Object.freeze({ ...result, runtimeQualified: false })
}

if (process.argv[1] === ENTRYPOINT) {
  try {
    const result = await dispatchMatrixEntrypoint(process.argv.slice(2))
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (result?.status === 'UNKNOWN') process.exitCode = 1
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
