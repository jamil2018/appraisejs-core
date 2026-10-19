import { afterEach, describe, expect, it } from 'vitest'
import { createProviderFixture } from '@/test/quality-journey-provider-fixture'
import {
  prepareQualityJourneyProviderRun,
  claimQualityJourneyProviderIntent,
  armQualityJourneyProviderIntent,
} from './quality-journey-provider-run-service'
import {
  cancelQualityJourneyWork,
  claimExternalQualityJourneyWork,
  resumeQualityJourney,
} from './quality-journey-service'
import { pauseQualityJourneyOperational, resumeQualityJourneyOperational } from './quality-journey-recovery-service'
import {
  registerQualityJourneyCoordinatorSession,
  transferQualityJourneyCoordinatorSession,
} from './quality-journey-session-service'
import { trustedHumanCoordinatorSession } from './quality-journey-coordinator-session'
import { assertProviderEffectsQuiescent } from './quality-journey-provider-recovery'

const fixtures: Awaited<ReturnType<typeof createProviderFixture>>[] = []
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(f => f.cleanup()))
})
async function fixture() {
  const f = await createProviderFixture()
  fixtures.push(f)
  return f
}
async function prepared(f: Awaited<ReturnType<typeof fixture>>) {
  const p = await prepareQualityJourneyProviderRun(f.prepareInput, f.client)
  const c = await claimQualityJourneyProviderIntent(
    { ...f.binding, intentId: p.intent.id, claimOwner: 'owner' },
    f.client,
  )
  return { ...f.binding, intentId: p.intent.id, claimOwner: 'owner', claimEpoch: c.intent.claimEpoch }
}

describe('M04 provider effects across existing recovery and transfer', () => {
  it.each(['work-retired', 'input-revised', 'authorization-revoked', 'attempt-completed', 'journey-revised'])(
    'transactionally invalidates an unsent intent across specialized retirement writes (%s)',
    async kind => {
      const f = await fixture()
      const intent = await prepared(f)
      const retire = async (tx: import('@prisma/client').Prisma.TransactionClient) => {
        if (kind === 'work-retired')
          await tx.qualityJourneyWorkItem.update({
            where: { id: f.binding.workItemId },
            data: { status: 'CANCELLED', version: { increment: 1 } },
          })
        else if (kind === 'input-revised')
          await tx.qualityJourneyWorkItem.update({
            where: { id: f.binding.workItemId },
            data: { inputHash: 'sha256:revised', version: { increment: 1 } },
          })
        else if (kind === 'authorization-revoked')
          await tx.qualityJourneyWorkAuthorization.update({
            where: { id: f.claimed.attempt.authorizationId! },
            data: { revokedAt: new Date(), revokedBy: 'specialized-revision', revocationReason: 'revised' },
          })
        else if (kind === 'attempt-completed')
          await tx.qualityJourneyWorkAttempt.update({
            where: { id: f.binding.attemptId },
            data: { status: 'COMPLETED' },
          })
        else
          await tx.qualityJourney.update({
            where: { id: f.scope.journeyId },
            data: { activeRevisionIdsJson: JSON.stringify({ journey: 'new-revision' }), version: { increment: 1 } },
          })
      }
      await expect(
        f.client.$transaction(async tx => {
          await retire(tx)
          throw new Error('rollback witness')
        }),
      ).rejects.toThrow('rollback witness')
      expect(
        (await f.client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({ where: { id: intent.intentId } }))
          .invalidatedAt,
      ).toBeNull()
      await f.client.$transaction(retire)
      const invalidated = await f.client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({
        where: { id: intent.intentId },
      })
      expect(invalidated).toMatchObject({ status: 'INVALIDATED', armedAt: null })
      expect(invalidated.invalidatedAt).toBeInstanceOf(Date)
      await expect(armQualityJourneyProviderIntent(intent, f.client)).rejects.toBeDefined()
      await expect(f.client.$transaction(tx => assertProviderEffectsQuiescent(f.scope, tx))).resolves.toBeUndefined()
    },
  )

  it('keeps armed effects and the hub slot after cancellation; terminal attempts cannot hide them', async () => {
    const f = await fixture()
    const intent = await prepared(f)
    await armQualityJourneyProviderIntent(intent, f.client)
    await cancelQualityJourneyWork(
      { ...f.credentials, workItemId: f.binding.workItemId, actor: 'USER', reason: 'stop' },
      f.client,
    )
    expect(
      (await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: f.binding.attemptId } })).status,
    ).toBe('CANCELLED')
    expect((await f.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })).intentId).toBe(
      intent.intentId,
    )
    await expect(f.client.$transaction(tx => assertProviderEffectsQuiescent(f.scope, tx))).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    // Even a replacement projection cannot turn cancellation into proof of stop.
    await f.client.qualityJourneyWorkItem.update({
      where: { id: f.binding.workItemId },
      data: { status: 'REPLACEMENT_REQUESTED' },
    })
    await expect(
      claimExternalQualityJourneyWork({ ...f.claimRequest, idempotencyKey: 'replacement' }, f.client),
    ).rejects.toBeDefined()
    expect(await f.client.qualityJourneyWorkAttempt.count()).toBe(1)
  })

  it('invalidates unsent cancellation and permits an exact human quiescent transfer', async () => {
    const f = await fixture()
    const intent = await prepared(f)
    await cancelQualityJourneyWork(
      { ...f.credentials, workItemId: f.binding.workItemId, actor: 'USER', reason: 'unsent stop' },
      f.client,
    )
    const row = await f.client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({
      where: { id: intent.intentId },
    })
    expect(row).toMatchObject({ status: 'INVALIDATED', armedAt: null })
    await expect(armQualityJourneyProviderIntent(intent, f.client)).rejects.toMatchObject({ code: 'CONFLICT' })
    const successor = await registerQualityJourneyCoordinatorSession(
      {
        ...f.scope,
        ownerPrincipalId: f.principal.principalId,
        hostKind: 'APP_SERVER_LOCAL_V1',
        idempotencyKey: 'next',
      },
      f.client,
    )
    const before = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
    await transferQualityJourneyCoordinatorSession(
      {
        ...f.scope,
        authority: trustedHumanCoordinatorSession,
        coordinatorPrincipalId: f.principal.principalId,
        approvedBy: 'local-ui',
        expectedStateHash: before.stateHash,
        expectedOwnershipVersion: before.ownershipVersion,
        predecessorSessionId: f.registered.session.id,
        predecessorGeneration: 1,
        successorSessionId: successor.session.id,
        requestId: 'transfer',
        reconciliationReceiptId: 'human:unsent-cancel',
      },
      f.client,
    )
    expect(
      (await f.client.qualityJourneyProviderRun.findUniqueOrThrow({ where: { attemptId: f.binding.attemptId } }))
        .sessionId,
    ).toBe(f.registered.session.id)
  })

  it('does not make an armed external attempt replaceable during operational pause or resume', async () => {
    const f = await fixture()
    const intent = await prepared(f)
    await armQualityJourneyProviderIntent(intent, f.client)
    const before = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
    await pauseQualityJourneyOperational(
      {
        ...f.scope,
        expectedStateHash: before.stateHash,
        expectedVersion: before.version,
        idempotencyKey: 'pause',
        reason: 'pause provider work',
      },
      f.client,
    )
    const paused = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: before.id } })
    expect(
      (await f.client.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: f.binding.workItemId } })).status,
    ).toBe('BLOCKED')
    await expect(
      resumeQualityJourneyOperational(
        { ...f.scope, expectedStateHash: paused.stateHash, expectedVersion: paused.version, idempotencyKey: 'resume' },
        f.client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(
      (await f.client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({ where: { id: intent.intentId } }))
        .status,
    ).toBe('UNKNOWN')
  })

  it('treats expired armed attempts as unresolved instead of offering replacement', async () => {
    const f = await fixture()
    const intent = await prepared(f)
    await armQualityJourneyProviderIntent(intent, f.client)
    await f.client.qualityJourneyWorkAttempt.update({
      where: { id: f.binding.attemptId },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    })
    await resumeQualityJourney(f.credentials, f.client)
    expect(
      (await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: f.binding.attemptId } })).status,
    ).toBe('DISPATCH_UNRESOLVED')
    expect(await f.client.qualityJourneyProviderSlot.count({ where: { intentId: intent.intentId } })).toBe(1)
    expect(await f.client.qualityJourneyProviderRun.count()).toBe(1)
  })

  it('rejects a stale revision at arming without consuming the slot or another turn', async () => {
    const f = await fixture()
    const intent = await prepared(f)
    await f.client.qualityJourney.update({
      where: { id: f.scope.journeyId },
      data: { activeRevisionIdsJson: JSON.stringify({ journey: 'changed-revision' }), version: { increment: 1 } },
    })
    await expect(armQualityJourneyProviderIntent(intent, f.client)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect((await f.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })).intentId).toBeNull()
    expect(
      (await f.client.qualityJourneyProviderRun.findUniqueOrThrow({ where: { attemptId: f.binding.attemptId } }))
        .turnsReserved,
    ).toBe(0)
  })
})
