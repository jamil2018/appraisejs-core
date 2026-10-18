/** Pure R17 T2 manifest derivation. No root, listener, child or build output is created. */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyR11HostFile } from '../codex-app-server-m02-ta-owned-host-observer-r11/observer.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { outerMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { buildMatrixCanonicalBytes, HISTORICAL_BUNDLE, HISTORICAL_SHA } from './canonical-build.mjs'
import { verifyPriorT2Unknown } from './prior-evidence.mjs'
import { verifyConsumedPreflights } from './preflight-evidence.mjs'
import { POLICY, POLICY_DIGEST, JOURNAL_BASE_POLICY_DIGEST, ROOT_AMENDMENT, digest } from './policy.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r17')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t2-recovery-03.md')
// The coordinator freezes this document before source review and one offline preparation.
const PROPOSAL_SHA = 'c3d17fb95be5c151200d072013449fc24e838ab809bd85386d43132fcd50269e'
const SCHEMA = join(
  REPO,
  '.appraisejs/m02-executable-qualification-20261016-01/schemas/v2/AccountRateLimitsUpdatedNotification.json',
)
const SCHEMA_SHA = '37326ef0364007be0c8f92bf5cd228941b513f87266edd566d694409b5aa5b8b'
const PREDICATE = join(
  REPO,
  'scripts/tests/fixtures/codex-app-server-m02-ta-passive-telemetry-r13/rate-limit-advisory.mjs',
)
const PREDICATE_SHA = '68a219e4442b69af68ff6b88ed07d6e242be7f3b7e3991099a6e03012aa59925'
const R13_MANIFEST_SHA = '23a57757e47d07925a54a3bc7785f02495a56e26c6769476a2cda7bf75fb35a2'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs'].every(key => a[key] === b[key])

async function filePin(file, purpose) {
  const before = await fs.lstat(file)
  if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o022) !== 0)
    throw new Error('R17 pin identity drift')
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const held = await handle.stat()
    if (!same(before, held)) throw new Error('R17 pin replaced before read')
    const bytes = await handle.readFile()
    const after = await handle.stat()
    const pathAfter = await fs.lstat(file)
    if (!same(before, after) || !same(before, pathAfter) || bytes.length !== before.size)
      throw new Error('R17 pin changed during read')
    return Object.freeze({ path: file, purpose, sha256: sha(bytes) })
  } finally {
    await handle.close()
  }
}

async function tree(dir) {
  const output = []
  const walk = async file => {
    const state = await fs.lstat(file)
    if (state.isSymbolicLink()) throw new Error('R17 source symlink')
    if (state.isFile()) return output.push(file)
    if (!state.isDirectory()) throw new Error('R17 source special file')
    for (const name of await fs.readdir(file)) await walk(join(file, name))
  }
  await walk(dir)
  return output.sort()
}

export async function prepareR17MatrixManifest() {
  const [prior, host, canonical, preflight] = await Promise.all([
    verifyPriorT2Unknown(),
    verifyR11HostFile(),
    buildMatrixCanonicalBytes(),
    verifyConsumedPreflights(),
  ])
  const old = prior.manifest
  const oldBundle = old.artifacts.find(item => item.purpose === 'matrix-canonical-backend')
  if (
    prior.status !== 'PRIOR_P1_P2_P3_UNKNOWN_PRESERVED' ||
    old.version !== 'appraise.m02-ta-matrix-r13/v1' ||
    old.root !== ROOT_AMENDMENT.from ||
    old.policyDigest !== ROOT_AMENDMENT.priorPolicyDigest ||
    old.artifacts.length !== 6413 ||
    old.artifacts.filter(item => item.sha256 === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
      .length !== 16 ||
    oldBundle?.path !== HISTORICAL_BUNDLE ||
    oldBundle.sha256 !== HISTORICAL_SHA ||
    host.uid !== 502 ||
    host.processImageAttested !== false ||
    canonical.originalSha256 !== HISTORICAL_SHA ||
    preflight.status !== 'R15_UNKNOWN_R16_CLI_OBSERVED_PERMISSION_CHECK_ONLY'
  )
    throw new Error('R17 predecessor or installed host drift')
  for (const historicalPin of old.artifacts) {
    const current = await filePin(historicalPin.path, historicalPin.purpose)
    if (current.sha256 !== historicalPin.sha256) throw new Error('R17 historical artifact drift')
  }
  const required = [
    ...(await tree(HERE)),
    join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-r17.test.mjs'),
    SCHEMA,
    PREDICATE,
    join(REPO, 'scripts/tests/codex-app-server-m02-ta-passive-telemetry-r13.test.mjs'),
    PROPOSAL,
    ...prior.pinnedFiles,
    ...preflight.pinnedFiles,
  ]
  const additions = []
  for (const file of [...new Set(required)].sort()) additions.push(await filePin(file, `r17:${relative(REPO, file)}`))
  if (
    additions.find(item => item.path === PROPOSAL)?.sha256 !== PROPOSAL_SHA ||
    additions.find(item => item.path === SCHEMA)?.sha256 !== SCHEMA_SHA ||
    additions.find(item => item.path === PREDICATE)?.sha256 !== PREDICATE_SHA ||
    additions.find(item => item.path.endsWith('/m02-ta-matrix-build-r13/manifest.json'))?.sha256 !== R13_MANIFEST_SHA
  )
    throw new Error('R17 proposal, schema, validator, or accepted manifest drift')
  const historical = old.artifacts.map(item => ({
    ...item,
    purpose:
      item.purpose === 'matrix-canonical-backend'
        ? 'historical-r13-canonical-backend'
        : item.purpose === 'scoped-mcp-entry'
          ? 'historical-r13-scoped-entry'
          : item.purpose,
  }))
  const artifacts = new Map(historical.map(item => [item.path, item]))
  if (artifacts.size !== historical.length) throw new Error('R13 duplicate artifact path')
  for (const pin of additions) {
    const existing = artifacts.get(pin.path)
    if (existing && existing.sha256 !== pin.sha256) throw new Error('R17 duplicate pin drift')
    if (!existing) artifacts.set(pin.path, pin)
  }
  const scoped = additions.find(item => item.path === join(HERE, 'scoped-entry.mjs'))
  if (!scoped) throw new Error('R17 scoped entry absent')
  artifacts.set(scoped.path, { ...scoped, purpose: 'scoped-mcp-entry' })
  const bundle = join(BUILD, 'canonical-bridge.mjs')
  if (artifacts.has(bundle)) throw new Error('R17 output pin collision')
  const active = { path: bundle, purpose: 'matrix-canonical-backend', sha256: canonical.sha256 }
  const manifest = {
    version: 'appraise.m02-ta-matrix-r17/v1',
    phase: 'T2',
    root: POLICY.roots.T2,
    policyDigest: POLICY_DIGEST,
    amendedPolicyDigest: POLICY_DIGEST,
    basePolicyDigest: JOURNAL_BASE_POLICY_DIGEST,
    journalBasePolicyDigest: JOURNAL_BASE_POLICY_DIGEST,
    recoveryProposalPath: PROPOSAL,
    recoveryProposalSha256: PROPOSAL_SHA,
    rootAmendment: ROOT_AMENDMENT,
    cases: [...old.cases],
    artifacts: [active, ...artifacts.values()],
    canonicalRelocation: {
      sourcePath: HISTORICAL_BUNDLE,
      originalSha256: canonical.originalSha256,
      stagedSha256: canonical.sha256,
      ...canonical.relocation,
      packageMetadataPath: old.canonicalRelocation.packageMetadataPath,
      migrationSourceRoot: old.canonicalRelocation.migrationSourceRoot,
      stagedCurrentWorkingDirectory: join(POLICY.roots.T2, 'supervisor'),
    },
    passiveTelemetryAmendment: {
      version: 'appraise.m02-ta-t2-r13-rate-limit-advisory/v1',
      priorInventoryDisposition: 'unsupported-fence',
      method: 'account/rateLimits/updated',
      schemaPath: SCHEMA,
      schemaSha256: SCHEMA_SHA,
      predicatePath: PREDICATE,
      predicateSha256: PREDICATE_SHA,
      disposition: 'IDLESS_ACTIVE_TURN_SCHEMA_SHAPED_PRESENTATION_ONLY',
      sharedQuota: { frames: 32, bytes: 16 * 1024 },
      valuesRetained: false,
      grantsAuthority: false,
    },
    sourceHostBudget: old.sourceHostBudget,
    recoveryBudget: {
      priorP1Unknown: prior.p1.consumed,
      priorP2Unknown: prior.p2.consumed,
      priorP3Unknown: prior.p3.consumed,
      newT2Maximum: {
        cases: 24,
        codexStarts: 24,
        mcpStarts: 24,
        threadStarts: 24,
        turnStarts: 23,
        providerRequests: 58,
        scopedCalls: 34,
        outerCalls: POLICY.cases.filter(item => item.phase === 'T2').reduce((sum, item) => sum + outerMaximum(item), 0),
        listenerStarts: 24,
        controlWrites: 96,
        canonicalRequests: 184,
        sourceCapacity: 58,
      },
      cumulativeWholeCampaignCeilings: {
        codexStarts: 28,
        mcpStarts: 28,
        threadStarts: 28,
        turnStarts: 27,
        providerRequests: 64,
        scopedCalls: 34,
        workspaceActions: 2,
        permissionReplies: 1,
        listenerStarts: 30,
        controlWrites: 112,
        outerCalls: 38,
        canonicalRequests: 192,
        sourceCapacity: 74,
      },
      priorCommandsConsumed: true,
      newInvocationRequiresSeparateExplicitUserDecision: true,
      standalonePreflightAllocations: preflight.allocations,
      combinedListenerAllocationCeilingIncludingR16: 31,
    },
    priorEvidence: {
      p1: {
        archiveIndexSha256: prior.p1.archiveIndexSha256,
        actualReviewSha256: prior.p1.reviewSha256,
        status: 'UNKNOWN',
      },
      p2: {
        archiveIndexSha256: prior.p2.archiveIndexSha256,
        actualReviewSha256: prior.p2.actualReviewSha256,
        journalSha256: prior.p2.journalSha256,
        rootIdentity: prior.p2.rootIdentity,
        status: 'UNKNOWN',
      },
      p3: {
        archiveIndexSha256: prior.p3.archiveIndexSha256,
        actualReviewSha256: prior.p3.actualReviewSha256,
        resultSha256: prior.p3.resultSha256,
        journalSha256: prior.p3.journalSha256,
        rootIdentity: prior.p3.rootIdentity,
        status: 'UNKNOWN',
      },
      allThreeRootsRetained: true,
    },
    preflightEvidence: {
      r15ReviewSha256: preflight.r15ReviewSha256,
      r16ReviewSha256: preflight.r16ReviewSha256,
      r16ArchiveIndexSha256: preflight.r16ArchiveIndexSha256,
      r16VisibleSha256: preflight.r16VisibleSha256,
      r16ManifestSha256: preflight.r16ManifestSha256,
      r16ManifestDigest: preflight.r16ManifestDigest,
      r16RootIdentity: preflight.r16RootIdentity,
      cliStatus: 'OBSERVED_PERMISSION_CHECK_ONLY',
      diskStatus: 'CANDIDATE_OBSERVATION_PENDING_FINAL_DEADLINE',
      actualHostMode: 'UNATTESTED',
      evidenceClass: preflight.evidenceClass,
    },
    futureInvocation: {
      requestedHostToolMode: 'exec_command sandbox_permissions=require_escalated',
      workdir: REPO,
      noAutomaticT2T3: true,
      priorUnknownsRequired: ['p1', 'p2', 'p3'],
      sourceEnforcementOfHostMode: 'UNATTESTED',
    },
    installedCodeModeHost: {
      path: host.path,
      sha256: host.sha256,
      uid: host.uid,
      mode: host.mode,
      nlink: host.nlink,
      dev: host.dev,
      ino: host.ino,
      evidenceClass: host.evidenceClass,
      processImageAttested: false,
    },
    nativeFileCreationUmask: '0077',
    routeReview: old.routeReview,
    runtimeAuthorized: false,
    evidenceClass: 'OFFLINE_R17_RECOVERY_CANDIDATE_EXACT_REVIEW_AND_NEW_USER_DECISION_REQUIRED',
  }
  return Object.freeze({
    manifest,
    manifestDigest: digest(manifest),
    canonicalBytes: canonical.bytes,
    canonicalSha256: canonical.sha256,
    blockers: [],
    runtimeEligible: false,
    seal: loadSealedRouteEvidence(),
  })
}
