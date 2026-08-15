import { describe, expect, it, vi } from 'vitest'
import { startRuntimeTrace, stopRuntimeTrace } from './trace-policy.ts'

describe('runtime trace policy', () => {
  it('does not start tracing for a credential-bearing scenario', async () => {
    const start = vi.fn()
    const context = { tracing: { start } }

    await expect(startRuntimeTrace(context as never, 'x')).resolves.toBe(false)
    expect(start).not.toHaveBeenCalled()
  })

  it('retains tracing for scenarios without credentials', async () => {
    const start = vi.fn().mockResolvedValue(undefined)
    const context = { tracing: { start } }

    await expect(startRuntimeTrace(context as never, undefined)).resolves.toBe(true)
    expect(start).toHaveBeenCalledOnce()
  })

  it('never creates a trace artifact for a credential-bearing failed scenario', async () => {
    const stop = vi.fn().mockResolvedValue(undefined)
    const createTracePath = vi.fn().mockResolvedValue('/private/traces/credential.zip')
    const context = { tracing: { stop } }

    await expect(
      stopRuntimeTrace({
        context: context as never,
        traceStarted: true,
        failed: true,
        createTracePath,
        resolvedPassword: 'x',
      }),
    ).resolves.toBeUndefined()

    expect(createTracePath).not.toHaveBeenCalled()
    expect(stop).toHaveBeenCalledExactlyOnceWith()
  })

  it('creates a trace artifact only for a non-credential-bearing failed scenario', async () => {
    const stop = vi.fn().mockResolvedValue(undefined)
    const createTracePath = vi.fn().mockResolvedValue('/private/traces/non-secret.zip')
    const context = { tracing: { stop } }

    await expect(
      stopRuntimeTrace({
        context: context as never,
        traceStarted: true,
        failed: true,
        createTracePath,
      }),
    ).resolves.toBe('/private/traces/non-secret.zip')

    expect(createTracePath).toHaveBeenCalledOnce()
    expect(stop).toHaveBeenCalledExactlyOnceWith({ path: '/private/traces/non-secret.zip' })
  })
})
