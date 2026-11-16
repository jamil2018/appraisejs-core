import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { recoveryEvidenceRoot } from './recovery-read-binding.mts'
import { sealRecoverySnapshot, readRecoverySnapshotFresh } from './recovery-snapshot.mts'

mkdirSync(recoveryEvidenceRoot, { recursive: true, mode: 0o700 })
const root = mkdtempSync(path.join(recoveryEvidenceRoot, 'lineage-proof-'))
// Bind any accidental implicit client use to this test's own unused location, never a default/project database.
process.env.DATABASE_URL = `file:${path.join(root, 'unused-bootstrap.sqlite')}`
const bootstrap = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })
;(globalThis as typeof globalThis & { prisma?: unknown }).prisma = bootstrap
const { createNativeJourneyLineage } = await import('./native-lineage.mts')
const { prepareQualityJourneyProviderRun, claimQualityJourneyProviderIntent, armQualityJourneyProviderIntent } =
  await import('../../../../src/services/coordinator/quality-journey-provider-run-service')

test('original disposable lineage pauses and retains before its original checkpoint/disconnect and fresh R1 snapshot projection', async () => {
  const lineage = createNativeJourneyLineage(undefined, root)
  const event = await lineage.prepareInitial()
  const fixture = lineage.fixtureOwned(),
    b = event.original.binding
  const scope = { journeyId: b.journeyId, targetProjectId: b.targetProjectId }
  await assert.rejects(lineage.checkpointOriginalRecoveryAndDisconnect(), /retained recovery client/)
  const prepared = await prepareQualityJourneyProviderRun(
    {
      ...b,
      idempotencyKey: 'offline-lineage-prepare',
      providerNamespace: 'synthetic:offline-lineage',
      configurationDigest: `sha256:${'c'.repeat(64)}`,
      envelopeDigest: `sha256:${'e'.repeat(64)}`,
    },
    fixture.client,
  )
  const request = { ...b, intentId: prepared.intent.id, claimOwner: 'offline-inert-lineage-owner' }
  const claim = await claimQualityJourneyProviderIntent(request, fixture.client)
  await armQualityJourneyProviderIntent({ ...request, claimEpoch: claim.intent.claimEpoch }, fixture.client)
  const original = await lineage.readOriginalRecoveryScope()
  assert.equal(original.canonicalAcceptanceObserved, false)
  lineage.fenceRecoveryAdmission()
  const pause = await lineage.pauseOriginalRecovery({
    caseKind: 'R1_ACKNOWLEDGED_NATIVE_INTERRUPTION',
    expectedVersion: original.version,
    expectedStateHash: original.stateHash,
    idempotencyKey: 'offline-lineage-pause',
  })
  assert.equal(pause.operationalStatus, 'PAUSED')
  assert.equal(pause.cleanup.managedTurn, 'UNKNOWN')
  assert.equal(lineage.snapshot().fixtureDisconnected, false)
  await lineage.stopRecoveryAndRetainOriginalClient()
  assert.equal(lineage.snapshot().recoveryRetained, true)
  const { binding, sourceWitness } = await sealRecoverySnapshot({
    binding: {
      version: 'M13_SENDER_FREE_RECOVERY_READ_V1',
      actor: 'BOUND_DISPOSABLE_PROJECT_READER',
      caseKind: 'R1_ACKNOWLEDGED_NATIVE_INTERRUPTION',
      ...scope,
      expectedVersion: pause.version,
      expectedStateHash: pause.stateHash,
      pauseEventId: pause.eventId,
      attemptId: b.attemptId,
    },
    originalDatabasePath: fixture.databasePath,
    evidenceRoot: recoveryEvidenceRoot,
    originalOwner: {
      async provePausedAndCleaned() {
        assert.equal(lineage.snapshot().recoveryRetained, true)
      },
      async closeOtherOriginalWriters() {}, // This fixture created only its original client.
      checkpointOriginalAndDisconnect: () => lineage.checkpointOriginalRecoveryAndDisconnect(),
    },
  })
  assert.equal(lineage.snapshot().fixtureDisconnected, true)
  await assert.rejects(lineage.checkpointOriginalRecoveryAndDisconnect(), /retained recovery client/)
  const observation = await readRecoverySnapshotFresh(binding, sourceWitness)
  assert.equal(observation.providerEffects, 'UNRESOLVED')
  assert.equal(observation.artifact, 'NOT_REQUESTED')
  assert.equal(observation.hostingCleanupGuard, 'REFUSED')
  assert.equal(observation.senderReconstructed, false)
  writeFileSync(
    path.join(root, 'proof.json'),
    JSON.stringify(
      { classification: 'OFFLINE_CANONICAL_LINEAGE_ONLY_NO_NATIVE_ACK_OR_INTERRUPTION', binding, observation },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  )
  await bootstrap.$disconnect()
})
