import { describe, expect, it } from 'vitest'
import { mergeMissingLocators } from './locator-sync-utils'

describe('mergeMissingLocators', () => {
  it('adds keys only from locatorsToEnsure that are missing in base', () => {
    const { mergedLocators, addedCount } = mergeMissingLocators(
      { a: '1', b: '2' },
      { b: 'x', c: '3' },
    )
    expect(mergedLocators).toEqual({ a: '1', b: '2', c: '3' })
    expect(addedCount).toBe(1)
  })

  it('returns zero added when all keys exist', () => {
    const { mergedLocators, addedCount } = mergeMissingLocators({ x: '1' }, { x: '2' })
    expect(mergedLocators).toEqual({ x: '1' })
    expect(addedCount).toBe(0)
  })
})
