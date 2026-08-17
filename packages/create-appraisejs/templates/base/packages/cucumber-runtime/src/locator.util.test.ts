import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Page } from 'playwright'

import { waitForRouteSettled } from './locator.util.ts'

function pageForEvaluate(evaluate: ReturnType<typeof vi.fn>) {
  return {
    url: vi.fn(() => 'https://example.test/home'),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
    evaluate,
  } as unknown as Page
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('waitForRouteSettled', () => {
  it('uses its deadline to escape a continuously mutating DOM', async () => {
    class ContinuouslyMutatingObserver {
      private readonly timer: ReturnType<typeof setInterval>

      constructor(callback: MutationCallback) {
        this.timer = setInterval(() => callback([], this as unknown as MutationObserver), 2)
      }

      observe() {}

      disconnect() {
        clearInterval(this.timer)
      }
    }
    vi.stubGlobal('document', {})
    vi.stubGlobal('MutationObserver', ContinuouslyMutatingObserver)
    const evaluate = vi.fn(async (fn: (input: { quietMs: number; deadlineMs: number }) => Promise<boolean>, input) =>
      fn(input),
    )
    const started = Date.now()

    await expect(
      waitForRouteSettled(pageForEvaluate(evaluate), {
        timeoutMs: 80,
        pollMs: 0,
        urlStableMs: 0,
        domQuietMs: 10,
      }),
    ).resolves.toBe('/home')

    expect(Date.now() - started).toBeLessThan(250)
    expect(evaluate.mock.calls[0]?.[1]).toMatchObject({ quietMs: 10, deadlineMs: expect.any(Number) })
  })

  it('returns normally after the DOM stays quiet', async () => {
    class QuietObserver {
      constructor(callback: MutationCallback) {
        void callback
      }

      observe() {}

      disconnect() {}
    }
    vi.stubGlobal('document', {})
    vi.stubGlobal('MutationObserver', QuietObserver)
    const evaluate = vi.fn(async (fn: (input: { quietMs: number; deadlineMs: number }) => Promise<boolean>, input) =>
      fn(input),
    )

    await expect(
      waitForRouteSettled(pageForEvaluate(evaluate), {
        timeoutMs: 200,
        pollMs: 0,
        urlStableMs: 0,
        domQuietMs: 10,
      }),
    ).resolves.toBe('/home')

    expect(evaluate).toHaveBeenCalledOnce()
  })
})
