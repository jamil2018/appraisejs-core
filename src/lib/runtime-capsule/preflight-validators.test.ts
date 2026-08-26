import { describe, expect, it, vi } from 'vitest'

import { canonicalCapsuleCommandReceipt, parseCanonicalCapsuleCommandReceipt } from './command-receipt-contract'
import { sealCapsuleCommandReceipt } from './command-receipt-sealer'
import { hashRuntimeCapsuleBytes, type RuntimeCapsuleManifest } from './contracts'
import { resolveSealedEnvironment, validateOperationClosure } from './preflight-validators'
import { createCustomExtensionPolicy } from '@/lib/validation-ast/extension-policy'

const hash = (character: string) => `sha256:${character.repeat(64)}`

async function sealedConfiguredCredentialReceipt() {
  const expectedCases = [{ validationId: 'validation', suiteId: 'suite', caseId: 'case', scenarioId: 'scenario' }]
  const built = {
    cases: expectedCases,
    files: [
      { path: 'cucumber.mjs', role: 'config', bytes: Buffer.from('export default {}\n') },
      { path: 'features/login.feature', role: 'feature', bytes: Buffer.from('Feature: Login\n') },
      { path: 'bindings/login.mjs', role: 'binding', bytes: Buffer.from('export const binding = true\n') },
      { path: 'support/world.mjs', role: 'support', bytes: Buffer.from('export const world = true\n') },
      { path: 'support/hooks.mjs', role: 'support', bytes: Buffer.from('export const hooks = true\n') },
      { path: 'expected-cases.json', role: 'expected-cases', bytes: Buffer.from(JSON.stringify(expectedCases)) },
    ],
  }
  const receipt = await sealCapsuleCommandReceipt({
    operation: {
      id: 'qvp_validation',
      operationHash: hash('a'),
      projectionHash: hash('b'),
      receiptHash: hash('c'),
      runtimeInputHash: hash('d'),
      targetProjectId: 'target',
      validationHash: hash('e'),
    },
    testRun: {
      id: 'test-run',
      runId: 'run',
      browserEngine: 'CHROMIUM',
      environment: {
        id: 'environment',
        name: 'Sauce Demo',
        baseUrl: 'https://example.test/',
        username: 'standard_user',
        credentialState: 'REFERENCE_CONFIGURED',
        passwordEnvironmentVariable: 'APPRAISE_TEST_PASSWORD',
      },
    },
    // Receipt sealing only consumes this immutable compiler identity. The
    // full runtime-input parser is exercised at publication before sealing.
    runtimeInput: {
      extensionPolicy: {
        ...createCustomExtensionPolicy({
          projectId: 'target',
          projectFingerprint: hash('f'),
          capabilityImports: {},
        }),
        capabilityImports: {},
      },
    },
    built,
  })
  return parseCanonicalCapsuleCommandReceipt(canonicalCapsuleCommandReceipt(receipt))
}

describe('sealed Step Definition closure preflight', () => {
  it('rejects an absent Step Definition closure', () => {
    expect(() => validateOperationClosure({ stepDefinitions: [] } as unknown as RuntimeCapsuleManifest)).toThrow(
      'Step Definition closure is missing',
    )
  })
})

describe('sealed environment resolution', () => {
  it('hands an authorized configured credential from the real sealer through the canonical parser without durable value identity', async () => {
    vi.stubEnv('APPRAISE_TEST_PASSWORD', 'runtime-secret')
    const receipt = await sealedConfiguredCredentialReceipt()

    expect(resolveSealedEnvironment(receipt)).toEqual({
      APPRAISE_BASE_URL: 'https://example.test/',
      APPRAISE_ENV_USERNAME: 'standard_user',
      APPRAISE_ENV_PASSWORD: 'runtime-secret',
      BROWSER: 'chromium',
      HEADLESS: 'true',
      REPORT_PATH: 'reports/cucumber.json',
      REPORT_FORMAT: 'json:reports/cucumber.json',
      TEST_RUN_ID: 'run',
    })
    expect(JSON.stringify(receipt)).not.toContain('runtime-secret')
    vi.stubEnv('APPRAISE_TEST_PASSWORD', 'changed-secret')
    expect(resolveSealedEnvironment(receipt).APPRAISE_ENV_PASSWORD).toBe('changed-secret')

    const credential = receipt.environment.entries.find(entry => entry.key === 'APPRAISE_ENV_PASSWORD')!
    expect(credential).toMatchObject({
      source: 'environment-ref',
      reference: 'APPRAISE_TEST_PASSWORD',
      referenceKind: 'environment',
      referenceVersion: hashRuntimeCapsuleBytes(Buffer.from('APPRAISE_TEST_PASSWORD')),
    })
    expect(credential).not.toHaveProperty('expectedDigest')

    const tampered = {
      ...receipt,
      environment: {
        ...receipt.environment,
        entries: receipt.environment.entries.map(entry =>
          entry.key === 'APPRAISE_ENV_PASSWORD' ? { ...entry, referenceVersion: hash('9') } : entry,
        ),
      },
    }
    expect(() => resolveSealedEnvironment(tampered)).toThrow(expect.objectContaining({ code: 'ENV_VALUE_DRIFT' }))

    const literalTampered = {
      ...receipt,
      environment: {
        ...receipt.environment,
        entries: receipt.environment.entries.map(entry =>
          entry.key === 'APPRAISE_BASE_URL' ? { ...entry, expectedDigest: hash('8') } : entry,
        ),
      },
    }
    expect(() => resolveSealedEnvironment(literalTampered)).toThrow(
      expect.objectContaining({ code: 'ENV_VALUE_DRIFT' }),
    )

    vi.unstubAllEnvs()
    expect(() => resolveSealedEnvironment(receipt)).toThrow(expect.objectContaining({ code: 'ENV_REFERENCE_MISSING' }))
  })
})
