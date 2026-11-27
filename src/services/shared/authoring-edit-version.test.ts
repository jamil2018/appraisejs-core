import { describe, expect, it } from 'vitest'

import { authoringEditVersion, throwIfStaleAuthoringUpdate } from './authoring-edit-version'

describe('authoring edit version', () => {
  it('advances even when a second save happens in the same millisecond', () => {
    const current = new Date(Date.now() + 1000)
    const version = authoringEditVersion(current, current.toISOString())
    expect(version?.expected).toEqual(current)
    expect(version?.next.getTime()).toBe(current.getTime() + 1)
  })

  it('rejects stale and invalid tokens before a writer starts', () => {
    const current = new Date('2026-01-01T00:00:00.001Z')
    expect(() => authoringEditVersion(current, '2026-01-01T00:00:00.000Z')).toThrow('changed')
    expect(() => authoringEditVersion(current, 'not-a-date')).toThrow('invalid')
  })

  it('maps a lost conditional update to a conflict and propagates other faults', () => {
    expect(() => throwIfStaleAuthoringUpdate(Object.assign(new Error('missing'), { code: 'P2025' }))).toThrow('changed')
    const fault = new Error('storage fault')
    expect(() => throwIfStaleAuthoringUpdate(fault)).toThrow(fault)
  })
})
