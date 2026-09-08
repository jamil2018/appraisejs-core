import { describe, expect, it } from 'vitest'

import { collaborationRequestSchemas, publicCollaborationHashes } from './repository-collaboration-route'

describe('repository collaboration coordinator ingress', () => {
  it('rejects forged trusted-principal fields from policy and decision requests', () => {
    expect(
      collaborationRequestSchemas.policyUpdate.safeParse({
        target: 'target-1',
        expectedPolicyVersion: 1,
        changes: { INTEGRATE: true },
        trustedPrincipalId: 'forged',
      }).success,
    ).toBe(false)
    expect(
      collaborationRequestSchemas.policyUpdate.safeParse({ target: 'target-1', changes: { INTEGRATE: true } }).success,
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

  it('rejects UNDO on generic prepare because undo has its own guarded endpoint', () => {
    expect(
      collaborationRequestSchemas.prepare.safeParse({
        target: 'target-1',
        intent: 'UNDO',
        idempotencyKey: 'undo-1',
        expectedPolicyVersion: 1,
      }).success,
    ).toBe(false)
  })

  it('prefixes every public collaboration digest and hash exactly once', () => {
    const bare = 'a'.repeat(64)
    expect(
      publicCollaborationHashes({
        receiptHash: bare,
        resolutionDigest: `sha256:${bare}`,
        review: {
          sourceSnapshotHash: bare,
          proposalDigest: bare,
          reviewDigest: bare,
          databaseReviewDigest: bare,
        },
        scope: { handoffDigest: bare },
      }),
    ).toEqual({
      receiptHash: `sha256:${bare}`,
      resolutionDigest: `sha256:${bare}`,
      review: {
        sourceSnapshotHash: `sha256:${bare}`,
        proposalDigest: `sha256:${bare}`,
        reviewDigest: `sha256:${bare}`,
        databaseReviewDigest: `sha256:${bare}`,
      },
      scope: { handoffDigest: `sha256:${bare}` },
    })
  })
})
