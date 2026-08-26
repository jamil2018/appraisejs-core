import { describe, expect, it } from 'vitest'

import {
  canonicalRemoteEvaluationEnvironmentBinding,
  canonicalRemoteEvaluationOrigin,
  remoteEvaluationScopeDigest,
} from './remote-evaluation-scope-service'
import {
  normalizedRemoteScopePartitions,
  remoteEvaluationScopePartitionCreateSchema,
  remoteScopePartitionRequestIdentity,
} from '@/lib/quality-design/remote-evaluation-scope-contract'

const hash = (letter: string) => `sha256:${letter.repeat(64)}`

const target = {
  id: 'target-sauce',
  kind: 'REMOTE_BLACK_BOX',
  fingerprint: hash('a'),
  canonicalIdentity: 'remote:https://www.saucedemo.com',
  normalizedRemoteOrigin: 'https://www.saucedemo.com',
}

const environment = {
  id: 'environment-sauce',
  targetProjectId: target.id,
  name: 'Sauce Demo',
  baseUrl: 'https://www.saucedemo.com/',
  expectedPageTitle: 'Swag Labs',
  apiBaseUrl: null,
  username: null,
  credentialState: 'NONE',
  passwordEnvironmentVariable: null,
  scopeVersion: 1,
  updatedAt: new Date('2026-08-22T00:00:00.000Z'),
}

function canonicalScope() {
  return {
    schemaVersion: 'appraise.remote-evaluation-scope/v1',
    target: { id: target.id, fingerprint: target.fingerprint, kind: target.kind },
    environment: {
      ...canonicalRemoteEvaluationEnvironmentBinding(environment, target),
      bindingHash: hash('b'),
    },
    qualityPlan: {
      id: 'plan-1',
      revisionId: 'revision-1',
      revisionContentHash: hash('c'),
      designHash: hash('d'),
    },
    validation: {
      bindingsHash: hash('e'),
      validationSet: [
        {
          validationVersionId: 'validation-1',
          validationIdentity: 'login-entry',
          version: 1,
          canonicalHash: hash('f'),
          canonicalAstHash: hash('0'),
          realizationHash: hash('1'),
        },
      ],
      realizationPreflightHash: hash('2'),
    },
    policies: { runtimePolicyHash: hash('2'), securityPolicyHash: hash('3'), evidencePolicyHash: hash('4') },
    targetContentIdentity: 'not_asserted',
    identityStrength: 'evaluation_scope_only',
  }
}

describe('remote evaluation scope canonical contract', () => {
  it('canonically orders nonempty environment-homogeneous partition requests without idempotency input', () => {
    const request = remoteEvaluationScopePartitionCreateSchema.parse({
      target: target.id,
      qualityPlanId: 'plan-1',
      revisionId: 'revision-1',
      expectedDesignHash: hash('d'),
      partitions: [
        {
          partitionKey: 'second',
          environment: { environmentId: 'environment-2' },
          validationBindings: [
            { validationId: 'validation-2', steps: [{ stepId: 'step', version: '1', description: 'x' }] },
          ],
        },
        {
          partitionKey: 'first',
          environment: { environmentId: 'environment-1' },
          validationBindings: [
            { validationId: 'validation-1', steps: [{ stepId: 'step', version: '1', description: 'x' }] },
          ],
        },
      ],
      idempotencyKey: 'request-key',
    })
    expect(normalizedRemoteScopePartitions(request.partitions).map(item => item.partitionKey)).toEqual([
      'first',
      'second',
    ])
    expect(remoteScopePartitionRequestIdentity(request)).not.toHaveProperty('idempotencyKey')
  })

  it('normalizes the exact HTTPS origin and rejects navigable or credential-bearing URLs', () => {
    expect(canonicalRemoteEvaluationOrigin('https://www.saucedemo.com/')).toBe('https://www.saucedemo.com')
    for (const invalid of [
      'http://www.saucedemo.com',
      'https://user:password@www.saucedemo.com',
      'https://www.saucedemo.com/inventory.html',
      'https://www.saucedemo.com/?next=inventory',
      'https://www.saucedemo.com/#inventory',
      'https://www.saucedemo.com:444',
    ])
      expect(() => canonicalRemoteEvaluationOrigin(invalid)).toThrow(/exact HTTPS origin|valid HTTPS URL/)
  })

  it('binds relevant non-secret environment identity and refuses an origin mismatch', () => {
    expect(canonicalRemoteEvaluationEnvironmentBinding(environment, target)).toEqual({
      id: 'environment-sauce',
      targetProjectId: 'target-sauce',
      name: 'Sauce Demo',
      baseUrl: 'https://www.saucedemo.com',
      expectedPageTitle: 'Swag Labs',
      apiBaseUrl: null,
      username: null,
      hasPassword: false,
      credentialBindingState: 'NONE',
      credentialReference: null,
      scopeVersion: 1,
    })
    expect(() =>
      canonicalRemoteEvaluationEnvironmentBinding({ ...environment, baseUrl: 'https://example.test/' }, target),
    ).toThrow(/exactly match/)
  })

  it('is stable for canonical ordering and changes for every scope constituent', () => {
    const scope = canonicalScope()
    const baseline = remoteEvaluationScopeDigest(scope)
    expect(remoteEvaluationScopeDigest(JSON.parse(JSON.stringify(scope)))).toBe(baseline)

    const changes: Array<(value: ReturnType<typeof canonicalScope>) => void> = [
      value => (value.target.fingerprint = hash('9')),
      value => (value.environment.bindingHash = hash('9')),
      value => (value.qualityPlan.revisionContentHash = hash('9')),
      value => (value.qualityPlan.designHash = hash('9')),
      value => (value.validation.bindingsHash = hash('9')),
      value => (value.validation.validationSet[0]!.validationIdentity = 'changed'),
      value => (value.validation.validationSet[0]!.version = 2),
      value => (value.validation.validationSet[0]!.canonicalHash = hash('9')),
      value => (value.validation.validationSet[0]!.canonicalAstHash = hash('9')),
      value => (value.validation.validationSet[0]!.realizationHash = hash('9')),
      value => (value.validation.realizationPreflightHash = hash('9')),
      value => (value.policies.runtimePolicyHash = hash('9')),
      value => (value.policies.securityPolicyHash = hash('9')),
      value => (value.policies.evidencePolicyHash = hash('9')),
      value => (value.targetContentIdentity = 'changed' as never),
      value => (value.identityStrength = 'changed' as never),
    ]
    for (const change of changes) {
      const changed = canonicalScope()
      change(changed)
      expect(remoteEvaluationScopeDigest(changed)).not.toBe(baseline)
    }
  })
})
