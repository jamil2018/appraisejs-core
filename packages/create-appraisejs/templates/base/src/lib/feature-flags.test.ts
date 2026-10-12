import { afterEach, describe, expect, it, vi } from 'vitest'
import { isProviderNativeRunsEnabled } from './feature-flags'

afterEach(() => vi.unstubAllEnvs())

describe('experimental provider admission defaults', () => {
  it('excludes provider-native runs when neither explicit flag is set', () => {
    vi.stubEnv('APPRAISE_EXPERIMENTAL_PROVIDER_RUNS', undefined)
    vi.stubEnv('NEXT_PUBLIC_APPRAISE_EXPERIMENTAL_PROVIDER_RUNS', undefined)
    expect(isProviderNativeRunsEnabled()).toBe(false)
  })

  it.each(['', 'false', '0', 'unsupported'])('keeps provider-native runs excluded for %s', value => {
    vi.stubEnv('APPRAISE_EXPERIMENTAL_PROVIDER_RUNS', value)
    vi.stubEnv('NEXT_PUBLIC_APPRAISE_EXPERIMENTAL_PROVIDER_RUNS', 'true')
    expect(isProviderNativeRunsEnabled()).toBe(false)
  })

  it('requires an explicit opt-in and returns to disabled when removed', () => {
    vi.stubEnv('APPRAISE_EXPERIMENTAL_PROVIDER_RUNS', 'true')
    expect(isProviderNativeRunsEnabled()).toBe(true)
    vi.stubEnv('APPRAISE_EXPERIMENTAL_PROVIDER_RUNS', undefined)
    vi.stubEnv('NEXT_PUBLIC_APPRAISE_EXPERIMENTAL_PROVIDER_RUNS', undefined)
    expect(isProviderNativeRunsEnabled()).toBe(false)
  })
})
