/** Additive R24: exact frozen R23 predecessor, unchanged TA04/TA05, fresh p10 and bounded diagnostics. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyR23Predecessor } from './r23-evidence.mjs'
import { readStableFile } from './r21-evidence.mjs'
import { verifyR24HostFile } from './host-file.mjs'
import { buildR24CanonicalBytes } from './canonical-build.mjs'
import { POLICY, POLICY_DIGEST, ROOT_AMENDMENT, digest } from './policy.mjs'
const HERE = dirname(fileURLToPath(import.meta.url)),
  REPO = resolve(HERE, '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r24')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t2-recovery-09.md')
const AUTHORITY = join(REPO, '.appraisejs/m02-continuing-implementation-authority-01.json')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
async function pin(file) {
  return { path: file, purpose: `r24:${relative(REPO, file)}`, sha256: sha(await readStableFile(file)) }
}
async function modules(directory) {
  const names = await fs.readdir(directory)
  if (names.some(name => !/^[a-z0-9-]+\.mjs$/.test(name))) throw new Error('R24 source membership drift')
  return names.sort().map(name => join(directory, name))
}
export async function prepareR24MatrixManifest() {
  const predecessor = await verifyR23Predecessor()
  const host = await verifyR24HostFile()
  if (host.processImageAttested !== false) throw new Error('R24 unexpected host attestation')
  const canonical = await buildR24CanonicalBytes()
  const old = predecessor.prepared.manifest
  const authorityBytes = await readStableFile(AUTHORITY)
  const authority = JSON.parse(authorityBytes)
  if (
    authority.schema !== 'appraise.m02-continuing-implementation-authority/v1' ||
    authority.exactArtifactUserApprovalClaimed !== false ||
    !authority.userObjective?.includes('all actions relating to implemention')
  )
    throw new Error('R24 continuing implementation authority drift')
  const paths = new Set([
    ...(await modules(HERE)),
    ...(await modules(join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-r24-composed'))),
    ...(await modules(join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-r24-diagnostics-offline'))),
    ...['diagnostics', 'composed', 'cases'].map(name =>
      join(REPO, `scripts/tests/codex-app-server-m02-ta-r24-${name}.test.mjs`),
    ),
    PROPOSAL,
    AUTHORITY,
    join(REPO, '.appraisejs/m02-ta-matrix-build-r23/manifest.json'),
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
    paths.add(join(REPO, '.appraisejs/m02-r23-native-terminal-evidence-01', name))
  const artifacts = new Map()
  for (const row of old.artifacts)
    artifacts.set(row.path, {
      ...row,
      purpose:
        row.purpose === 'matrix-canonical-backend'
          ? 'historical-r23-canonical-backend'
          : row.purpose === 'scoped-mcp-entry'
            ? 'historical-r23-scoped-entry'
            : row.purpose,
    })
  for (const file of [...paths].sort()) {
    const row = await pin(file),
      existing = artifacts.get(file)
    if (existing && existing.sha256 !== row.sha256) throw new Error('R24 predecessor pin contradiction')
    if (!existing) artifacts.set(file, row)
  }
  const scoped = artifacts.get(join(HERE, 'scoped-entry.mjs'))
  artifacts.set(scoped.path, { ...scoped, purpose: 'scoped-mcp-entry' })
  const active = {
    path: join(BUILD, 'canonical-bridge.mjs'),
    purpose: 'matrix-canonical-backend',
    sha256: canonical.sha256,
  }
  if (artifacts.has(active.path)) throw new Error('R24 output collision')
  const budget = structuredClone(old.recoveryBudget)
  budget.historicalR23Ceilings = structuredClone(budget.cumulativeWholeCampaignCeilings)
  budget.priorR23Unknown = {
    ...predecessor.r23TerminalEvidence.consumed,
    sourceCapacity: 4,
    casesCompleted: 0,
    cleanup: 'UNKNOWN',
  }
  for (const [key, count] of Object.entries(predecessor.r23TerminalEvidence.consumed))
    if (Object.hasOwn(budget.cumulativeWholeCampaignCeilings, key)) budget.cumulativeWholeCampaignCeilings[key] += count
  budget.cumulativeWholeCampaignCeilings.sourceCapacity += 4
  budget.historicalCombinedListenerCeilingIncludingR16 = budget.combinedListenerAllocationCeilingIncludingR16
  budget.combinedListenerAllocationCeilingIncludingR16 += 1
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  const proposal = artifacts.get(PROPOSAL)
  const manifest = {
    ...structuredClone(old),
    version: 'appraise.m02-ta-matrix-r24/v1',
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
    r23TerminalEvidence: predecessor.r23TerminalEvidence,
    predecessorR23Manifest: {
      path: join(REPO, '.appraisejs/m02-ta-matrix-build-r23/manifest.json'),
      sha256: predecessor.prepared.manifestFileSha256,
      manifestDigest: predecessor.prepared.manifestDigest,
    },
    priorEvidence: {
      ...structuredClone(old.priorEvidence),
      r23: {
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
    evidenceClass: 'ADDITIVE_R24_CONTINUATION_DIAGNOSTICS_EXACT_REVIEW_REQUIRED',
    runtimeAuthorized: false,
  }
  if (
    manifest.artifacts.filter(x => x.purpose === 'matrix-canonical-backend').length !== 1 ||
    manifest.artifacts.filter(x => x.purpose === 'scoped-mcp-entry').length !== 1 ||
    manifest.artifacts.filter(x => x.availability === 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED').length !== 23 ||
    budget.cumulativeWholeCampaignCeilings.listenerStarts !== 33 ||
    budget.cumulativeWholeCampaignCeilings.sourceCapacity !== 86 ||
    budget.combinedListenerAllocationCeilingIncludingR16 !== 34
  )
    throw new Error('R24 exact composition or cumulative budget drift')
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
