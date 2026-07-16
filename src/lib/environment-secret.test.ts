import { describe, expect, it } from 'vitest'

import { EnvironmentSecretConfigurationError, resolveEnvironmentPassword } from './environment-secret'

describe('environment secret resolution', () => {
  it('resolves only the named process environment variable at execution time', () => {
    expect(
      resolveEnvironmentPassword(
        { passwordEnvironmentVariable: 'APPRAISE_TEST_PASSWORD', credentialState: 'REFERENCE_CONFIGURED' },
        { APPRAISE_TEST_PASSWORD: 'runtime-only-secret' },
      ),
    ).toBe('runtime-only-secret')
  })

  it('returns no credential for an environment without a reference', () => {
    expect(
      resolveEnvironmentPassword({ passwordEnvironmentVariable: null, credentialState: 'NONE' }, {}),
    ).toBeUndefined()
  })

  it('fails closed without exposing a legacy value', () => {
    expect(() =>
      resolveEnvironmentPassword({ passwordEnvironmentVariable: null, credentialState: 'LEGACY_DISABLED' }, {}),
    ).toThrow(EnvironmentSecretConfigurationError)
  })

  it('reports the missing reference name without a secret value', () => {
    expect(() =>
      resolveEnvironmentPassword(
        { passwordEnvironmentVariable: 'APPRAISE_MISSING_PASSWORD', credentialState: 'REFERENCE_CONFIGURED' },
        {},
      ),
    ).toThrow('APPRAISE_MISSING_PASSWORD')
  })
})
