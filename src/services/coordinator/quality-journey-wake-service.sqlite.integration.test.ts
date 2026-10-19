import { afterEach, describe, expect, it } from 'vitest'
import { createProviderFixture } from '@/test/quality-journey-provider-fixture'
import {
  prepareQualityJourneyProviderRun,
  claimQualityJourneyProviderIntent,
  armQualityJourneyProviderIntent,
} from './quality-journey-provider-run-service'
import {
  acknowledgeQualityJourneyWake as acknowledge,
  claimQualityJourneyWake as claim,
  enqueueQualityJourneyWakeInTransaction as enqueue,
  listQualityJourneyWakeWork as discover,
  trustedQualityJourneyWakeProducer as producer,
} from './quality-journey-wake-service'

type Fixture = Awaited<ReturnType<typeof createProviderFixture>>
const fixtures: Fixture[] = []
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.cleanup()
})
async function fixture() {
  const result = await createProviderFixture()
  fixtures.push(result)
  return result
}
async function cause(f: Fixture, key: string) {
  return f.client.$transaction(tx => enqueue({ ...f.scope, causeKey: key, reason: 'RECOVERY_REQUIRED' }, tx, producer))
}

describe('durable Quality Journey wake intent (migrated SQLite)', () => {
  it('commits every canonical producer with its mutation and rolls all of them back together', async () => {
    const f = await fixture()
    const before = await f.client.qualityJourneyWakeIntent.count()
    const mutate = async (rollback: boolean) =>
      f.client.$transaction(async tx => {
        const latest = await tx.qualityJourneyEvent.findFirst({
          where: { journeyId: f.scope.journeyId },
          orderBy: { sequence: 'desc' },
        })
        await tx.qualityJourneyEvent.create({
          data: {
            ...f.scope,
            id: 'wake-atomic-event',
            sequence: (latest?.sequence ?? 0) + 1,
            eventType: 'WAKE_REGRESSION_OBSERVATION',
            predecessorStateHash: 'synthetic-before',
            successorStateHash: 'synthetic-after',
            payloadJson: '{}',
          },
        })
        await tx.qualityJourney.update({
          where: { id: f.scope.journeyId },
          data: { version: { increment: 1 } },
        })
        await tx.qualityJourneyWorkItem.update({
          where: { id: f.binding.workItemId },
          data: { version: { increment: 1 } },
        })
        const attempt = await tx.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: f.binding.attemptId } })
        await tx.qualityJourneyWorkAuthorization.update({
          where: { id: attempt.authorizationId! },
          data: { cancelledAt: new Date(), revokedAt: new Date() },
        })
        expect(await tx.qualityJourneyWakeIntent.count()).toBe(before + 5)
        if (rollback) throw new Error('rollback canonical mutation')
      })
    await expect(mutate(true)).rejects.toThrow('rollback canonical mutation')
    expect(await f.client.qualityJourneyWakeIntent.count()).toBe(before)
    expect(await f.client.qualityJourneyEvent.count({ where: { id: 'wake-atomic-event' } })).toBe(0)
    await mutate(false)
    const added = await f.client.qualityJourneyWakeIntent.findMany({
      where: { reason: { in: ['JOURNEY_EVENT', 'STATE_CHANGED', 'WORK_CHANGED', 'AUTHORIZATION_CHANGED'] } },
    })
    expect(added.filter(row => row.causeKey === 'event:wake-atomic-event')).toHaveLength(1)
    expect(await f.client.qualityJourneyWakeIntent.count()).toBe(before + 5)
    expect((await discover(f.credentials, f.client)).admittedWithoutRun).toEqual([])
  })

  it('deduplicates exact causes, refuses changed digests and rolls back explicit enqueue', async () => {
    const f = await fixture()
    const first = await cause(f, 'test:one')
    expect((await cause(f, 'test:one'))?.id).toBe(first?.id)
    await expect(
      f.client.$transaction(tx =>
        enqueue({ ...f.scope, causeKey: 'test:one', reason: 'CANONICAL_TRANSITION' }, tx, producer),
      ),
    ).rejects.toThrow('different input')
    await expect(
      f.client.$transaction(async tx => {
        await enqueue({ ...f.scope, causeKey: 'test:rollback', reason: 'RECOVERY_REQUIRED' }, tx, producer)
        throw new Error('rollback enqueue')
      }),
    ).rejects.toThrow('rollback enqueue')
    expect(await f.client.qualityJourneyWakeIntent.count({ where: { causeKey: 'test:rollback' } })).toBe(0)
    await expect(
      f.client.$transaction(tx =>
        enqueue(
          { ...f.scope, causeKey: 'test:forged', reason: 'RECOVERY_REQUIRED' },
          tx,
          Symbol('forged') as typeof producer,
        ),
      ),
    ).rejects.toThrow('producer authority')
  })

  it('has one independent-client claimant and recovers its lost claim reply without extending the lease', async () => {
    const f = await fixture()
    const other = f.connect()
    const wake = (await cause(f, 'test:race'))!
    const now = new Date()
    const outcomes = await Promise.allSettled([
      claim({ ...f.credentials, wakeId: wake.id, claimOwner: 'supervisor-a' }, f.client, () => now),
      claim({ ...f.credentials, wakeId: wake.id, claimOwner: 'supervisor-b' }, other, () => now),
    ])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const winner = await other.qualityJourneyWakeIntent.findUniqueOrThrow({ where: { id: wake.id } })
    const replay = await claim(
      { ...f.credentials, wakeId: wake.id, claimOwner: winner.claimOwner! },
      other,
      () => new Date(now.getTime() + 1000),
    )
    expect(replay.claimEpoch).toBe(1)
    expect(replay.claimExpiresAt).toEqual(new Date(now.getTime() + 120_000))
    expect(replay.claimExpiresAt).toEqual(winner.claimExpiresAt)
  })

  it('expires claims by epoch and prevents an old claimant acknowledging reclaimed work', async () => {
    const f = await fixture()
    const wake = (await cause(f, 'test:expiry'))!
    const now = new Date()
    const old = await claim({ ...f.credentials, wakeId: wake.id, claimOwner: 'old' }, f.client, () => now)
    const later = new Date(now.getTime() + 120_001)
    const current = await claim({ ...f.credentials, wakeId: wake.id, claimOwner: 'new' }, f.client, () => later)
    expect(current.claimEpoch).toBe(old.claimEpoch + 1)
    await expect(
      acknowledge(
        { ...f.credentials, wakeId: wake.id, claimOwner: 'old', claimEpoch: old.claimEpoch },
        f.client,
        () => later,
      ),
    ).rejects.toThrow('stale')
    expect(
      (
        await acknowledge(
          { ...f.credentials, wakeId: wake.id, claimOwner: 'new', claimEpoch: current.claimEpoch },
          f.client,
          () => later,
        )
      ).wake.status,
    ).toBe('ACKNOWLEDGED')
  })

  it('preserves new causes while an older ACK commits and replays a lost ACK reply exactly', async () => {
    const f = await fixture()
    const wake = (await cause(f, 'test:older'))!
    const claimed = await claim({ ...f.credentials, wakeId: wake.id, claimOwner: 'worker' }, f.client)
    const newer = (await cause(f, 'test:newer'))!
    const input = { ...f.credentials, wakeId: wake.id, claimOwner: 'worker', claimEpoch: claimed.claimEpoch }
    let committed: Awaited<ReturnType<typeof acknowledge>> | undefined
    await expect(
      (async () => {
        committed = await acknowledge(input, f.client)
        throw new Error('lost acknowledgement response')
      })(),
    ).rejects.toThrow('lost acknowledgement response')
    const replay = await acknowledge(input, f.connect())
    expect(replay.replayed).toBe(true)
    expect(replay.wake).toEqual(committed!.wake)
    expect(JSON.parse(replay.wake.processingOutcome!)).toMatchObject({ outcome: 'ADMITTED_WORK_DISCOVERED' })
    expect((await discover(f.credentials, f.client)).pending.map(row => row.id)).toContain(newer.id)
    expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
  })

  it('discovers admitted work after every wake was acknowledged and the database reopens before prepare', async () => {
    const f = await fixture()
    for (const wake of (await discover(f.credentials, f.client)).pending) {
      const owned = await claim({ ...f.credentials, wakeId: wake.id, claimOwner: 'poller' }, f.client)
      await acknowledge(
        { ...f.credentials, wakeId: wake.id, claimOwner: 'poller', claimEpoch: owned.claimEpoch },
        f.client,
      )
    }
    await f.client.$disconnect()
    const reopened = f.connect()
    const recovered = await discover(f.credentials, reopened)
    expect(recovered.pending).toHaveLength(0)
    expect(recovered.admittedWithoutRun).toEqual([{ attemptId: f.binding.attemptId, workItemId: f.binding.workItemId }])
    expect(await reopened.qualityJourneyProviderRun.count()).toBe(0)
    expect(await reopened.qualityJourneyProviderDispatchIntent.count()).toBe(0)
  })

  it('rediscovers the same unarmed prepared intent after every wake ACK and restart before intent claim', async () => {
    const f = await fixture()
    const prepared = await prepareQualityJourneyProviderRun(f.prepareInput, f.client)
    for (const wake of (await discover(f.credentials, f.client)).pending) {
      const owned = await claim({ ...f.credentials, wakeId: wake.id, claimOwner: 'prepared-poller' }, f.client)
      const ack = await acknowledge(
        { ...f.credentials, wakeId: wake.id, claimOwner: 'prepared-poller', claimEpoch: owned.claimEpoch },
        f.client,
      )
      expect(JSON.parse(ack.wake.processingOutcome!)).toMatchObject({ outcome: 'ADMITTED_WORK_DISCOVERED' })
    }
    await f.client.$disconnect()
    const reopened = f.connect()
    const recovered = await discover(f.credentials, reopened)
    expect(recovered.pending).toEqual([])
    expect(recovered.admittedWithoutRun).toEqual([])
    expect(recovered.pendingProviderIntents).toEqual([
      { intentId: prepared.intent.id, attemptId: f.binding.attemptId, workItemId: f.binding.workItemId },
    ])
    expect(await reopened.qualityJourneyProviderRun.count()).toBe(1)
    expect(await reopened.qualityJourneyProviderDispatchIntent.count()).toBe(1)
    const unchanged = await reopened.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({
      where: { id: prepared.intent.id },
    })
    expect(unchanged.status).toBe('PENDING')
    expect(unchanged.claimEpoch).toBe(0)
    expect(unchanged.sendBoundaryId).toBeNull()
    expect(unchanged.armedAt).toBeNull()
    await reopened.qualityJourney.update({
      where: { id: f.scope.journeyId },
      data: { activeRevisionIdsJson: '{"journey":"new-revision"}', version: { increment: 1 } },
    })
    expect((await discover(f.credentials, reopened)).pendingProviderIntents).toEqual([])
  })

  it('discovers expired unarmed provider claims while live claims and stale inputs remain ineligible', async () => {
    const f = await fixture()
    await f.client.qualityJourneyWorkAttempt.update({
      where: { id: f.binding.attemptId },
      data: { leaseExpiresAt: new Date(Date.now() + 600_000) },
    })
    const prepared = await prepareQualityJourneyProviderRun(f.prepareInput, f.client)
    const owned = await claimQualityJourneyProviderIntent(
      { ...f.binding, intentId: prepared.intent.id, claimOwner: 'original-provider-owner' },
      f.client,
    )
    expect((await discover(f.credentials, f.client)).pendingProviderIntents).toEqual([])
    const later = new Date(owned.intent.claimExpiresAt!.getTime() + 1)
    expect((await discover(f.credentials, f.client, () => later)).pendingProviderIntents).toEqual([
      { intentId: prepared.intent.id, attemptId: f.binding.attemptId, workItemId: f.binding.workItemId },
    ])
    await f.client.qualityJourneyWorkItem.update({
      where: { id: f.binding.workItemId },
      data: { inputHash: 'changed-input', version: { increment: 1 } },
    })
    expect((await discover(f.credentials, f.client, () => later)).pendingProviderIntents).toEqual([])
    expect(
      (await f.client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({ where: { id: prepared.intent.id } }))
        .sendBoundaryId,
    ).toBeNull()
  })

  it('never advertises an armed boundary as pending work after its claim expires', async () => {
    const f = await fixture()
    await f.client.qualityJourneyWorkAttempt.update({
      where: { id: f.binding.attemptId },
      data: { leaseExpiresAt: new Date(Date.now() + 600_000) },
    })
    const prepared = await prepareQualityJourneyProviderRun(f.prepareInput, f.client)
    const input = { ...f.binding, intentId: prepared.intent.id, claimOwner: 'original-sender' }
    const owned = await claimQualityJourneyProviderIntent(input, f.client)
    await armQualityJourneyProviderIntent({ ...input, claimEpoch: owned.intent.claimEpoch }, f.client)
    const later = new Date(owned.intent.claimExpiresAt!.getTime() + 1)
    expect((await discover(f.credentials, f.client, () => later)).pendingProviderIntents).toEqual([])
    const durable = await f.client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({
      where: { id: prepared.intent.id },
    })
    expect(durable.sendBoundaryId).not.toBeNull()
    expect(durable.armedAt).not.toBeNull()
    expect(durable.turnId).toBeNull()
  })

  it('observes human waits and pause without creating a run or dispatch intent', async () => {
    const f = await fixture()
    for (const status of ['WAITING_FOR_INPUT', 'PAUSED']) {
      await f.client.qualityJourney.update({
        where: { id: f.scope.journeyId },
        data: { status, version: { increment: 1 } },
      })
      const work = await discover(f.credentials, f.client)
      expect(work.admittedWithoutRun).toEqual([])
      expect(work.outcome).toBe('RECONCILIATION_REQUIRED')
      const wake = (await cause(f, `test:${status}`))!
      const owned = await claim({ ...f.credentials, wakeId: wake.id, claimOwner: 'observer' }, f.client)
      await acknowledge(
        { ...f.credentials, wakeId: wake.id, claimOwner: 'observer', claimEpoch: owned.claimEpoch },
        f.client,
      )
    }
    expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
    expect(await f.client.qualityJourneyProviderDispatchIntent.count()).toBe(0)
  })

  it('rejects foreign target and stale or missing session authority without claiming a wake', async () => {
    const f = await fixture()
    const wake = (await cause(f, 'test:authority'))!
    for (const credentials of [
      { ...f.credentials, targetProjectId: 'foreign-target' },
      { ...f.credentials, coordinatorGeneration: f.credentials.coordinatorGeneration + 1 },
      { ...f.credentials, coordinatorPrincipalId: undefined },
      { ...f.credentials, coordinatorSessionId: undefined },
    ]) {
      await expect(discover(credentials, f.client)).rejects.toThrow()
      await expect(claim({ ...credentials, wakeId: wake.id, claimOwner: 'unauthorized' }, f.client)).rejects.toThrow()
    }
    const unchanged = await f.client.qualityJourneyWakeIntent.findUniqueOrThrow({ where: { id: wake.id } })
    expect(unchanged.status).toBe('PENDING')
    expect(unchanged.claimEpoch).toBe(0)
    const owned = await claim({ ...f.credentials, wakeId: wake.id, claimOwner: 'current' }, f.client)
    await expect(
      acknowledge(
        {
          ...f.credentials,
          coordinatorGeneration: f.credentials.coordinatorGeneration + 1,
          wakeId: wake.id,
          claimOwner: 'current',
          claimEpoch: owned.claimEpoch,
        },
        f.client,
      ),
    ).rejects.toThrow()
    expect((await f.client.qualityJourneyWakeIntent.findUniqueOrThrow({ where: { id: wake.id } })).status).toBe(
      'CLAIMED',
    )
    expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
  })
})
