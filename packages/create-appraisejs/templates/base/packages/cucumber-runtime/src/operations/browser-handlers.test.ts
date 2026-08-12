import { describe, expect, it, vi } from 'vitest'
import type { Locator, Page } from 'playwright'

import {
  browserOperationHandlerDescriptors,
  executeBrowserOperation,
  listBrowserOperationHandlerRefs,
  OperationExecutionError,
} from './browser-handlers'

function runtime() {
  const locator = {
    click: vi.fn(),
    fill: vi.fn(),
    focus: vi.fn(),
    isVisible: vi.fn().mockResolvedValue(true),
    isChecked: vi.fn().mockResolvedValue(true),
    inputValue: vi.fn().mockResolvedValue('value'),
    textContent: vi.fn().mockResolvedValue('expected text'),
    evaluate: vi.fn().mockResolvedValue('Accessible name'),
    waitFor: vi.fn(),
  } as unknown as Locator
  const page = {
    locator: vi.fn().mockReturnValue(locator),
    goto: vi.fn(),
    reload: vi.fn(),
    keyboard: { press: vi.fn() },
    setViewportSize: vi.fn(),
    waitForLoadState: vi.fn(),
    waitForTimeout: vi.fn(),
    evaluate: vi.fn().mockResolvedValue(true),
  } as unknown as Page
  return {
    locator,
    page,
    context: {
      world: { page, browserRuntimeIssuesFor: vi.fn().mockReturnValue([]) },
      inputs: {} as Record<string, unknown>,
      resolveLocator: vi.fn().mockReturnValue(locator),
      resolveSelector: vi.fn().mockReturnValue('[data-reviewed="target"]'),
      baseUrl: 'https://example.test',
    },
  }
}

describe('browser operation handlers', () => {
  it('content-addresses each extracted implementation rather than only the shared adapter', () => {
    expect(browserOperationHandlerDescriptors['browser.click.double.click@1']?.contentHash).not.toBe(
      browserOperationHandlerDescriptors['browser.click.right.click@1']?.contentHash,
    )
  })

  it('exposes one content-addressed handler for every managed browser operation', () => {
    const refs = listBrowserOperationHandlerRefs()
    expect(refs.length).toBeGreaterThanOrEqual(116)
    expect(new Set(refs).size).toBe(refs.length)
    expect(
      Object.values(browserOperationHandlerDescriptors).every(item => /^sha256:[a-f0-9]{64}$/.test(item.contentHash)),
    ).toBe(true)
  })

  it.each([
    [
      'browser.navigation.goto@1',
      { url: '/notes' },
      'goto',
      ['https://example.test/notes', { waitUntil: 'domcontentloaded' }],
    ],
    ['browser.navigation.reload@1', {}, 'reload', undefined],
    ['browser.waits.duration@1', { duration: 2 }, 'waitForTimeout', 2_000],
    ['browser.waits.timeout@1', { timeout: 250 }, 'waitForTimeout', 250],
  ] as const)('executes page primitive %s through the shared registry', async (ref, inputs, method, expected) => {
    const value = runtime()
    value.context.inputs = inputs
    await executeBrowserOperation(ref, value.context)
    const call = value.page[method] as ReturnType<typeof vi.fn>
    if (expected === undefined) expect(call).toHaveBeenCalledWith()
    else if (Array.isArray(expected)) expect(call).toHaveBeenCalledWith(...expected)
    else expect(call).toHaveBeenCalledWith(expected)
  })

  it('executes locator primitives and preserves stable failure codes', async () => {
    const value = runtime()
    value.context.inputs = { target: { id: 'title' }, value: 'Notice' }
    await executeBrowserOperation('browser.forms.fill@1', value.context)
    expect(value.locator.fill).toHaveBeenCalledWith('Notice')

    value.context.inputs = { target: { id: 'title' } }
    await expect(executeBrowserOperation('browser.assertions.hidden@1', value.context)).rejects.toMatchObject({
      code: 'operation_assertion_failed',
    })
  })

  it('fails closed for unknown or unreviewed operations', async () => {
    const value = runtime()
    await expect(
      executeBrowserOperation('browser.mouse.click@1', value.context, new Set(['browser.navigation.reload@1'])),
    ).rejects.toEqual(expect.objectContaining<Partial<OperationExecutionError>>({ code: 'operation_not_reviewed' }))
    await expect(executeBrowserOperation('browser.unknown@1', value.context)).rejects.toMatchObject({
      code: 'operation_unknown',
    })
  })

  it('adds bounded visible form validation messages to browser operation failures', async () => {
    const value = runtime()
    value.context.inputs = { elementName: { id: 'confirmation' } }
    vi.mocked(value.locator.waitFor).mockRejectedValueOnce(new Error('confirmation timed out'))
    vi.mocked(value.page.evaluate).mockResolvedValueOnce(['Enter a valid card number.'] as never)

    await expect(executeBrowserOperation('browser.wait.wait.for.element@1', value.context)).rejects.toMatchObject({
      code: 'operation_execution_failed',
      message: expect.stringContaining('Visible validation: Enter a valid card number.'),
    })
  })
})
