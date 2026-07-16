import { describe, expect, it, vi } from 'vitest'

import { TestRunLogger } from './test-run-logger'

describe('TestRunLogger', () => {
  it('closes once and turns late writes into a controlled false result', async () => {
    const sink = { info: vi.fn(), error: vi.fn() }
    const closeSink = vi.fn().mockResolvedValue(undefined)
    const logger = new TestRunLogger(sink as never, closeSink)

    expect(logger.info('before close')).toBe(true)
    const firstClose = logger.close()
    const secondClose = logger.close()
    expect(firstClose).toBe(secondClose)
    expect(logger.error('late write')).toBe(false)
    await firstClose

    expect(closeSink).toHaveBeenCalledOnce()
    expect(sink.info).toHaveBeenCalledWith('before close')
    expect(sink.error).not.toHaveBeenCalled()
    expect(logger.isClosed()).toBe(true)
  })
})
