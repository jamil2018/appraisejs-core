import { describe, expect, it } from 'vitest'
import { parseCliArgs } from './cli-args.js'

describe('parseCliArgs', () => {
  it('accepts --template starter', () => {
    expect(parseCliArgs(['--template', 'starter'])).toEqual({ template: 'starter' })
  })

  it('accepts --template blank', () => {
    expect(parseCliArgs(['--template', 'blank'])).toEqual({ template: 'blank' })
  })

  it('accepts --template=blank', () => {
    expect(parseCliArgs(['--template=blank'])).toEqual({ template: 'blank' })
  })

  it('rejects unsupported template values', () => {
    expect(() => parseCliArgs(['--template', 'custom'])).toThrow(
      'Invalid template "custom". Expected one of: starter, blank.',
    )
  })
})
