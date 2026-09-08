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

  it('refuses caller-supplied repository records and revisions for Git-backed receive', () => {
    const base = {
      target: 'target-1',
      intent: 'RECEIVE' as const,
      idempotencyKey: 'prepare-1',
      expectedPolicyVersion: 1,
    }
    expect(
      collaborationRequestSchemas.prepare.safeParse({
        ...base,
        incomingRecords: Array.from({ length: 1 }, () => ({})),
      }).success,
    ).toBe(false)
    expect(
      collaborationRequestSchemas.prepare.safeParse({
        ...base,
        sourceRevision: 'forged',
      }).success,
    ).toBe(false)
  })
})
