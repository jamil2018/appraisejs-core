/** T2 command boundary. Import, --verify, and --prepare never load the addon or start native ports. */
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digest, POLICY } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { MATRIX_MANIFEST, verifyMatrixPreparation, writeMatrixPreparation } from './preparation.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const ENTRYPOINT = fileURLToPath(import.meta.url)
const NODE = '/opt/homebrew/Cellar/node/26.11.0/bin/node'
const REVIEW = join(REPO, '.appraisejs/m02-t2-r10-exact-review.json')
const ADDON = join(REPO, '.appraisejs/m02-owned-host-observer-build-01/mac-owned-host.node')
const REVIEW_SCHEMA = 'appraise.m02-ta-t2-r10-exact-review/v1'
const REVIEW_VERDICT = 'ACCEPT_ONE_FIXED_T2_R10_INVOCATION'
const REVIEWER = '/root/r6_exact_review'
const requestActions = Object.freeze({
  'canonical-ipc-request': 'canonical',
  'scoped-audit-request': 'audit',
  'scripted-provider-request': 'request',
})
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const hex64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
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

async function readFixedReviewReceipt() {
  const before = await fs.lstat(REVIEW)
  if (!fixedFileIdentity(before)) fail('review file identity')
  const handle = await fs.open(REVIEW, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const held = await handle.stat()
    if (!fixedFileIdentity(held) || held.dev !== before.dev || held.ino !== before.ino || held.size !== before.size)
      fail('review file changed before read')
    const bytes = await handle.readFile()
    const afterHeld = await handle.stat()
    const afterPath = await fs.lstat(REVIEW)
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
    receipt.entrypointSha256 !== sourceSha256
  )
    fail('independent exact review absent or changed')
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
  if (args.length === 1 && args[0] === '--prepare') return (ports.prepare ?? writeMatrixPreparation)()
  if (args.length === 1 && args[0] === '--verify') {
    const prepared = await (ports.verify ?? verifyMatrixPreparation)()
    return Object.freeze({
      manifestDigest: prepared.manifestDigest,
      manifestFileSha256: prepared.manifestFileSha256,
      runtimeEligible: false,
    })
  }
  if (args.length !== 5 || args[0] !== '--run' || args[1] !== MATRIX_MANIFEST)
    fail('exact --prepare, --verify, or --run invocation required')
  const [, , requestedDigest, requestedManifestSha, requestedReviewSha] = args
  if (![requestedDigest, requestedManifestSha, requestedReviewSha].every(hex64)) fail('run digest argument')
  const environment = ports.environment ?? process.env
  const execPath = ports.execPath ?? process.execPath
  const programPath = ports.programPath ?? process.argv[1]
  if (
    execPath !== NODE ||
    programPath !== ENTRYPOINT ||
    JSON.stringify(Object.keys(environment).sort()) !== JSON.stringify(['LANG', 'PATH']) ||
    environment.PATH !== '/usr/bin:/bin' ||
    environment.LANG !== 'C'
  )
    fail('host invocation environment changed')
  const verify = ports.verify ?? verifyMatrixPreparation
  const readReview = ports.readReview ?? readFixedReviewReceipt
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
  let currentIndex = -1
  let currentCase = null
  let stopAuthorized = false
  let requestCounts = { canonical: 0, audit: 0, request: 0 }
  const recheck = async () => {
    assertReview(await readReview(), { expectedReviewSha256: requestedReviewSha, prepared, sourceSha256 })
  }
  const authorize = async ({ action, id, manifestDigest, manifest }) => {
    await recheck()
    if (manifestDigest !== prepared.manifestDigest || digest(manifest) !== prepared.manifestDigest) return false
    const caseId = effectCase(action, id, currentCase)
    if (!caseId) return false
    const policy = POLICY.cases.find(item => item.id === caseId && item.phase === 'T2')
    if (!policy) return false
    if (action === 'owned-loopback-listener') {
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
