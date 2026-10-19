import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { createWorkerSpawnRequest } from '@/lib/quality-journey'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addManagedProviderAssignment, createProviderFixture } from '@/test/quality-journey-provider-fixture'
import {
  consumeProviderSendPermit,
  disableProviderSendPermit,
  trustedProviderObservation,
  trustedProviderReconciliation,
} from '@/lib/quality-journey/provider-intent-contract'
import { refreshQualityJourneyWorkAuthorizationInTransaction } from './quality-journey-service'
import {
  armQualityJourneyProviderIntent as arm,
  consumeQualityJourneyProviderSendPermit as consumeCurrent,
  claimQualityJourneyProviderIntent as claim,
  prepareQualityJourneyProviderRun as prepare,
  reconcileQualityJourneyProviderIntent as reconcile,
  recordQualityJourneyProviderAcknowledgement as acknowledge,
} from './quality-journey-provider-run-service'

type Fixture = Awaited<ReturnType<typeof createProviderFixture>>
const fixtures: Fixture[] = []
afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(fixtures.splice(0).map(f => f.cleanup()))
})
async function fixture() {
  const f = await createProviderFixture()
  fixtures.push(f)
  return f
}
const evidenceDigest = `sha256:${'b'.repeat(64)}`

/** Real transaction commits/rollbacks; only its reply is deliberately dropped. */
function transactionFault(client: PrismaClient, fault: 'after-commit' | 'before-commit'): PrismaClient {
  return new Proxy(client, {
    get(target, key) {
      if (key === '$transaction')
        return async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
          const result = await target.$transaction(async tx => {
            const result = await callback(tx)
            if (fault === 'before-commit') throw new Error('injected rollback')
            return result
          })
          if (fault === 'after-commit') throw new Error('injected lost commit reply')
          return result
        }
      const value = Reflect.get(target, key)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
async function prepared(f: Fixture) {
  return prepare(f.prepareInput, f.client)
}
async function armed(f: Fixture) {
  const p = await prepared(f)
  const request = { ...f.binding, intentId: p.intent.id, claimOwner: 'supervisor' }
  const c = await claim(request, f.client)
  const a = await arm({ ...request, claimEpoch: c.intent.claimEpoch }, f.client)
  return { p, c, a, request }
}
function ackInput(f: Fixture, a: Awaited<ReturnType<typeof arm>>) {
  return {
    intentId: a.intent.id,
    sendBoundaryId: a.intent.sendBoundaryId!,
    providerNamespace: f.prepareInput.providerNamespace,
    threadId: 'thread-1',
    turnId: 'turn-1',
    observationKey: 'ack-1',
    evidenceDigest,
  }
}

describe('managed provider intent committed SQLite boundaries', () => {
  it('recovers a lost preparation reply by exact identity without extra rows, secrets or budgets', async () => {
    const f = await fixture()
    await expect(prepare(f.prepareInput, transactionFault(f.client, 'after-commit'))).rejects.toThrow(
      'lost commit reply',
    )
    const replay = await prepare(f.prepareInput, f.connect())
    expect(replay.replayed).toBe(true)
    expect(await f.client.qualityJourneyProviderRun.count()).toBe(1)
    expect(await f.client.qualityJourneyProviderDispatchIntent.count()).toBe(1)
    expect(replay.run.turnsReserved).toBe(0)
    expect(JSON.stringify(replay)).not.toContain(f.binding.assignmentSecret)
    expect(
      await f.client.qualityJourneyWakeIntent.count({ where: { causeKey: `provider-run:${replay.run.id}:initial` } }),
    ).toBe(1)
    await expect(prepare({ ...f.prepareInput, envelopeDigest: `sha256:${'a'.repeat(64)}` }, f.client)).rejects.toThrow(
      'different input',
    )
    await expect(prepare({ ...f.prepareInput, assignmentSecret: 'wrong-secret-'.repeat(5) }, f.client)).rejects.toThrow(
      'authority',
    )
  })

  it('rolls back preparation and its wake together', async () => {
    const f = await fixture()
    const before = await f.client.qualityJourneyWakeIntent.count()
    await expect(prepare(f.prepareInput, transactionFault(f.client, 'before-commit'))).rejects.toThrow('rollback')
    expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
    expect(await f.client.qualityJourneyProviderDispatchIntent.count()).toBe(0)
    expect(await f.client.qualityJourneyWakeIntent.count()).toBe(before)
  })

  it('recovers a committed claim with unchanged epoch and expiry, then reclaims only an expired unsent claim', async () => {
    const f = await fixture()
    const p = await prepared(f)
    const request = { ...f.binding, intentId: p.intent.id, claimOwner: 'supervisor' }
    await expect(claim(request, transactionFault(f.client, 'after-commit'))).rejects.toThrow('lost commit reply')
    const durable = await f.client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({
      where: { id: p.intent.id },
    })
    const replay = await claim(request, f.connect())
    expect(replay.replayed).toBe(true)
    expect(replay.intent.claimEpoch).toBe(durable.claimEpoch)
    expect(replay.intent.claimExpiresAt).toEqual(durable.claimExpiresAt)
    await expect(claim({ ...request, claimOwner: 'other' }, f.client)).rejects.toThrow('not claimable')
    await f.client.qualityJourneyProviderDispatchIntent.update({
      where: { id: p.intent.id },
      data: { claimExpiresAt: new Date(0) },
    })
    const reclaimed = await claim({ ...request, claimOwner: 'other' }, f.connect())
    expect(reclaimed.intent.claimEpoch).toBe(durable.claimEpoch + 1)
    await expect(arm({ ...request, claimEpoch: durable.claimEpoch }, f.client)).rejects.toThrow('stale')
  })

  it('has one claim winner across independent SQLite clients', async () => {
    const f = await fixture()
    const p = await prepared(f)
    const results = await Promise.allSettled(
      ['one', 'two'].map(claimOwner => claim({ ...f.binding, intentId: p.intent.id, claimOwner }, f.connect())),
    )
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(
      (await f.client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({ where: { id: p.intent.id } }))
        .claimEpoch,
    ).toBe(1)
  })

  it('loses an arm commit reply without reconstructing a permit or releasing UNKNOWN after restart', async () => {
    const f = await fixture()
    const p = await prepared(f)
    const request = { ...f.binding, intentId: p.intent.id, claimOwner: 'supervisor' }
    const c = await claim(request, f.client)
    await expect(
      arm({ ...request, claimEpoch: c.intent.claimEpoch }, transactionFault(f.client, 'after-commit')),
    ).rejects.toThrow('lost commit reply')
    const replay = await arm({ ...request, claimEpoch: c.intent.claimEpoch }, f.connect())
    expect(replay.replayed).toBe(true)
    expect(replay.permit).toBeUndefined()
    expect(replay.intent.status).toBe('UNKNOWN')
    expect(replay.run.turnsReserved).toBe(1)
    expect((await f.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })).intentId).toBe(
      p.intent.id,
    )
    await expect(claim({ ...request, claimOwner: 'replacement' }, f.connect())).rejects.toThrow('not claimable')
  })

  it('serializes the same send boundary with at most one returned permit', async () => {
    const f = await fixture()
    const p = await prepared(f)
    const request = { ...f.binding, intentId: p.intent.id, claimOwner: 'supervisor' }
    const c = await claim(request, f.client)
    const results = await Promise.allSettled(
      [f.client, f.connect()].map(client => arm({ ...request, claimEpoch: c.intent.claimEpoch }, client)),
    )
    const permits = results.flatMap(r => (r.status === 'fulfilled' && r.value.permit ? [r.value.permit] : []))
    expect(permits).toHaveLength(1)
    let sends = 0
    for (const permit of permits) {
      consumeProviderSendPermit(permit)
      sends++
    }
    expect(sends).toBe(1)
    expect(
      (await f.client.qualityJourneyProviderRun.findUniqueOrThrow({ where: { id: p.run.id } })).turnsReserved,
    ).toBe(1)
  })

  it('serializes different Journeys and targets through one hub slot', async () => {
    const f = await fixture()
    await f.client.targetProject.create({
      data: {
        id: 'second-target',
        kind: 'LOCAL_WORKSPACE',
        canonicalIdentity: `path:${f.workspace}/second`,
        canonicalPath: `${f.workspace}/second`,
        displayName: 'second',
        fingerprint: `sha256:${'d'.repeat(64)}`,
      },
    })
    const second = await addManagedProviderAssignment(f.client, 'second-target', 'second')
    const entries = []
    for (const assignment of [f, second]) {
      const p = await prepare(assignment.prepareInput, f.client)
      const request = { ...assignment.binding, intentId: p.intent.id, claimOwner: `owner-${p.run.id}` }
      const c = await claim(request, f.client)
      entries.push({ ...request, claimEpoch: c.intent.claimEpoch })
    }
    const results = await Promise.allSettled(entries.map(request => arm(request, f.connect())))
    expect(results.filter(r => r.status === 'fulfilled' && r.value.permit)).toHaveLength(1)
    expect(await f.client.qualityJourneyProviderRun.count({ where: { turnsReserved: 1 } })).toBe(1)
  })

  it('keeps a post-send lost acknowledgement uncertain with exactly one simulated sink invocation', async () => {
    const f = await fixture()
    const { a, request, c } = await armed(f)
    let sinkCalls = 0
    consumeProviderSendPermit(a.permit!)
    sinkCalls++
    await expect(arm({ ...request, claimEpoch: c.intent.claimEpoch }, f.connect())).resolves.toMatchObject({
      replayed: true,
    })
    expect(() => consumeProviderSendPermit(a.permit!)).toThrow('already consumed')
    expect(sinkCalls).toBe(1)
    expect((await f.connect().qualityJourneyProviderRun.findUniqueOrThrow({ where: { id: a.run.id } })).status).toBe(
      'UNKNOWN',
    )
  })

  it('replays exact acknowledged handles after a lost observation reply without granting completion', async () => {
    const f = await fixture()
    const { a } = await armed(f)
    const input = ackInput(f, a)
    await expect(
      acknowledge(input, trustedProviderObservation, transactionFault(f.client, 'after-commit')),
    ).rejects.toThrow('lost commit reply')
    expect((await acknowledge(input, trustedProviderObservation, f.connect())).replayed).toBe(true)
    expect(await f.client.qualityJourneyProviderObservation.count()).toBe(1)
    expect(
      (await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: f.binding.attemptId } })).status,
    ).toBe('IN_PROGRESS')
    expect((await f.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })).intentId).toBe(
      a.intent.id,
    )
  })

  it('retains late acknowledgement after cancellation as evidence with no restored authority', async () => {
    const f = await fixture()
    const { a, request, c } = await armed(f)
    await f.client.qualityJourneyWorkAttempt.update({
      where: { id: f.binding.attemptId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    })
    await acknowledge(ackInput(f, a), trustedProviderObservation, f.client)
    expect(
      (await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: f.binding.attemptId } })).status,
    ).toBe('CANCELLED')
    expect((await arm({ ...request, claimEpoch: c.intent.claimEpoch }, f.client)).permit).toBeUndefined()
    expect((await f.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })).intentId).toBe(
      a.intent.id,
    )
  })

  it('durably fences changed acknowledgement correlation and rejects JSON lookalike capabilities', async () => {
    const f = await fixture()
    const { a } = await armed(f)
    const input = ackInput(f, a)
    await expect(
      acknowledge(input, Symbol('trusted provider observation') as typeof trustedProviderObservation, f.client),
    ).rejects.toThrow('authority')
    await acknowledge(input, trustedProviderObservation, f.client)
    await expect(
      acknowledge(
        { ...input, observationKey: 'conflict', threadId: 'foreign-thread' },
        trustedProviderObservation,
        f.client,
      ),
    ).rejects.toThrow('conflicts')
    expect((await f.connect().qualityJourneyProviderRun.findUniqueOrThrow({ where: { id: a.run.id } })).status).toBe(
      'CONFLICT',
    )
    expect(await f.client.qualityJourneyProviderObservation.count({ where: { kind: 'ACK_CONFLICT' } })).toBe(1)
    await expect(acknowledge({ ...input, turnId: 'changed' }, trustedProviderObservation, f.client)).rejects.toThrow(
      'conflicts',
    )
  })

  it('requires exact nonstart evidence plus disabled original sender before release, preventing delayed send', async () => {
    const f = await fixture()
    const { a } = await armed(f)
    const input = {
      intentId: a.intent.id,
      sendBoundaryId: a.intent.sendBoundaryId!,
      providerNamespace: f.prepareInput.providerNamespace,
      observationKey: 'nonstart',
      evidenceDigest,
      outcome: 'NONSTART' as const,
    }
    await expect(
      reconcile(
        { ...input, senderDisabled: {} as ReturnType<typeof disableProviderSendPermit> },
        trustedProviderReconciliation,
        f.client,
      ),
    ).rejects.toThrow('disabled')
    expect((await f.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })).intentId).toBe(
      a.intent.id,
    )
    const senderDisabled = disableProviderSendPermit(a.permit!, trustedProviderReconciliation)
    await reconcile({ ...input, senderDisabled }, trustedProviderReconciliation, f.client)
    expect(() => consumeProviderSendPermit(a.permit!)).toThrow('unavailable')
    expect((await f.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })).intentId).toBeNull()
    const run = await f.client.qualityJourneyProviderRun.findUniqueOrThrow({ where: { id: a.run.id } })
    expect(run.turnsReserved).toBe(1)
    expect(run.terminalRetentionAt!.getTime() - run.terminalReconciledAt!.getTime()).toBe(86400000)
    expect((await reconcile({ ...input, senderDisabled }, trustedProviderReconciliation, f.connect())).replayed).toBe(
      true,
    )
    expect((await prepare(f.prepareInput, f.client)).run.id).toBe(a.run.id)
  })

  it('cannot disable a consumed sender even after ACK, retaining the slot pending qualified transport evidence', async () => {
    const f = await fixture()
    const { a } = await armed(f)
    consumeProviderSendPermit(a.permit!)
    await acknowledge(ackInput(f, a), trustedProviderObservation, f.client)
    expect(() => disableProviderSendPermit(a.permit!, trustedProviderReconciliation)).toThrow('qualified transport')
    expect((await f.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })).intentId).toBe(
      a.intent.id,
    )
    expect(
      (await f.client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({ where: { id: a.intent.id } }))
        .reconciledAt,
    ).toBeNull()
  })

  it.each(['revision', 'input', 'authorization', 'session', 'lease', 'pause', 'human-wait'] as const)(
    'fences %s changes before arm without consuming the hub slot',
    async change => {
      const f = await fixture()
      const p = await prepared(f)
      const request = { ...f.binding, intentId: p.intent.id, claimOwner: 'supervisor' }
      const c = await claim(request, f.client)
      if (change === 'revision')
        await f.client.qualityJourney.update({
          where: { id: f.scope.journeyId },
          data: { activeRevisionIdsJson: '{"journey":"different"}' },
        })
      if (change === 'input')
        await f.client.qualityJourneyWorkItem.update({
          where: { id: f.binding.workItemId },
          data: { inputHash: 'different' },
        })
      if (change === 'authorization')
        await f.client.qualityJourneyWorkAuthorization.update({
          where: { id: p.run.authorizationId },
          data: { revokedAt: new Date() },
        })
      if (change === 'session')
        await f.client.qualityJourneyCoordinatorSession.update({
          where: { id: f.credentials.coordinatorSessionId },
          data: { status: 'FENCED', fencedAt: new Date() },
        })
      if (change === 'lease')
        await f.client.qualityJourneyWorkAttempt.update({
          where: { id: f.binding.attemptId },
          data: { leaseExpiresAt: new Date(0) },
        })
      if (change === 'pause')
        await f.client.qualityJourney.update({ where: { id: f.scope.journeyId }, data: { status: 'PAUSED' } })
      if (change === 'human-wait')
        await f.client.qualityJourney.update({
          where: { id: f.scope.journeyId },
          data: { unresolvedQuestionIdsJson: '["human-question"]' },
        })
      await expect(arm({ ...request, claimEpoch: c.intent.claimEpoch }, f.client)).rejects.toThrow()
      expect(
        (await f.client.qualityJourneyProviderRun.findUniqueOrThrow({ where: { id: p.run.id } })).turnsReserved,
      ).toBe(0)
      expect(
        (await f.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })).intentId,
      ).toBeNull()
    },
  )

  it('preserves frozen deadlines and rejects direct history edits or unsafe slot recycling', async () => {
    const f = await fixture()
    const { a } = await armed(f)
    expect(a.intent.acknowledgementDueAt!.getTime() - a.intent.armedAt!.getTime()).toBe(60000)
    expect(a.intent.turnDueAt!.getTime() - a.intent.armedAt!.getTime()).toBe(900000)
    expect(a.run.unresolvedRetentionAt.getTime() - a.run.earliestIntentAt.getTime()).toBe(604800000)
    await expect(
      f.client.qualityJourneyProviderRun.update({ where: { id: a.run.id }, data: { turnsReserved: 0 } }),
    ).rejects.toThrow()
    await expect(
      f.client.qualityJourneyProviderRun.update({
        where: { id: a.run.id },
        data: { unresolvedRetentionAt: new Date() },
      }),
    ).rejects.toThrow()
    await expect(
      f.client.qualityJourneyProviderDispatchIntent.update({
        where: { id: a.intent.id },
        data: { sendBoundaryId: null },
      }),
    ).rejects.toThrow()
    await expect(
      f.client.qualityJourneyProviderSlot.update({
        where: { id: 'HUB' },
        data: { intentId: null, providerRunId: null, sendBoundaryId: null },
      }),
    ).rejects.toThrow()
    await expect(f.client.qualityJourneyProviderSlot.create({ data: { id: 'SECOND' } })).rejects.toThrow()
    await expect(
      f.client.qualityJourneyProviderSlot.update({ where: { id: 'HUB' }, data: { id: 'SECOND' } }),
    ).rejects.toThrow()
    expect(await f.client.qualityJourneyProviderSlot.count()).toBe(1)
    expect((await f.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })).intentId).toBe(
      a.intent.id,
    )
    await expect(f.client.qualityJourneyProviderRun.delete({ where: { id: a.run.id } })).rejects.toThrow()
  })
  it('rechecks current authority immediately before permit consumption', async () => {
    const f = await fixture()
    const { a } = await armed(f)
    await f.client.qualityJourney.update({ where: { id: f.scope.journeyId }, data: { status: 'PAUSED' } })
    await expect(consumeCurrent({ ...f.binding, permit: a.permit! }, f.client)).rejects.toThrow('paused')
    expect((await f.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })).intentId).toBe(
      a.intent.id,
    )
    // The original permit can be disabled because the sink never received its identity.
    expect(disableProviderSendPermit(a.permit!, trustedProviderReconciliation).intentId).toBe(a.intent.id)
  })

  it('enforces original seven-day retention across restart without moving the deadline', async () => {
    const f = await fixture()
    const p = await prepared(f)
    const original = p.run.unresolvedRetentionAt
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(original.getTime() + 1)
    // Isolate retention eligibility from the independently tested canonical lease fence.
    await f.client.qualityJourneyWorkAttempt.update({
      where: { id: f.binding.attemptId },
      data: { leaseExpiresAt: new Date(original.getTime() + 120000) },
    })
    await expect(claim({ ...f.binding, intentId: p.intent.id, claimOwner: 'restart' }, f.connect())).rejects.toThrow(
      'explicit recovery',
    )
    expect((await prepare(f.prepareInput, f.connect())).run.unresolvedRetentionAt).toEqual(original)
    expect(
      (await f.client.qualityJourneyProviderRun.findUniqueOrThrow({ where: { id: p.run.id } })).turnsReserved,
    ).toBe(0)
  })

  it('cannot reserve a fourth provider turn or bypass the canonical attempt ceiling', async () => {
    const f = await fixture()
    const p = await prepared(f)
    const request = { ...f.binding, intentId: p.intent.id, claimOwner: 'supervisor' }
    const c = await claim(request, f.client)
    await f.client.qualityJourneyProviderRun.update({ where: { id: p.run.id }, data: { turnsReserved: 3 } })
    await expect(arm({ ...request, claimEpoch: c.intent.claimEpoch }, f.client)).rejects.toThrow('budget')
    await expect(
      f.client.qualityJourneyProviderDispatchIntent.create({
        data: {
          id: 'fourth',
          providerRunId: p.run.id,
          turnOrdinal: 4,
          operationKey: 'fourth',
          requestHash: evidenceDigest,
          envelopeDigest: evidenceDigest,
          providerNamespace: p.run.providerNamespace,
        },
      }),
    ).rejects.toThrow()
    for (const attempt of [2, 3, 4])
      await f.client.qualityJourneyWorkAttempt.create({
        data: {
          id: `historical-${attempt}`,
          workItemId: f.binding.workItemId,
          authorizationId: p.run.authorizationId,
          attempt,
          status: 'COMPLETED',
          leaseId: `historical-lease-${attempt}`,
          ownerTokenHash: 'historical-verifier',
          leaseExpiresAt: new Date(0),
          heartbeatSeconds: 40,
          completedAt: new Date(),
        },
      })
    await expect(arm({ ...request, claimEpoch: c.intent.claimEpoch }, f.client)).rejects.toThrow('attempt budget')
    expect((await f.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })).intentId).toBeNull()
  })

  it.each(['CANCELLED', 'DISPATCH_UNRESOLVED'] as const)(
    'does not infer legacy %s dispatch is safe from empty provider tables',
    async status => {
      const f = await fixture()
      const legacy = await f.client.qualityJourneyWorkAttempt.create({
        data: {
          id: 'legacy-unknown',
          workItemId: f.binding.workItemId,
          attempt: 2,
          status,
          leaseId: 'legacy-lease',
          ownerTokenHash: 'legacy-hash',
          leaseExpiresAt: new Date(0),
          heartbeatSeconds: 40,
          dispatchReservedAt: status === 'CANCELLED' ? new Date() : null,
          completedAt: new Date(),
        },
      })
      await expect(prepare(f.prepareInput, f.client)).rejects.toThrow('Historical provider dispatch')
      expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
      expect(await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: legacy.id } })).toEqual(legacy)
    },
  )

  it('cannot adopt another attempt native thread even after authoritative terminal release', async () => {
    const f = await fixture()
    const { a } = await armed(f)
    await acknowledge(ackInput(f, a), trustedProviderObservation, f.client)
    const senderDisabled = disableProviderSendPermit(a.permit!, trustedProviderReconciliation)
    await reconcile(
      {
        intentId: a.intent.id,
        sendBoundaryId: a.intent.sendBoundaryId!,
        providerNamespace: f.prepareInput.providerNamespace,
        observationKey: 'terminal',
        evidenceDigest,
        outcome: 'TERMINAL',
        senderDisabled,
      },
      trustedProviderReconciliation,
      f.client,
    )
    const second = await addManagedProviderAssignment(f.client, f.scope.targetProjectId, 'next-attempt')
    const p = await prepare({ ...second.prepareInput, providerNamespace: f.prepareInput.providerNamespace }, f.client)
    const request = { ...second.binding, intentId: p.intent.id, claimOwner: 'next' }
    const c = await claim(request, f.client)
    const secondArm = await arm({ ...request, claimEpoch: c.intent.claimEpoch }, f.client)
    await expect(
      acknowledge({ ...ackInput(f, secondArm), observationKey: 'cross-attempt' }, trustedProviderObservation, f.client),
    ).rejects.toThrow('conflicts')
    expect(
      (await f.client.qualityJourneyProviderRun.findUniqueOrThrow({ where: { id: secondArm.run.id } })).status,
    ).toBe('CONFLICT')
    expect((await f.client.qualityJourneyProviderRun.findUniqueOrThrow({ where: { id: a.run.id } })).threadId).toBe(
      'thread-1',
    )
  })
  it('replays a committed reconciliation after a lost reply without an ephemeral sender proof', async () => {
    const f = await fixture()
    const { a } = await armed(f)
    const input = {
      intentId: a.intent.id,
      sendBoundaryId: a.intent.sendBoundaryId!,
      providerNamespace: f.prepareInput.providerNamespace,
      observationKey: 'nonstart-restart',
      evidenceDigest,
      outcome: 'NONSTART' as const,
    }
    const senderDisabled = disableProviderSendPermit(a.permit!, trustedProviderReconciliation)
    await expect(
      reconcile(
        { ...input, senderDisabled },
        trustedProviderReconciliation,
        transactionFault(f.client, 'after-commit'),
      ),
    ).rejects.toThrow('lost commit reply')
    const before = await f.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })
    expect((await reconcile(input, trustedProviderReconciliation, f.connect())).replayed).toBe(true)
    await expect(
      reconcile({ ...input, evidenceDigest: `sha256:${'a'.repeat(64)}` }, trustedProviderReconciliation, f.connect()),
    ).rejects.toThrow('different evidence')
    expect(await f.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })).toEqual(before)
    expect(await f.client.qualityJourneyProviderObservation.count({ where: { kind: 'NONSTART' } })).toBe(1)
  })
  it('retains physical ambiguity for a logically cancelled legacy attempt with a STARTED acknowledgement', async () => {
    const f = await fixture()
    const legacy = await f.client.qualityJourneyWorkAttempt.create({
      data: {
        id: 'legacy-cancelled-started',
        workItemId: f.binding.workItemId,
        attempt: 2,
        status: 'CANCELLED',
        leaseId: 'legacy-cancelled-lease',
        ownerTokenHash: 'historical-verifier',
        leaseExpiresAt: new Date(0),
        heartbeatSeconds: 40,
        dispatchReservedAt: new Date(),
        dispatchStartedAt: new Date(),
        spawnReceiptHash: evidenceDigest,
        spawnReceiptJson: '{"outcome":"STARTED"}',
        completedAt: new Date(),
      },
    })
    await expect(prepare(f.prepareInput, f.client)).rejects.toThrow('Historical provider dispatch')
    expect(await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: legacy.id } })).toEqual(legacy)
    expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
  })
  it('excludes an exactly validated historical REFUSED receipt from unresolved physical effects', async () => {
    const f = await fixture()
    const request = createWorkerSpawnRequest({
      requestId: 'legacy-refused-request',
      attemptId: 'legacy-refused',
      manifest: { ...f.claimed.assignment, assignmentId: 'legacy-refused-assignment' },
    })
    const receipt = {
      schemaVersion: 'appraise.quality-journey/v1',
      outcome: 'REFUSED',
      refusalCode: 'REQUIRED_BOUNDARY_UNSUPPORTED',
      spawnReceiptId: 'legacy-refusal',
      assignmentId: request.assignmentId,
      workItemId: request.workItemId,
      attemptId: request.attemptId,
      roleDefinitionDigest: request.roleDefinitionDigest,
      capabilityProfileDigest: request.capabilityProfileDigest,
      boundaries: request.requiredBoundaries.map((boundary, index) => ({
        boundary: boundary.boundary,
        requested: boundary.allowedValues,
        status: index === 0 ? 'UNSUPPORTED' : 'ENFORCED',
        evidence: index === 0 ? [evidenceDigest] : [],
      })),
      refusedAt: new Date().toISOString(),
    }
    const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
    await f.client.qualityJourneyWorkAttempt.create({
      data: {
        id: 'legacy-refused',
        workItemId: f.binding.workItemId,
        assignmentId: request.assignmentId,
        attempt: 2,
        status: 'REFUSED',
        leaseId: 'legacy-refused-lease',
        ownerTokenHash: 'historical-verifier',
        leaseExpiresAt: new Date(0),
        heartbeatSeconds: 40,
        dispatchReservedAt: new Date(),
        spawnRequestJson: canonicalContractJson(request),
        spawnRequestHash: hash(request),
        spawnReceiptJson: canonicalContractJson(receipt),
        spawnReceiptHash: hash(receipt),
        completedAt: new Date(),
      },
    })
    expect((await prepare(f.prepareInput, f.client)).run.attemptId).toBe(f.binding.attemptId)
  })
  it('fences unrelated Journey arm when late ACK contradicts reconciled nonstart after slot release', async () => {
    const f = await fixture()
    const { a } = await armed(f)
    const senderDisabled = disableProviderSendPermit(a.permit!, trustedProviderReconciliation)
    await reconcile(
      {
        intentId: a.intent.id,
        sendBoundaryId: a.intent.sendBoundaryId!,
        providerNamespace: f.prepareInput.providerNamespace,
        observationKey: 'nonstart-late',
        evidenceDigest,
        outcome: 'NONSTART',
        senderDisabled,
      },
      trustedProviderReconciliation,
      f.client,
    )
    const second = await addManagedProviderAssignment(f.client, f.scope.targetProjectId, 'unrelated')
    const p = await prepare(second.prepareInput, f.client)
    const request = { ...second.binding, intentId: p.intent.id, claimOwner: 'unrelated' }
    const c = await claim(request, f.client)
    await expect(acknowledge(ackInput(f, a), trustedProviderObservation, f.client)).rejects.toThrow('conflicts')
    await expect(arm({ ...request, claimEpoch: c.intent.claimEpoch }, f.connect())).rejects.toThrow(
      'Conflicting provider evidence',
    )
    expect((await f.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })).intentId).toBeNull()
    expect(
      (await f.client.qualityJourneyProviderRun.findUniqueOrThrow({ where: { id: p.run.id } })).turnsReserved,
    ).toBe(0)
    expect((await f.client.qualityJourneyProviderRun.findUniqueOrThrow({ where: { id: a.run.id } })).status).toBe(
      'CONFLICT',
    )
  })
  it.each(['before-prepare', 'before-arm'] as const)(
    'fences a genuinely superseded authorization %s without slot or turn debit',
    async stage => {
      const f = await fixture()
      const p = stage === 'before-arm' ? await prepared(f) : null
      const c = p ? await claim({ ...f.binding, intentId: p.intent.id, claimOwner: 'supervisor' }, f.client) : null
      const admitted = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({
        where: { id: f.binding.attemptId },
      })
      await f.client.$transaction(tx =>
        refreshQualityJourneyWorkAuthorizationInTransaction(f.scope.journeyId, f.binding.workItemId, tx),
      )
      const predecessor = await f.client.qualityJourneyWorkAuthorization.findUniqueOrThrow({
        where: { id: admitted.authorizationId! },
        include: { successorAuthorization: true },
      })
      expect(predecessor.cancelledAt).toBeNull()
      expect(predecessor.revokedAt).toBeNull()
      expect(predecessor.successorAuthorization?.supersedesAuthorizationId).toBe(predecessor.id)
      if (p && c) {
        await expect(
          arm(
            { ...f.binding, intentId: p.intent.id, claimOwner: 'supervisor', claimEpoch: c.intent.claimEpoch },
            f.connect(),
          ),
        ).rejects.toThrow('eligible')
        expect(
          (await f.client.qualityJourneyProviderRun.findUniqueOrThrow({ where: { id: p.run.id } })).turnsReserved,
        ).toBe(0)
      } else {
        await expect(prepare(f.prepareInput, f.connect())).rejects.toThrow('eligible')
        expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
      }
      expect(await f.client.qualityJourneyProviderSlot.count({ where: { intentId: { not: null } } })).toBe(0)
    },
  )
})
