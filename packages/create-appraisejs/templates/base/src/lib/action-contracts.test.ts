import { describe, expect, it } from 'vitest'

import { actionDescriptorDefinitionSchema } from '@/lib/action-catalog'
import { actionReferenceIdentitySchema } from '@/lib/action-contracts'
import { actionReferenceSchema } from '@/lib/validation-ast'

const descriptor = {
  id: 'browser.navigation.goto',
  version: '1.2.0',
  title: 'Go to',
  description: 'Navigate to a URL.',
  categories: ['browser.navigation'],
  inputs: [],
  outputs: [],
  requirements: { runtime: 'browser', capabilities: [] },
  examples: [],
  deprecated: false,
}

describe('action contract parity', () => {
  it.each(['browser.goto', 'browser.navigation.goto', 'browser-click'])('accepts %s across catalog and AST', id => {
    expect(actionReferenceIdentitySchema.safeParse({ id, version: '1.2.0' }).success).toBe(true)
    expect(actionDescriptorDefinitionSchema.safeParse({ ...descriptor, id }).success).toBe(true)
    expect(actionReferenceSchema.safeParse({ id, version: '1.2.0', inputs: {} }).success).toBe(true)
  })

  it.each(['Browser.goto', 'browser/goto', 'browser..goto', '.browser'])('rejects %s across catalog and AST', id => {
    expect(actionReferenceIdentitySchema.safeParse({ id, version: '1' }).success).toBe(false)
    expect(actionDescriptorDefinitionSchema.safeParse({ ...descriptor, id }).success).toBe(false)
    expect(actionReferenceSchema.safeParse({ id, version: '1', inputs: {} }).success).toBe(false)
  })

  it.each(['latest', '1.2.3.4', 'v1'])('rejects version %s across catalog and AST', version => {
    expect(actionReferenceIdentitySchema.safeParse({ id: 'browser.goto', version }).success).toBe(false)
    expect(actionDescriptorDefinitionSchema.safeParse({ ...descriptor, version }).success).toBe(false)
    expect(actionReferenceSchema.safeParse({ id: 'browser.goto', version, inputs: {} }).success).toBe(false)
  })
})
