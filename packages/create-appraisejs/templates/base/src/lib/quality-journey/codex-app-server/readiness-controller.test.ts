import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { OwnedChildCleanupReceipt } from './owned-child'
import { createOfflineReadinessController } from './readiness-controller'
import type { OfflineReadinessPort, OfflineReadinessReceipt, ReadinessOptions } from './readiness-contract'

const binding = () => ({
  candidateTree: 'a'.repeat(40),
  executableSha256: 'b'.repeat(64),
  configurationDigest: `sha256:${'c'.repeat(64)}`,
  readinessContractDigest: `sha256:${'d'.repeat(64)}`,
})
const options = (): ReadinessOptions => ({
  binding: binding(),
  requiredMcpIds: ['z-server', 'a-server'],
  initializationTimeoutMs: 100,
  requiredMcpTimeoutMs: 200,
  cleanupTimeoutMs: 300,
})
const stopped = (): OwnedChildCleanupReceipt => ({
  status: 'stopped',
  groupExitObserved: true,
  privateRootRemoved: true,
  privateRootRetained: false,
})
const mcp = () => ({
  status: 'READY',
  servers: [
    { id: 'a-server', status: 'READY' },
    { id: 'z-server', status: 'READY' },
  ],
})
function gate<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function fixture(input = options()) {
  const calls: string[] = []
  const port = {
    provenance: 'OFFLINE_FAKE_PORT' as const,
    initialize: vi.fn<OfflineReadinessPort['initialize']>(async () => {
      calls.push('initialize')
      return { status: 'INITIALIZED', binding: binding() }
    }),
    inspectRequiredMcp: vi.fn<OfflineReadinessPort['inspectRequiredMcp']>(async () => {
      calls.push('mcp')
      return mcp()
    }),
    fence: vi.fn(() => {
      calls.push('fence')
    }),
    stop: vi.fn(async (): Promise<OwnedChildCleanupReceipt> => {
      calls.push('stop')
      return stopped()
    }),
  }
  const controller = createOfflineReadinessController(input, port)
  return { controller, port, calls }
}
async function untilMcp(f: ReturnType<typeof fixture>) {
  await vi.waitFor(() => expect(f.port.inspectRequiredMcp).toHaveBeenCalledTimes(1))
}
function assertSanitized(receipt: OfflineReadinessReceipt) {
  expect(receipt).toMatchObject({ provenance: 'OFFLINE_FAKE_PORT', runtimeQualified: false, observedNativeTuple: null })
  expect(JSON.stringify(receipt)).not.toContain('sensitive-probe-message')
  expect(Object.isFrozen(receipt)).toBe(true)
  expect(Object.isFrozen(receipt.binding)).toBe(true)
  expect(Object.isFrozen(receipt.requiredMcpIds)).toBe(true)
  expect(Object.isFrozen(receipt.cleanup)).toBe(true)
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('offline readiness contract and original-owned fake-port custody', () => {
  it('G01 validates both probes, canonicalizes IDs, fences then stops, and returns immutable fake-only evidence', async () => {
    const f = fixture()
    expect(f.calls).toEqual([])
    expect(f.controller.snapshot()).toEqual({
      state: 'IDLE',
      admissionClosed: false,
      reason: 'NONE',
      initializationComplete: false,
      requiredMcpComplete: false,
    })
    const first = f.controller.run()
    expect(f.controller.run()).toBe(first)
    const result = await first
    expect(f.calls).toEqual(['initialize', 'mcp', 'fence', 'stop'])
    expect(result).toMatchObject({
      outcome: 'OFFLINE_CONTRACT_SATISFIED',
      reason: 'NONE',
      requiredMcpIds: ['a-server', 'z-server'],
      initializationComplete: true,
      requiredMcpComplete: true,
      fenceOutcome: 'SUCCEEDED',
      cleanup: stopped(),
    })
    assertSanitized(result)
    expect(f.controller.cancel()).toBe(first)
    expect(f.controller.snapshot().state).toBe('FINALIZED')
    expect(Object.isFrozen(f.controller.snapshot())).toBe(true)
  })
  it('G02 refuses an exact binding mismatch and never inspects MCP', async () => {
    const f = fixture()
    f.port.initialize.mockResolvedValue({
      status: 'INITIALIZED',
      binding: { ...binding(), candidateTree: 'e'.repeat(40) },
    })
    expect(await f.controller.run()).toMatchObject({ outcome: 'REFUSED', reason: 'BINDING_MISMATCH' })
    expect(f.port.inspectRequiredMcp).not.toHaveBeenCalled()
    expect(f.port.stop).toHaveBeenCalledTimes(1)
  })
  it.each([
    null,
    {},
    { status: 'INITIALIZED', binding: binding(), raw: 'sensitive-probe-message' },
    { status: 'INITIALIZED', binding: { ...binding(), raw: 1 } },
  ])('G03 refuses malformed/extra-key initialization %#', async value => {
    const f = fixture()
    f.port.initialize.mockResolvedValue(value)
    const result = await f.controller.run()
    expect(result).toMatchObject({ outcome: 'REFUSED', reason: 'INITIALIZATION_INVALID' })
    assertSanitized(result)
    expect(f.port.inspectRequiredMcp).not.toHaveBeenCalled()
  })
  it('G04 refuses missing required servers', async () => {
    const f = fixture()
    f.port.inspectRequiredMcp.mockResolvedValue({ status: 'READY', servers: [mcp().servers[0]] })
    expect(await f.controller.run()).toMatchObject({ outcome: 'REFUSED', reason: 'MCP_INVALID' })
  })
  it.each(['top-level', 'server'])('G05 refuses unavailable required MCP (%s)', async kind => {
    const f = fixture()
    const response = mcp()
    if (kind === 'top-level') response.status = 'UNAVAILABLE'
    else response.servers[0].status = 'UNAVAILABLE'
    f.port.inspectRequiredMcp.mockResolvedValue(response)
    expect(await f.controller.run()).toMatchObject({ outcome: 'REFUSED', reason: 'MCP_UNAVAILABLE' })
  })
  it('G06 refuses unsupported MCP observation', async () => {
    const f = fixture()
    f.port.inspectRequiredMcp.mockResolvedValue({ ...mcp(), status: 'UNSUPPORTED' })
    expect(await f.controller.run()).toMatchObject({ outcome: 'REFUSED', reason: 'MCP_UNSUPPORTED' })
  })
  it.each(['duplicate', 'extra', 'wrong'])('G07 refuses %s server IDs', async kind => {
    const f = fixture()
    const response = mcp()
    if (kind === 'duplicate') response.servers[1] = response.servers[0]
    if (kind === 'extra') response.servers.push({ id: 'extra', status: 'READY' })
    if (kind === 'wrong') response.servers[1].id = 'wrong'
    f.port.inspectRequiredMcp.mockResolvedValue(response)
    expect(await f.controller.run()).toMatchObject({ outcome: 'REFUSED', reason: 'MCP_INVALID' })
  })
  it.each([
    null,
    { status: 'NATIVE_READY', servers: [] },
    { ...mcp(), raw: 'sensitive-probe-message' },
    { status: 'READY', servers: [{ ...mcp().servers[0], raw: 1 }, mcp().servers[1]] },
  ])('G08 refuses malformed/unknown MCP observation %#', async response => {
    const f = fixture()
    f.port.inspectRequiredMcp.mockResolvedValue(response)
    const result = await f.controller.run()
    expect(result).toMatchObject({ outcome: 'REFUSED', reason: 'MCP_INVALID' })
    assertSanitized(result)
  })
  it.each(['reject', 'throw'])('G09 cleans up after initialization %s without retaining errors', async kind => {
    const f = fixture()
    if (kind === 'throw')
      f.port.initialize.mockImplementation(() => {
        throw new Error('sensitive-probe-message')
      })
    else f.port.initialize.mockRejectedValue(new Error('sensitive-probe-message'))
    const result = await f.controller.run()
    expect(result).toMatchObject({ outcome: 'REFUSED', reason: 'INITIALIZATION_REJECTED' })
    expect(f.port.inspectRequiredMcp).not.toHaveBeenCalled()
    expect(f.calls).toEqual(['fence', 'stop'])
    assertSanitized(result)
  })
  it.each(['reject', 'throw'])('G10 cleans up after MCP %s', async kind => {
    const f = fixture()
    if (kind === 'throw')
      f.port.inspectRequiredMcp.mockImplementation(() => {
        throw new Error('sensitive-probe-message')
      })
    else f.port.inspectRequiredMcp.mockRejectedValue(new Error('sensitive-probe-message'))
    const result = await f.controller.run()
    expect(result).toMatchObject({ outcome: 'REFUSED', reason: 'MCP_REJECTED' })
    expect(f.port.stop).toHaveBeenCalledTimes(1)
    assertSanitized(result)
  })
  it.each(['resolve', 'reject'])('G11 initialization timeout fences late %s permanently', async late => {
    const f = fixture(),
      pending = gate<unknown>()
    f.port.initialize.mockReturnValue(pending.promise)
    const flight = f.controller.run()
    await vi.advanceTimersByTimeAsync(100)
    const result = await flight
    expect(result).toMatchObject({ outcome: 'REFUSED', reason: 'INITIALIZATION_TIMEOUT' })
    expect(f.port.initialize.mock.calls[0][0].aborted).toBe(true)
    if (late === 'resolve') pending.resolve({ status: 'INITIALIZED', binding: binding() })
    else pending.reject(new Error('sensitive-probe-message'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.port.inspectRequiredMcp).not.toHaveBeenCalled()
    expect(await f.controller.run()).toBe(result)
    expect(f.port.stop).toHaveBeenCalledTimes(1)
  })
  it.each(['resolve', 'reject'])('G12 MCP timeout fences late %s permanently', async late => {
    const f = fixture(),
      pending = gate<unknown>()
    f.port.inspectRequiredMcp.mockReturnValue(pending.promise)
    const flight = f.controller.run()
    await untilMcp(f)
    await vi.advanceTimersByTimeAsync(200)
    const result = await flight
    expect(result).toMatchObject({ outcome: 'REFUSED', reason: 'MCP_TIMEOUT' })
    if (late === 'resolve') pending.resolve(mcp())
    else pending.reject(new Error('sensitive-probe-message'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(await f.controller.run()).toBe(result)
    expect(f.port.fence).toHaveBeenCalledTimes(1)
  })
  it('G13 cancellation before run synchronously closes admission and never probes', async () => {
    const f = fixture(),
      pending = gate<OwnedChildCleanupReceipt>()
    f.port.stop.mockReturnValue(pending.promise)
    const flight = f.controller.cancel()
    expect(f.controller.snapshot()).toMatchObject({ state: 'STOPPING', admissionClosed: true, reason: 'CANCELLED' })
    expect(f.port.initialize).not.toHaveBeenCalled()
    expect(f.controller.run()).toBe(flight)
    pending.resolve(stopped())
    expect(await flight).toMatchObject({
      outcome: 'REFUSED',
      reason: 'CANCELLED',
      initializationComplete: false,
      requiredMcpComplete: false,
    })
  })
  it.each(['initialize', 'inspectRequiredMcp'] as const)(
    'G14 cancels pending %s before any cleanup await',
    async phase => {
      const f = fixture(),
        pending = gate<unknown>()
      f.port[phase].mockReturnValue(pending.promise)
      const flight = f.controller.run()
      if (phase === 'inspectRequiredMcp') await untilMcp(f)
      const cancellation = f.controller.cancel()
      expect(cancellation).toBe(flight)
      expect(f.port[phase].mock.calls[0][0].aborted).toBe(true)
      expect(f.controller.snapshot().admissionClosed).toBe(true)
      const result = await cancellation
      pending.resolve(phase === 'initialize' ? { status: 'INITIALIZED', binding: binding() } : mcp())
      await vi.advanceTimersByTimeAsync(1000)
      expect(result).toMatchObject({ outcome: 'REFUSED', reason: 'CANCELLED' })
      expect(await flight).toBe(result)
      expect(f.port.stop).toHaveBeenCalledTimes(1)
      if (phase === 'initialize') expect(f.port.inspectRequiredMcp).not.toHaveBeenCalled()
    },
  )
  it.each(['initialize', 'inspectRequiredMcp', 'fence', 'stop'] as const)(
    'G15 reentrant run/cancel from %s joins the original flight',
    async phase => {
      const f = fixture()
      let reentrant: Promise<OfflineReadinessReceipt> | undefined
      if (phase === 'initialize' || phase === 'inspectRequiredMcp')
        f.port[phase].mockImplementation(async () => {
          reentrant = f.controller.run()
          expect(f.controller.cancel()).toBe(reentrant)
          return phase === 'initialize' ? { status: 'INITIALIZED', binding: binding() } : mcp()
        })
      if (phase === 'fence')
        f.port.fence.mockImplementation(() => {
          reentrant = f.controller.cancel()
        })
      if (phase === 'stop')
        f.port.stop.mockImplementation(async () => {
          reentrant = f.controller.cancel()
          return stopped()
        })
      const flight = f.controller.run()
      const result = await flight
      expect(reentrant).toBe(flight)
      expect(f.controller.cancel()).toBe(flight)
      expect(result).toMatchObject({ outcome: 'REFUSED', reason: 'CANCELLED' })
      expect(f.port.initialize).toHaveBeenCalledTimes(1)
      expect(f.port.inspectRequiredMcp.mock.calls.length).toBeLessThanOrEqual(1)
      expect(f.port.fence).toHaveBeenCalledTimes(1)
      expect(f.port.stop).toHaveBeenCalledTimes(1)
    },
  )
  it.each([
    {
      mode: 'reject',
      expected: 'CLEANUP_REJECTED',
      unobserved: true,
      configure: (f: ReturnType<typeof fixture>) => f.port.stop.mockRejectedValue(new Error('sensitive-probe-message')),
    },
    {
      mode: 'throw',
      expected: 'CLEANUP_REJECTED',
      unobserved: true,
      configure: (f: ReturnType<typeof fixture>) =>
        f.port.stop.mockImplementation(() => {
          throw new Error('sensitive-probe-message')
        }),
    },
    {
      mode: 'timeout',
      expected: 'CLEANUP_TIMEOUT',
      unobserved: true,
      configure: (f: ReturnType<typeof fixture>) => f.port.stop.mockReturnValue(new Promise(() => {})),
    },
    {
      mode: 'uncertain',
      expected: 'CLEANUP_UNCERTAIN',
      unobserved: false,
      configure: (f: ReturnType<typeof fixture>) =>
        f.port.stop.mockResolvedValue({
          status: 'uncertain',
          groupExitObserved: false,
          privateRootRemoved: false,
          privateRootRetained: true,
        }),
    },
    {
      mode: 'contradictory',
      expected: 'CLEANUP_CONTRADICTORY',
      unobserved: false,
      configure: (f: ReturnType<typeof fixture>) =>
        f.port.stop.mockResolvedValue({ ...stopped(), privateRootRetained: true }),
    },
    {
      mode: 'malformed',
      expected: 'CLEANUP_UNCERTAIN',
      unobserved: false,
      configure: (f: ReturnType<typeof fixture>) =>
        f.port.stop.mockResolvedValue({ status: 'raw-sensitive-probe-message' } as unknown as OwnedChildCleanupReceipt),
    },
    {
      mode: 'fence',
      expected: 'FENCE_FAILED',
      unobserved: false,
      configure: (f: ReturnType<typeof fixture>) =>
        f.port.fence.mockImplementation(() => {
          throw new Error('sensitive-probe-message')
        }),
    },
  ])('G16 preserves UNKNOWN on cleanup $mode', async ({ configure, expected, unobserved }) => {
    const f = fixture()
    configure(f)
    const flight = f.controller.run()
    await vi.advanceTimersByTimeAsync(300)
    const result = await flight
    expect(result).toMatchObject({ outcome: 'UNKNOWN', reason: expected })
    expect(f.port.stop).toHaveBeenCalledTimes(1)
    if (unobserved)
      expect(result.cleanup).toEqual({
        status: null,
        groupExitObserved: null,
        privateRootRemoved: null,
        privateRootRetained: null,
      })
    assertSanitized(result)
  })
  it('G16 a timed-out original stop cannot replace the immutable receipt when it later settles', async () => {
    const f = fixture(),
      pending = gate<OwnedChildCleanupReceipt>()
    f.port.stop.mockReturnValue(pending.promise)
    const flight = f.controller.run()
    await vi.advanceTimersByTimeAsync(300)
    const result = await flight
    expect(result.reason).toBe('CLEANUP_TIMEOUT')
    pending.resolve(stopped())
    await vi.advanceTimersByTimeAsync(1000)
    expect(await f.controller.run()).toBe(result)
    expect(result.cleanup.status).toBe(null)
  })
  it('G17 captures caller options and original port functions before awaits', async () => {
    const input = options(),
      f = fixture(input),
      pending = gate<unknown>()
    // Pause the original initializer, then replace caller-owned fields/functions during the await.
    f.port.initialize.mockImplementation(async () => {
      await pending.promise
      return { status: 'INITIALIZED', binding: binding() }
    })
    const originalStop = f.port.stop
    const flight = f.controller.run()
    Object.assign(input.binding, { candidateTree: 'e'.repeat(40) })
    ;(input.requiredMcpIds as string[]).splice(0, 2, 'replacement')
    Object.assign(input, { requiredMcpTimeoutMs: 1, cleanupTimeoutMs: 1 })
    f.port.inspectRequiredMcp = vi.fn(async () => {
      throw new Error('replacement')
    })
    f.port.stop = vi.fn(async () => {
      throw new Error('replacement')
    })
    pending.resolve(undefined)
    const result = await flight
    expect(result).toMatchObject({
      outcome: 'OFFLINE_CONTRACT_SATISFIED',
      binding: binding(),
      requiredMcpIds: ['a-server', 'z-server'],
    })
    expect(originalStop).toHaveBeenCalledTimes(1)
    expect(f.port.stop).not.toHaveBeenCalled()
    expect(f.port.inspectRequiredMcp).not.toHaveBeenCalled()
  })
  it.each(['initialize', 'inspectRequiredMcp'] as const)(
    'G03/G08 throwing %s result accessors cannot skip original cleanup',
    async phase => {
      const f = fixture()
      f.port[phase].mockResolvedValue(
        Object.defineProperty({}, 'status', {
          enumerable: true,
          get() {
            throw new Error('sensitive-probe-message')
          },
        }),
      )
      const result = await f.controller.run()
      expect(result).toMatchObject({
        outcome: 'REFUSED',
        reason: phase === 'initialize' ? 'INITIALIZATION_INVALID' : 'MCP_INVALID',
      })
      expect(f.port.stop).toHaveBeenCalledTimes(1)
      assertSanitized(result)
    },
  )
  it.each(['initialize', 'inspectRequiredMcp'] as const)(
    'G15 cancellation during %s validation cannot reopen admission',
    async phase => {
      const f = fixture()
      const response = phase === 'initialize' ? { status: 'INITIALIZED', binding: binding() } : mcp()
      Object.defineProperty(response, 'status', {
        enumerable: true,
        get() {
          f.controller.cancel()
          return phase === 'initialize' ? 'INITIALIZED' : 'READY'
        },
      })
      f.port[phase].mockResolvedValue(response)
      const result = await f.controller.run()
      expect(result).toMatchObject({ outcome: 'REFUSED', reason: 'CANCELLED', requiredMcpComplete: false })
      if (phase === 'initialize') {
        expect(result.initializationComplete).toBe(false)
        expect(f.port.inspectRequiredMcp).not.toHaveBeenCalled()
      }
      expect(f.port.stop).toHaveBeenCalledTimes(1)
    },
  )
  it('G16 cleanup accessors remain unobserved and cannot manufacture a positive receipt', async () => {
    const f = fixture()
    const accessor = vi.fn(() => {
      throw new Error('sensitive-probe-message')
    })
    const cleanup = Object.defineProperty(stopped(), 'groupExitObserved', { get: accessor })
    f.port.stop.mockResolvedValue(cleanup)
    const result = await f.controller.run()
    expect(result).toMatchObject({
      outcome: 'UNKNOWN',
      reason: 'CLEANUP_UNCERTAIN',
      cleanup: { status: null, groupExitObserved: null, privateRootRemoved: null, privateRootRetained: null },
    })
    expect(accessor).not.toHaveBeenCalled()
    assertSanitized(result)
  })
  it.each([
    { requiredMcpIds: [] },
    { requiredMcpIds: ['same', 'same'] },
    { requiredMcpIds: ['bad id'] },
    { requiredMcpIds: Array.from({ length: 17 }, (_, index) => `id-${index}`) },
    { initializationTimeoutMs: 0 },
    { requiredMcpTimeoutMs: 60_001 },
    { cleanupTimeoutMs: 1.5 },
    { initializationTimeoutMs: 60_000, requiredMcpTimeoutMs: 30_000, cleanupTimeoutMs: 1 },
    { binding: { ...binding(), executableSha256: 'B'.repeat(64) } },
    { unexpected: true },
  ])('contract rejects invalid bounded options %# before touching the port', patch => {
    const f = fixture()
    expect(() => createOfflineReadinessController({ ...options(), ...patch } as ReadinessOptions, f.port)).toThrow(
      'Invalid offline readiness options',
    )
    expect(f.calls).toEqual([])
  })
  it('contract sanitizes throwing constructor option access and never invokes port accessors', () => {
    const f = fixture()
    const brokenOptions = Object.defineProperty(options(), 'binding', {
      get() {
        throw new Error('sensitive-probe-message')
      },
    })
    expect(() => createOfflineReadinessController(brokenOptions, f.port)).toThrow('Invalid offline readiness options')
    const accessor = vi.fn(() => {
      throw new Error('sensitive-probe-message')
    })
    const brokenPort = Object.defineProperty({ ...f.port }, 'initialize', { get: accessor })
    expect(() => createOfflineReadinessController(options(), brokenPort)).toThrow('Invalid offline readiness port')
    expect(accessor).not.toHaveBeenCalled()
    expect(f.calls).toEqual([])
  })
  it.each([{ provenance: 'NATIVE' }, { stop: null }, { credential: 'never-admitted' }])(
    'contract rejects invalid port %# without operations',
    patch => {
      const f = fixture()
      expect(() =>
        createOfflineReadinessController(options(), { ...f.port, ...patch } as OfflineReadinessPort),
      ).toThrow('Invalid offline readiness port')
      expect(f.calls).toEqual([])
    },
  )
})
