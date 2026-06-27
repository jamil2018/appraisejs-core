import { describe, it, expect } from 'vitest'
import { getConfig } from './config.js'

describe('getConfig', () => {
  it('returns the selected template', () => {
    expect(getConfig('starter')).toEqual({ template: 'starter' })
  })

  it('defaults to starter', () => {
    expect(getConfig()).toEqual({ template: 'starter' })
  })
})
