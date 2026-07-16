import { describe, expect, it } from 'vitest'

import { addedQualitySuppressions } from './quality-ratchet.mjs'

describe('quality ratchet', () => {
  it('rejects a deliberately added suppression fixture', () => {
    const patch = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '+// fallow-ignore-next-line complexity',
    ].join('\n')
    expect(addedQualitySuppressions(patch)).toEqual(['// fallow-ignore-next-line complexity'])
  })

  it('ignores removed and contextual suppressions', () => {
    expect(addedQualitySuppressions(' // eslint-disable\n-// @ts-ignore')).toEqual([])
  })
})
