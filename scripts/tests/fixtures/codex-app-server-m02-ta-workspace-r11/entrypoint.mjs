/** Exact T3 command boundary. Import, --verify and --prepare start no native runtime. */
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digest, POLICY } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { verifyR11HostFile } from '../codex-app-server-m02-ta-owned-host-observer-r11/observer.mjs'
import { WORKSPACE_MANIFEST, verifyWorkspacePreparation, writeWorkspacePreparation } from './preparation.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const ENTRYPOINT = fileURLToPath(import.meta.url)
const NODE = '/opt/homebrew/Cellar/node/26.11.0/bin/node'
const REVIEW = join(REPO, '.appraisejs/m02-t3-r11-exact-review.json')
const ADDON = join(REPO, '.appraisejs/m02-owned-host-observer-build-01/mac-owned-host.node')
const REVIEW_SCHEMA = 'appraise.m02-ta-t3-r11-exact-review/v1'
const REVIEW_VERDICT = 'ACCEPT_ONE_FIXED_T3_R11_INVOCATION'
const REVIEWER = '/root/r6_exact_review'
const requestActions = Object.freeze({
  'canonical-ipc-request': 'canonical',
  'scoped-audit-request': 'audit',
  'scripted-provider-request': 'request',
})
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const hex64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const macTextEncoding = value =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{1,8}:0x[0-9a-fA-F]{1,8}:0x[0-9a-fA-F]{1,8}$/.test(value)
const invocationPrefix = (manifestDigest, manifestFileSha256) => [
  '/usr/bin/env',
  '-i',
  'PATH=/usr/bin:/bin',
  'LANG=C',
  NODE,
  ENTRYPOINT,
  '--run',
  WORKSPACE_MANIFEST,
  manifestDigest,
  manifestFileSha256,
]
const fail = reason => {
  throw new Error(`T3 entrypoint ${reason}`)
}

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

async function readPinned(file, maxBytes = 128 * 1024) {
  const before = await fs.lstat(file)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== process.getuid() ||
    before.nlink !== 1 ||
    before.size < 2 ||
    before.size > maxBytes ||
    (before.mode & 0o022) !== 0
  )
    fail('pinned file identity changed')
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const held = await handle.stat()
    if (held.dev !== before.dev || held.ino !== before.ino || held.size !== before.size)
      fail('pinned file replaced before read')
    const bytes = await handle.readFile()
    const after = await handle.stat()
    const afterPath = await fs.lstat(file)
    if (
      [after, afterPath].some(
        item =>
          item.dev !== before.dev ||
          item.ino !== before.ino ||
          item.size !== before.size ||
          item.mtimeMs !== before.mtimeMs ||
          item.mode !== before.mode,
      ) ||
      bytes.length !== before.size
    )
      fail('pinned file changed during read')
    return bytes
  } finally {
    await handle.close()
  }
}

async function readFixedReviewReceipt() {
  const before = await fs.lstat(REVIEW)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== process.getuid() ||
    before.nlink !== 1 ||
    (before.mode & 0o777) !== 0o600 ||
    before.size < 2 ||
    before.size > 65536
  )
    fail('exact review file identity')
  const bytes = await readPinned(REVIEW, 65536)
  return { receipt: JSON.parse(bytes), sha256: sha(bytes) }
}

function assertReview({ receipt, sha256 }, { expectedReviewSha256, prepared, entrypointSha256 }) {
  const prefix = invocationPrefix(prepared.manifestDigest, prepared.manifestFileSha256)
  if (
    sha256 !== expectedReviewSha256 ||
    receipt?.schema !== REVIEW_SCHEMA ||
    receipt.reviewer !== REVIEWER ||
    receipt.verdict !== REVIEW_VERDICT ||
    receipt.runtimeVerdict !== 'NOT_RUN' ||
    JSON.stringify(receipt.exactInvocationPrefix) !== JSON.stringify(prefix) ||
    receipt.manifest?.path !== WORKSPACE_MANIFEST ||
    receipt.manifest.fileSha256 !== prepared.manifestFileSha256 ||
    receipt.manifest.manifestDigest !== prepared.manifestDigest ||
    receipt.manifest.phase !== 'T3' ||
    receipt.manifest.root !== POLICY.roots.T3 ||
    JSON.stringify(receipt.manifest.cases) !== JSON.stringify(['N01', 'N02']) ||
    receipt.entrypointSha256 !== entrypointSha256 ||
    receipt.ta03ProposalSha256 !== prepared.manifest.ta03.proposalSha256 ||
    receipt.ta03ApprovalRecordSha256 !== prepared.manifest.ta03.approvalRecordSha256 ||
    receipt.t2ActualReviewSha256 !== prepared.manifest.predecessor.t2ActualReviewSha256 ||
    receipt.t2R12ExactReviewSha256 !== prepared.manifest.predecessor.t2R12ExactReviewSha256 ||
    receipt.t2R12UserDecisionSha256 !== prepared.manifest.predecessor.t2R12UserDecisionSha256 ||
    receipt.t2R12RecoveryProposalSha256 !== prepared.manifest.predecessor.t2R12RecoveryProposalSha256
  )
    fail('independent exact T3 review absent or changed')
}

function effectCase(action, id, currentCase) {
  if (action === 'owned-stop') return currentCase
  if (typeof id !== 'string' || id.length > 160) return null
  if (action === 'owned-loopback-listener') return /^(N01|N02)-listener$/.exec(id)?.[1] ?? null
  if (!currentCase) return null
  if (action === 'private-synthetic-bootstrap') return id === `${currentCase}-bootstrap` ? currentCase : null
  if (action === 'codex-child') return id === `${currentCase}-codex` ? currentCase : null
  if (Object.hasOwn(requestActions, action))
    return id.startsWith(`${currentCase}-listener-${requestActions[action]}-`) ? currentCase : null
  if (
    action === 'owned-stdio-send' &&
    [
      `${currentCase}-initialize`,
      `${currentCase}-initialize-initialized`,
      `${currentCase}-thread-start`,
      `${currentCase}-turn-start`,
    ].includes(id)
  )
    return currentCase
  return null
}

/** Exact reviewed command and one case sequence. Injected ports exist only for offline fake tests. */
export async function dispatchWorkspaceEntrypoint(args, ports = {}) {
  if (args.length === 1 && args[0] === '--prepare') return (ports.prepare ?? writeWorkspacePreparation)()
  if (args.length === 1 && args[0] === '--verify') {
    const prepared = await (ports.verify ?? verifyWorkspacePreparation)()
    return Object.freeze({
      manifestDigest: prepared.manifestDigest,
      manifestFileSha256: prepared.manifestFileSha256,
      runtimeEligible: false,
    })
  }
  if (args.length !== 5 || args[0] !== '--run' || args[1] !== WORKSPACE_MANIFEST)
    fail('exact --prepare, --verify, or --run invocation required')
  const [, , requestedDigest, requestedManifestSha, requestedReviewSha] = args
  if (![requestedDigest, requestedManifestSha, requestedReviewSha].every(hex64)) fail('run digest argument')
  const environment = ports.environment ?? process.env
  const execPath = ports.execPath ?? process.execPath
  const programPath = ports.programPath ?? process.argv[1]
  if (execPath !== NODE || programPath !== ENTRYPOINT || !reviewedHostEnvironment(environment))
    fail('host invocation environment changed')
  const verify = ports.verify ?? verifyWorkspacePreparation
  const readReview = ports.readReview ?? readFixedReviewReceipt
  const prepared = await verify()
  const entrypointSha256 = sha(await readPinned(ENTRYPOINT))
  const entryPin = prepared.manifest?.artifacts?.find(item => item.path === ENTRYPOINT)
  if (
    prepared.manifest?.phase !== 'T3' ||
    prepared.manifest.root !== POLICY.roots.T3 ||
    prepared.manifest.version !== 'appraise.m02-ta-workspace-r11/v1' ||
    JSON.stringify(prepared.manifest.cases) !== JSON.stringify(['N01', 'N02']) ||
    digest(prepared.manifest) !== prepared.manifestDigest ||
    prepared.manifestDigest !== requestedDigest ||
    prepared.manifestFileSha256 !== requestedManifestSha ||
    entryPin?.sha256 !== entrypointSha256 ||
    prepared.blockers?.length !== 0 ||
    prepared.manifest.blockers?.length !== 0 ||
    !prepared.seal ||
    prepared.manifest.ta03?.nativeScratchHelperInventory !== 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED'
  )
    fail('prepared manifest, source, or command drift')
  assertReview(await readReview(), { expectedReviewSha256: requestedReviewSha, prepared, entrypointSha256 })
  // Exact installed-file compatibility is checked before addon load, T3 root, listener or child.
  await (ports.verifyHostFile ?? verifyR11HostFile)()
  let currentIndex = -1
  let currentCase = null
  let stopAuthorized = false
  let requestCounts = { canonical: 0, audit: 0, request: 0 }
  const recheck = async () => {
    if (sha(await readPinned(ENTRYPOINT)) !== entrypointSha256) fail('entrypoint changed during run')
    assertReview(await readReview(), { expectedReviewSha256: requestedReviewSha, prepared, entrypointSha256 })
  }
  const authorize = async ({ action, id, manifestDigest, manifest }) => {
    await recheck()
    if (manifestDigest !== prepared.manifestDigest || digest(manifest) !== prepared.manifestDigest) return false
    const caseId = effectCase(action, id, currentCase)
    if (!caseId) return false
    const policy = POLICY.cases.find(item => item.id === caseId && item.phase === 'T3')
    if (!policy) return false
    if (action === 'owned-loopback-listener') {
      if ((currentIndex >= 0 && !stopAuthorized) || prepared.manifest.cases[currentIndex + 1] !== caseId) return false
      currentIndex++
      currentCase = caseId
      stopAuthorized = false
      requestCounts = { canonical: 0, audit: 0, request: 0 }
    } else if (caseId !== currentCase || (stopAuthorized && action !== 'owned-stop')) return false
    if (Object.hasOwn(requestActions, action)) {
      const channel = requestActions[action]
      const suffix = id.slice(`${caseId}-listener-${channel}-`.length)
      if (!/^[1-9][0-9]*$/.test(suffix)) return false
      const index = Number(suffix)
      const limit = channel === 'request' ? policy.limits.providerRequests : 0
      if (!Number.isSafeInteger(index) || index !== requestCounts[channel] + 1 || index > limit) return false
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
  const run = ports.run ?? (async options => (await import('./workspace-runner.mjs')).runPreparedT3Workspace(options))
  const result = await run({ prepared, verifyExactReview, authorize, observerOs })
  return Object.freeze({ ...result, runtimeQualified: false })
}

if (process.argv[1] === ENTRYPOINT) {
  try {
    const result = await dispatchWorkspaceEntrypoint(process.argv.slice(2))
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (result?.status === 'UNKNOWN') process.exitCode = 1
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
