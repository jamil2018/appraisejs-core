import { describe, expect, it } from 'vitest'

import { addedQualitySuppressions, readQualityDiff } from './quality-ratchet.mjs'

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

  it('reads migration-sized diffs without relying on the Node default buffer', () => {
    const patch = 'x'.repeat(2 * 1024 * 1024)
    let maxBuffer = 0

    const result = readQualityDiff('origin/appraise-0.5', (_command, _args, options) => {
      maxBuffer = options.maxBuffer
      return { error: undefined, status: 0, stderr: '', stdout: patch }
    })

    expect(result).toBe(patch)
    expect(maxBuffer).toBeGreaterThan(patch.length)
  })

  it('reports child-process failures instead of exiting silently', () => {
    expect(() =>
      readQualityDiff('origin/appraise-0.5', () => ({
        error: new Error('spawnSync git ENOBUFS'),
        status: null,
        stderr: '',
        stdout: '',
      })),
    ).toThrow('Unable to read the quality diff: spawnSync git ENOBUFS')
  })
})
