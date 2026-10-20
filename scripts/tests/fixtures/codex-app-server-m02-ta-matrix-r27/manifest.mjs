/** B01-only R27 diagnostic probe; frozen predecessors and strict gates remain required. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyR26Predecessor } from './r26-evidence.mjs'
import { readStableFile } from './r21-evidence.mjs'
import { verifyR27HostFile } from './host-file.mjs'
import { buildR27CanonicalBytes } from './canonical-build.mjs'
import { POLICY, POLICY_DIGEST, ROOT_AMENDMENT, digest } from './policy.mjs'
const HERE = dirname(fileURLToPath(import.meta.url)),
  REPO = resolve(HERE, '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r27')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-r27-child-path-diagnostic-proposal-01.md')
const AUTHORITY = join(REPO, '.appraisejs/m02-continuing-implementation-authority-01.json')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
async function pin(file) {
  return { path: file, purpose: `r27:${relative(REPO, file)}`, sha256: sha(await readStableFile(file)) }
}
async function modules(directory) {
  const names = await fs.readdir(directory)
  if (names.some(name => !/^[a-z0-9-]+\.mjs$/.test(name))) throw new Error('R27 source membership drift')
  return names.sort().map(name => join(directory, name))
}
export async function prepareR27MatrixManifest() {
  const predecessor = await verifyR26Predecessor()
  const host = await verifyR27HostFile()
  if (host.processImageAttested !== false) throw new Error('R27 unexpected host attestation')
  const canonical = await buildR27CanonicalBytes()
  const old = predecessor.prepared.manifest
  const authorityBytes = await readStableFile(AUTHORITY)
  const authority = JSON.parse(authorityBytes)
  if (
    authority.schema !== 'appraise.m02-continuing-implementation-authority/v1' ||
    authority.exactArtifactUserApprovalClaimed !== false ||
    !authority.userObjective?.includes('all actions relating to implemention')
  )
    throw new Error('R27 continuing implementation authority drift')
  const paths = new Set([
    ...(await modules(HERE)),
    PROPOSAL,
    ...[
      'm02-r26-native-terminal-01.json',
      'm02-r26-native-terminal-evidence-01/index.json',
      'm02-r26-user-authorization-context-01.json',
      'm02-t2-r26-recovery-user-decision.json',
      'm02-t2-r26-exact-review.json',
      'm02-r26-approved-native-submission-01.json',
      'm02-ta-matrix-build-r26-02/manifest.json',
      'm02-standing-test-authorization-01.json',
    ].map(name => join(REPO, '.appraisejs', name)),
    join(REPO, 'tasks/codex-app-server-journeys/m02-r26-native-findings-01.md'),
    join(REPO, 'tasks/codex-app-server-journeys/M02-STANDING-TEST-AUTHORIZATION.md'),
  ])
  for (const name of [
    'phase-journal.jsonl',
    'provider-response-1.json',
    'provider-response-2.json',
    'provider-response-3.json',
    'mcp-startup.json',
    'mcp-exit.json',
    'late-case-failure.json',
  ])
    paths.add(join(REPO, '.appraisejs/m02-r26-native-terminal-evidence-01', name))
  const artifacts = new Map()
  for (const row of old.artifacts)
    artifacts.set(row.path, {
      ...row,
      purpose:
        row.purpose === 'matrix-canonical-backend'
          ? 'historical-r26-canonical-backend'
          : row.purpose === 'scoped-mcp-entry'
            ? 'historical-r26-scoped-entry'
            : row.purpose,
    })
  for (const file of [...paths].sort()) {
    const row = await pin(file),
      existing = artifacts.get(file)
    if (existing && existing.sha256 !== row.sha256) throw new Error('R27 predecessor pin contradiction')
    if (!existing) artifacts.set(file, row)
  }
  const scoped = artifacts.get(join(HERE, 'scoped-entry.mjs'))
  artifacts.set(scoped.path, { ...scoped, purpose: 'scoped-mcp-entry' })
  const active = {
    path: join(BUILD, 'canonical-bridge.mjs'),
    purpose: 'matrix-canonical-backend',
    sha256: canonical.sha256,
  }
  if (artifacts.has(active.path)) throw new Error('R27 output collision')
  const budget = structuredClone(old.recoveryBudget)
  budget.historicalR26Ceilings = structuredClone(budget.cumulativeWholeCampaignCeilings)
  budget.priorR26Unknown = {
    ...predecessor.r26TerminalEvidence.consumed,
    sourceCapacity: 4,
    casesCompleted: 0,
    cleanup: 'UNKNOWN',
  }
  for (const [key, count] of Object.entries(predecessor.r26TerminalEvidence.consumed))
    if (Object.hasOwn(budget.cumulativeWholeCampaignCeilings, key)) budget.cumulativeWholeCampaignCeilings[key] += count
  budget.cumulativeWholeCampaignCeilings.sourceCapacity += 4
  budget.historicalCombinedListenerCeilingIncludingR16 = budget.combinedListenerAllocationCeilingIncludingR16
  budget.combinedListenerAllocationCeilingIncludingR16 += 1
  budget.historicalR26NewT2Maximum = structuredClone(budget.newT2Maximum)
  budget.newT2Maximum = {
    cases: 1,
    codexStarts: 1,
    mcpStarts: 1,
    threadStarts: 1,
    turnStarts: 1,
    providerRequests: 4,
    scopedCalls: 3,
    outerCalls: 3,
    listenerStarts: 1,
    controlWrites: 4,
    canonicalRequests: 14,
    sourceCapacity: 4,
    workspaceActions: 0,
    permissionReplies: 0,
    helperStarts: 0,
    auditRequests: 6,
  }
  budget.newInvocationRequiresSeparateExplicitUserDecision = true
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = false
  const proposal = artifacts.get(PROPOSAL)
  const manifest = {
    ...structuredClone(old),
    version: 'appraise.m02-ta-matrix-r27/v1',
    root: POLICY.roots.T2,
    cases: ['B01'],
    probeOnly: true,
    stopAfterB01: true,
    fullT2Qualification: false,
    policyDigest: POLICY_DIGEST,
    amendedPolicyDigest: POLICY_DIGEST,
    rootAmendment: ROOT_AMENDMENT,
    artifacts: [active, ...artifacts.values()],
    recoveryBudget: budget,
    historicalR26SourceHostBudget: structuredClone(old.sourceHostBudget),
    sourceHostBudget: {
      maximum: 4,
      t2CapacityAllocation: 4,
      futureT3CapacityAllocation: 0,
      allPhaseOuterMaximum: 3,
      auditRequestsMaximum: 6,
      reservationEvidenceClass: 'SOURCE_BOUND_CAPACITY_RESERVED',
      actualShortLivedHostStarts: 'UNKNOWN',
      actualHostCountAttested: false,
    },
    recoveryProposalPath: PROPOSAL,
    recoveryProposalSha256: proposal.sha256,
    continuingImplementationAuthority: {
      path: AUTHORITY,
      sha256: sha(authorityBytes),
      exactArtifactUserApprovalClaimed: false,
    },
    r26TerminalEvidence: predecessor.r26TerminalEvidence,
    predecessorR26Manifest: {
      path: join(REPO, '.appraisejs/m02-ta-matrix-build-r26-02/manifest.json'),
      sha256: predecessor.prepared.manifestFileSha256,
      manifestDigest: predecessor.prepared.manifestDigest,
    },
    priorEvidence: {
      ...structuredClone(old.priorEvidence),
      r26: {
        status: 'CONSUMED_UNKNOWN',
        casesCompleted: 0,
        cleanup: 'UNKNOWN',
        pending: [],
      },
    },
    canonicalRelocation: {
      ...old.canonicalRelocation,
      originalSha256: canonical.originalSha256,
      stagedSha256: canonical.sha256,
      ...canonical.relocation,
      stagedCurrentWorkingDirectory: join(POLICY.roots.T2, 'supervisor'),
    },
    evidenceClass: 'B01_DIAGNOSTIC_PROBE_EXACT_REVIEW_AND_USER_APPROVAL_REQUIRED',
    runtimeAuthorized: false,
  }
  if (
    manifest.artifacts.filter(x => x.purpose === 'matrix-canonical-backend').length !== 1 ||
    manifest.artifacts.filter(x => x.purpose === 'scoped-mcp-entry').length !== 1 ||
    manifest.artifacts.filter(x => x.availability === 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED').length !== 23 ||
    budget.cumulativeWholeCampaignCeilings.listenerStarts !== 36 ||
    budget.cumulativeWholeCampaignCeilings.sourceCapacity !== 98 ||
    budget.combinedListenerAllocationCeilingIncludingR16 !== 37
  )
    throw new Error('R27 exact composition or cumulative budget drift')
  return Object.freeze({
    manifest,
    manifestDigest: digest(manifest),
    canonicalBytes: canonical.bytes,
    canonicalSha256: canonical.sha256,
    blockers: [],
    runtimeEligible: false,
    seal: predecessor.prepared.seal,
  })
}
