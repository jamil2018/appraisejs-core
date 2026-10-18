import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { readFixedReceipt } from '../codex-app-server-m02-ta-matrix-r25/entrypoint.mjs'
import { MATRIX_MANIFEST } from '../codex-app-server-m02-ta-matrix-r25/preparation.mjs'
const repo = process.cwd()
const entry = path.join(repo, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r25/entrypoint.mjs')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const wire = object => Buffer.from(`${JSON.stringify(object, null, 2)}\n`)

/** Generated mock approvals are read from disposable bytes, never the actual fixed decision path. */
export async function receipts(
  prepared,
  directory,
  { revision = '25', program = entry, manifestPath = MATRIX_MANIFEST } = {},
) {
  const review = JSON.parse(fs.readFileSync(path.join(repo, '.appraisejs/m02-t2-r21-exact-review.json')))
  const decision = JSON.parse(fs.readFileSync(path.join(repo, '.appraisejs/m02-t2-r21-recovery-user-decision.json')))
  const prefix = [
    '/usr/bin/env',
    '-i',
    'PATH=/usr/bin:/bin',
    'LANG=C',
    '/opt/homebrew/Cellar/node/26.11.0/bin/node',
    program,
    '--run',
    manifestPath,
    prepared.manifestDigest,
    prepared.manifestFileSha256,
  ]
  Object.assign(review, {
    schema: `appraise.m02-ta-t2-r${revision}-exact-review/v1`,
    reviewer: `/root/r24_review`,
    verdict: `ACCEPT_ONE_FIXED_T2_R${revision}_INVOCATION`,
    runtimeVerdict: 'NOT_RUN',
    exactInvocationPrefix: prefix,
    manifest: {
      path: manifestPath,
      fileSha256: prepared.manifestFileSha256,
      manifestDigest: prepared.manifestDigest,
      phase: 'T2',
      root: prepared.manifest.root,
      cases: prepared.manifest.cases,
    },
    entrypointSha256: sha(fs.readFileSync(program)),
    recoveryProposalSha256: prepared.manifest.recoveryProposalSha256,
    ta04Authority: prepared.manifest.ta04Authority,
    r24TerminalEvidence: structuredClone(prepared.manifest.r24TerminalEvidence),
    r23TerminalEvidence: structuredClone(prepared.manifest.r23TerminalEvidence),
    continuingImplementationAuthority: structuredClone(prepared.manifest.continuingImplementationAuthority),
    exactArtifactUserApprovalClaimed: false,
    r21TerminalEvidence: prepared.manifest.r21TerminalEvidence,
    rootPackageQualification: Object.fromEntries(Object.entries(prepared.manifest.rootPackageQualification).reverse()),
    r22BlockedEvidence: Object.fromEntries(Object.entries(prepared.manifest.r22BlockedEvidence).reverse()),
    combinedListenerAllocationCeilingIncludingR16: 35,
    historicalAvailability: prepared.manifest.historicalAvailability,
    preflightEvidence: Object.fromEntries(Object.entries(prepared.manifest.preflightEvidence).reverse()),
  })
  const reviewBytes = wire(review)
  const reviewSha = sha(reviewBytes)
  Object.assign(decision, {
    schema: `appraise.m02-ta-t2-r${revision}-recovery-user-decision/v1`,
    verdict: `APPROVE_ONE_FIXED_T2_R${revision}_INVOCATION`,
    scope: 'ONE_NEW_FULL_T2_P11_INVOCATION_NO_RESUME',
    evidenceClass: 'EXACT_USER_APPROVAL_REQUIRED_FOR_ONE_FRESH_NATIVE_INVOCATION',
    manifestDigest: prepared.manifestDigest,
    manifestFileSha256: prepared.manifestFileSha256,
    exactReviewSha256: reviewSha,
    proposal: { path: prepared.manifest.recoveryProposalPath, sha256: prepared.manifest.recoveryProposalSha256 },
    exactInvocationPrefix: [...prefix, reviewSha],
    ta04Authority: prepared.manifest.ta04Authority,
    r24TerminalEvidence: structuredClone(prepared.manifest.r24TerminalEvidence),
    r23TerminalEvidence: structuredClone(prepared.manifest.r23TerminalEvidence),
    continuingImplementationAuthority: structuredClone(prepared.manifest.continuingImplementationAuthority),
    exactArtifactUserApprovalClaimed: true,
    r21TerminalEvidence: prepared.manifest.r21TerminalEvidence,
    rootPackageQualification: Object.fromEntries(Object.entries(prepared.manifest.rootPackageQualification).reverse()),
    r22BlockedEvidence: Object.fromEntries(Object.entries(prepared.manifest.r22BlockedEvidence).reverse()),
    combinedListenerAllocationCeilingIncludingR16: 35,
    historicalAvailability: prepared.manifest.historicalAvailability,
    preflightEvidence: structuredClone(prepared.manifest.preflightEvidence),
    cumulativeWholeCampaignCeilings: Object.fromEntries(
      Object.entries(prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings).reverse(),
    ),
  })
  const decisionBytes = wire(decision)
  const decisionSha = sha(decisionBytes)
  fs.writeFileSync(path.join(directory, 'mock-review.json'), reviewBytes, { flag: 'wx', mode: 0o600 })
  fs.writeFileSync(path.join(directory, 'mock-decision.json'), decisionBytes, { flag: 'wx', mode: 0o600 })
  const read = name => () => readFixedReceipt(path.join(directory, name))
  return {
    args: ['--run', manifestPath, prepared.manifestDigest, prepared.manifestFileSha256, reviewSha, decisionSha],
    ports: {
      environment: { PATH: '/usr/bin:/bin', LANG: 'C' },
      execPath: '/opt/homebrew/Cellar/node/26.11.0/bin/node',
      programPath: program,
      cwd: repo,
      readReview: read('mock-review.json'),
      readDecision: read('mock-decision.json'),
      loadAddon: async () => observer,
    },
  }
}
