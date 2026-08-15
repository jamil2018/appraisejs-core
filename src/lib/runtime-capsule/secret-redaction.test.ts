import { describe, expect, it } from 'vitest'

import { credentialRedactor, redactResolvedCredentials } from './secret-redaction'

describe('runtime credential redaction', () => {
  it('redacts non-empty short credentials', () => {
    expect(redactResolvedCredentials('password=x', ['x'])).toBe('password=[REDACTED]')
  })

  it('redacts every resolved credential before logs, reports, and evidence are persisted', () => {
    const redact = credentialRedactor(['runtime-password', 'user-token'])
    expect(redact('stdout runtime-password stderr user-token')).toBe('stdout [REDACTED] stderr [REDACTED]')
    expect(redactResolvedCredentials('runtime-password', ['runtime-password'])).toBe('[REDACTED]')
  })
})
