import { describe, expect, it } from 'vitest'
import { assertValidCustomExtensionPolicy, createCustomExtensionPolicy } from './extension-policy'

describe('custom extension policy authority', () => {
  it('accepts the canonical authority and rejects coherently forged declaration identity', () => {
    const policy = createCustomExtensionPolicy({
      projectId: 'project',
      projectFingerprint: `sha256:${'a'.repeat(64)}`,
      capabilityImports: { browser: ['@playwright/test'] },
    })
    expect(() => assertValidCustomExtensionPolicy(policy)).not.toThrow()
    expect(() =>
      assertValidCustomExtensionPolicy({
        ...policy,
        declarationHash: `sha256:${'b'.repeat(64)}`,
      }),
    ).toThrow(/invalid or stale/)
  })
})
