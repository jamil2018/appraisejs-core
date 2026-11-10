// Exact sequential canonical complement snapshot and complete canonical proof; inert at import.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { createFixtureAdmission } from './custody-fixture-admission'
import type { OriginalFixture, SealedOriginal } from './custody-service-owner'
import { fixtureOriginalTemporal } from './custody-fixture-datetime.ts'
type Message = Record<string, unknown>
type CanonicalSnapshot = {
  hub: Awaited<ReturnType<Prisma.TransactionClient['qualityJourneyProviderSlot']['findUniqueOrThrow']>>
  run: Awaited<ReturnType<Prisma.TransactionClient['qualityJourneyProviderRun']['findUniqueOrThrow']>>
  intent: Awaited<ReturnType<Prisma.TransactionClient['qualityJourneyProviderDispatchIntent']['findUniqueOrThrow']>>
  state: Awaited<ReturnType<Prisma.TransactionClient['qualityJourneyProviderSourceState']['findUniqueOrThrow']>>
  observations: Awaited<ReturnType<Prisma.TransactionClient['qualityJourneyProviderObservation']['findMany']>>
}
export async function captureServiceComplementCanonical(
  fixture: OriginalFixture,
  sealed: SealedOriginal,
  tx: Prisma.TransactionClient,
  admission: ReturnType<typeof createFixtureAdmission>,
  expectedFixture: Message,
  canonicalContractJson: (value: unknown) => string,
) {
  const { assertActive: assertFixtureActive, admitActual, afterActual } = admission
  assertFixtureActive('16h:capture-canonical')
  const hub = afterActual(
    '16h:hub',
    await admitActual('16h:hub', () => tx.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })),
  )
  const run = afterActual(
    '16h:run',
    await admitActual('16h:run', () =>
      tx.qualityJourneyProviderRun.findUniqueOrThrow({ where: { id: fixture.armed.run.id } }),
    ),
  )
  const intent = afterActual(
    '16h:intent',
    await admitActual('16h:intent', () =>
      tx.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({ where: { id: sealed.input.intentId } }),
    ),
  )
  const state = afterActual(
    '16h:state',
    await admitActual('16h:state', () =>
      tx.qualityJourneyProviderSourceState.findUniqueOrThrow({ where: { sourceId: fixture.sourceId } }),
    ),
  )
  const observations = afterActual(
    '16h:observations',
    await admitActual('16h:observations', () => tx.qualityJourneyProviderObservation.findMany({ take: 2 })),
  )
  return assertComplementCanonicalSnapshot(
    fixture,
    sealed,
    { hub, run, intent, state, observations },
    expectedFixture,
    canonicalContractJson,
  )
}
export function assertComplementCanonicalSnapshot(
  fixture: OriginalFixture,
  sealed: SealedOriginal,
  snapshot: CanonicalSnapshot,
  expectedFixture: Message,
  canonicalContractJson: (value: unknown) => string,
) {
  const { hub, run, intent, state, observations } = snapshot
  assert.deepEqual(hub, {
    id: 'HUB',
    providerRunId: null,
    intentId: null,
    sendBoundaryId: null,
    reservedAt: null,
    version: 2,
  })
  assert.equal(run.turnsReserved, 1)
  assert.equal(expectedFixture.frozenTurnCap, 3)
  for (const [field, value] of Object.entries(expectedFixture.originalRun as Message)) {
    if (!['status', 'threadId'].includes(field)) assert.deepEqual(run[field as keyof typeof run], value, field)
  }
  for (const [field, value] of Object.entries(expectedFixture.originalIntent as Message)) {
    if (!['status', 'threadId', 'turnId'].includes(field))
      assert.deepEqual(intent[field as keyof typeof intent], value, field)
  }
  assert.equal(intent.status, 'NONSTART_RECONCILED')
  assert.equal(intent.sendBoundaryId, fixture.permit.sendBoundaryId)
  assert.equal(intent.claimEpoch, fixture.permit.claimEpoch)
  assert.equal(intent.providerRunId, run.id)
  assert.equal(intent.providerNamespace, fixture.f.prepareInput.providerNamespace)
  assert.equal(intent.acknowledgedAt, null)
  assert.notEqual(intent.reconciledAt, null)
  assert.equal(intent.threadId, null)
  assert.equal(intent.turnId, null)
  const temporal = fixtureOriginalTemporal(null, { run, intent })
  assert.deepEqual(temporal.run, (expectedFixture.originalTemporal as Message).run)
  assert.deepEqual(temporal.intent, (expectedFixture.originalTemporal as Message).intent)
  assert.equal(state.lifecycle, 'COMMITTED')
  assert.equal(state.committedRequestHash, sealed.requestHash)
  assert.equal(state.commitFenceVersion, Number((expectedFixture.occupiedSource as Message).commitFenceVersion) + 1)
  for (const [field, value] of Object.entries(expectedFixture.occupiedSource as Message)) {
    if (!['lifecycle', 'commitFenceVersion', 'committedObservationId', 'committedRequestHash'].includes(field))
      assert.deepEqual(state[field as keyof typeof state], value, field)
  }
  assert.equal(observations.length, 1)
  const observation = observations[0]
  assert.equal(state.committedObservationId, observation.id)
  assert.equal(observation.observationKey, sealed.input.observationKey)
  assert.equal(observation.requestHash, sealed.requestHash)
  assert.equal(observation.kind, 'NONSTART')
  assert.equal(observation.intentId, sealed.input.intentId)
  assert.equal(observation.sendBoundaryId, fixture.permit.sendBoundaryId)
  assert.equal(observation.providerNamespace, fixture.f.prepareInput.providerNamespace)
  assert.equal(observation.threadId, null)
  assert.equal(observation.turnId, null)
  assert.equal(
    observation.evidenceDigest,
    `sha256:${createHash('sha256').update(canonicalContractJson(sealed.receipt)).digest('hex')}`,
  )
  assert.deepEqual(JSON.parse(observation.reconciliationJson!), sealed.receipt)
  return { hub, run, intent, state, observations, temporal }
}
