import { describe, expect, it } from 'vitest'
import { splitTagLine } from './tag-parsing'

describe('splitTagLine', () => {
  it('splits a single tag', () => {
    expect(splitTagLine('@smoke')).toEqual(['@smoke'])
  })

  it('splits multiple tags with mixed whitespace', () => {
    expect(splitTagLine('@smoke   @demo\t@regression')).toEqual(['@smoke', '@demo', '@regression'])
  })

  it('returns empty array for empty string', () => {
    expect(splitTagLine('')).toEqual([])
  })

  it('filters values without @ prefix', () => {
    expect(splitTagLine('smoke @demo abc')).toEqual(['@demo'])
  })
})
