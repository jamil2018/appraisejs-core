import { describe, expect, it } from 'vitest'

import { addedQualitySuppressions } from './quality-ratchet.mjs'

describe('quality ratchet', () => {
  it('rejects a deliberately added suppression fixture', () => {
    const patch = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '+// fallow-ignore-next-line complexity',
      '+/* eslint-disable */',
    ].join('\n')
    expect(addedQualitySuppressions(patch)).toEqual(['// fallow-ignore-next-line complexity', '/* eslint-disable */'])
  })

  it('ignores removed and contextual suppressions', () => {
    expect(addedQualitySuppressions(' // eslint-disable\n-// @ts-ignore')).toEqual([])
  })

  it('ignores suppression tokens inside source strings and detector expressions', () => {
    const patch = [
      '+const pattern = /(?:fallow-ignore|eslint-disable|@ts-ignore|@ts-expect-error)/',
      "+const fixture = '+// fallow-ignore-next-line complexity'",
      "+expect(result).toEqual(['// eslint-disable'])",
    ].join('\n')
    expect(addedQualitySuppressions(patch)).toEqual([])
  })
})
