import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { dispatchMatrixEntrypoint } from './fixtures/codex-app-server-m02-ta-matrix-r20/entrypoint.mjs'
import { buildR20CanonicalBytes } from './fixtures/codex-app-server-m02-ta-matrix-r20/canonical-build.mjs'
import { digest, ROOT, PRIOR_ROOT } from './fixtures/codex-app-server-m02-ta-matrix-r20/policy.mjs'

const repo = process.cwd()
const entry = path.join(repo, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r20/entrypoint.mjs')
const manifestPath = path.join(repo, '.appraisejs/m02-ta-matrix-build-r20/manifest.json')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const wire = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
const reverse = object => Object.fromEntries(Object.entries(object).reverse())

async function specimen({ evidenceArray = false } = {}) {
  const [oldBytes, entryBytes] = await Promise.all([
    fs.readFile(path.join(repo, '.appraisejs/m02-ta-matrix-build-r19/manifest.json')),
    fs.readFile(entry),
  ])
  const manifest = structuredClone(JSON.parse(oldBytes).manifest)
  manifest.version = 'appraise.m02-ta-matrix-r20/v1'
  manifest.root = ROOT
  manifest.recoveryProposalPath = path.join(repo, 'tasks/codex-app-server-journeys/m02-ta-t2-recovery-05.md')
  manifest.recoveryProposalSha256 = 'e9be70c933fa188a74ffe464494bc5768089a812754217d4b9e48a3839a540c6'
  manifest.priorEvidence.r19 = { status: 'GATE_ONLY_REFUSED', rootAbsent: true, casesCompleted: 0 }
  manifest.recoveryBudget.priorR19GateOnlyNodeInvocations = 1
  if (evidenceArray) manifest.preflightEvidence.offlineArrayProbe = ['first', 'second']
  manifest.artifacts.push({ path: entry, purpose: 'r20:entrypoint', sha256: sha(entryBytes) })
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
    schema: 'appraise.m02-ta-t2-r20-exact-review/v1',
    reviewer: '/root/continuation_review',
    verdict: 'ACCEPT_ONE_FIXED_T2_R20_INVOCATION',
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
  }
  reviewChange?.(review)
  const reviewBytes = wire(review)
  const reviewSha = sha(reviewBytes)
  const decision = {
    schema: 'appraise.m02-ta-t2-r20-recovery-user-decision/v1',
    verdict: 'APPROVE_ONE_FIXED_T2_R20_RECOVERY',
    scope: 'ONE_NEW_FULL_T2_P6_INVOCATION_NO_RESUME',
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

test('p4 to p6 canonical relocation is exactly one reversible literal', async () => {
  const canonical = await buildR20CanonicalBytes()
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
      /independent exact R20 review absent or changed/,
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
      /explicit R20 user decision absent or changed/,
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
      error: /independent exact R20 review/,
    },
    { args: [...accepted.args.slice(0, 5), '0'.repeat(64)], error: /explicit R20 user decision/ },
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
      error: /independent exact R20 review/,
    },
    {
      decisionChange: receipt => {
        receipt.verdict = 'NOT_APPROVED'
      },
      error: /explicit R20 user decision/,
    },
    {
      decisionChange: receipt => {
        receipt.cumulativeWholeCampaignCeilings = { ...receipt.cumulativeWholeCampaignCeilings, sourceCapacity: 79 }
      },
      error: /explicit R20 user decision/,
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
