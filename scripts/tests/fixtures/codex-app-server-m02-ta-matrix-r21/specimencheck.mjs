/** Exercise real prepared bytes and fixed exact review with a disposable non-authority decision. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dispatchMatrixEntrypoint } from './entrypoint.mjs'
import { MATRIX_MANIFEST, verifyR21MatrixPreparation } from './preparation.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const ENTRYPOINT = join(HERE, 'entrypoint.mjs')
const REVIEW = join(REPO, '.appraisejs/m02-t2-r21-exact-review.json')
const ACTUAL_DECISION = join(REPO, '.appraisejs/m02-t2-r21-recovery-user-decision.json')
const NODE = '/opt/homebrew/Cellar/node/26.11.0/bin/node'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

export async function checkR21GeneratedSpecimen({ specimenPath }) {
  if (
    !isAbsolute(specimenPath) ||
    !specimenPath.startsWith('/private/tmp/') ||
    specimenPath === ACTUAL_DECISION ||
    specimenPath.includes('/appraise-m02-ta-matrix-p7/')
  )
    throw new Error('specimen requires a distinct disposable /private/tmp path')
  const prepared = await verifyR21MatrixPreparation()
  const reviewBytes = await fs.readFile(REVIEW)
  const reviewSha = sha(reviewBytes)
  const prefix = [
    '/usr/bin/env',
    '-i',
    'PATH=/usr/bin:/bin',
    'LANG=C',
    NODE,
    ENTRYPOINT,
    '--run',
    MATRIX_MANIFEST,
    prepared.manifestDigest,
    prepared.manifestFileSha256,
  ]
  const decision = {
    schema: 'appraise.m02-ta-t2-r21-recovery-user-decision/v1',
    verdict: 'APPROVE_ONE_FIXED_T2_R21_RECOVERY',
    scope: 'ONE_NEW_FULL_T2_P7_INVOCATION_NO_RESUME',
    evidenceClass: 'SYNTHETIC_OFFLINE_SPECIMEN_NO_USER_AUTHORITY',
    specimenOnly: true,
    visibleUserDecision: 'SYNTHETIC_NON_AUTHORITY_TEST_SPECIMEN',
    runtimeAuthority: false,
    manifestDigest: prepared.manifestDigest,
    manifestFileSha256: prepared.manifestFileSha256,
    exactReviewSha256: reviewSha,
    proposal: {
      path: prepared.manifest.recoveryProposalPath,
      sha256: prepared.manifest.recoveryProposalSha256,
    },
    exactInvocationPrefix: [...prefix, reviewSha],
    priorP1P2P3P4UnknownPreserved: true,
    requestedHostToolMode: 'exec_command sandbox_permissions=require_escalated',
    workdir: REPO,
    noAutomaticT2T3: true,
    preflightEvidence: structuredClone(prepared.manifest.preflightEvidence),
    ta04Authority: structuredClone(prepared.manifest.ta04Authority),
    historicalAvailability: structuredClone(prepared.manifest.historicalAvailability),
    cumulativeWholeCampaignCeilings: structuredClone(prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings),
  }
  const bytes = Buffer.from(`${JSON.stringify(decision, null, 2)}\n`)
  const handle = await fs.open(specimenPath, 'wx', 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } finally {
    await handle.close()
  }
  const decisionSha = sha(bytes)
  const result = await dispatchMatrixEntrypoint(
    ['--precheck', MATRIX_MANIFEST, prepared.manifestDigest, prepared.manifestFileSha256, reviewSha, decisionSha],
    {
      programPath: ENTRYPOINT, // Imported test process override; this is explicitly not host attestation.
      syntheticSpecimen: true,
      readDecision: async () => {
        const specimenBytes = await fs.readFile(specimenPath)
        return { receipt: JSON.parse(specimenBytes.toString('utf8')), sha256: sha(specimenBytes) }
      },
      loadAddon: async () => {
        throw new Error('specimen reached native addon port')
      },
      run: async () => {
        throw new Error('specimen reached runner port')
      },
    },
  )
  if (result.status !== 'PRECHECK_PASSED_NO_RUNTIME_AUTHORITY') throw new Error('R21 specimen precheck failed')
  return Object.freeze({
    status: 'SYNTHETIC_R21_SPECIMEN_PRECHECK_PASSED_NO_RUNTIME_AUTHORITY',
    specimenPath,
    specimenSha256: decisionSha,
    reviewSha256: reviewSha,
    manifestDigest: prepared.manifestDigest,
    manifestFileSha256: prepared.manifestFileSha256,
    programPathOverride: 'IMPORTED_TEST_ONLY_NOT_HOST_ATTESTATION',
    nativeEffects: false,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--specimen')
      throw new Error('expected --specimen /private/tmp/path')
    process.stdout.write(`${JSON.stringify(await checkR21GeneratedSpecimen({ specimenPath: process.argv[3] }))}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
