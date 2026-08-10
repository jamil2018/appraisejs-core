import { describe, expect, it } from 'vitest'

import { aggregatePendingComparisons, pendingComparison } from './pending-comparators'

describe('pending comparators', () => {
  it('retains family-owned mismatch reasons and aggregates without entity branches', () => {
    const comparisons = [pendingComparison('sync-modules', 2), pendingComparison('sync-tags', 0)]
    expect(comparisons[0].reasons).toEqual(['2 projected sync-modules record(s) differ from persisted state.'])
    expect(comparisons[1].reasons).toEqual([])
    expect(aggregatePendingComparisons(comparisons)).toEqual({
      counts: { 'sync-modules': 2, 'sync-tags': 0 },
      total: 2,
    })
  })
})
