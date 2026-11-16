import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  createNativeQualificationLossControl,
  bindNativeQualificationLossControl,
  bindNativeQualificationLossRuntime,
  bindNativeQualificationLossParser,
  withholdNativeQualificationStartReply,
  inspectNativeQualificationLoss,
  assertNativeQualificationLossGateway,
  waitNativeQualificationLossPhysicalRelease,
  deferNativeQualificationLossPhysical,
  deferNativeQualificationLossDisconnect,
  captureNativeQualificationLossChildCleanup,
  waitNativeQualificationLossQuiescence,
  assertNativeQualificationLossQuiescent,
  failNativeQualificationLoss,
  tightenNativeQualificationLossCleanup,
  bindNativeQualificationAnalysisSource,
  selectNativeQualificationAnalysis,
  acceptNativeQualificationAnalysis,
  matchesNativeQualificationAnalysisReplyLoss,
  claimNativeQualificationAnalysisReplyLoss,
  type NativeQualificationLossControl,
} from './native-qualification-loss'

const calls = vi.hoisted(() => ({ pause: vi.fn(), read: vi.fn(), loadedPause: 0, loadedRead: 0 }))
vi.mock('@/config/db-config', () => {
  throw new Error('default DB sentinel loaded')
})
vi.mock('@/services/coordinator/quality-journey-recovery-service', () => {
  calls.loadedPause++
  return { pauseQualityJourneyOperational: calls.pause }
})
vi.mock('@/services/coordinator/quality-journey-service', () => {
  calls.loadedRead++
  return { getQualityJourney: calls.read }
})
const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const scope = { journeyId: 'journey', targetProjectId: 'target', workItemId: 'work', attemptId: 'attempt' }
const active: NativeQualificationLossControl[] = []
afterEach(() => {
  active.splice(0).forEach(failNativeQualificationLoss)
  vi.useRealTimers()
  calls.pause.mockReset()
  calls.read.mockReset()
})
function paused(input: Record<string, unknown>) {
  const eventId = `qje_${createHash('sha256').update(`${input.journeyId}:PAUSE:${input.idempotencyKey}`).digest('hex').slice(0, 24)}`
  return {
    journey: {
      ...scope,
      status: 'PAUSED',
      version: Number(input.expectedVersion) + 1,
      stateHash: input.expectedStateHash,
    },
    events: [
      {
        id: eventId,
        ...scope,
        eventType: 'OPERATIONAL_PAUSE',
        predecessorStateHash: input.expectedStateHash,
        successorStateHash: input.expectedStateHash,
        payloadJson: canonicalContractJson({
          operation: 'PAUSE',
          requestHash: digest({ operation: 'PAUSE', ...input }),
          version: Number(input.expectedVersion) + 1,
          status: 'PAUSED',
          reasonHash: digest(input.reason),
        }),
      },
    ],
  }
}
function fixture(
  kind: 'R2_NATIVE_START_ACK_LOSS' | 'R3_ACCEPTED_ANALYSIS_REPLY_LOSS' = 'R2_NATIVE_START_ACK_LOSS',
  ms = 1000,
) {
  const fixture = {},
    client = {} as never,
    plan = {} as never,
    profile = {} as never
  const pause = {
    idempotencyKey: 'exact-pause',
    reason: 'qualification loss',
    ...(kind === 'R2_NATIVE_START_ACK_LOSS'
      ? { expectedVersion: 4, expectedStateHash: `sha256:${'a'.repeat(64)}` }
      : {}),
  }
  const control = createNativeQualificationLossControl({
    caseKind: kind,
    fixture,
    client,
    plan,
    profile,
    absoluteCleanupDeadline: Date.now() + ms,
    pause,
  })
  active.push(control)
  const binding = { fixture, client, plan, profile, scope }
  bindNativeQualificationLossControl(control, binding)
  const owner = {},
    child = {},
    endpoint = {},
    consume = vi.fn(),
    heldFacts: unknown[] = []
  bindNativeQualificationLossRuntime(control, {
    owner,
    child,
    endpoint,
    logicalFence() {
      heldFacts.push(inspectNativeQualificationLoss(control).phase)
    },
  })
  bindNativeQualificationLossParser(control, owner, consume)
  let settlePause!: () => void
  calls.pause.mockImplementation(
    () =>
      new Promise<void>(resolve => {
        settlePause = resolve
      }),
  )
  calls.read.mockImplementation(async () => paused(calls.pause.mock.calls[0][0]))
  return {
    control,
    binding,
    child,
    owner,
    endpoint,
    consume,
    heldFacts,
    trigger: () => withholdNativeQualificationStartReply(control, owner, 5),
    settle: async () => {
      settlePause?.()
      await waitNativeQualificationLossQuiescence(control)
    },
  }
}

describe('one original loss controller', () => {
  it('keeps NONE pure and does not load recovery or database services', async () => {
    expect(createNativeQualificationLossControl()).toBeUndefined()
    expect(createNativeQualificationLossControl({ caseKind: 'NONE' })).toBeUndefined()
    assertNativeQualificationLossGateway()
    expect(await waitNativeQualificationLossPhysicalRelease()).toEqual({ pauseCommitted: false, emergency: false })
    expect(calls.loadedPause).toBe(0)
    expect(calls.loadedRead).toBe(0)
    expect(calls.pause).not.toHaveBeenCalled()
    expect(calls.read).not.toHaveBeenCalled()
  })
  it('rejects fake/copied controls, wrong bindings and reused binding/runtime/parser', () => {
    const f = fixture()
    expect(() => inspectNativeQualificationLoss({} as never)).toThrow()
    expect(() => inspectNativeQualificationLoss({ ...f.control })).toThrow()
    expect(() => bindNativeQualificationLossControl(f.control, { ...f.binding, fixture: {} })).toThrow()
    expect(() => bindNativeQualificationLossControl(f.control, f.binding)).toThrow()
    expect(() => bindNativeQualificationLossRuntime(f.control, {} as never)).toThrow()
    expect(() => bindNativeQualificationLossParser(f.control, f.owner, () => {})).toThrow()
    expect(() => withholdNativeQualificationStartReply(f.control, {}, 5)).toThrow()
    expect(f.consume).not.toHaveBeenCalled()
    expect(calls.pause).not.toHaveBeenCalled()
  })
  it('blocks R2 gateway before trigger and enters HOLDING before any callback', async () => {
    const f = fixture(),
      physical = vi.fn(),
      disconnect = vi.fn(() => true)
    expect(() => assertNativeQualificationLossGateway(f.control)).toThrow()
    f.trigger()
    deferNativeQualificationLossPhysical(f.control, physical)
    expect(f.heldFacts).toEqual(['HOLDING'])
    expect(inspectNativeQualificationLoss(f.control).proof).toMatchObject({
      VALIDATED: true,
      WITHHELD: true,
      PAUSE_COMMITTED: false,
    })
    expect(deferNativeQualificationLossDisconnect(f.control, disconnect)).toBe(false)
    expect(physical).not.toHaveBeenCalled()
    expect(disconnect).not.toHaveBeenCalled()
    expect(await waitNativeQualificationLossPhysicalRelease(f.control)).toEqual({
      pauseCommitted: true,
      emergency: false,
    })
    await Promise.resolve()
    expect(physical).toHaveBeenCalledOnce()
    expect(calls.pause).toHaveBeenCalledExactlyOnceWith(
      {
        journeyId: scope.journeyId,
        targetProjectId: scope.targetProjectId,
        expectedVersion: 4,
        expectedStateHash: `sha256:${'a'.repeat(64)}`,
        idempotencyKey: 'exact-pause',
        reason: 'qualification loss',
      },
      f.binding.client,
    )
    expect(disconnect).not.toHaveBeenCalled()
    captureNativeQualificationLossChildCleanup(
      f.control,
      f.child,
      Promise.resolve({
        status: 'stopped',
        groupExitObserved: true,
        privateRootRemoved: true,
        privateRootRetained: false,
      }),
    )
    expect(() => assertNativeQualificationLossQuiescent(f.control)).toThrow()
    await f.settle()
    await Promise.resolve()
    expect(disconnect).toHaveBeenCalledOnce()
    assertNativeQualificationLossQuiescent(f.control)
    expect(() => f.trigger()).toThrow()
  })
  it.each(['requestHash', 'reasonHash', 'predecessor', 'successor', 'eventId', 'resume'])(
    'does not accept a mismatched %s commit observation',
    async field => {
      vi.useFakeTimers()
      const f = fixture(undefined, 100)
      calls.read.mockImplementation(async () => {
        const state = paused(calls.pause.mock.calls[0][0]),
          event = state.events[0],
          payload = JSON.parse(event.payloadJson)
        if (field === 'requestHash' || field === 'reasonHash') {
          payload[field] = 'wrong'
          event.payloadJson = JSON.stringify(payload)
        }
        if (field === 'predecessor') event.predecessorStateHash = 'wrong'
        if (field === 'successor') event.successorStateHash = 'wrong'
        if (field === 'eventId') event.id = 'wrong'
        if (field === 'resume') state.events.push({ ...event, id: 'resume', eventType: 'OPERATIONAL_RESUME' })
        return state
      })
      f.trigger()
      const released = waitNativeQualificationLossPhysicalRelease(f.control)
      await vi.advanceTimersByTimeAsync(100)
      expect(await released).toEqual({ pauseCommitted: false, emergency: true })
      await f.settle()
      expect(inspectNativeQualificationLoss(f.control).proof).toMatchObject({ PAUSE_COMMITTED: false, UNPROVEN: true })
    },
  )
  it('retains late original read/pause promises after the absolute deadline and never seals from timeout', async () => {
    vi.useFakeTimers()
    const f = fixture(undefined, 100)
    let settleRead!: (value: unknown) => void
    calls.read.mockImplementation(
      () =>
        new Promise(resolve => {
          settleRead = resolve
        }),
    )
    f.trigger()
    await vi.advanceTimersByTimeAsync(100)
    expect(await waitNativeQualificationLossPhysicalRelease(f.control)).toEqual({
      pauseCommitted: false,
      emergency: true,
    })
    expect(inspectNativeQualificationLoss(f.control).unsettledOriginalOperations).toBeGreaterThan(0)
    expect(() => assertNativeQualificationLossQuiescent(f.control)).toThrow()
    settleRead(paused(calls.pause.mock.calls[0][0]))
    await f.settle()
    expect(() => assertNativeQualificationLossQuiescent(f.control)).toThrow()
  })
  it('tightens cleanup without extending it and marks early physical cleanup unproven', async () => {
    const f = fixture(),
      initial = inspectNativeQualificationLoss(f.control).cleanupDeadline
    tightenNativeQualificationLossCleanup(f.control, initial + 10000)
    expect(inspectNativeQualificationLoss(f.control).cleanupDeadline).toBe(initial)
    expect(await waitNativeQualificationLossPhysicalRelease(f.control)).toEqual({
      pauseCommitted: false,
      emergency: true,
    })
    expect(calls.pause).not.toHaveBeenCalled()
  })
  it('binds R3 selected normalized charter once, derives post-accept ACTIVE version, and verifies exact endpoint identity', async () => {
    const f = fixture('R3_ACCEPTED_ANALYSIS_REPLY_LOSS'),
      source = {},
      args = { idempotencyKey: 'generated-key', charter: { generated: true } }
    bindNativeQualificationAnalysisSource(f.control, source)
    const selection = {
      rawWorkerArgumentsDigest: digest(args),
      normalizedArgumentsDigest: digest({ normalized: true }),
      charterHash: digest('charter'),
      charterRevisionId: 'generated-revision',
      workerInputDigest: digest('worker'),
      nativeEnvelopeDigest: digest('envelope'),
      idempotencyKey: 'generated-key',
    }
    expect(() => selectNativeQualificationAnalysis(f.control, {}, selection)).toThrow()
    selectNativeQualificationAnalysis(f.control, source, selection)
    expect(() => selectNativeQualificationAnalysis(f.control, source, selection)).toThrow()
    calls.read.mockImplementation(async () =>
      calls.pause.mock.calls.length
        ? paused(calls.pause.mock.calls[0][0])
        : { journey: { ...scope, status: 'ACTIVE', version: 19, stateHash: digest('post-accept') }, events: [] },
    )
    acceptNativeQualificationAnalysis(f.control, source, {
      id: selection.charterRevisionId,
      contentHash: selection.charterHash,
      resultDigest: digest('result'),
      requestPayloadDigest: digest('request'),
    })
    const call = { toolName: 'quality_journey_analysis_submit', arguments: args }
    expect(matchesNativeQualificationAnalysisReplyLoss(f.control, call)).toBe(true)
    expect(() => claimNativeQualificationAnalysisReplyLoss(f.control, {}, call)).toThrow()
    claimNativeQualificationAnalysisReplyLoss(f.control, f.endpoint, call)
    expect(() => claimNativeQualificationAnalysisReplyLoss(f.control, f.endpoint, call)).toThrow()
    await waitNativeQualificationLossPhysicalRelease(f.control)
    expect(calls.pause.mock.calls[0][0]).toMatchObject({
      expectedVersion: 19,
      expectedStateHash: digest('post-accept'),
    })
    captureNativeQualificationLossChildCleanup(
      f.control,
      f.child,
      Promise.resolve({
        status: 'stopped',
        groupExitObserved: true,
        privateRootRemoved: true,
        privateRootRetained: false,
      }),
    )
    await f.settle()
    assertNativeQualificationLossQuiescent(f.control)
  })
})

describe('original cleanup flights and failure bounds', () => {
  it.each(['fixture', 'client', 'plan', 'profile'] as const)('refuses a wrong original %s before binding', key => {
    const options = {
      caseKind: 'R2_NATIVE_START_ACK_LOSS' as const,
      fixture: {},
      client: {} as never,
      plan: {} as never,
      profile: {} as never,
      absoluteCleanupDeadline: Date.now() + 1000,
      pause: { expectedVersion: 1, expectedStateHash: digest('state'), idempotencyKey: 'once', reason: 'loss' },
    }
    const control = createNativeQualificationLossControl(options)
    active.push(control)
    expect(() => bindNativeQualificationLossControl(control, { ...options, scope, [key]: {} } as never)).toThrow()
    expect(inspectNativeQualificationLoss(control).phase).toBe('DECLARED')
  })
  it('keeps pause failure explicitly unproven and never treats it as a commit', async () => {
    const f = fixture()
    calls.pause.mockRejectedValue(new Error('canonical pause failed'))
    f.trigger()
    expect(await waitNativeQualificationLossPhysicalRelease(f.control)).toEqual({
      pauseCommitted: false,
      emergency: true,
    })
    await waitNativeQualificationLossQuiescence(f.control)
    expect(() => assertNativeQualificationLossQuiescent(f.control)).toThrow()
  })
  it('retains the original child cleanup Promise and refuses snapshot/disconnect before settlement', async () => {
    const f = fixture(),
      disconnect = vi.fn(() => true)
    f.trigger()
    await waitNativeQualificationLossPhysicalRelease(f.control)
    let complete!: (value: {
      status: 'stopped'
      groupExitObserved: boolean
      privateRootRemoved: boolean
      privateRootRetained: boolean
    }) => void
    const original = new Promise<{
      status: 'stopped'
      groupExitObserved: boolean
      privateRootRemoved: boolean
      privateRootRetained: boolean
    }>(resolve => {
      complete = resolve
    })
    captureNativeQualificationLossChildCleanup(f.control, f.child, original)
    expect(deferNativeQualificationLossDisconnect(f.control, disconnect)).toBe(false)
    const settling = f.settle()
    await Promise.resolve()
    expect(() => assertNativeQualificationLossQuiescent(f.control)).toThrow()
    expect(disconnect).not.toHaveBeenCalled()
    complete({ status: 'stopped', groupExitObserved: true, privateRootRemoved: true, privateRootRetained: false })
    await settling
    await Promise.resolve()
    assertNativeQualificationLossQuiescent(f.control)
    expect(disconnect).toHaveBeenCalledOnce()
  })
  it('refuses wrong child/copy/reused cleanup authority and retains UNKNOWN', async () => {
    const f = fixture(),
      receipt = {
        status: 'stopped' as const,
        groupExitObserved: true,
        privateRootRemoved: true,
        privateRootRetained: false,
      }
    f.trigger()
    await waitNativeQualificationLossPhysicalRelease(f.control)
    expect(() => captureNativeQualificationLossChildCleanup(f.control, {}, Promise.resolve(receipt))).toThrow()
    captureNativeQualificationLossChildCleanup(f.control, f.child, Promise.resolve(receipt))
    expect(() =>
      captureNativeQualificationLossChildCleanup(f.control, f.child, Promise.resolve({ ...receipt })),
    ).toThrow()
    await f.settle()
    expect(inspectNativeQualificationLoss(f.control).proof.UNPROVEN).toBe(true)
    expect(() => assertNativeQualificationLossQuiescent(f.control)).toThrow()
  })
})
