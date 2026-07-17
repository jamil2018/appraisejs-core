import { describe, expect, it } from 'vitest'

import { expectedAgentCapabilities } from './agent-setup-capabilities.js'

describe('agent setup capabilities', () => {
  it.each(['tools', 'resources'] as const)('lists unique %s', capabilityType => {
    const capabilities = expectedAgentCapabilities[capabilityType]

    expect(new Set(capabilities).size).toBe(capabilities.length)
  })
})
