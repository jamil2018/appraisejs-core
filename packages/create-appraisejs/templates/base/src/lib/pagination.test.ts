import { describe, expect, it } from 'vitest'

import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, appliedPageLimit, decodePageCursor, encodePageCursor } from './pagination'

describe('pagination contract', () => {
  it('applies a conservative default and hard maximum', () => {
    expect(appliedPageLimit()).toBe(DEFAULT_PAGE_LIMIT)
    expect(appliedPageLimit(MAX_PAGE_LIMIT + 50)).toBe(MAX_PAGE_LIMIT)
    expect(() => appliedPageLimit(0)).toThrow('positive integer')
  })

  it('round-trips a stable scope-bound cursor', () => {
    const encoded = encodePageCursor({ scope: 'project-1', id: 'run-1', sortValue: '2026-01-01T00:00:00.000Z' })
    expect(decodePageCursor(encoded, 'project-1')).toEqual({
      scope: 'project-1',
      id: 'run-1',
      sortValue: '2026-01-01T00:00:00.000Z',
    })
    expect(() => decodePageCursor(encoded, 'project-2')).toThrow('invalid for this project')
  })
})
