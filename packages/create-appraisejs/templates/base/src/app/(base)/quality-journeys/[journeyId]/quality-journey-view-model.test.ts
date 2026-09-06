import { describe, expect, it } from 'vitest'

import { orderAnswersWithCorrectionHeadLast } from './quality-journey-view-model'

describe('orderAnswersWithCorrectionHeadLast', () => {
  it('selects the semantic correction head even when timestamps and identifiers do not order the lineage', () => {
    const answers = [
      { id: 'row-z', answerId: 'z-original', correctionOfAnswerId: null },
      { id: 'row-a', answerId: 'a-correction', correctionOfAnswerId: 'row-z' },
    ]

    expect(orderAnswersWithCorrectionHeadLast(answers).at(-1)?.answerId).toBe('a-correction')
  })
})
