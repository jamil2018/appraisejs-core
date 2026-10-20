/** Fixed R45 T3 command boundary over unconsumed R45 source. Import performs no native effect. */
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createRequire } from 'node:module'
import { isDeepStrictEqual } from 'node:util'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digest, POLICY } from './policy.mjs'
import { verifyR45HostFile } from './host-file.mjs'
import { verifyFullT2Predecessor } from './r44-evidence.mjs'
import { MATRIX_MANIFEST, verifyWorkspacePreparation, writeWorkspacePreparation } from './preparation.mjs'
import { readStableFile } from '../codex-app-server-m02-ta-matrix-r44/r21-evidence.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const ENTRYPOINT = fileURLToPath(import.meta.url)
const NODE = '/opt/homebrew/Cellar/node/26.11.0/bin/node'
const ROOT = '/private/tmp/appraise-m02-ta-workspace-p2'
const REVIEW = join(REPO, '.appraisejs/m02-t3-r45-exact-review.json')
const DECISION = join(REPO, '.appraisejs/m02-t3-r45-recovery-user-decision.json')
const AUTHORIZATION_CONTEXT = join(REPO, '.appraisejs/m02-r45-user-authorization-context-01.json')
const STANDING_AUTHORIZATION = join(REPO, '.appraisejs/m02-standing-test-authorization-01.json')
const ADDON = join(REPO, '.appraisejs/m02-owned-host-observer-build-r33-01/mac-owned-host.node')
const ADDON_SHA256 = 'e325eaa2a5655c9a985159f39105128b9925d1179c2f45bceeff7b917cc12998'
const REVIEWER = '/root/r24_review'
const COMMON_FIELDS = Object.freeze([
  'ta04Authority',
  'rootPackageQualification',
  'r44TerminalEvidence',
  'ta03',
  'sourceHostBudget',
  'nativeContractQualification',
  'processStateObserver',
  'gitReadiness',
  'continuingImplementationAuthority',
  'recoveryBudget',
  'admissionAccounting',
])
const requestActions = Object.freeze({
  'canonical-ipc-request': 'canonical',
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
  throw new Error(`T3 R45 entrypoint ${reason}`)
}

/** macOS may add this one locale metadata key after env -i; no other inherited key is accepted. */
export function reviewedHostEnvironment(environment) {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) return false
  const keys = Object.keys(environment).sort()
  const expected = Object.hasOwn(environment, '__CF_USER_TEXT_ENCODING')
    ? ['LANG', 'PATH', '__CF_USER_TEXT_ENCODING'].sort()
    : ['LANG', 'PATH']
  return (
    isDeepStrictEqual(keys, expected) &&
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
    stat.size <= 65536 &&
    Number.isFinite(stat.mtimeMs) &&
    Number.isFinite(stat.ctimeMs)
  )
}

export async function readFixedReceipt(file) {
  if (![REVIEW, DECISION, AUTHORIZATION_CONTEXT, STANDING_AUTHORIZATION].includes(file)) fail('receipt path')
  const before = await fs.lstat(file)
  if (!fixedFileIdentity(before)) fail('receipt file identity')
  const same = state =>
    fixedFileIdentity(state) &&
    ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'].every(key => state[key] === before[key])
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    if (!same(await handle.stat())) fail('receipt changed before read')
    const bytes = await handle.readFile()
    if (bytes.length !== before.size || !same(await handle.stat()) || !same(await fs.lstat(file)))
      fail('receipt changed during read')
    return { receipt: JSON.parse(bytes.toString('utf8')), sha256: sha(bytes) }
  } finally {
    await handle.close()
  }
}

function assertCommonBindings(receipt, prepared) {
  if (
    receipt.historicalAvailabilitySha256 !== sha(JSON.stringify(prepared.manifest.historicalAvailability)) ||
    COMMON_FIELDS.some(
      key =>
        !Object.hasOwn(receipt, key) ||
        !Object.hasOwn(prepared.manifest, key) ||
        prepared.manifest[key] === null ||
        prepared.manifest[key] === undefined ||
        !isDeepStrictEqual(receipt[key], prepared.manifest[key]),
    ) ||
    !isDeepStrictEqual(
      receipt.cumulativeWholeCampaignCeilings,
      prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    ) ||
    receipt.combinedListenerAllocationCeilingIncludingR16 !== 212 ||
    prepared.manifest.recoveryBudget.combinedListenerAllocationCeilingIncludingR16 !== 212
  )
    fail('common authority, predecessor, or allocation binding drift')
}

function assertReview({ receipt, sha256 }, { expectedReviewSha256, prepared, sourceSha256 }) {
  if (
    sha256 !== expectedReviewSha256 ||
    receipt?.schema !== 'appraise.m02-ta-t3-r45-exact-review/v1' ||
    receipt.reviewer !== REVIEWER ||
    receipt.verdict !== 'ACCEPT_ONE_FIXED_T3_R45_INVOCATION' ||
    receipt.runtimeVerdict !== 'NOT_RUN' ||
    !isDeepStrictEqual(
      receipt.exactInvocationPrefix,
      invocationPrefix(prepared.manifestDigest, prepared.manifestFileSha256),
    ) ||
    receipt.manifest?.path !== MATRIX_MANIFEST ||
    receipt.manifest.fileSha256 !== prepared.manifestFileSha256 ||
    receipt.manifest.manifestDigest !== prepared.manifestDigest ||
    receipt.manifest.phase !== 'T3' ||
    receipt.manifest.root !== ROOT ||
    !isDeepStrictEqual(receipt.manifest.cases, ['N01', 'N02']) ||
    receipt.entrypointSha256 !== sourceSha256 ||
    receipt.recoveryProposalSha256 !== prepared.manifest.recoveryProposalSha256 ||
    receipt.exactArtifactUserApprovalClaimed !== false ||
    receipt.requestedHostToolMode !== 'exec_command sandbox_permissions=require_escalated' ||
    receipt.workdir !== REPO ||
    receipt.noAutomaticFurtherInvocation !== true ||
    receipt.priorP1P2P3P4UnknownPreserved !== true
  )
    fail('independent exact R45 review absent or changed')
  assertCommonBindings(receipt, prepared)
}

function assertDecision({ receipt, sha256 }, { expectedDecisionSha256, expectedReviewSha256, prepared }) {
  if (
    sha256 !== expectedDecisionSha256 ||
    receipt?.schema !== 'appraise.m02-ta-t3-r45-recovery-user-decision/v1' ||
    receipt.specimenOnly === true ||
    receipt.verdict !== 'AUTHORIZE_ONE_FIXED_T3_R45_INVOCATION' ||
    receipt.scope !== 'ONE_NEW_T3_WORKSPACE_P2_INVOCATION_NO_RESUME' ||
    receipt.evidenceClass !== 'STANDING_TEST_PERMISSION_AND_CONTINUE_BOUND_TO_FIXED_T3_INVOCATION' ||
    receipt.manifestDigest !== prepared.manifestDigest ||
    receipt.manifestFileSha256 !== prepared.manifestFileSha256 ||
    receipt.exactReviewSha256 !== expectedReviewSha256 ||
    receipt.authorizationContext?.path !== AUTHORIZATION_CONTEXT ||
    !hex64(receipt.authorizationContext.sha256) ||
    receipt.proposal?.path !== prepared.manifest.recoveryProposalPath ||
    receipt.proposal.sha256 !== prepared.manifest.recoveryProposalSha256 ||
    receipt.exactArtifactUserApprovalClaimed !== false ||
    !isDeepStrictEqual(receipt.exactInvocationPrefix, [
      ...invocationPrefix(prepared.manifestDigest, prepared.manifestFileSha256),
      expectedReviewSha256,
    ]) ||
    receipt.priorP1P2P3P4UnknownPreserved !== true ||
    receipt.requestedHostToolMode !== 'exec_command sandbox_permissions=require_escalated' ||
    receipt.workdir !== REPO ||
    receipt.noAutomaticFurtherInvocation !== true
  )
    fail('bound R45 standing-authorization decision absent or changed')
  assertCommonBindings(receipt, prepared)
}

async function assertStandingAuthorization(decision, prepared, readAuthorizationContext) {
  const { receipt, sha256 } = await readAuthorizationContext()
  const standingPin = prepared.manifest.artifacts.find(row => row.path === STANDING_AUTHORIZATION)
  const standing = await readFixedReceipt(STANDING_AUTHORIZATION)
  if (
    sha256 !== decision.authorizationContext.sha256 ||
    receipt?.schema !== 'appraise.m02-r45-user-authorization-context/v1' ||
    receipt.authorizedAction !== 'ONE_FRESH_R45_WORKSPACE_P2_T3_INVOCATION' ||
    receipt.authorityBasis !== 'STANDING_FUTURE_TEST_PERMISSION_AND_CONTINUE_CURRENT_M02_WORK' ||
    receipt.literalHashSpecificApprovalQuoteClaimed !== false ||
    receipt.standingAuthorization?.path !== STANDING_AUTHORIZATION ||
    !standingPin ||
    receipt.standingAuthorization.sha256 !== standingPin.sha256 ||
    standing.sha256 !== standingPin.sha256 ||
    standing.receipt.schema !== 'appraise.m02-standing-test-authorization/v1' ||
    standing.receipt.literalUserInstruction !==
      'I am approving permission to for all future test runs. Note it down somewhere.' ||
    receipt.manifest?.path !== MATRIX_MANIFEST ||
    receipt.manifest.sha256 !== prepared.manifestFileSha256 ||
    receipt.manifest.manifestDigest !== prepared.manifestDigest ||
    receipt.exactReviewSha256 !== decision.exactReviewSha256 ||
    receipt.proposal?.path !== prepared.manifest.recoveryProposalPath ||
    receipt.proposal.sha256 !== prepared.manifest.recoveryProposalSha256 ||
    receipt.noReplayOrResume !== true ||
    receipt.priorConsumedCommandsReusable !== false ||
    receipt.historicalAllocationsReset !== false ||
    receipt.noAutomaticFurtherInvocation !== true
  )
    fail('standing permission context or exact invocation binding changed')
  assertCommonBindings(receipt, prepared)
}

async function readHostTuple() {
  const plist = await fs.readFile('/System/Library/CoreServices/SystemVersion.plist', 'utf8')
  return {
    platform: process.platform,
    arch: process.arch,
    osBuild: plist.match(/<key>ProductBuildVersion<\/key>\s*<string>([^<]+)<\/string>/)?.[1],
    nodeExecutable: process.execPath,
    nodeMajor: Number(process.versions.node.split('.')[0]),
  }
}

function assertPredecessor(prior, prepared) {
  if (
    prior?.prepared?.manifest?.phase !== 'T2' ||
    prior.prepared.manifest.root !== '/private/tmp/appraise-m02-ta-matrix-p24' ||
    !isDeepStrictEqual(
      prior.prepared.manifest.cases,
      POLICY.cases.filter(item => item.phase === 'T2').map(item => item.id),
    ) ||
    digest(prior.prepared.manifest) !== prior.prepared.manifestDigest ||
    !isDeepStrictEqual(prior.r44TerminalEvidence, prepared.manifest.r44TerminalEvidence) ||
    prior.r44TerminalEvidence?.status !== 'T2_CASES_COMPLETED_NOT_CONTAINMENT' ||
    prior.r44TerminalEvidence.casesCompleted !== 24 ||
    !isDeepStrictEqual(prior.r44TerminalEvidence.pending, [])
  )
    fail('accepted full T2 predecessor absent or changed')
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

/** Exact review binds standing test permission to one invocation; no native-action grant is added. */
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
  const precheck = args[0] === '--precheck'
  if (args.length !== 6 || !['--run', '--precheck'].includes(args[0]) || args[1] !== MATRIX_MANIFEST)
    fail('exact --prepare, --verify, --precheck or --run invocation required')
  const [, , requestedDigest, requestedManifestSha, requestedReviewSha, requestedDecisionSha] = args
  if (![requestedDigest, requestedManifestSha, requestedReviewSha, requestedDecisionSha].every(hex64))
    fail('run digest argument')
  if (
    (ports.execPath ?? process.execPath) !== NODE ||
    (ports.programPath ?? process.argv[1]) !== ENTRYPOINT ||
    (ports.cwd ?? process.cwd()) !== REPO ||
    !reviewedHostEnvironment(ports.environment ?? process.env)
  )
    fail('host invocation environment changed')
  const verify = ports.verify ?? verifyWorkspacePreparation
  const readReview = ports.readReview ?? (() => readFixedReceipt(REVIEW))
  const readDecision = ports.readDecision ?? (() => readFixedReceipt(DECISION))
  const readAuthorizationContext = ports.readAuthorizationContext ?? (() => readFixedReceipt(AUTHORIZATION_CONTEXT))
  const prepared = await verify()
  const sourceSha256 = await (ports.sourceSha256 ?? (async () => sha(await readStableFile(ENTRYPOINT))))()
  const entryPin = prepared.manifest?.artifacts?.find(item => item.path === ENTRYPOINT)
  if (
    prepared.manifest?.version !== 'appraise.m02-ta-workspace-r45/v1' ||
    prepared.manifest.phase !== 'T3' ||
    prepared.manifest.root !== ROOT ||
    POLICY.roots.T3 !== ROOT ||
    !isDeepStrictEqual(prepared.manifest.cases, ['N01', 'N02']) ||
    digest(prepared.manifest) !== prepared.manifestDigest ||
    prepared.manifestDigest !== requestedDigest ||
    prepared.manifestFileSha256 !== requestedManifestSha ||
    entryPin?.sha256 !== sourceSha256 ||
    prepared.blockers?.length !== 0 ||
    prepared.runtimeEligible !== false ||
    prepared.manifest.nativeFileCreationUmask !== '0077' ||
    prepared.manifest.ta03?.nativeScratchHelperInventory !== 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED' ||
    prepared.manifest.sourceHostBudget?.nativeScratchHelperInventory !== 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED' ||
    prepared.manifest.rootPackageQualification?.currentSha256 !==
      '96c022e3f83bed882040c6f07c73ffca03819c13ad42bae97a2e8e24fe9c0118' ||
    !hex64(prepared.manifest.recoveryProposalSha256) ||
    prepared.manifest.futureInvocation?.requestedHostToolMode !==
      'exec_command sandbox_permissions=require_escalated' ||
    prepared.manifest.futureInvocation.workdir !== REPO ||
    prepared.manifest.futureInvocation.noAutomaticFurtherInvocation !== true ||
    prepared.manifest.recoveryBudget?.combinedListenerAllocationCeilingIncludingR16 !== 212 ||
    prepared.manifest.processStateObserver?.addonPath !== ADDON ||
    prepared.manifest.processStateObserver.addonSha256 !== ADDON_SHA256 ||
    !prepared.manifest.artifacts.some(row => row.path === ADDON && row.sha256 === ADDON_SHA256) ||
    !prepared.seal
  )
    fail('prepared manifest, source, or command drift')
  assertReview(await readReview(), { expectedReviewSha256: requestedReviewSha, prepared, sourceSha256 })
  const decision = await readDecision()
  assertDecision(decision, {
    expectedDecisionSha256: requestedDecisionSha,
    expectedReviewSha256: requestedReviewSha,
    prepared,
  })
  await assertStandingAuthorization(decision.receipt, prepared, readAuthorizationContext)
  const tuple = await (ports.tuple ?? readHostTuple)()
  const interpreter = prepared.manifest.artifacts.find(item => item.purpose === 'interpreter')
  if (
    tuple?.platform !== POLICY.executable.platform ||
    tuple.arch !== POLICY.executable.arch ||
    tuple.osBuild !== POLICY.executable.osBuild ||
    tuple.nodeExecutable !== NODE ||
    interpreter?.path !== NODE ||
    tuple.nodeMajor !== POLICY.executable.nodeMajor
  )
    fail('host/interpreter tuple drift')
  await (ports.verifyHostFile ?? verifyR45HostFile)()
  const verifyPrior = ports.verifyPrior ?? verifyFullT2Predecessor
  assertPredecessor(await verifyPrior(), prepared)
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
  let admission = null
  const phaseGeneration = Object.freeze({})
  let requestCounts = { canonical: 0, request: 0 }
  let actionIds = new Set()
  const recheck = async () => {
    assertReview(await readReview(), { expectedReviewSha256: requestedReviewSha, prepared, sourceSha256 })
    const currentDecision = await readDecision()
    assertDecision(currentDecision, {
      expectedDecisionSha256: requestedDecisionSha,
      expectedReviewSha256: requestedReviewSha,
      prepared,
    })
    await assertStandingAuthorization(currentDecision.receipt, prepared, readAuthorizationContext)
  }
  const authorize = async ({ action, id, manifestDigest, manifest }) => {
    await recheck()
    if (manifestDigest !== prepared.manifestDigest || digest(manifest) !== prepared.manifestDigest) return false
    const caseId = effectCase(action, id, currentCase)
    if (!caseId) return false
    const policy = POLICY.cases.find(item => item.id === caseId && item.phase === 'T3')
    if (!policy || policy.limits.scopedCalls !== 0 || policy.limits.workspaceActions !== 1) return false
    if (action === 'owned-loopback-listener') {
      const ticket = admission
      admission = null
      if (
        !ticket ||
        ticket.caseId !== caseId ||
        ticket.index !== currentIndex + 1 ||
        ticket.manifestDigest !== prepared.manifestDigest ||
        ticket.manifestFileSha256 !== prepared.manifestFileSha256 ||
        ticket.root !== ROOT ||
        ticket.phase !== 'T3' ||
        ticket.phaseGeneration !== phaseGeneration
      )
        return false
      if ((currentIndex >= 0 && !stopAuthorized) || prepared.manifest.cases[currentIndex + 1] !== caseId) return false
      currentIndex++
      currentCase = caseId
      stopAuthorized = false
      requestCounts = { canonical: 0, request: 0 }
      actionIds = new Set()
    } else if (caseId !== currentCase) return false
    else if (stopAuthorized && action !== 'owned-stop') return false
    if (Object.hasOwn(requestActions, action)) {
      const channel = requestActions[action]
      const suffix = id.slice(`${caseId}-listener-${channel}-`.length)
      if (!/^[1-9][0-9]*$/.test(suffix)) return false
      const index = Number(suffix)
      const limit = channel === 'canonical' ? policy.limits.canonicalRequests : policy.limits.providerRequests
      if (
        !Number.isSafeInteger(index) ||
        !Number.isSafeInteger(limit) ||
        index !== requestCounts[channel] + 1 ||
        index > limit
      )
        return false
      requestCounts[channel] = index
    } else if (action === 'owned-stop') stopAuthorized = true
    else {
      if (actionIds.has(id)) return false
      actionIds.add(id)
    }
    return true
  }
  const prepareCaseAdmission = async ({ caseId, assertPhaseBudget }) => {
    admission = null
    if (typeof assertPhaseBudget !== 'function') fail('phase-only admission guard missing')
    await assertPhaseBudget()
    await recheck()
    if ((currentIndex >= 0 && !stopAuthorized) || prepared.manifest.cases[currentIndex + 1] !== caseId)
      fail('admission case sequence or prior owned stop drift')
    assertPredecessor(await verifyPrior({ requireNewRootAbsent: false }), prepared)
    await assertPhaseBudget()
    await recheck()
    admission = Object.freeze({
      caseId,
      index: currentIndex + 1,
      manifestDigest: prepared.manifestDigest,
      manifestFileSha256: prepared.manifestFileSha256,
      root: ROOT,
      phase: 'T3',
      phaseGeneration,
    })
  }
  const verifyExactReview = async ({ manifestDigest, manifest }) => {
    await recheck()
    return manifestDigest === prepared.manifestDigest && digest(manifest) === prepared.manifestDigest
  }
  await recheck()
  await (ports.verifyAddonFile ?? (() => readStableFile(ADDON, ADDON_SHA256)))()
  const observerOs = await (ports.loadAddon ?? (async () => createRequire(import.meta.url)(ADDON)))()
  if (
    typeof observerOs?.identity !== 'function' ||
    typeof observerOs.listDirectChildren !== 'function' ||
    typeof observerOs.directChildMetadata !== 'function'
  )
    fail('owned observer addon exports changed')
  const run = ports.run ?? (async options => (await import('./workspace-runner.mjs')).runPreparedT3Workspace(options))
  const result = await run({ prepared, verifyExactReview, authorize, prepareCaseAdmission, observerOs })
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
