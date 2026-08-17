import { describe, expect, it, vi } from 'vitest'
import type { Locator, Page } from 'playwright'

import {
  browserOperationHandlerDescriptors,
  type BrowserOperationContext,
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
    count: vi.fn().mockResolvedValue(1),
  } as unknown as Locator
  const page = {
    locator: vi.fn().mockReturnValue(locator),
    goto: vi.fn(),
    url: vi.fn().mockReturnValue('https://example.test/home'),
    reload: vi.fn(),
    keyboard: { press: vi.fn() },
    setViewportSize: vi.fn(),
    waitForLoadState: vi.fn(),
    waitForURL: vi.fn(),
    waitForTimeout: vi.fn(),
    evaluate: vi.fn().mockResolvedValue(true),
    on: vi.fn(),
    off: vi.fn(),
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

  it('waits for an expected route before asserting it', async () => {
    const value = runtime()
    value.context.inputs = { route: '/home' }

    await executeBrowserOperation('browser.navigation.assertion.assert.url.route.equals@1', value.context)

    expect(value.page.waitForURL).toHaveBeenCalledOnce()
    const predicate = vi.mocked(value.page.waitForURL).mock.calls[0]![0] as (url: URL) => boolean
    expect(predicate(new URL('https://example.test/home'))).toBe(true)
    expect(predicate(new URL('https://example.test/login'))).toBe(false)
    expect(value.page.waitForLoadState).toHaveBeenCalledWith('domcontentloaded', { timeout: 15000 })
    expect(value.page.waitForLoadState).not.toHaveBeenCalledWith('networkidle')
  })

  it('denies an absolute navigation outside the sealed target origin before navigation', async () => {
    const value = runtime()
    value.context.inputs = { url: 'https://attacker.test/home' }

    await expect(executeBrowserOperation('browser.navigation.goto@1', value.context)).rejects.toMatchObject({
      code: 'ORIGIN_DENIED',
    })
    expect(value.page.goto).not.toHaveBeenCalled()
  })

  it('denies a cross-origin redirect after navigation', async () => {
    const value = runtime()
    value.context.inputs = { url: '/home' }
    vi.mocked(value.page.url)
      .mockReturnValueOnce('https://example.test/home')
      .mockReturnValue('https://attacker.test/home')

    await expect(executeBrowserOperation('browser.navigation.goto@1', value.context)).rejects.toMatchObject({
      code: 'ORIGIN_DENIED',
    })
  })

  it('denies a same-route assertion on an unsealed origin', async () => {
    const value = runtime()
    value.context.inputs = { route: '/home' }
    vi.mocked(value.page.url).mockReturnValue('https://attacker.test/home')

    await expect(
      executeBrowserOperation('browser.navigation.assertion.assert.url.route.equals@1', value.context),
    ).rejects.toMatchObject({ code: 'ORIGIN_DENIED' })
    expect(value.page.waitForURL).not.toHaveBeenCalled()
  })

  it('does not fill a resolved credential before reaching the sealed origin and redacts it from errors', async () => {
    const value = runtime()
    const priorCredential = process.env.APPRAISE_ENV_PASSWORD
    process.env.APPRAISE_ENV_PASSWORD = 'resolved-test-password'
    try {
      value.context.inputs = { target: { id: 'password' }, value: 'resolved-test-password' }
      vi.mocked(value.page.url).mockReturnValue('about:blank')
      await expect(executeBrowserOperation('browser.forms.fill@1', value.context)).rejects.toMatchObject({
        code: 'ORIGIN_DENIED',
      })
      expect(value.locator.fill).not.toHaveBeenCalled()

      vi.mocked(value.page.url).mockReturnValue('https://example.test/login')
      vi.mocked(value.locator.fill).mockRejectedValueOnce(new Error('fill rejected resolved-test-password'))
      await expect(executeBrowserOperation('browser.forms.fill@1', value.context)).rejects.toMatchObject({
        code: 'operation_execution_failed',
        message: expect.not.stringContaining('resolved-test-password'),
      })
    } finally {
      if (priorCredential === undefined) delete process.env.APPRAISE_ENV_PASSWORD
      else process.env.APPRAISE_ENV_PASSWORD = priorCredential
    }
  })

  it('treats a one-character resolved credential as sensitive', async () => {
    const value = runtime()
    const priorCredential = process.env.APPRAISE_ENV_PASSWORD
    process.env.APPRAISE_ENV_PASSWORD = 'x'
    try {
      value.context.inputs = { target: { id: 'password' }, value: 'x' }
      vi.mocked(value.page.url).mockReturnValue('about:blank')
      await expect(executeBrowserOperation('browser.forms.fill@1', value.context)).rejects.toMatchObject({
        code: 'ORIGIN_DENIED',
      })
      expect(value.locator.fill).not.toHaveBeenCalled()
    } finally {
      if (priorCredential === undefined) delete process.env.APPRAISE_ENV_PASSWORD
      else process.env.APPRAISE_ENV_PASSWORD = priorCredential
    }
  })

  it.each([
    [0, 'operation_locator_cardinality'],
    [1, undefined],
    [2, 'operation_locator_cardinality'],
  ])('enforces exactly-one locator cardinality for %i live matches', async (matchCount, expectedCode) => {
    const value = runtime()
    value.context.inputs = { target: { id: 'title' }, value: 'Notice' }
    vi.mocked(value.locator.count).mockResolvedValue(matchCount)

    if (expectedCode) {
      await expect(executeBrowserOperation('browser.forms.fill@1', value.context)).rejects.toMatchObject({
        code: expectedCode,
      })
      expect(value.locator.fill).not.toHaveBeenCalled()
      return
    }

    await expect(executeBrowserOperation('browser.forms.fill@1', value.context)).resolves.toBeUndefined()
    expect(value.locator.fill).toHaveBeenCalledWith('Notice')
  })

  it('keeps collection locator operations plural', async () => {
    const value = runtime()
    value.context.inputs = { elementName: { id: 'rows' }, expected: 2 }
    vi.mocked(value.locator.count).mockResolvedValue(2)

    await expect(
      executeBrowserOperation('browser.element.property.assertion.assert.element.count@1', value.context),
    ).resolves.toBeUndefined()
    expect(value.locator.count).toHaveBeenCalledTimes(1)
  })

  it('prefers sealed operation cardinality over the installed registry definition', async () => {
    const value = runtime()
    value.context.inputs = { target: { id: 'title' }, value: 'Notice' }
    ;(value.context as BrowserOperationContext).operationCardinalities = {
      'browser.forms.fill@1': { target: 'collection' },
    }
    vi.mocked(value.locator.count).mockResolvedValue(2)

    await expect(executeBrowserOperation('browser.forms.fill@1', value.context)).resolves.toBeUndefined()
    expect(value.locator.fill).toHaveBeenCalledWith('Notice')
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
