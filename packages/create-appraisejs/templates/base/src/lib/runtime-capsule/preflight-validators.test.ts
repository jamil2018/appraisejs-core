import { describe, expect, it, vi } from 'vitest'

import { hashRuntimeCapsuleBytes, type RuntimeCapsuleManifest } from './contracts'
import { resolveSealedEnvironment, validateOperationClosure } from './preflight-validators'
import type { CapsuleCommandReceiptV1 } from './command-receipt-contract'

describe('sealed Step Definition closure preflight', () => {
  it('rejects an absent Step Definition closure', () => {
    expect(() => validateOperationClosure({ stepDefinitions: [] } as unknown as RuntimeCapsuleManifest)).toThrow(
      'Step Definition closure is missing',
    )
  })
})

describe('sealed environment resolution', () => {
  it('resolves a credential reference without storing its value in the receipt', () => {
    vi.stubEnv('APPRAISE_TEST_PASSWORD', 'runtime-secret')
    const receipt = {
      environment: {
        allowlist: ['APPRAISE_BASE_URL', 'APPRAISE_ENV_PASSWORD'],
        entries: [
          {
            key: 'APPRAISE_BASE_URL',
            source: 'literal',
            value: 'https://example.test',
            expectedDigest: hashRuntimeCapsuleBytes(Buffer.from('https://example.test')),
          },
          {
            key: 'APPRAISE_ENV_PASSWORD',
            source: 'environment-ref',
            reference: 'APPRAISE_TEST_PASSWORD',
            referenceKind: 'environment',
            referenceVersion: hashRuntimeCapsuleBytes(Buffer.from('APPRAISE_TEST_PASSWORD')),
            expectedDigest: hashRuntimeCapsuleBytes(Buffer.from('runtime-secret')),
          },
        ],
      },
      capabilities: {
        network: { allowedOrigins: ['https://example.test'] },
        process: { spawn: false, shell: false, childProcess: false },
        imports: { allowed: [] },
      },
      runtime: { moduleImports: [] },
    } as unknown as CapsuleCommandReceiptV1

    expect(resolveSealedEnvironment(receipt)).toEqual({
      APPRAISE_BASE_URL: 'https://example.test',
      APPRAISE_ENV_PASSWORD: 'runtime-secret',
    })
    expect(JSON.stringify(receipt)).not.toContain('runtime-secret')
    vi.stubEnv('APPRAISE_TEST_PASSWORD', 'changed-secret')
    expect(() => resolveSealedEnvironment(receipt)).toThrow(expect.objectContaining({ code: 'ENV_VALUE_DRIFT' }))
    vi.unstubAllEnvs()
    expect(() => resolveSealedEnvironment(receipt)).toThrow(expect.objectContaining({ code: 'ENV_REFERENCE_MISSING' }))
  })
})
