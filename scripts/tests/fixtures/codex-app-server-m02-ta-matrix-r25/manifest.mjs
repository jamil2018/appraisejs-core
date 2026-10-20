/** Additive R25: exact frozen R24 predecessor, unchanged TA04/TA05, fresh p11 and selected-role MCP approval correction. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyR24Predecessor } from './r24-evidence.mjs'
import { readStableFile } from './r21-evidence.mjs'
import { verifyR25HostFile } from './host-file.mjs'
import { buildR25CanonicalBytes } from './canonical-build.mjs'
import { POLICY, POLICY_DIGEST, ROOT_AMENDMENT, digest } from './policy.mjs'
const HERE = dirname(fileURLToPath(import.meta.url)),
  REPO = resolve(HERE, '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r25')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-ta-mcp-approval-policy-correction-proposal-02.md')
const AUTHORITY = join(REPO, '.appraisejs/m02-continuing-implementation-authority-01.json')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
async function pin(file) {
  return { path: file, purpose: `r25:${relative(REPO, file)}`, sha256: sha(await readStableFile(file)) }
}
async function modules(directory) {
  const names = await fs.readdir(directory)
  if (names.some(name => !/^[a-z0-9-]+\.mjs$/.test(name))) throw new Error('R25 source membership drift')
  return names.sort().map(name => join(directory, name))
}
export async function prepareR25MatrixManifest() {
  const predecessor = await verifyR24Predecessor()
  const host = await verifyR25HostFile()
  if (host.processImageAttested !== false) throw new Error('R25 unexpected host attestation')
  const canonical = await buildR25CanonicalBytes()
  const old = predecessor.prepared.manifest
  const authorityBytes = await readStableFile(AUTHORITY)
  const authority = JSON.parse(authorityBytes)
  if (
    authority.schema !== 'appraise.m02-continuing-implementation-authority/v1' ||
    authority.exactArtifactUserApprovalClaimed !== false ||
    !authority.userObjective?.includes('all actions relating to implemention')
  )
    throw new Error('R25 continuing implementation authority drift')
  const paths = new Set([
    ...(await modules(HERE)),
    ...(await modules(join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-r25-composed'))),
    ...(await modules(join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-r25-approval-policy-01'))),
    ...['approval-policy', 'composed', 'cases'].map(name =>
      join(REPO, `scripts/tests/codex-app-server-m02-ta-r25-${name}.test.mjs`),
    ),
    PROPOSAL,
    join(REPO, '.appraisejs/m02-r25-pinned-config-schema-01/approval-mode-schema-excerpt.json'),
    join(REPO, '.appraisejs/m02-r24-native-terminal-01.json'),
    join(REPO, '.appraisejs/m02-r24-native-terminal-evidence-01/index.json'),
    join(REPO, '.appraisejs/m02-r24-postrun-integrity-01.json'),
    join(REPO, '.appraisejs/m02-r24-private-history-observation-01.json'),
    join(REPO, '.appraisejs/m02-r24-private-history-literal-observation-01.json'),
    join(REPO, '.appraisejs/m02-r24-approval-correction-design-review-02.json'),
    AUTHORITY,
    join(REPO, '.appraisejs/m02-ta-matrix-build-r24/manifest.json'),
    join(REPO, '.appraisejs/m02-t2-r23-exact-review.json'),
    join(REPO, '.appraisejs/m02-t2-r23-recovery-user-decision.json'),
    join(REPO, '.appraisejs/m02-r23-native-terminal-01.json'),
    join(REPO, '.appraisejs/m02-r23-native-terminal-evidence-01/index.json'),
    join(REPO, '.appraisejs/m02-r23-postrun-integrity-01.json'),
    join(REPO, '.appraisejs/m02-r23-investigation-exact-review-01.json'),
    join(REPO, '.appraisejs/m02-r23-investigation-evidence-01/index.json'),
    join(REPO, '.appraisejs/m02-r23-investigation-validation-supplement-01.json'),
    ...(await modules(join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-r23-investigation-01'))),
  ])
  for (const name of [
    'phase-journal.jsonl',
    'provider-failure.json',
    'provider-response-1.json',
    'mcp-startup.json',
    'mcp-exit.json',
  ])
    paths.add(join(REPO, '.appraisejs/m02-r24-native-terminal-evidence-01', name))
  const artifacts = new Map()
  for (const row of old.artifacts)
    artifacts.set(row.path, {
      ...row,
      purpose:
        row.purpose === 'matrix-canonical-backend'
          ? 'historical-r24-canonical-backend'
          : row.purpose === 'scoped-mcp-entry'
            ? 'historical-r24-scoped-entry'
            : row.purpose,
    })
  for (const file of [...paths].sort()) {
    const row = await pin(file),
      existing = artifacts.get(file)
    if (existing && existing.sha256 !== row.sha256) throw new Error('R25 predecessor pin contradiction')
    if (!existing) artifacts.set(file, row)
  }
  const scoped = artifacts.get(join(HERE, 'scoped-entry.mjs'))
  artifacts.set(scoped.path, { ...scoped, purpose: 'scoped-mcp-entry' })
  const active = {
    path: join(BUILD, 'canonical-bridge.mjs'),
    purpose: 'matrix-canonical-backend',
    sha256: canonical.sha256,
  }
  if (artifacts.has(active.path)) throw new Error('R25 output collision')
  const budget = structuredClone(old.recoveryBudget)
  budget.historicalR24Ceilings = structuredClone(budget.cumulativeWholeCampaignCeilings)
  budget.priorR24Unknown = {
    ...predecessor.r24TerminalEvidence.consumed,
    sourceCapacity: 4,
    casesCompleted: 0,
    cleanup: 'UNKNOWN',
  }
  for (const [key, count] of Object.entries(predecessor.r24TerminalEvidence.consumed))
    if (Object.hasOwn(budget.cumulativeWholeCampaignCeilings, key)) budget.cumulativeWholeCampaignCeilings[key] += count
  budget.cumulativeWholeCampaignCeilings.sourceCapacity += 4
  budget.historicalCombinedListenerCeilingIncludingR16 = budget.combinedListenerAllocationCeilingIncludingR16
  budget.combinedListenerAllocationCeilingIncludingR16 += 1
  budget.newInvocationRequiresSeparateExplicitUserDecision = true
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = false
  const proposal = artifacts.get(PROPOSAL)
  const manifest = {
    ...structuredClone(old),
    version: 'appraise.m02-ta-matrix-r25/v1',
    root: POLICY.roots.T2,
    policyDigest: POLICY_DIGEST,
    amendedPolicyDigest: POLICY_DIGEST,
    rootAmendment: ROOT_AMENDMENT,
    artifacts: [active, ...artifacts.values()],
    recoveryBudget: budget,
    recoveryProposalPath: PROPOSAL,
    recoveryProposalSha256: proposal.sha256,
    continuingImplementationAuthority: {
      path: AUTHORITY,
      sha256: sha(authorityBytes),
      exactArtifactUserApprovalClaimed: false,
    },
    r24TerminalEvidence: predecessor.r24TerminalEvidence,
    predecessorR24Manifest: {
      path: join(REPO, '.appraisejs/m02-ta-matrix-build-r24/manifest.json'),
      sha256: predecessor.prepared.manifestFileSha256,
      manifestDigest: predecessor.prepared.manifestDigest,
    },
    priorEvidence: {
      ...structuredClone(old.priorEvidence),
      r24: {
        status: 'CONSUMED_UNKNOWN',
        casesCompleted: 0,
        cleanup: 'UNKNOWN',
        pendingProviderRequest: 'B01-listener-request-2',
      },
    },
    canonicalRelocation: {
      ...old.canonicalRelocation,
      originalSha256: canonical.originalSha256,
      stagedSha256: canonical.sha256,
      ...canonical.relocation,
      stagedCurrentWorkingDirectory: join(POLICY.roots.T2, 'supervisor'),
    },
    evidenceClass: 'ADDITIVE_R25_SCOPED_MCP_APPROVAL_CORRECTION_EXACT_REVIEW_REQUIRED',
    runtimeAuthorized: false,
  }
  if (
    manifest.artifacts.filter(x => x.purpose === 'matrix-canonical-backend').length !== 1 ||
    manifest.artifacts.filter(x => x.purpose === 'scoped-mcp-entry').length !== 1 ||
    manifest.artifacts.filter(x => x.availability === 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED').length !== 23 ||
    budget.cumulativeWholeCampaignCeilings.listenerStarts !== 34 ||
    budget.cumulativeWholeCampaignCeilings.sourceCapacity !== 90 ||
    budget.combinedListenerAllocationCeilingIncludingR16 !== 35
  )
    throw new Error('R25 exact composition or cumulative budget drift')
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
