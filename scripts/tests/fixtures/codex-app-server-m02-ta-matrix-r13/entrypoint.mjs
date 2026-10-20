/** R13 recovery command boundary. Import, --verify, and --prepare are inert to native effects. */
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digest, POLICY } from './policy.mjs'
import { verifyR11HostFile } from '../codex-app-server-m02-ta-owned-host-observer-r11/observer.mjs'
import { verifyPriorT2Unknown } from './prior-evidence.mjs'
import { MATRIX_MANIFEST, verifyR13MatrixPreparation, writeR13MatrixPreparation } from './preparation.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const ENTRYPOINT = fileURLToPath(import.meta.url)
const NODE = '/opt/homebrew/Cellar/node/26.11.0/bin/node'
const REVIEW = join(REPO, '.appraisejs/m02-t2-r13-exact-review.json')
const ADDON = join(REPO, '.appraisejs/m02-owned-host-observer-build-01/mac-owned-host.node')
const DECISION = join(REPO, '.appraisejs/m02-t2-r13-recovery-user-decision.json')
const REVIEW_SCHEMA = 'appraise.m02-ta-t2-r13-exact-review/v1'
const REVIEW_VERDICT = 'ACCEPT_ONE_FIXED_T2_R13_INVOCATION'
const DECISION_SCHEMA = 'appraise.m02-ta-t2-r13-recovery-user-decision/v1'
const DECISION_VERDICT = 'APPROVE_ONE_FIXED_T2_R13_RECOVERY'
const REVIEWER = '/root/r6_exact_review'
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

async function readFixedReceipt(file) {
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
    receipt.recoveryProposalSha256 !== prepared.manifest.recoveryProposalSha256
  )
    fail('independent exact R13 review absent or changed')
}

function assertDecision({ receipt, sha256 }, { expectedDecisionSha256, expectedReviewSha256, prepared }) {
  const prefix = [...invocationPrefix(prepared.manifestDigest, prepared.manifestFileSha256), expectedReviewSha256]
  if (
    sha256 !== expectedDecisionSha256 ||
    receipt?.schema !== DECISION_SCHEMA ||
    receipt.verdict !== DECISION_VERDICT ||
    receipt.scope !== 'ONE_NEW_FULL_T2_P3_INVOCATION_NO_RESUME' ||
    receipt.evidenceClass !== 'VISIBLE_HOST_CONVERSATION_DECISION_TRANSCRIBED_NOT_CRYPTOGRAPHIC_ATTESTATION' ||
    receipt.manifestDigest !== prepared.manifestDigest ||
    receipt.manifestFileSha256 !== prepared.manifestFileSha256 ||
    receipt.exactReviewSha256 !== expectedReviewSha256 ||
    receipt.proposal?.path !== prepared.manifest.recoveryProposalPath ||
    receipt.proposal?.sha256 !== prepared.manifest.recoveryProposalSha256 ||
    JSON.stringify(receipt.exactInvocationPrefix) !== JSON.stringify(prefix) ||
    receipt.priorP1P2UnknownPreserved !== true ||
    receipt.cumulativeWholeCampaignCeilings?.listenerStarts !== 29 ||
    receipt.cumulativeWholeCampaignCeilings?.controlWrites !== 112 ||
    receipt.cumulativeWholeCampaignCeilings?.sourceCapacity !== 70
  )
    fail('explicit R13 user decision absent or changed')
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
  if (args.length === 1 && args[0] === '--prepare') return (ports.prepare ?? writeR13MatrixPreparation)()
  if (args.length === 1 && args[0] === '--verify') {
    const prepared = await (ports.verify ?? verifyR13MatrixPreparation)()
    return Object.freeze({
      manifestDigest: prepared.manifestDigest,
      manifestFileSha256: prepared.manifestFileSha256,
      runtimeEligible: false,
    })
  }
  if (args.length !== 6 || args[0] !== '--run' || args[1] !== MATRIX_MANIFEST)
    fail('exact --prepare, --verify or --run invocation required')
  const [, , requestedDigest, requestedManifestSha, requestedReviewSha, requestedDecisionSha] = args
  if (![requestedDigest, requestedManifestSha, requestedReviewSha, requestedDecisionSha].every(hex64))
    fail('run digest argument')
  const environment = ports.environment ?? process.env
  const execPath = ports.execPath ?? process.execPath
  const programPath = ports.programPath ?? process.argv[1]
  if (execPath !== NODE || programPath !== ENTRYPOINT || !reviewedHostEnvironment(environment))
    fail('host invocation environment changed')
  const verify = ports.verify ?? verifyR13MatrixPreparation
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
    !prepared.seal
  )
    fail('prepared manifest, source, or command drift')
  assertReview(await readReview(), { expectedReviewSha256: requestedReviewSha, prepared, sourceSha256 })
  assertDecision(await readDecision(), {
    expectedDecisionSha256: requestedDecisionSha,
    expectedReviewSha256: requestedReviewSha,
    prepared,
  })
  // This FILE-only compatibility check precedes addon load, root creation, listener, or native spawn.
  await (ports.verifyHostFile ?? verifyR11HostFile)()
  const verifyPrior = ports.verifyPrior ?? verifyPriorT2Unknown
  await verifyPrior()
  let currentIndex = -1
  let currentCase = null
  let stopAuthorized = false
  let requestCounts = { canonical: 0, audit: 0, request: 0 }
  const recheck = async () => {
    assertReview(await readReview(), { expectedReviewSha256: requestedReviewSha, prepared, sourceSha256 })
    assertDecision(await readDecision(), {
      expectedDecisionSha256: requestedDecisionSha,
      expectedReviewSha256: requestedReviewSha,
      prepared,
    })
  }
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
