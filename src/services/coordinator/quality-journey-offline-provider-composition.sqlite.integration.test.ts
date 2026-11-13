import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OwnedChildCleanupReceipt } from '@/lib/quality-journey/codex-app-server/owned-child'
import { createProviderFixture } from '@/test/quality-journey-provider-fixture'
import type {
  OfflineOwnedProviderPort,
  OfflineProviderBinding,
  OfflineProviderCall,
} from '@/lib/quality-journey/codex-app-server/provider-composition-contract'
import { createOfflineQualityJourneyProviderComposition } from './quality-journey-offline-provider-composition'
import { createOfflineQualityJourneyRoleDelivery } from './quality-journey-offline-role-delivery'
import { revokeQualityJourneyWorkAuthorization } from './quality-journey-service'

const fixtures: Awaited<ReturnType<typeof createProviderFixture>>[] = []
afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(fixtures.splice(0).map(f => f.cleanup()))
})
const digest = (x: string) => `sha256:${x.repeat(64)}`
const definitions = [
  { kind: 'tool' as const, name: 'quality_journey_analysis_get', inputSchema: { type: 'object', properties: {} } },
  {
    kind: 'tool' as const,
    name: 'quality_journey_analysis_submit',
    inputSchema: { type: 'object', properties: { idempotencyKey: { type: 'string' }, charter: { type: 'object' } } },
  },
]
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
async function setup() {
  const f = await createProviderFixture()
  fixtures.push(f)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  const delivery = await createOfflineQualityJourneyRoleDelivery({
    binding: f.binding,
    canonicalDefinitions: definitions,
    client: f.client,
  })
  const binding: OfflineProviderBinding = {
    candidateTree: 'a'.repeat(40),
    configurationDigest: f.prepareInput.configurationDigest,
    protocolDigest: digest('d'),
    roleProfileDigest: delivery.profileDigest,
    requiredMcpIds: ['synthetic-appraise'],
  }
  const charter = {
    schemaVersion: 'appraise.quality-journey/v1',
    charterId: 'offline-charter',
    analysisRevisionId: 'offline-analysis',
    ...f.scope,
    cycleId: f.created.journey.activeCycleId,
    requirementRevisionId: f.created.journey.activeRevisionIds.journey,
    objectives: ['Allow checkout.'],
    scope: { included: ['Checkout'], excluded: [] },
    actors: ['Shopper'],
    requirements: [{ requirementId: 'REQ-OFFLINE', statement: 'A shopper opens checkout.', sourceRefs: ['brief:1'] }],
    obligations: [
      {
        obligationId: 'OBL-OFFLINE',
        requirementId: 'REQ-OFFLINE',
        statement: 'Checkout is displayed.',
        acceptanceSignals: ['Checkout'],
      },
    ],
    constraints: [],
    assumptions: [],
    risks: [],
    acceptanceSignals: ['Checkout'],
    retiredRequirementIds: [],
    questions: [],
    resolvedQuestionAnswerIds: [],
  }
  const publicCharter = Object.fromEntries(
    Object.entries(charter).filter(([field]) => !['schemaVersion', 'journeyId', 'targetProjectId'].includes(field)),
  )
  const call: OfflineProviderCall = {
    callId: 'offline-call',
    toolName: 'quality_journey_analysis_submit',
    arguments: { idempotencyKey: 'offline-analysis', charter: publicCharter },
  }
  const calls: string[] = []
  const port = {
    provenance: 'OFFLINE_FAKE_PORT' as const,
    initialize: vi.fn(async () => {
      calls.push('initialize')
      expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
      return { status: 'INITIALIZED', binding }
    }),
    inspectRequiredMcp: vi.fn(async () => {
      calls.push('mcp')
      return { status: 'READY', servers: [{ id: 'synthetic-appraise', status: 'READY' }] }
    }),
    startThread: vi.fn(async () => {
      calls.push('thread')
      return { thread: { id: 'offline-thread' } }
    }),
    startTurn: vi.fn(async () => {
      calls.push('turn')
      return { turn: { id: 'offline-turn' } }
    }),
    completeTurn: vi.fn(async () => {
      calls.push('complete')
      return { threadId: 'offline-thread', turnId: 'offline-turn', status: 'COMPLETED', calls: [call] }
    }),
    fence: vi.fn(() => {
      calls.push('fence')
    }),
    stop: vi.fn(async (): Promise<OwnedChildCleanupReceipt> => {
      calls.push('stop')
      return {
        status: 'stopped' as const,
        groupExitObserved: true,
        privateRootRemoved: true,
        privateRootRetained: false,
      }
    }),
  }
  const acquire = vi.fn(async () => port)
  const options = {
    binding,
    input: f.prepareInput,
    envelope: [{ type: 'text', text: 'Synthetic offline input' }],
    delivery,
    acquire,
    timeouts: {
      acquisitionMs: 100,
      initializationMs: 100,
      requiredMcpMs: 100,
      acknowledgementMs: 100,
      completionMs: 100,
      cleanupMs: 100,
    },
  }
  return {
    ...f,
    assignmentBinding: f.binding,
    delivery,
    binding,
    call,
    calls,
    port,
    acquire,
    options,
    create: () => createOfflineQualityJourneyProviderComposition(options, f.client),
  }
}

describe('same-owned offline provider composition with migrated SQLite', () => {
  it('initializes and proves MCP before arm, accepts canonically, and retains physical UNKNOWN/HUB', async () => {
    const f = await setup()
    const controller = f.create()
    const flight = controller.start()
    expect(controller.start()).toBe(flight)
    const receipt = await flight
    expect(receipt).toMatchObject({
      outcome: 'ACCEPTED_OFFLINE',
      reason: 'NONE',
      runtimeQualified: false,
      observedNativeTuple: null,
      modelTokens: null,
      cost: null,
      usageStatus: 'UNQUALIFIED',
    })
    expect(f.calls).toEqual(['initialize', 'mcp', 'thread', 'turn', 'complete', 'fence', 'stop'])
    expect(f.acquire).toHaveBeenCalledTimes(1)
    expect(f.port.fence).toHaveBeenCalledTimes(1)
    expect(f.port.stop).toHaveBeenCalledTimes(1)
    expect(await f.client.qualityJourneyExternalSubmissionAcceptance.count()).toBe(1)
    expect(await f.client.qualityJourneyProviderSlot.count()).toBe(1)
    expect((await f.client.qualityJourneyProviderDispatchIntent.findFirstOrThrow()).reconciledAt).toBeNull()
    expect(await controller.cancel()).toBe(receipt)
    expect(JSON.stringify(receipt)).not.toContain(f.assignmentBinding.assignmentSecret)
    const replay = await f.delivery.invoke(f.call)
    expect(replay.accepted).toBe(true)
    await expect(
      f.delivery.invoke({
        ...f.call,
        arguments: {
          ...f.call.arguments,
          charter: { ...(f.call.arguments.charter as object), assumptions: ['changed'] },
        },
      }),
    ).rejects.toThrow('Changed offline replay payload')
  })
  it.each(['initialize', 'mcp', 'binding'] as const)(
    'refuses %s before any provider intent/thread/turn',
    async kind => {
      const f = await setup()
      if (kind === 'initialize') f.port.initialize.mockResolvedValue({ status: 'INVALID', binding: f.binding })
      if (kind === 'binding')
        f.port.initialize.mockResolvedValue({
          status: 'INITIALIZED',
          binding: { ...f.binding, protocolDigest: digest('e') },
        })
      if (kind === 'mcp')
        f.port.inspectRequiredMcp.mockResolvedValue({
          status: 'UNAVAILABLE',
          servers: [{ id: 'synthetic-appraise', status: 'UNAVAILABLE' }],
        })
      expect((await f.create().start()).outcome).toBe('REFUSED')
      expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
      expect(f.port.startThread).not.toHaveBeenCalled()
      expect(f.port.startTurn).not.toHaveBeenCalled()
      expect(f.port.stop).toHaveBeenCalledTimes(1)
    },
  )
  it('parks human wait without acquisition or canonical provider work', async () => {
    const f = await setup()
    await f.client.qualityJourney.update({
      where: { id: f.scope.journeyId },
      data: { unresolvedQuestionIdsJson: '["synthetic-question"]' },
    })
    expect(await f.create().start()).toMatchObject({ outcome: 'PARKED_HUMAN_WAIT', reason: 'HUMAN_WAIT' })
    expect(f.acquire).not.toHaveBeenCalled()
    expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
  })
  it.each(['revoked', 'expired', 'stale-session'] as const)('refuses %s before acquisition', async kind => {
    const f = await setup()
    if (kind === 'revoked')
      await revokeQualityJourneyWorkAuthorization(
        {
          ...f.scope,
          ...f.credentials,
          workItemId: f.assignmentBinding.workItemId,
          actor: 'USER',
          reason: 'Synthetic offline revocation',
        },
        f.client,
      )
    if (kind === 'expired')
      await f.client.qualityJourneyWorkAttempt.update({
        where: { id: f.assignmentBinding.attemptId },
        data: { leaseExpiresAt: new Date(0) },
      })
    if (kind === 'stale-session')
      f.options.input = { ...f.options.input, coordinatorGeneration: f.options.input.coordinatorGeneration + 1 }
    expect((await f.create().start()).outcome).toBe('REFUSED')
    expect(f.acquire).not.toHaveBeenCalled()
  })
  it('captures options, validates exact profile, and never uses replacement port functions', async () => {
    const f = await setup()
    const gate = deferred<unknown>()
    f.port.initialize.mockImplementation(() => gate.promise as never)
    const controller = f.create()
    const flight = controller.start()
    while (!f.port.initialize.mock.calls.length) await new Promise(resolve => setImmediate(resolve))
    const originalStop = f.port.stop
    f.options.binding = { ...f.binding, protocolDigest: digest('f') }
    f.options.acquire = vi.fn(async () => {
      throw new Error('wrong acquisition')
    })
    f.port.stop = vi.fn(async () => {
      throw new Error('replacement stop')
    })
    gate.resolve({ status: 'INITIALIZED', binding: f.binding })
    expect((await flight).outcome).toBe('ACCEPTED_OFFLINE')
    expect(originalStop).toHaveBeenCalledTimes(1)
    expect(f.port.stop).not.toHaveBeenCalled()
    expect(() =>
      createOfflineQualityJourneyProviderComposition(
        { ...f.options, binding: { ...f.binding, roleProfileDigest: digest('f') } },
        f.client,
      ),
    ).toThrow('BINDING_MISMATCH')
  })
  it('cancels before start without acquiring', async () => {
    const f = await setup()
    const controller = f.create()
    const flight = controller.cancel()
    expect(controller.start()).toBe(flight)
    expect(controller.snapshot().closed).toBe(true)
    expect((await flight).outcome).toBe('REFUSED')
    expect(f.acquire).not.toHaveBeenCalled()
  })
  it('cancels pending readiness synchronously and excludes late success', async () => {
    const f = await setup()
    const gate = deferred<unknown>()
    f.port.initialize.mockImplementation(() => gate.promise as never)
    const controller = f.create()
    const flight = controller.start()
    while (!f.port.initialize.mock.calls.length) await new Promise(resolve => setImmediate(resolve))
    const cancelled = controller.cancel()
    expect(cancelled).toBe(flight)
    expect(controller.snapshot().closed).toBe(true)
    const receipt = await cancelled
    gate.resolve({ status: 'INITIALIZED', binding: f.binding })
    await new Promise(resolve => setImmediate(resolve))
    expect(receipt.outcome).toBe('REFUSED')
    expect(f.port.startThread).not.toHaveBeenCalled()
    expect(f.port.stop).toHaveBeenCalledTimes(1)
    expect(f.port.fence).toHaveBeenCalledTimes(1)
  })
  it('cleans the original late acquisition after timeout without changing its UNKNOWN receipt', async () => {
    const f = await setup()
    const gate = deferred<OfflineOwnedProviderPort>()
    f.acquire.mockReturnValue(gate.promise as never)
    f.options.timeouts.acquisitionMs = 5
    const controller = f.create()
    const flight = controller.start()
    while (!f.acquire.mock.calls.length) await new Promise(resolve => setImmediate(resolve))
    await vi.advanceTimersByTimeAsync(6)
    const receipt = await flight
    expect(receipt.outcome).toBe('UNKNOWN')
    gate.resolve(f.port)
    await new Promise(resolve => setImmediate(resolve))
    await new Promise(resolve => setImmediate(resolve))
    expect(f.port.initialize).not.toHaveBeenCalled()
    expect(f.port.stop).toHaveBeenCalledTimes(1)
    expect(await controller.start()).toBe(receipt)
  })
  it.each(['thread', 'turn', 'completion', 'correlation', 'cleanup'] as const)(
    'keeps armed UNKNOWN after %s fault',
    async kind => {
      const f = await setup()
      if (kind === 'thread') f.port.startThread.mockRejectedValue(new Error('sensitive provider output'))
      if (kind === 'turn') f.port.startTurn.mockRejectedValue(new Error('sensitive provider output'))
      if (kind === 'completion') f.port.completeTurn.mockRejectedValue(new Error('sensitive provider output'))
      if (kind === 'correlation')
        f.port.completeTurn.mockResolvedValue({
          threadId: 'other',
          turnId: 'offline-turn',
          status: 'COMPLETED',
          calls: [f.call],
        })
      if (kind === 'cleanup')
        f.port.stop.mockResolvedValue({
          status: 'uncertain',
          groupExitObserved: false,
          privateRootRemoved: false,
          privateRootRetained: true,
        })
      const receipt = await f.create().start()
      expect(receipt.outcome).toBe('UNKNOWN')
      expect(await f.client.qualityJourneyProviderSlot.count()).toBe(1)
      expect(f.port.stop).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(receipt)).not.toContain('sensitive')
    },
  )
  it('recovers only original committed delivery after transport reply loss, never calls it again', async () => {
    const f = await setup()
    let exchangeCalls = 0
    const delivery = await createOfflineQualityJourneyRoleDelivery({
      binding: f.assignmentBinding,
      canonicalDefinitions: definitions,
      client: f.client,
      exchange: async (_tool, _args, canonical) => {
        exchangeCalls++
        await canonical()
        throw new Error('lost reply')
      },
    })
    f.options.delivery = delivery
    f.options.binding = { ...f.binding, roleProfileDigest: delivery.profileDigest }
    expect((await f.create().start()).outcome).toBe('ACCEPTED_OFFLINE')
    expect(exchangeCalls).toBe(1)
    expect(await f.client.qualityJourneyExternalSubmissionAcceptance.count()).toBe(1)
    await expect(delivery.invoke({ ...f.call, toolName: 'quality_journey_triage_submit' })).rejects.toThrow('scope')
    await expect(
      delivery.invoke({ ...f.call, arguments: { ...f.call.arguments, assignmentSecret: 'injected' } }),
    ).rejects.toThrow('scope')
  })
  it('retains known intent and UNKNOWN when the arm commit reply is lost', async () => {
    const f = await setup()
    let dropped = false
    const proxy = new Proxy(f.client, {
      get(target, key) {
        if (key === '$transaction')
          return async (callback: Parameters<typeof target.$transaction>[0]) => {
            const result = (await target.$transaction(callback as never)) as unknown
            if (
              !dropped &&
              result &&
              typeof result === 'object' &&
              'intent' in result &&
              (result as { intent?: { armedAt?: unknown } }).intent?.armedAt
            ) {
              dropped = true
              throw new Error('synthetic committed arm reply loss')
            }
            return result
          }
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const receipt = await createOfflineQualityJourneyProviderComposition(f.options, proxy).start()
    expect(receipt).toMatchObject({ outcome: 'UNKNOWN', reason: 'AMBIGUOUS_ARM' })
    expect(receipt.intentId).toBe((await f.client.qualityJourneyProviderDispatchIntent.findFirstOrThrow()).id)
    expect(await f.client.qualityJourneyProviderSlot.count()).toBe(1)
    expect(f.port.startThread).not.toHaveBeenCalled()
    expect(f.port.startTurn).not.toHaveBeenCalled()
  })
  it('refuses changed frozen input after pending initialization before arm', async () => {
    const f = await setup(),
      gate = deferred<unknown>()
    f.port.initialize.mockImplementation(() => gate.promise as never)
    const flight = f.create().start()
    while (!f.port.initialize.mock.calls.length) await new Promise(resolve => setImmediate(resolve))
    await f.client.qualityJourneyWorkItem.update({
      where: { id: f.assignmentBinding.workItemId },
      data: { inputHash: digest('f') },
    })
    gate.resolve({ status: 'INITIALIZED', binding: f.binding })
    expect(await flight).toMatchObject({ outcome: 'REFUSED' })
    expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
  })
  it.each(['revocation', 'lease'] as const)(
    'fences pending completion on heartbeat %s without another turn',
    async mode => {
      const f = await setup(),
        gate = deferred<unknown>()
      f.options.timeouts.completionMs = 900_000
      f.port.completeTurn.mockImplementation(() => gate.promise as never)
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
      const controller = f.create(),
        flight = controller.start()
      while (!f.port.completeTurn.mock.calls.length) await new Promise(resolve => setImmediate(resolve))
      if (mode === 'revocation')
        await revokeQualityJourneyWorkAuthorization(
          {
            ...f.scope,
            ...f.credentials,
            workItemId: f.assignmentBinding.workItemId,
            actor: 'USER',
            reason: 'Synthetic pending completion revocation',
          },
          f.client,
        )
      else
        await f.client.qualityJourneyWorkAttempt.update({
          where: { id: f.assignmentBinding.attemptId },
          data: { leaseExpiresAt: new Date(0) },
        })
      await vi.advanceTimersByTimeAsync(40_000)
      while (!controller.snapshot().closed) await new Promise(resolve => setImmediate(resolve))
      expect(await flight).toMatchObject({ outcome: 'UNKNOWN', reason: 'AUTHORITY_REFUSED' })
      expect(f.port.fence).toHaveBeenCalledTimes(1)
      expect(f.port.stop).toHaveBeenCalledTimes(1)
      expect(f.port.startTurn).toHaveBeenCalledTimes(1)
      expect(await f.client.qualityJourneyProviderSlot.count()).toBe(1)
      gate.resolve({ threadId: 'offline-thread', turnId: 'offline-turn', status: 'COMPLETED', calls: [f.call] })
      await Promise.resolve()
      expect(await f.client.qualityJourneyExternalSubmissionAcceptance.count()).toBe(0)
    },
  )
  it('deadline-fences the exact canonical lease while completion is pending', async () => {
    const f = await setup(),
      gate = deferred<unknown>()
    f.options.timeouts.completionMs = 900_000
    await f.client.qualityJourneyWorkAttempt.update({
      where: { id: f.assignmentBinding.attemptId },
      data: { leaseExpiresAt: new Date(Date.now() + 20_000) },
    })
    f.port.completeTurn.mockImplementation(() => gate.promise as never)
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    const flight = f.create().start()
    while (!f.port.completeTurn.mock.calls.length) await new Promise(resolve => setImmediate(resolve))
    await vi.advanceTimersByTimeAsync(20_001)
    expect(await flight).toMatchObject({ outcome: 'UNKNOWN', reason: 'AUTHORITY_REFUSED' })
    expect(f.port.stop).toHaveBeenCalledTimes(1)
  })
  it.each(['fence', 'stop'] as const)('reentrant cancel from original %s joins cleanup once', async operation => {
    const f = await setup()
    const controller = f.create()
    if (operation === 'fence')
      f.port.fence.mockImplementation(() => {
        controller.cancel()
      })
    else
      f.port.stop.mockImplementation(async () => {
        controller.cancel()
        return { status: 'stopped', groupExitObserved: true, privateRootRemoved: true, privateRootRetained: false }
      })
    const flight = controller.start()
    await flight
    expect(controller.cancel()).toBe(flight)
    expect(f.port.fence).toHaveBeenCalledTimes(1)
    expect(f.port.stop).toHaveBeenCalledTimes(1)
  })
  it('times out initialization and refuses its late completion before any arm', async () => {
    const f = await setup(),
      gate = deferred<unknown>()
    f.port.initialize.mockImplementation(() => gate.promise as never)
    const flight = f.create().start()
    while (!f.port.initialize.mock.calls.length) await new Promise(resolve => setImmediate(resolve))
    await vi.advanceTimersByTimeAsync(101)
    expect(await flight).toMatchObject({ outcome: 'REFUSED', reason: 'TIMEOUT' })
    gate.resolve({ status: 'INITIALIZED', binding: f.binding })
    await Promise.resolve()
    expect(f.port.inspectRequiredMcp).not.toHaveBeenCalled()
    expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
  })
  it('refuses a restarted sender while keeping exact original historical delivery separate', async () => {
    const f = await setup()
    expect((await f.create().start()).outcome).toBe('ACCEPTED_OFFLINE')
    expect((await f.create().start()).outcome).toBe('REFUSED')
    expect(f.acquire).toHaveBeenCalledTimes(1)
    expect(f.port.startTurn).toHaveBeenCalledTimes(1)
    expect(await f.client.qualityJourneyProviderSlot.count()).toBe(1)
    expect((await f.delivery.readCommitted(f.call))?.accepted).toBe(true)
    expect(
      await f.delivery.readCommitted({ ...f.call, arguments: { ...f.call.arguments, idempotencyKey: 'other' } }),
    ).toBeNull()
    await expect(
      createOfflineQualityJourneyRoleDelivery({
        binding: f.assignmentBinding,
        canonicalDefinitions: definitions,
        client: f.client,
      }),
    ).rejects.toThrow()
  })
  it('rejects assignment material in the producer envelope before acquisition', async () => {
    const f = await setup()
    f.options.envelope = [{ type: 'text', text: f.assignmentBinding.assignmentSecret }]
    expect(() => f.create()).toThrow('BINDING_MISMATCH')
    expect(f.acquire).not.toHaveBeenCalled()
  })
  it('does not acquire a replacement for an active armed UNKNOWN after restart', async () => {
    const f = await setup()
    f.port.startTurn.mockRejectedValue(new Error('synthetic ambiguous send'))
    expect((await f.create().start()).outcome).toBe('UNKNOWN')
    expect((await f.create().start()).outcome).toBe('REFUSED')
    expect(f.acquire).toHaveBeenCalledTimes(1)
    expect(await f.client.qualityJourneyProviderSlot.count()).toBe(1)
  })
  it.each(['schemaVersion', 'journeyId', 'targetProjectId'] as const)(
    'refuses Analyzer producer forgery of fixed %s',
    async field => {
      const f = await setup()
      await expect(
        f.delivery.invoke({
          ...f.call,
          arguments: { ...f.call.arguments, charter: { ...(f.call.arguments.charter as object), [field]: 'forged' } },
        }),
      ).rejects.toThrow()
      expect(await f.client.qualityJourneyExternalSubmissionAcceptance.count()).toBe(0)
    },
  )
  it('recovers the same original accepted call when its SQLite submission commit reply is lost', async () => {
    const f = await setup()
    let dropped = false
    const proxy = new Proxy(f.client, {
      get(target, key) {
        if (key === '$transaction')
          return async (callback: Parameters<typeof target.$transaction>[0]) => {
            const result = (await target.$transaction(callback as never)) as unknown
            if (!dropped && result && typeof result === 'object' && 'analysisRevision' in result) {
              dropped = true
              throw new Error('synthetic committed submission reply loss')
            }
            return result
          }
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const delivery = await createOfflineQualityJourneyRoleDelivery({
      binding: f.assignmentBinding,
      canonicalDefinitions: definitions,
      client: proxy,
    })
    f.options.delivery = delivery
    const receipt = await f.create().start()
    expect(dropped).toBe(true)
    expect(receipt.outcome).toBe('ACCEPTED_OFFLINE')
    expect(await f.client.qualityJourneyExternalSubmissionAcceptance.count()).toBe(1)
    expect((await delivery.readCommitted(f.call))?.accepted).toBe(true)
    expect(
      await delivery.readCommitted({
        ...f.call,
        arguments: {
          ...f.call.arguments,
          charter: { ...(f.call.arguments.charter as object), assumptions: ['changed'] },
        },
      }),
    ).toBeNull()
    expect(f.port.startTurn).toHaveBeenCalledTimes(1)
    expect(await f.client.qualityJourneyProviderSlot.count()).toBe(1)
  })
  it('counts one accepted artifact for two exact idempotent calls in the same original turn', async () => {
    const f = await setup()
    f.port.completeTurn.mockResolvedValue({
      threadId: 'offline-thread',
      turnId: 'offline-turn',
      status: 'COMPLETED',
      calls: [f.call, { ...f.call, callId: 'offline-call-replay' }],
    })
    const receipt = await f.create().start()
    expect(receipt.outcome).toBe('ACCEPTED_OFFLINE')
    expect(receipt.acceptedArtifactDigests).toHaveLength(1)
    expect(f.port.startTurn).toHaveBeenCalledTimes(1)
    expect(await f.client.qualityJourneyExternalSubmissionAcceptance.count()).toBe(1)
  })
})
