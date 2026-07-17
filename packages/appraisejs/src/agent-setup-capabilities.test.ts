import { describe, expect, it } from 'vitest'

import { expectedAgentCapabilities } from './agent-setup-capabilities.js'

describe('agent setup capabilities', () => {
  it.each(['tools', 'resources'] as const)('lists unique %s', capabilityType => {
    const capabilities = expectedAgentCapabilities[capabilityType]

    expect(new Set(capabilities).size).toBe(capabilities.length)
  })

  it('advertises release-critical lifecycle tools', () => {
    expect(expectedAgentCapabilities.tools).toEqual(
      expect.arrayContaining(['baseline_start', 'baseline_reconcile', 'baseline_accept', 'implementation_start']),
    )
  })
})
