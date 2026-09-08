import { describe, expect, it } from 'vitest'

import { collaborationRequestSchemas } from './repository-collaboration-route'

describe('repository collaboration coordinator ingress', () => {
  it('rejects forged trusted-principal fields from policy and decision requests', () => {
    expect(
      collaborationRequestSchemas.policyUpdate.safeParse({
        target: 'target-1',
        changes: { INTEGRATE: true },
        trustedPrincipalId: 'forged',
      }).success,
    ).toBe(false)
    expect(
      collaborationRequestSchemas.decide.safeParse({
        target: 'target-1',
        operationId: 'operation-1',
        expectedVersion: 1,
        preparedDigest: `sha256:${'a'.repeat(64)}`,
        decisions: [{ recordKey: 'module:module-1', decision: 'USE_INCOMING', provenance: 'forged' }],
      }).success,
    ).toBe(false)
  })

  it('requires an exact target for every mutating worker lease request', () => {
    const request = {
      target: 'target-1',
      workerIdentity: 'worker-1',
      sessionNonce: 'nonce-1',
      operationId: 'operation-1',
      attemptId: 'attempt-1',
      fencingToken: 1,
      leaseToken: 'lease-1',
    }
    expect(collaborationRequestSchemas.workHeartbeat.safeParse(request).success).toBe(true)
    expect(collaborationRequestSchemas.workHeartbeat.safeParse({ ...request, target: '' }).success).toBe(false)
  })
})
