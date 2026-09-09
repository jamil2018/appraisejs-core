import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  COLLABORATION_SCHEDULER_INTERVAL_MS,
  startCollaborationScheduler,
  stopCollaborationScheduler,
  tickCollaborationScheduler,
} from './scheduler-runtime'

function timerHarness() {
  const unref = vi.fn()
  const clear = vi.fn()
  let callback: (() => void) | undefined
  const set = vi.fn((next: () => void, intervalMs: number) => {
    callback = next
    expect(intervalMs).toBe(COLLABORATION_SCHEDULER_INTERVAL_MS)
    return { unref }
  })
  return {
    get callback() {
      return callback
    },
    clear,
    set,
    unref,
  }
}

function timerDependencies(timers: ReturnType<typeof timerHarness>) {
  return {
    setInterval: (callback: () => void, intervalMs: number) => timers.set(callback, intervalMs),
    clearInterval: (timer: { unref?: () => void }) => timers.clear(timer),
  }
}

afterEach(() => {
  stopCollaborationScheduler()
  vi.useRealTimers()
})

describe('repository collaboration scheduler runtime', () => {
  it('runs a startup reconciliation and then reconciles on the five-minute fake-time interval', async () => {
    vi.useFakeTimers()
    const tick = vi.fn(async () => undefined)

    const scheduler = startCollaborationScheduler({ tick })
    await scheduler.startup
    expect(tick).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(COLLABORATION_SCHEDULER_INTERVAL_MS)
    expect(tick).toHaveBeenCalledTimes(2)
  })

  it('unrefs the process-local timer', async () => {
    const timers = timerHarness()
    const scheduler = startCollaborationScheduler({ tick: async () => undefined, ...timerDependencies(timers) })
    await scheduler.startup

    expect(timers.set).toHaveBeenCalledTimes(1)
    expect(timers.unref).toHaveBeenCalledTimes(1)
  })

  it('does not overlap a slow reconciliation tick', async () => {
    const timers = timerHarness()
    let release: (() => void) | undefined
    const tick = vi.fn(
      () =>
        new Promise<void>(resolve => {
          release = resolve
        }),
    )
    const scheduler = startCollaborationScheduler({ tick, ...timerDependencies(timers) })
    const secondTick = tickCollaborationScheduler()

    expect(tick).toHaveBeenCalledTimes(1)
    release?.()
    await Promise.all([scheduler.startup, secondTick])
  })

  it('does not create another timer or startup pass after a hot-reload-safe duplicate start', async () => {
    const timers = timerHarness()
    const firstTick = vi.fn(async () => undefined)
    const secondTick = vi.fn(async () => undefined)

    const first = startCollaborationScheduler({ tick: firstTick, ...timerDependencies(timers) })
    await first.startup
    const duplicate = startCollaborationScheduler({ tick: secondTick })

    expect(duplicate).toBe(first)
    expect(timers.set).toHaveBeenCalledTimes(1)
    expect(firstTick).toHaveBeenCalledTimes(1)
    expect(secondTick).not.toHaveBeenCalled()
  })

  it('stops its interval and does not reconcile after stop', async () => {
    const timers = timerHarness()
    const tick = vi.fn(async () => undefined)
    const scheduler = startCollaborationScheduler({ tick, ...timerDependencies(timers) })
    await scheduler.startup

    stopCollaborationScheduler()
    timers.callback?.()
    await tickCollaborationScheduler()

    expect(timers.clear).toHaveBeenCalledTimes(1)
    expect(tick).toHaveBeenCalledTimes(1)
  })

  it('isolates reconciliation failures with a sanitized report and keeps the timer usable', async () => {
    const timers = timerHarness()
    const reportFailure = vi.fn()
    const tick = vi.fn().mockRejectedValueOnce(new Error('credential=do-not-report')).mockResolvedValueOnce(undefined)
    const scheduler = startCollaborationScheduler({
      tick,
      ...timerDependencies(timers),
      reportFailure,
    })
    await expect(scheduler.startup).resolves.toBeUndefined()

    expect(reportFailure).toHaveBeenCalledWith('Repository collaboration scheduler tick failed.')
    timers.callback?.()
    await tickCollaborationScheduler()
    expect(tick).toHaveBeenCalledTimes(2)
    expect(reportFailure).toHaveBeenCalledTimes(1)
  })
})
