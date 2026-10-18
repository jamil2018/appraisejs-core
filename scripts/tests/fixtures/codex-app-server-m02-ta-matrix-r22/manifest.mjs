/** Offline R22 derivation from exact R21 evidence and TA04's finite historical witness set. */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { buildR22CanonicalBytes, HISTORICAL_BUNDLE, HISTORICAL_SHA } from './canonical-build.mjs'
import { verifyR22HostFile } from './host-file.mjs'
import {
  verifyR21Predecessor,
  readStableFile,
  R21_MANIFEST,
  R21_SOURCE_REVIEW,
  R21_ACTUAL_REVIEW,
  R21_ROOT,
} from './r21-evidence.mjs'
import { POLICY, POLICY_DIGEST, ROOT_AMENDMENT, digest } from './policy.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r22')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t2-recovery-07.md')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'].every(k => a[k] === b[k])

async function pin(file) {
  const before = await fs.lstat(file)
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || (before.mode & 0o022) !== 0)
    throw new Error('R22 source pin identity drift')
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    if (!same(before, await handle.stat())) throw new Error('R22 source pin replaced')
    const bytes = await handle.readFile()
    if (bytes.length !== before.size || !same(before, await handle.stat()) || !same(before, await fs.lstat(file)))
      throw new Error('R22 source pin changed during read')
    return Object.freeze({ path: file, purpose: `r22:${relative(REPO, file)}`, sha256: sha(bytes) })
  } finally {
    await handle.close()
  }
}

async function sourceTree(directory) {
  const names = await fs.readdir(directory)
  if (names.length !== 24 || names.some(name => !/^[a-z0-9-]+\.mjs$/.test(name)))
    throw new Error('R22 source membership drift')
  return names.sort().map(name => join(directory, name))
}

async function helperTree(directory) {
  const names = await fs.readdir(directory)
  if (names.length < 1 || names.some(name => !/^[a-z0-9-]+\.mjs$/.test(name)))
    throw new Error('R22 offline helper membership drift')
  return names.sort().map(name => join(directory, name))
}

export async function prepareR22MatrixManifest() {
  const [predecessor, host, canonical] = await Promise.all([
    verifyR21Predecessor(),
    verifyR22HostFile(),
    buildR22CanonicalBytes(),
  ])
  const old = predecessor.manifest
  const prior = predecessor.ta04
  if (
    old.version !== 'appraise.m02-ta-matrix-r21/v1' ||
    old.root !== R21_ROOT ||
    old.policyDigest !== ROOT_AMENDMENT.priorPolicyDigest ||
    old.artifacts.length !== 6584 ||
    old.historicalAvailability?.archiveWitnesses?.length !== 23 ||
    old.cases?.length !== 24 ||
    canonical.originalSha256 !== HISTORICAL_SHA ||
    host.processImageAttested !== false ||
    old.recoveryBudget?.cumulativeWholeCampaignCeilings?.listenerStarts !== 31 ||
    old.recoveryBudget?.cumulativeWholeCampaignCeilings?.sourceCapacity !== 78 ||
    old.recoveryBudget?.combinedListenerAllocationCeilingIncludingR16 !== 32
  )
    throw new Error('R22 predecessor drift')
  const proposal = await pin(PROPOSAL)
  const required = [
    ...new Set([
      ...(await sourceTree(HERE)),
      ...(await helperTree(join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r22-offline'))),
      ...(await helperTree(join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r22-composed'))),
      join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-r22-composed.test.mjs'),
      join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-r22-cases.test.mjs'),
      join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-r22-prior.test.mjs'),
      ...predecessor.pinnedFiles,
      PROPOSAL,
    ]),
  ].sort()
  const additions = []
  for (const file of required) additions.push(await pin(file))
  if (additions.find(x => x.path === PROPOSAL)?.sha256 !== proposal.sha256) throw new Error('R22 proposal pin drift')
  const priorPaths = new Set(prior.historicalSources.map(x => x.path))
  if (priorPaths.size !== 23) throw new Error('TA04 witness cardinality drift')
  const artifacts = new Map()
  for (const row of old.artifacts) {
    if (artifacts.has(row.path)) throw new Error('R21 duplicate artifact path')
    artifacts.set(row.path, {
      ...row,
      purpose:
        row.purpose === 'matrix-canonical-backend'
          ? 'historical-r21-canonical-backend'
          : row.purpose === 'scoped-mcp-entry'
            ? 'historical-r21-scoped-entry'
            : row.purpose,
    })
  }
  for (const row of additions) {
    const priorRow = artifacts.get(row.path)
    if (priorRow && priorRow.sha256 !== row.sha256) throw new Error('R22 duplicate pin drift')
    if (!priorRow) artifacts.set(row.path, row)
  }
  const scoped = additions.find(x => x.path === join(HERE, 'scoped-entry.mjs'))
  if (!scoped) throw new Error('R22 scoped entry absent')
  artifacts.set(scoped.path, { ...scoped, purpose: 'scoped-mcp-entry' })
  const bundle = join(BUILD, 'canonical-bridge.mjs')
  if (artifacts.has(bundle)) throw new Error('R22 canonical output collision')
  const active = { path: bundle, purpose: 'matrix-canonical-backend', sha256: canonical.sha256 }
  const cumulative = { ...old.recoveryBudget.cumulativeWholeCampaignCeilings, listenerStarts: 32, sourceCapacity: 82 }
  const priorEvidence = {
    ...structuredClone(old.priorEvidence),
    p7: {
      status: 'UNKNOWN',
      casesCompleted: 0,
      listenerAllocation: 1,
      listenerAck: 'NOT_RECORDED',
      listenerEffect: 'UNKNOWN',
      cleanup: 'UNKNOWN',
      sourceCapacityReserved: 4,
      root: R21_ROOT,
      rootIdentity: predecessor.rootIdentity,
      journalSha256: predecessor.journalSha256,
    },
  }
  const manifest = {
    ...structuredClone(old),
    version: 'appraise.m02-ta-matrix-r22/v1',
    root: POLICY.roots.T2,
    policyDigest: POLICY_DIGEST,
    amendedPolicyDigest: POLICY_DIGEST,
    rootAmendment: ROOT_AMENDMENT,
    recoveryProposalPath: PROPOSAL,
    recoveryProposalSha256: proposal.sha256,
    artifacts: [active, ...artifacts.values()],
    canonicalRelocation: {
      ...old.canonicalRelocation,
      sourcePath: HISTORICAL_BUNDLE,
      originalSha256: canonical.originalSha256,
      stagedSha256: canonical.sha256,
      ...canonical.relocation,
      stagedCurrentWorkingDirectory: join(POLICY.roots.T2, 'supervisor'),
    },
    recoveryBudget: {
      ...old.recoveryBudget,
      priorR21Unknown: { listenerStarts: 1, sourceCapacity: 4, casesCompleted: 0 },
      cumulativeWholeCampaignCeilings: cumulative,
      combinedListenerAllocationCeilingIncludingR16: 33,
    },
    priorEvidence,
    historicalAvailability: {
      ...structuredClone(old.historicalAvailability),
      archiveWitnesses: prior.historicalSources,
      predecessorR21ManifestPath: R21_MANIFEST,
      predecessorR21ManifestSha256: '6b88000f383ecbac5ec55a0cb12a0fc39bd36abbce76d05958923c00a50d0303',
      predecessorR21Entries: 6584,
      currentPresentR21Matches: 6561,
      historicalSourceAbsentArchiveVerified: 23,
    },
    r21TerminalEvidence: {
      sourceReview: R21_SOURCE_REVIEW,
      sourceReviewSha256: '60c12f4a22d765aa1d83c352f6af4ddd02ea8cccb5323d8955cd27853805b960',
      actualReview: R21_ACTUAL_REVIEW,
      actualReviewSha256: '83a557788654d25340aa04fc345c68392f0afbdeaf8062e0c28f9bd9d7d1ac77',
      root: R21_ROOT,
      rootIdentity: predecessor.rootIdentity,
      journalSha256: predecessor.journalSha256,
      status: 'UNKNOWN',
      completed: 0,
      cleanup: 'UNKNOWN',
    },
    runtimeAuthorized: false,
    evidenceClass: 'OFFLINE_R22_SOURCE_CANDIDATE_REVIEW_AND_NEW_USER_DECISION_REQUIRED',
  }
  if (
    manifest.artifacts.filter(x => x.purpose === 'matrix-canonical-backend').length !== 1 ||
    manifest.artifacts.filter(x => x.purpose === 'scoped-mcp-entry').length !== 1 ||
    manifest.artifacts.filter(x => x.availability === 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED').length !== 23 ||
    manifest.recoveryBudget.newT2Maximum.sourceCapacity !== 58 ||
    manifest.recoveryBudget.cumulativeWholeCampaignCeilings.listenerStarts !== 32 ||
    manifest.recoveryBudget.cumulativeWholeCampaignCeilings.sourceCapacity !== 82
  )
    throw new Error('R22 active purpose or budget drift')
  // A second read catches proposal drift across derivation without mutating the source tree.
  await readStableFile(PROPOSAL, proposal.sha256)
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
