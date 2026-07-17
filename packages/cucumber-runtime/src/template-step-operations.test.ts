import { describe, expect, it, vi } from 'vitest'

import { runLocatorTemplateOperation, runPageTemplateOperation } from './template-step-operations'

describe('structured template-step operations', () => {
  it('dispatches an allowlisted locator operation with stored-variable references', async () => {
    const fill = vi.fn().mockResolvedValue(undefined)
    await runLocatorTemplateOperation(
      { fill } as never,
      'fill',
      '[{"$stored":"customerName"}]',
      '{"timeout":5000}',
      name => (name === 'customerName' ? 'Ada Lovelace' : undefined),
    )

    expect(fill).toHaveBeenCalledWith('Ada Lovelace', { timeout: 5000 })
  })

  it('rejects unsupported locator operations and options before touching Playwright', async () => {
    const locator = { evaluate: vi.fn(), click: vi.fn() }

    await expect(runLocatorTemplateOperation(locator as never, 'evaluate', '[]', '{}', vi.fn())).rejects.toThrow(
      'Unsupported locator operation: evaluate',
    )
    await expect(
      runLocatorTemplateOperation(locator as never, 'click', '[]', '{"unknown":true}', vi.fn()),
    ).rejects.toThrow('Unsupported option(s) for click: unknown')
    expect(locator.evaluate).not.toHaveBeenCalled()
    expect(locator.click).not.toHaveBeenCalled()
  })

  it('rejects malformed argument shapes and invalid stored-variable references', async () => {
    await expect(runLocatorTemplateOperation({} as never, 'fill', '{}', '{}', vi.fn())).rejects.toThrow(
      'Arguments JSON must be an array',
    )
    await expect(runLocatorTemplateOperation({} as never, 'fill', '[{"$stored":""}]', '{}', vi.fn())).rejects.toThrow(
      'Stored-variable references must use',
    )
  })

  it('dispatches safe page operations and rejects arbitrary JavaScript evaluation', async () => {
    const setViewportSize = vi.fn().mockResolvedValue(undefined)
    const evaluate = vi.fn()
    const page = { setViewportSize, evaluate }

    await runPageTemplateOperation(page as never, 'setViewportSize', '[{"width":1280,"height":720}]', '{}', vi.fn())
    expect(setViewportSize).toHaveBeenCalledWith({ width: 1280, height: 720 })

    await expect(runPageTemplateOperation(page as never, 'evaluate', '[]', '{}', vi.fn())).rejects.toThrow(
      'Unsupported page operation: evaluate',
    )
    expect(evaluate).not.toHaveBeenCalled()
  })

  it('bounds explicit waits', async () => {
    const waitForTimeout = vi.fn()
    await expect(
      runPageTemplateOperation({ waitForTimeout } as never, 'waitForTimeout', '[120001]', '{}', vi.fn()),
    ).rejects.toThrow('milliseconds between 0 and 120000')
    expect(waitForTimeout).not.toHaveBeenCalled()
  })
})
