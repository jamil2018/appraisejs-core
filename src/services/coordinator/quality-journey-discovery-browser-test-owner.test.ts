import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiscoveryBrowserTestOwner } from '@/test/discovery-browser-test-owner'
import { DiscoveryBrowserStartupError } from './quality-journey-discovery-browser-startup'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('per-case discovery browser fixture custody', () => {
  it('aborts pending launches before cleanup and closes a late result only in its original owner', async () => {
    const first = new DiscoveryBrowserTestOwner()
    const pending = deferred<{ close(): Promise<void> }>()
    let signal!: AbortSignal
    const starting = first
      .acquire(value => {
        signal = value
        return pending.promise
      })
      .catch(error => error)
    first.abort()
    expect(signal.aborted).toBe(true)
    const unknown = first.drain(20).catch(error => error)
    await vi.advanceTimersByTimeAsync(20)
    expect(await unknown).toBeInstanceOf(Error)
    const next = new DiscoveryBrowserTestOwner()
    const nextClose = vi.fn(async () => undefined)
    await next.acquire(async () => ({ close: nextClose }))
    const close = vi.fn(async () => undefined)
    pending.resolve({ close })
    expect(await starting).toBeInstanceOf(Error)
    expect(close).toHaveBeenCalledTimes(1)
    expect(nextClose).not.toHaveBeenCalled()
    await first.drain()
    await next.drain()
    expect(close).toHaveBeenCalledTimes(1)
    expect(nextClose).toHaveBeenCalledTimes(1)
  })

  it('joins one cleanup flight and reports failed close as UNKNOWN', async () => {
    const owner = new DiscoveryBrowserTestOwner()
    const close = vi.fn(async () => {
      throw new Error('private cleanup detail')
    })
    await owner.acquire(async () => ({ close }))
    owner.abort()
    const first = await owner.drain().catch(error => error)
    const second = await owner.drain().catch(error => error)
    expect(String(first)).toContain('UNKNOWN')
    expect(String(second)).not.toContain('private cleanup detail')
    expect(close).toHaveBeenCalledTimes(1)
  })
  it('retains only fixed failure diagnostics and owns cleanup registered after teardown', async () => {
    const owner = new DiscoveryBrowserTestOwner()
    const error = new DiscoveryBrowserStartupError('ABORTED', Promise.resolve('OBSERVED'), 'PROBE_LAUNCH', 12)
    await owner
      .acquire(async () => {
        throw error
      })
      .catch(() => undefined)
    expect(owner.diagnostic()).toEqual({
      category: 'ABORTED',
      cleanupStatus: 'UNKNOWN',
      phase: 'PROBE_LAUNCH',
      elapsedMs: 12,
    })
    owner.abort()
    await owner.drain()
    const callback = vi.fn()
    owner.clearTimerOnCleanup(setTimeout(callback, 10))
    await vi.advanceTimersByTimeAsync(10)
    expect(callback).not.toHaveBeenCalled()
  })
})
