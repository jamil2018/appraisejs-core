import { describe, expect, it } from 'vitest'

import { sealCredentialEnvironment } from './command-receipt-sealer'
import { hashRuntimeCapsuleBytes } from './contracts'

describe('sealed capsule credentials', () => {
  it('creates exactly one reference-only password entry for a configured reference', () => {
    const entry = sealCredentialEnvironment({
      credentialState: 'REFERENCE_CONFIGURED',
      passwordReference: 'APPRAISE_LOGIN_PASSWORD',
      resolvedPassword: 'resolved-secret',
    })

    expect(entry).toMatchObject({
      key: 'APPRAISE_ENV_PASSWORD',
      source: 'environment-ref',
      reference: 'APPRAISE_LOGIN_PASSWORD',
    })
    expect(JSON.stringify(entry)).not.toContain('resolved-secret')
    expect(JSON.stringify(entry)).not.toContain(hashRuntimeCapsuleBytes(Buffer.from('resolved-secret')))
    expect(entry).not.toHaveProperty('expectedDigest')
  })

  it('keeps the durable environment-ref receipt identical for different resolved values', () => {
    const sealed = (resolvedPassword: string) =>
      sealCredentialEnvironment({
        credentialState: 'REFERENCE_CONFIGURED',
        passwordReference: 'APPRAISE_LOGIN_PASSWORD',
        resolvedPassword,
      })
    expect(sealed('first-secret')).toEqual(sealed('second-secret'))
  })

  it('rejects inconsistent credential state and reference combinations', () => {
    expect(() =>
      sealCredentialEnvironment({
        credentialState: 'NONE',
        passwordReference: 'APPRAISE_LOGIN_PASSWORD',
        resolvedPassword: 'resolved-secret',
      }),
    ).toThrow('credential state and reference are inconsistent')
    expect(() =>
      sealCredentialEnvironment({
        credentialState: 'REFERENCE_CONFIGURED',
        passwordReference: null,
        resolvedPassword: undefined,
      }),
    ).toThrow('credential reference is unavailable')
  })
})
