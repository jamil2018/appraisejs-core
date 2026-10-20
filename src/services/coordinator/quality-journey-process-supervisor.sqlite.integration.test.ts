import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Prisma, PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  disableProviderSendPermit,
  trustedProviderReconciliation,
} from '@/lib/quality-journey/provider-intent-contract'
import { launchOwnedFixtureChild } from '@/lib/quality-journey/codex-app-server/owned-child'
import { createProviderFixture } from '@/test/quality-journey-provider-fixture'
import {
  createQualityJourneyFixtureSupervisor,
  createQualityJourneyProcessSupervisor,
  trustedJourneyProcessAdapter,
  startQualityJourneyProductionProvider,
} from './quality-journey-process-supervisor'
import { pauseQualityJourneyOperational } from './quality-journey-recovery-service'
import { assertProviderEffectsQuiescent } from './quality-journey-provider-recovery'
import {
  armQualityJourneyProviderIntent,
  claimQualityJourneyProviderIntent,
  prepareQualityJourneyProviderRun,
  writeQualityJourneyProviderTransport,
} from './quality-journey-provider-run-service'

type Fixture = Awaited<ReturnType<typeof createProviderFixture>>
const fixtures: Fixture[] = []
const supervisors: ReturnType<typeof createQualityJourneyFixtureSupervisor>[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(supervisors.splice(0).map(s => s.cancel()))
  await Promise.all(fixtures.splice(0).map(f => f.cleanup()))
})
async function setup(mode = 'hold', clientOverride?: (client: PrismaClient) => PrismaClient) {
  const f = await createProviderFixture()
  fixtures.push(f)
  const trace = path.join(f.workspace, 'methods.txt')
  const options = {
    fixturePath: path.resolve('scripts/tests/fixtures/m05-owned-child.mjs'),
    fixtureArgs: [mode, trace],
    requestTimeoutMs: 5_000,
    // A lost turn ACK must time out after readiness succeeds, even under full-suite load.
    turnAcknowledgementTimeoutMs: mode === 'lost-ack' ? 250 : undefined,
  }
  const s = createQualityJourneyFixtureSupervisor(f.prepareInput, options, clientOverride?.(f.client) ?? f.client)
  supervisors.push(s)
  return { f, s, trace, options }
}
async function methods(trace: string) {
  return (await readFile(trace, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean)
}
async function retained(f: Fixture) {
  const client = f.connect()
  const slot = await client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })
  expect(slot.intentId).not.toBeNull()
  const intent = await client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({ where: { id: slot.intentId! } })
  expect(intent.reconciledAt).toBeNull()
  expect(await client.qualityJourneyProviderRun.count()).toBe(1)
  expect(await client.qualityJourneyProviderDispatchIntent.count()).toBe(1)
  expect(await client.qualityJourneyExternalSubmissionAcceptance.count()).toBe(0)
  await expect(client.$transaction(tx => assertProviderEffectsQuiescent(f.scope, tx))).rejects.toBeDefined()
  return intent
}

describe('M05 owned fixture process composed with canonical SQLite services', () => {
  it('initializes once, captures exact correlation, cancels and drains without releasing uncertainty', async () => {
    const { f, s, trace } = await setup()
    const active = await s.start()
    expect(active.state).toBe('active')
    expect(active.threadId).toBe('m05-fixture-thread')
    expect(active.turnId).toBe('m05-fixture-turn')
    expect(active.sessionId).toBe(f.binding.coordinatorSessionId)
    expect(active.coordinatorGeneration).toBe(1)
    expect(await s.start()).toEqual(active)
    const stopped = await s.cancel()
    expect(stopped.cleanup).toMatchObject({ status: 'stopped', groupExitObserved: true, privateRootRemoved: true })
    expect(stopped.providerTerminationProven).toBe(false)
    expect(stopped.transport?.pendingRequests).toBe(0)
    expect(await s.cancel()).toEqual(stopped)
    expect(await methods(trace)).toEqual(['initialize', 'initialized', 'thread/start', 'turn/start'])
    expect((await retained(f)).status).toBe('ACKNOWLEDGED')
    const observations = await f.client.qualityJourneyProviderObservation.findMany()
    expect(observations.some(o => o.observationKey.includes(active.transportId))).toBe(true)
    expect(JSON.stringify(observations)).not.toContain(f.binding.assignmentSecret)
    expect(startQualityJourneyProductionProvider).toThrow('blocked')
  })

  it.each(['crash', 'lost-ack', 'rpc', 'malformed', 'wrong-event', 'turn-mismatch', 'malformed-handle'])(
    'fences %s without resend, restart or slot release',
    async mode => {
      const { f, s, trace, options } = await setup(mode)
      await expect(s.start()).rejects.toBeDefined()
      const stopped = await s.cancel()
      expect(stopped.fenced).toBe(true)
      expect(stopped.cleanup?.groupExitObserved).toBe(true)
      const before = await methods(trace)
      expect(before.filter(m => m === 'turn/start')).toHaveLength(1)
      expect((await retained(f)).status).toBe('UNKNOWN')
      const restarted = createQualityJourneyFixtureSupervisor(f.prepareInput, options, f.connect())
      supervisors.push(restarted)
      await expect(restarted.start()).rejects.toBeDefined()
      expect(await methods(trace)).toEqual(before)
    },
  )

  it('correctly shaped premature completion blocks before any turn/start', async () => {
    const { f, s, trace } = await setup('premature-event')
    await expect(s.start()).rejects.toBeDefined()
    expect(s.snapshot().completed).toBe(false)
    expect(await methods(trace)).toEqual(['initialize', 'initialized', 'thread/start'])
    await retained(f)
  })

  it('pre-turn writes require the exact original enabled permit, not reconstructed fields', async () => {
    const { f } = await setup()
    const p = await prepareQualityJourneyProviderRun(f.prepareInput, f.client)
    const request = { ...f.binding, intentId: p.intent.id, claimOwner: 'permit-owner' }
    const c = await claimQualityJourneyProviderIntent(request, f.client)
    const a = await armQualityJourneyProviderIntent({ ...request, claimEpoch: c.intent.claimEpoch }, f.client)
    const send = vi.fn(async () => ({}))
    await expect(
      writeQualityJourneyProviderTransport({ ...f.binding, permit: { ...a.permit! }, consume: false }, send, f.client),
    ).rejects.toBeDefined()
    disableProviderSendPermit(a.permit!, trustedProviderReconciliation)
    await expect(
      writeQualityJourneyProviderTransport({ ...f.binding, permit: a.permit!, consume: false }, send, f.client),
    ).rejects.toBeDefined()
    expect(send).not.toHaveBeenCalled()
    await retained(f)
  })

  it('logical completion drains transport but creates no accepted artifact or termination proof', async () => {
    const { f, s } = await setup('normal')
    await s.start()
    await vi.waitFor(() => expect(s.snapshot().state).toBe('stopped'))
    expect(s.snapshot().completed).toBe(true)
    await retained(f)
  })

  it('turn deadline fences and drains the live fixture without changing consumed budgets', async () => {
    const nativeTimeout = globalThis.setTimeout
    let expire: (() => void) | undefined
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void, ms?: number, ...args: unknown[]) => {
      if (ms && ms > 800_000 && ms <= 900_000) expire = callback
      return nativeTimeout(callback, ms, ...args)
    }) as typeof setTimeout)
    const { f, s } = await setup()
    await s.start()
    expect(expire).toBeDefined()
    expire!()
    expect(s.snapshot().fenced).toBe(true)
    expect((await s.cancel()).reason).toBe('TURN_DEADLINE')
    await retained(f)
    expect((await f.client.qualityJourneyProviderRun.findFirstOrThrow()).turnsReserved).toBe(1)
  })

  it('stale generations and cancelled-before-start send no bytes', async () => {
    const { f, s, trace, options } = await setup()
    await s.cancel()
    await expect(s.start()).rejects.toBeDefined()
    expect(await methods(trace)).toEqual([])
    const stale = createQualityJourneyFixtureSupervisor(
      { ...f.prepareInput, coordinatorGeneration: 99 },
      options,
      f.client,
    )
    supervisors.push(stale)
    await expect(stale.start()).rejects.toBeDefined()
    expect(await methods(trace)).toEqual([])
    expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
  })

  it('cancellation at the awaited startup phase boundary prevents child launch', async () => {
    const { f, options } = await setup()
    let cancel: Promise<unknown> | undefined
    const delegate = new Proxy(f.client.qualityJourneyProviderObservation, {
      get(target, key) {
        if (key === 'create')
          return async (args: Parameters<typeof target.create>[0]) => {
            const result = await target.create(args)
            if (args.data.kind === 'TRANSPORT_STARTUP')
              queueMicrotask(() =>
                queueMicrotask(() =>
                  queueMicrotask(() => {
                    cancel = boundary.cancel()
                  }),
                ),
              )
            return result
          }
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const client = new Proxy(f.client, {
      get(target, key) {
        if (key === 'qualityJourneyProviderObservation') return delegate
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const launch = vi.fn(callbacks => launchOwnedFixtureChild({ ...options, ...callbacks }))
    const boundary = createQualityJourneyProcessSupervisor(
      f.prepareInput,
      {
        capability: trustedJourneyProcessAdapter,
        configurationDigest: f.prepareInput.configurationDigest,
        input: [{ type: 'text', text: 'synthetic boundary check' }],
        validateReadiness: value => !!value,
        launch,
      },
      client,
    )
    supervisors.push(boundary)
    await expect(boundary.start()).rejects.toBeDefined()
    await cancel
    expect(launch).not.toHaveBeenCalled()
    expect(boundary.snapshot().fenced).toBe(true)
    await retained(f)
  })

  it('revokes a delayed real launch before any RPC and joins its owned drain', async () => {
    const { f, trace, options } = await setup()
    let release!: () => void
    let launched!: () => void
    const barrier = new Promise<void>(resolve => {
      release = resolve
    })
    const ready = new Promise<void>(resolve => {
      launched = resolve
    })
    const delayed = createQualityJourneyProcessSupervisor(
      f.prepareInput,
      {
        capability: trustedJourneyProcessAdapter,
        configurationDigest: f.prepareInput.configurationDigest,
        input: [{ type: 'text', text: 'synthetic generic core input' }],
        validateReadiness: value => !!value,
        launch: async callbacks => {
          const child = await launchOwnedFixtureChild({ ...options, ...callbacks })
          launched()
          await barrier
          return child
        },
      },
      f.client,
    )
    supervisors.push(delayed)
    const started = delayed.start()
    const rejection = expect(started).rejects.toBeDefined()
    await ready
    const stopped = delayed.cancel()
    expect(delayed.snapshot().fenced).toBe(true)
    release()
    expect((await stopped).cleanup?.groupExitObserved).toBe(true)
    await rejection
    expect(await methods(trace)).toEqual([])
    await retained(f)
  })

  it('a paused canonical owner cannot enter a delayed transport callback', async () => {
    const { f } = await setup()
    const p = await prepareQualityJourneyProviderRun(f.prepareInput, f.client)
    const request = { ...f.binding, intentId: p.intent.id, claimOwner: 'delayed' }
    const c = await claimQualityJourneyProviderIntent(request, f.client)
    const a = await armQualityJourneyProviderIntent({ ...request, claimEpoch: c.intent.claimEpoch }, f.client)
    const current = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
    await pauseQualityJourneyOperational(
      {
        ...f.scope,
        expectedStateHash: current.stateHash,
        expectedVersion: current.version,
        idempotencyKey: 'pause-delayed',
        reason: 'fixture pause',
      },
      f.client,
    )
    const send = vi.fn(async () => ({}))
    await expect(
      writeQualityJourneyProviderTransport({ ...f.binding, permit: a.permit!, consume: true }, send, f.connect()),
    ).rejects.toBeDefined()
    expect(send).not.toHaveBeenCalled()
    await retained(f)
  })

  it('a committed write with lost transaction reply cannot produce another physical start', async () => {
    let loseReply = true
    const { f, s, trace, options } = await setup(
      'hold',
      client =>
        new Proxy(client, {
          get(target, key) {
            if (key === '$transaction')
              return async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
                const result = await target.$transaction(callback)
                if (loseReply && result && typeof result === 'object' && 'reply' in result) {
                  const wire = await (result as { reply: Promise<Record<string, unknown> | void> }).reply
                  if (wire && 'turn' in wire) {
                    loseReply = false
                    throw new Error('lost transport commit acknowledgement')
                  }
                }
                return result
              }
            const value = Reflect.get(target, key)
            return typeof value === 'function' ? value.bind(target) : value
          },
        }),
    )
    await expect(s.start()).rejects.toThrow('lost transport commit')
    expect(await methods(trace)).toEqual(['initialize', 'initialized', 'thread/start', 'turn/start'])
    await retained(f)
    const successor = createQualityJourneyFixtureSupervisor(f.prepareInput, options, f.connect())
    supervisors.push(successor)
    await expect(successor.start()).rejects.toBeDefined()
    expect(await methods(trace)).toEqual(['initialize', 'initialized', 'thread/start', 'turn/start'])
  })
})
