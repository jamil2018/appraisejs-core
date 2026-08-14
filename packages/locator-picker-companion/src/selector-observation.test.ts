import { describe, expect, it, vi } from 'vitest'

import { assertExactlyOneObservedMatch, observeSelector } from './selector-observation.js'

function pageFor(matchCount: number, error?: Error) {
  return {
    url: () => 'https://example.test/checkout',
    locator: vi.fn().mockReturnValue({
      count: error ? vi.fn().mockRejectedValue(error) : vi.fn().mockResolvedValue(matchCount),
    }),
  }
}

describe('selector observation', () => {
  it.each([0, 1, 2])('records %i live selector matches with a stable fingerprint', async matchCount => {
    const observation = await observeSelector(pageFor(matchCount) as never, 'css=.checkout')

    expect(observation).toMatchObject({
      matchCount,
      checkedUrl: 'https://example.test/checkout',
      selectorFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      checkedAt: expect.any(String),
    })
    if (matchCount === 1) expect(() => assertExactlyOneObservedMatch(observation)).not.toThrow()
    else expect(() => assertExactlyOneObservedMatch(observation)).toThrow('must match exactly one')
  })

  it('records invalid selector observations and prevents confirmation', async () => {
    const observation = await observeSelector(pageFor(0, new Error('Unexpected token')) as never, 'css=???')

    expect(observation).toMatchObject({ matchCount: null, error: 'Unexpected token' })
    expect(() => assertExactlyOneObservedMatch(observation)).toThrow('invalid on the live page')
  })
})
