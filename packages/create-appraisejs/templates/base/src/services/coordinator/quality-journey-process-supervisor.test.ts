import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  configureInertSupervisor,
  inertSupervisorFixture,
  provider,
  supervisorGate,
} from './quality-journey-process-supervisor.test-support'
import {
  createQualityJourneyProcessSupervisor,
  trustedJourneyProcessAdapter,
} from './quality-journey-process-supervisor'

const fixture = () => inertSupervisorFixture(createQualityJourneyProcessSupervisor, trustedJourneyProcessAdapter)
beforeEach(configureInertSupervisor)
afterEach(() => vi.useRealTimers())
describe('original supervisor heartbeat lifetime (inert provider/child)', () => {
  it('fences first and joins the original pending heartbeat before child drain and fulfilled stop', async () => {
    const f = fixture()
    await f.supervisor.start()
    const heartbeat = supervisorGate<{ reply: undefined }>()
    provider.write.mockImplementationOnce(() => heartbeat.promise)
    await vi.advanceTimersByTimeAsync(40_000)
    let stopped = false
    const originalStop = f.supervisor.cancel().then(value => {
      stopped = true
      return value
    })
    await Promise.resolve()
    expect(f.supervisor.snapshot().fenced).toBe(true)
    expect(stopped).toBe(false)
    expect(f.child.stop).not.toHaveBeenCalled()
    heartbeat.resolve({ reply: undefined })
    await originalStop
    expect(f.child.stop).toHaveBeenCalledTimes(1)
    const writes = provider.write.mock.calls.length
    await vi.advanceTimersByTimeAsync(80_000)
    expect(provider.write).toHaveBeenCalledTimes(writes)
  })
  it('heartbeat rejection invokes AUTHORITY_REVOKED without awaiting its own stop flight', async () => {
    const f = fixture()
    await f.supervisor.start()
    const heartbeat = supervisorGate<never>()
    provider.write.mockImplementationOnce(() => heartbeat.promise)
    await vi.advanceTimersByTimeAsync(40_000)
    heartbeat.reject(new Error('inert heartbeat rejected'))
    await vi.waitFor(() => expect(f.supervisor.snapshot().reason).toBe('AUTHORITY_REVOKED'))
    const result = await f.supervisor.cancel()
    expect(result.reason).toBe('AUTHORITY_REVOKED')
    expect(result.state).toBe('stopped')
    expect(f.child.stop).toHaveBeenCalledTimes(1)
  })
  it('does not mistake fulfilled stop for settlement of a pending original ACTIVE observation/start', async () => {
    const f = fixture()
    const active = supervisorGate<object>()
    f.create.mockImplementation(async ({ data }) => (data.kind === 'TRANSPORT_ACTIVE' ? active.promise : {}))
    let startSettled = false
    const originalStart = f.supervisor.start().then(value => {
      startSettled = true
      return value
    })
    await vi.waitFor(() => expect(f.supervisor.snapshot().state).toBe('active'))
    await f.supervisor.cancel()
    expect(startSettled).toBe(false)
    active.resolve({})
    await originalStart
    expect(startSettled).toBe(true)
    expect(f.supervisor.snapshot().state).toBe('stopped')
  })
  it('shares one child stop and does not join startFlight during cancelled launch', async () => {
    const f = fixture()
    const launch = supervisorGate<typeof f.child>()
    f.launch.mockReturnValue(launch.promise)
    const originalStart = f.supervisor.start()
    const rejected = expect(originalStart).rejects.toThrow(/fenced/)
    await vi.waitFor(() => expect(f.launch).toHaveBeenCalledTimes(1))
    const firstStop = f.supervisor.cancel(),
      secondStop = f.supervisor.cancel()
    launch.resolve(f.child)
    await Promise.all([firstStop, secondStop, rejected])
    expect(f.child.transport.request).not.toHaveBeenCalled()
  })
  it('joins the original rejected launch and retains uncertainty without an owned child or start-flight join', async () => {
    const f = fixture()
    const launch = supervisorGate<typeof f.child>()
    f.launch.mockReturnValue(launch.promise)
    const failure = new Error('original inert launch failure')
    const originalStart = f.supervisor.start()
    const rejected = expect(originalStart).rejects.toBe(failure)
    await vi.waitFor(() => expect(f.launch).toHaveBeenCalledTimes(1))
    let settled = false
    const originalStop = f.supervisor.cancel().then(value => {
      settled = true
      return value
    })
    await Promise.resolve()
    expect(f.supervisor.snapshot().fenced).toBe(true)
    expect(settled).toBe(false)
    expect(f.child.stop).not.toHaveBeenCalled()
    launch.reject(failure)
    const result = await originalStop
    await rejected
    expect(result.state).toBe('uncertain')
    expect(result.reason).toBe('CANCELLED')
    expect(f.child.stop).not.toHaveBeenCalled()
    expect(f.child.transport.request).not.toHaveBeenCalled()
    expect(f.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'TRANSPORT_FENCED' }) }),
    )
    expect(f.launch).toHaveBeenCalledTimes(1)
  })
})

describe('passive original-start snapshot disposition (inert boundaries)', () => {
  it('reports actual Promise settlement after a callback and preserves the stale fulfillment snapshot', async () => {
    const f = fixture(),
      active = supervisorGate<object>()
    f.create.mockImplementation(async ({ data }) => (data.kind === 'TRANSPORT_ACTIVE' ? active.promise : {}))
    const original = f.supervisor.start()
    expect(f.supervisor.start()).toBe(original)
    await vi.waitFor(() => expect(f.supervisor.snapshot().state).toBe('active'))
    expect(f.supervisor.snapshot().originalStartState).toBe('PENDING')
    await f.supervisor.cancel()
    expect(f.supervisor.snapshot().originalStartState).toBe('PENDING')
    active.resolve({})
    const returned = await original
    expect(returned.originalStartState).toBe('PENDING')
    const fresh = f.supervisor.snapshot()
    expect(fresh.originalStartState).toBe('FULFILLED')
    expect(fresh.childLaunchEntered).toBe(true)
    expect(Object.isFrozen(fresh)).toBe(true)
    for (const key of ['originalStartState', 'childLaunchEntered']) {
      const descriptor = Object.getOwnPropertyDescriptor(fresh, key)
      expect(descriptor).toMatchObject({ writable: false, configurable: false, enumerable: true })
      expect(descriptor?.get).toBeUndefined()
    }
    expect(f.launch).toHaveBeenCalledTimes(1)
    expect(f.child.stop).toHaveBeenCalledTimes(1)
  })
})
