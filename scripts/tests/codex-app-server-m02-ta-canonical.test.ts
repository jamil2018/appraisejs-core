import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  canonicalOperations,
  createCanonicalAcceptanceFixture,
} from './fixtures/codex-app-server-m02-ta/canonical-fixture'
import { canonicalPacket } from './fixtures/codex-app-server-m02-ta/canonical-packets'
import {
  createExternalWorkerGateway,
  ExternalWorkerCallError,
} from '../../packages/appraisejs/src/mcp/external-worker-gateway'
import type { McpRegistryContext } from '../../packages/appraisejs/src/mcp/registry'

type Fixture = Awaited<ReturnType<typeof createCanonicalAcceptanceFixture>>
const fixtures: Fixture[] = []
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.close()
})

async function fixture(role: keyof typeof canonicalOperations) {
  const result = await createCanonicalAcceptanceFixture(role)
  fixtures.push(result)
  return result
}

function gateway(h: Fixture) {
  const result = createExternalWorkerGateway({
    context: { api: { request: h.gateway.request }, options: {} } as unknown as Omit<McpRegistryContext, 'server'>,
    binding: h.gateway.binding,
    frozenReads: h.gateway.frozenReads,
    authorize: h.gateway.authorize,
    readAcceptance: h.gateway.readAcceptance,
    clock: () => new Date(Date.parse(h.gateway.binding.expiresAt) - 60_000),
  })
  h.gateway.bindProfile(result.profile.profileDigest)
  return result
}

test('six synthetic role assignments use the canonical transaction acceptance and independent persisted lookup', async () => {
  for (const role of Object.keys(canonicalOperations) as Array<keyof typeof canonicalOperations>) {
    const h = await fixture(role)
    const payload = { synthetic: true, role }
    await h.assertCurrent(h.binding, 'before_io')
    const accepted = await h.submitSynthetic({ idempotencyKey: 'case-1', payload })
    await h.assertCurrent(h.binding, 'after_io')
    assert.equal(accepted.replayed, false)
    assert.equal(h.counts.effects, 1)
    const persisted = await h.readPersistedAcceptance({ idempotencyKey: 'case-1' })
    assert.equal(persisted.outcome.artifactId, persisted.artifactId)
    assert.equal(await h.client.qualityJourneyExternalSubmissionAcceptance.count(), 1)
    assert.equal(await h.client.qualityJourneyArtifact.count(), 1)
    assert.deepEqual(h.counts, { beforeIo: 1, afterIo: 1, effects: 1, lookups: 1 })
  }
})

test('revocation before I/O prevents effect, and revocation after I/O is detected without undoing acceptance', async () => {
  const before = await fixture('REQUIREMENT_ANALYZER')
  await before.revoke()
  await assert.rejects(before.assertCurrent(before.binding, 'before_io'), /revoked/)
  assert.equal(before.counts.beforeIo, 1)
  assert.equal(before.counts.effects, 0)
  assert.equal(await before.client.qualityJourneyExternalSubmissionAcceptance.count(), 0)

  const after = await fixture('SCOUT')
  await after.assertCurrent(after.binding, 'before_io')
  await after.submitSynthetic({ idempotencyKey: 'after-revoke', payload: { synthetic: true } })
  await after.revoke()
  await assert.rejects(after.assertCurrent(after.binding, 'after_io'), /revoked/)
  assert.equal(after.counts.effects, 1)
  assert.equal(after.counts.afterIo, 1)
  assert.equal(
    (await after.readPersistedAcceptance({ idempotencyKey: 'after-revoke' })).outcome.artifactId.length > 0,
    true,
  )
})

test('canonical authority rejects stale generation, foreign owner, role and missing secret', async () => {
  const h = await fixture('TEST_SCENARIO_DESIGNER')
  const secret = h.binding.assignmentSecret
  const candidates = [
    { ...h.binding, assignmentGeneration: 2 },
    { ...h.binding, principal: { ...h.binding.principal, principalId: 'foreign' } },
    { ...h.binding, role: 'TRIAGER' as const },
    { ...h.binding, assignmentSecret: '' },
  ]
  for (const candidate of candidates) {
    await assert.rejects(h.assertCurrent(candidate, 'before_io'), error => {
      assert.equal(String(error).includes(secret), false)
      return true
    })
    await assert.rejects(h.submitSynthetic({ binding: candidate, idempotencyKey: 'invalid', payload: {} }))
  }
  assert.equal(h.counts.effects, 0)
  assert.equal(await h.client.qualityJourneyExternalSubmissionAcceptance.count(), 0)
  assert.equal(await h.client.qualityJourneyArtifact.count(), 0)
})

test('lost acknowledgement is recovered from durable outcome without resending, including after revocation', async () => {
  const h = await fixture('AUTOMATOR')
  const first = await h.submitSynthetic({ idempotencyKey: 'lost-ack', payload: { synthetic: true } })
  assert.equal(first.replayed, false)
  await h.revoke()
  const persisted = await h.readPersistedAcceptance({ idempotencyKey: 'lost-ack' })
  assert.equal(persisted.outcome.artifactId, first.outcome.artifactId)
  assert.equal(h.counts.effects, 1)
  assert.equal(h.counts.lookups, 1)
  assert.equal(await h.client.qualityJourneyArtifact.count(), 1)
  await assert.rejects(
    h.readPersistedAcceptance({
      binding: { ...h.binding, principal: { ...h.binding.principal, principalId: 'foreign' } },
      idempotencyKey: 'lost-ack',
    }),
    /invalid/,
  )
})

test('all six gateway submissions cross canonical MCP schemas and persisted common acceptance', async () => {
  for (const role of Object.keys(canonicalOperations) as Array<keyof typeof canonicalOperations>) {
    const h = await fixture(role)
    const g = gateway(h)
    const packet = canonicalPacket(role, h.gateway.binding)
    const result = (await g.call(h.gateway.submitTool, packet)) as { artifactIds: string[]; receiptId: string }
    assert.equal(result.artifactIds.length, 1)
    assert.ok(result.receiptId.startsWith('qjesa_'))
    assert.equal(h.counts.beforeIo, 1)
    assert.equal(h.counts.afterIo, 1)
    assert.equal(h.counts.effects, 1)
    assert.equal(h.counts.lookups, 1)
    assert.equal(
      (await h.readPersistedAcceptance({ idempotencyKey: String(packet.idempotencyKey) })).artifactId,
      result.artifactIds[0],
    )
  }
})

test('gateway observes post-I/O revocation as occurred and resolves durable acceptance without a resend', async () => {
  const h = await fixture('SCOUT')
  const g = gateway(h)
  const packet = canonicalPacket('SCOUT', h.gateway.binding)
  const originalRead = h.gateway.readAcceptance
  // Exercise the actual gateway callback path with a revocation between the
  // canonical acceptance read and the second current-binding check.
  const revokedGateway = createExternalWorkerGateway({
    context: { api: { request: h.gateway.request }, options: {} } as unknown as Omit<McpRegistryContext, 'server'>,
    binding: h.gateway.binding,
    frozenReads: h.gateway.frozenReads,
    authorize: h.gateway.authorize,
    readAcceptance: async input => {
      const accepted = await originalRead(input)
      await h.revoke()
      return accepted
    },
    clock: () => new Date(Date.parse(h.gateway.binding.expiresAt) - 60_000),
  })
  h.gateway.bindProfile(revokedGateway.profile.profileDigest)
  assert.equal(g.profile.profileDigest, revokedGateway.profile.profileDigest)
  await assert.rejects(revokedGateway.call(h.gateway.submitTool, packet), error => {
    assert.ok(error instanceof ExternalWorkerCallError)
    assert.deepEqual(error.receipt.effectOutcome, 'occurred')
    assert.equal(error.receipt.canonicalAccepted, true)
    return true
  })
  assert.equal(h.counts.effects, 1)
  assert.equal(
    (await h.readPersistedAcceptance({ idempotencyKey: String(packet.idempotencyKey) })).artifactId.length > 0,
    true,
  )
})

test('gateway lost acknowledgement stays unknown and durable lookup recovers exact acceptance', async () => {
  const h = await fixture('RESOURCE_EXPLORER')
  const g = gateway(h)
  const packet = canonicalPacket('RESOURCE_EXPLORER', h.gateway.binding)
  h.gateway.loseNextAcknowledgement()
  await assert.rejects(g.call(h.gateway.submitTool, packet), error => {
    assert.ok(error instanceof ExternalWorkerCallError)
    assert.equal(error.receipt.effectOutcome, 'unknown')
    assert.equal(error.receipt.canonicalAccepted, false)
    assert.equal(JSON.stringify(error).includes(h.binding.assignmentSecret), false)
    return true
  })
  const persisted = await h.readPersistedAcceptance({ idempotencyKey: String(packet.idempotencyKey) })
  assert.ok(persisted.acceptanceId.startsWith('qjesa_'))
  assert.equal(h.counts.effects, 1)
  assert.equal(await h.client.qualityJourneyExternalSubmissionAcceptance.count(), 1)
})

test('gateway rejects mismatched result role before canonical I/O', async () => {
  const h = await fixture('TEST_SCENARIO_DESIGNER')
  const g = gateway(h)
  const packet = canonicalPacket('TEST_SCENARIO_DESIGNER', h.gateway.binding)
  ;(packet.result as Record<string, unknown>).role = 'TRIAGER'
  await assert.rejects(g.call(h.gateway.submitTool, packet), error => error instanceof ExternalWorkerCallError)
  assert.equal(h.counts.beforeIo, 0)
  assert.equal(h.counts.effects, 0)
})

test('matching frozen Triager key still fails the canonical foreign receipt-owner query', async () => {
  const h = await fixture('TRIAGER')
  const { readQualityJourneyTriageEvidence } =
    await import('../../src/services/coordinator/quality-journey-triage-evidence-service')
  const { foreignReceiptId } = await h.seedForeignTriageReceipt()
  const reads = h.gateway.frozenReads.map(read => {
    if (read.toolName !== 'quality_journey_triage_evidence_read') return read
    return {
      ...read,
      arguments: { receiptId: foreignReceiptId, artifactKind: 'log' },
      allowedArtifactIds: [foreignReceiptId],
      source: read.source.map(source => ({
        ...source,
        artifactId: foreignReceiptId,
        data: { ...source.data, receiptId: foreignReceiptId },
      })),
    }
  })
  const g = createExternalWorkerGateway({
    context: { api: { request: h.gateway.request }, options: {} } as unknown as Omit<McpRegistryContext, 'server'>,
    binding: h.gateway.binding,
    frozenReads: reads,
    authorize: h.gateway.authorize,
    readAcceptance: h.gateway.readAcceptance,
    clock: () => new Date(Date.parse(h.gateway.binding.expiresAt) - 60_000),
  })
  h.gateway.bindProfile(g.profile.profileDigest)
  const frozen = (await g.call('quality_journey_triage_evidence_read', {
    receiptId: foreignReceiptId,
    artifactKind: 'log',
  })) as { artifacts: Array<{ artifactId: string }> }
  assert.equal(frozen.artifacts[0]?.artifactId, foreignReceiptId)
  await assert.rejects(
    readQualityJourneyTriageEvidence(
      {
        journeyId: h.binding.journeyId,
        targetProjectId: h.binding.targetProjectId,
        workItemId: h.binding.workItemId,
        attemptId: h.binding.attemptId,
        leaseId: h.binding.leaseId,
        ownerToken: h.binding.assignmentSecret,
        receiptId: foreignReceiptId,
        artifactKind: 'log',
      },
      h.client,
    ),
    /receipt not found/i,
  )
  assert.equal(h.counts.effects, 0)
  assert.equal(await h.client.qualityJourneyExecutionEvidenceReceipt.count(), 1)
})
