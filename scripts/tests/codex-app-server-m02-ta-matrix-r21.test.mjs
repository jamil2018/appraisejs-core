import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { dispatchMatrixEntrypoint } from './fixtures/codex-app-server-m02-ta-matrix-r21/entrypoint.mjs'
import { buildR21CanonicalBytes } from './fixtures/codex-app-server-m02-ta-matrix-r21/canonical-build.mjs'
import { digest, ROOT, PRIOR_ROOT } from './fixtures/codex-app-server-m02-ta-matrix-r21/policy.mjs'

const repo = process.cwd()
const entry = path.join(repo, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r21/entrypoint.mjs')
const manifestPath = path.join(repo, '.appraisejs/m02-ta-matrix-build-r21/manifest.json')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const wire = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
const reverse = object => Object.fromEntries(Object.entries(object).reverse())

async function specimen({ evidenceArray = false } = {}) {
  const [oldBytes, entryBytes] = await Promise.all([
    fs.readFile(path.join(repo, '.appraisejs/m02-ta-matrix-build-r19/manifest.json')),
    fs.readFile(entry),
  ])
  const manifest = structuredClone(JSON.parse(oldBytes).manifest)
  manifest.version = 'appraise.m02-ta-matrix-r21/v1'
  manifest.root = ROOT
  manifest.recoveryProposalPath = path.join(repo, 'tasks/codex-app-server-journeys/m02-ta-t2-recovery-05.md')
  manifest.recoveryProposalSha256 = 'aea1c4ad1c9c158edb60a086dac70a2c0d8ddb87212b316958aad24daefde983'
  manifest.priorEvidence.r19 = { status: 'GATE_ONLY_REFUSED', rootAbsent: true, casesCompleted: 0 }
  manifest.priorEvidence.allFourRootsRetained = false
  manifest.priorEvidence.currentOriginalRootIdentity = 'UNKNOWN'
  manifest.historicalAvailability = { currentPresentMatches: 6498, historicalSourceAbsentArchiveVerified: 23 }
  manifest.recoveryBudget.priorR19GateOnlyNodeInvocations = 1
  manifest.ta04Authority = {
    userDecision: { sha256: '196fe5f3809f10c00272948a941d99cfafbca597f89672b079a31c8fe59eb64a' },
  }
  if (evidenceArray) manifest.preflightEvidence.offlineArrayProbe = ['first', 'second']
  manifest.artifacts.push({ path: entry, purpose: 'r21:entrypoint', sha256: sha(entryBytes) })
  const prepared = {
    manifest,
    manifestDigest: digest(manifest),
    manifestFileSha256: 'a'.repeat(64),
    blockers: [],
    seal: { offlineFixture: true },
  }
  return { prepared, entrySha: sha(entryBytes) }
}

function approval(prepared, entrySha, { reviewChange, decisionChange } = {}) {
  const prefix = [
    '/usr/bin/env',
    '-i',
    'PATH=/usr/bin:/bin',
    'LANG=C',
    '/opt/homebrew/Cellar/node/26.11.0/bin/node',
    entry,
    '--run',
    manifestPath,
    prepared.manifestDigest,
    prepared.manifestFileSha256,
  ]
  const evidence = structuredClone(reverse(prepared.manifest.preflightEvidence))
  if (evidence.r16RootIdentity) evidence.r16RootIdentity = reverse(evidence.r16RootIdentity)
  const review = {
    schema: 'appraise.m02-ta-t2-r21-exact-review/v1',
    reviewer: '/root/r21_review',
    verdict: 'ACCEPT_ONE_FIXED_T2_R21_INVOCATION',
    runtimeVerdict: 'NOT_RUN',
    exactInvocationPrefix: prefix,
    manifest: {
      path: manifestPath,
      fileSha256: prepared.manifestFileSha256,
      manifestDigest: prepared.manifestDigest,
      phase: 'T2',
      root: ROOT,
      cases: prepared.manifest.cases,
    },
    entrypointSha256: entrySha,
    recoveryProposalSha256: prepared.manifest.recoveryProposalSha256,
    requestedHostToolMode: 'exec_command sandbox_permissions=require_escalated',
    workdir: repo,
    noAutomaticT2T3: true,
    priorP1P2P3P4UnknownPreserved: true,
    preflightEvidence: evidence,
    ta04Authority: prepared.manifest.ta04Authority,
    historicalAvailability: prepared.manifest.historicalAvailability,
  }
  reviewChange?.(review)
  const reviewBytes = wire(review)
  const reviewSha = sha(reviewBytes)
  const decision = {
    schema: 'appraise.m02-ta-t2-r21-recovery-user-decision/v1',
    verdict: 'APPROVE_ONE_FIXED_T2_R21_RECOVERY',
    scope: 'ONE_NEW_FULL_T2_P7_INVOCATION_NO_RESUME',
    evidenceClass: 'VISIBLE_HOST_CONVERSATION_DECISION_TRANSCRIBED_NOT_CRYPTOGRAPHIC_ATTESTATION',
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
    workdir: repo,
    noAutomaticT2T3: true,
    preflightEvidence: structuredClone(reverse(evidence)),
    ta04Authority: prepared.manifest.ta04Authority,
    historicalAvailability: prepared.manifest.historicalAvailability,
    cumulativeWholeCampaignCeilings: prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
  }
  decisionChange?.(decision)
  const decisionBytes = wire(decision)
  return {
    review,
    decision,
    reviewSha,
    decisionSha: sha(decisionBytes),
    args: [
      '--precheck',
      manifestPath,
      prepared.manifestDigest,
      prepared.manifestFileSha256,
      reviewSha,
      sha(decisionBytes),
    ],
  }
}

function ports(prepared, entrySha, accepted, counts) {
  return {
    environment: { PATH: '/usr/bin:/bin', LANG: 'C' },
    execPath: '/opt/homebrew/Cellar/node/26.11.0/bin/node',
    programPath: entry, // Imported test process has a different argv[1]; no host attestation.
    cwd: repo,
    verify: async () => prepared,
    sourceSha256: async () => entrySha,
    readReview: async () => ({ receipt: accepted.review, sha256: accepted.reviewSha }),
    readDecision: async () => ({ receipt: accepted.decision, sha256: accepted.decisionSha }),
    verifyHostFile: async () => {
      counts.host++
    },
    verifyPrior: async () => {
      counts.prior++
    },
    loadAddon: async () => {
      counts.addon++
      throw new Error('effect port reached')
    },
    run: async () => {
      counts.run++
      throw new Error('effect port reached')
    },
  }
}

test('p4 to p7 canonical relocation is exactly one reversible literal', async () => {
  const canonical = await buildR21CanonicalBytes()
  assert.equal(canonical.originalSha256, '8d03c8156ce171c63135c57b716ee5b3e6b679cf3dc18005d87f0fa45eed1893')
  assert.equal(canonical.relocation.count, 1)
  assert.equal(canonical.relocation.to, ROOT)
  assert.equal(canonical.bytes.toString().includes(PRIOR_ROOT), false)
})

test('reordered review and decision evidence pass read-only precheck without effect ports', async () => {
  const { prepared, entrySha } = await specimen({ evidenceArray: true })
  const accepted = approval(prepared, entrySha)
  assert.notEqual(
    JSON.stringify(accepted.review.preflightEvidence),
    JSON.stringify(prepared.manifest.preflightEvidence),
  )
  const counts = { host: 0, prior: 0, addon: 0, run: 0 }
  const result = await dispatchMatrixEntrypoint(accepted.args, ports(prepared, entrySha, accepted, counts))
  assert.equal(result.status, 'PRECHECK_PASSED_NO_RUNTIME_AUTHORITY')
  assert.equal(result.runtimeQualified, false)
  assert.deepEqual(counts, { host: 1, prior: 1, addon: 0, run: 0 })
})

test('the same reordered evidence reaches only an explicitly supplied fake run port', async () => {
  const { prepared, entrySha } = await specimen()
  const accepted = approval(prepared, entrySha)
  const counts = { host: 0, prior: 0, addon: 0, run: 0 }
  const fake = ports(prepared, entrySha, accepted, counts)
  fake.loadAddon = async () => {
    counts.addon++
    return { identity() {}, listDirectChildren() {}, directChildMetadata() {} }
  }
  fake.run = async ({ verifyExactReview }) => {
    counts.run++
    assert.equal(
      await verifyExactReview({ manifestDigest: prepared.manifestDigest, manifest: prepared.manifest }),
      true,
    )
    return { status: 'FAKE_PORTS_ONLY' }
  }
  const result = await dispatchMatrixEntrypoint(['--run', ...accepted.args.slice(1)], fake)
  assert.equal(result.status, 'FAKE_PORTS_ONLY')
  assert.equal(result.runtimeQualified, false)
  assert.deepEqual(counts, { host: 1, prior: 1, addon: 1, run: 1 })
})

test('changed, missing, extra and array-reordered review evidence refuse before effects', async () => {
  const { prepared, entrySha } = await specimen({ evidenceArray: true })
  for (const change of [
    receipt => {
      receipt.preflightEvidence.actualHostMode = 'ATTESTED'
    },
    receipt => {
      delete receipt.preflightEvidence.r16ReviewSha256
    },
    receipt => {
      receipt.preflightEvidence.extra = true
    },
    receipt => {
      receipt.preflightEvidence.offlineArrayProbe.reverse()
    },
  ]) {
    const accepted = approval(prepared, entrySha, { reviewChange: change })
    const counts = { host: 0, prior: 0, addon: 0, run: 0 }
    await assert.rejects(
      dispatchMatrixEntrypoint(accepted.args, ports(prepared, entrySha, accepted, counts)),
      /independent exact R21 review absent or changed/,
    )
    assert.deepEqual(counts, { host: 0, prior: 0, addon: 0, run: 0 })
  }
})

test('changed, missing, extra and array-reordered decision evidence refuse before effects', async () => {
  const { prepared, entrySha } = await specimen({ evidenceArray: true })
  for (const change of [
    receipt => {
      receipt.preflightEvidence.actualHostMode = 'ATTESTED'
    },
    receipt => {
      delete receipt.preflightEvidence.r16ReviewSha256
    },
    receipt => {
      receipt.preflightEvidence.extra = true
    },
    receipt => {
      receipt.preflightEvidence.offlineArrayProbe.reverse()
    },
  ]) {
    const accepted = approval(prepared, entrySha, { decisionChange: change })
    const counts = { host: 0, prior: 0, addon: 0, run: 0 }
    await assert.rejects(
      dispatchMatrixEntrypoint(accepted.args, ports(prepared, entrySha, accepted, counts)),
      /explicit R21 user decision absent or changed/,
    )
    assert.deepEqual(counts, { host: 0, prior: 0, addon: 0, run: 0 })
  }
})

test('hash, source, root, host, approval, budget and prior failures refuse before effects', async () => {
  const { prepared, entrySha } = await specimen()
  const accepted = approval(prepared, entrySha)
  const cases = [
    {
      args: [...accepted.args.slice(0, 4), '0'.repeat(64), accepted.decisionSha],
      error: /independent exact R21 review/,
    },
    { args: [...accepted.args.slice(0, 5), '0'.repeat(64)], error: /explicit R21 user decision/ },
    { sourceSha256: async () => '0'.repeat(64), error: /prepared manifest, source, or command drift/ },
    { cwd: '/private/tmp', error: /host invocation environment changed/ },
    {
      environment: { PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/private' },
      error: /host invocation environment changed/,
    },
    {
      reviewChange: receipt => {
        receipt.manifest.root = PRIOR_ROOT
      },
      error: /independent exact R21 review/,
    },
    {
      decisionChange: receipt => {
        receipt.verdict = 'NOT_APPROVED'
      },
      error: /explicit R21 user decision/,
    },
    {
      decisionChange: receipt => {
        receipt.cumulativeWholeCampaignCeilings = { ...receipt.cumulativeWholeCampaignCeilings, sourceCapacity: 79 }
      },
      error: /explicit R21 user decision/,
    },
  ]
  for (const candidate of cases) {
    const current =
      candidate.reviewChange || candidate.decisionChange ? approval(prepared, entrySha, candidate) : accepted
    const counts = { host: 0, prior: 0, addon: 0, run: 0 }
    await assert.rejects(
      dispatchMatrixEntrypoint(candidate.args ?? current.args, {
        ...ports(prepared, entrySha, current, counts),
        ...(candidate.cwd ? { cwd: candidate.cwd } : {}),
        ...(candidate.environment ? { environment: candidate.environment } : {}),
        ...(candidate.sourceSha256 ? { sourceSha256: candidate.sourceSha256 } : {}),
      }),
      candidate.error,
    )
    assert.deepEqual(counts, { host: 0, prior: 0, addon: 0, run: 0 })
  }
  for (const override of [
    {
      verifyHostFile: async () => {
        throw new Error('host file drift')
      },
      error: /host file drift/,
    },
    {
      verifyPrior: async () => {
        throw new Error('retained root drift')
      },
      error: /retained root drift/,
    },
  ]) {
    const counts = { host: 0, prior: 0, addon: 0, run: 0 }
    const { error, ...overrides } = override
    await assert.rejects(
      dispatchMatrixEntrypoint(accepted.args, { ...ports(prepared, entrySha, accepted, counts), ...overrides }),
      error,
    )
    assert.equal(counts.addon, 0)
    assert.equal(counts.run, 0)
  }
})

test('synthetic decision marker is rejected by the normal run gate', async () => {
  const { prepared, entrySha } = await specimen()
  const accepted = approval(prepared, entrySha, {
    decisionChange: receipt => {
      receipt.specimenOnly = true
      receipt.runtimeAuthority = false
      receipt.evidenceClass = 'SYNTHETIC_OFFLINE_SPECIMEN_NO_USER_AUTHORITY'
    },
  })
  const counts = { host: 0, prior: 0, addon: 0, run: 0 }
  await assert.rejects(
    dispatchMatrixEntrypoint(['--run', ...accepted.args.slice(1)], {
      ...ports(prepared, entrySha, accepted, counts),
      syntheticSpecimen: true,
    }),
    /explicit R21 user decision absent or changed/,
  )
  assert.deepEqual(counts, { host: 0, prior: 0, addon: 0, run: 0 })
  const positive = await dispatchMatrixEntrypoint(accepted.args, {
    ...ports(prepared, entrySha, accepted, counts),
    syntheticSpecimen: true,
  })
  assert.equal(positive.status, 'PRECHECK_PASSED_NO_RUNTIME_AUTHORITY')
  assert.deepEqual(counts, { host: 1, prior: 1, addon: 0, run: 0 })
})

test('real read-only derivation records current and historical counts separately', async () => {
  const { prepareR21MatrixManifest } = await import('./fixtures/codex-app-server-m02-ta-matrix-r21/manifest.mjs')
  const prepared = await prepareR21MatrixManifest()
  assert.equal(prepared.runtimeEligible, false)
  assert.equal(prepared.manifest.historicalAvailability.predecessorEntries, 6521)
  assert.equal(prepared.manifest.historicalAvailability.currentPresentMatches, 6498)
  assert.equal(prepared.manifest.historicalAvailability.historicalSourceAbsentArchiveVerified, 23)
  assert.equal(prepared.manifest.priorEvidence.allFourRootsRetained, false)
  assert.equal(prepared.manifest.priorEvidence.currentOriginalRootIdentity, 'UNKNOWN')
  assert.equal(prepared.manifest.artifacts.filter(item => item.purpose === 'matrix-canonical-backend').length, 1)
  assert.equal(prepared.manifest.artifacts.filter(item => item.purpose === 'scoped-mcp-entry').length, 1)
  assert.equal(prepared.manifest.historicalAvailability.archiveWitnesses.length, 23)
})

test('future effect cadence runs full history at case start and exact receipts per effect', async () => {
  const { prepared, entrySha } = await specimen()
  const accepted = approval(prepared, entrySha)
  const counts = { host: 0, prior: 0, addon: 0, run: 0 }
  const fake = ports(prepared, entrySha, accepted, counts)
  fake.loadAddon = async () => {
    counts.addon++
    return { identity() {}, listDirectChildren() {}, directChildMetadata() {} }
  }
  fake.run = async ({ authorize, verifyExactReview }) => {
    counts.run++
    const credentials = { manifestDigest: prepared.manifestDigest, manifest: prepared.manifest }
    assert.equal(await verifyExactReview(credentials), true)
    assert.equal(await authorize({ ...credentials, action: 'owned-loopback-listener', id: 'B01-listener' }), true)
    assert.equal(await authorize({ ...credentials, action: 'owned-stdio-send', id: 'B01-initialize' }), true)
    assert.deepEqual(counts, { host: 1, prior: 2, addon: 1, run: 1 })
    return { status: 'FAKE_PORTS_ONLY' }
  }
  const result = await dispatchMatrixEntrypoint(['--run', ...accepted.args.slice(1)], fake)
  assert.equal(result.status, 'FAKE_PORTS_ONLY')
  assert.equal(result.runtimeQualified, false)
})
