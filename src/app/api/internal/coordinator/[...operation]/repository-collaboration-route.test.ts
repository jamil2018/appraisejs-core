import { describe, expect, it, vi } from 'vitest'

import { ServiceError } from '@/services/shared/errors'

const mocks = vi.hoisted(() => ({
  bindingFind: vi.fn(),
  guard: vi.fn(),
  prepare: vi.fn(),
  readJson: vi.fn(),
  targetResolve: vi.fn(),
}))

vi.mock('@/config/db-config', () => ({
  default: { collaborationBinding: { findUnique: mocks.bindingFind } },
}))

vi.mock('@/services/target-project/target-project-service', () => ({ resolveTargetProject: mocks.targetResolve }))

vi.mock('@/lib/coordinator-api/request-guard', () => ({
  guardCoordinatorRequest: mocks.guard,
  readCoordinatorJson: mocks.readJson,
}))

vi.mock('@/services/repository-collaboration/operation-service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/repository-collaboration/operation-service')>()),
  prepareCollaborationOperation: mocks.prepare,
}))

import { collaborationRequestSchemas, publicCollaborationHashes } from './repository-collaboration-route'
import { POST } from './route'

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

  it('does not expose a bearer-only divergent proposal endpoint', () => {
    expect('resolutionPropose' in collaborationRequestSchemas).toBe(false)
  })

  it('marks a malformed RECEIVE dependency graph after a durable fetch reference as unknown', async () => {
    const requestBody = {
      target: 'target-1',
      intent: 'RECEIVE',
      idempotencyKey: 'receive-1',
      expectedPolicyVersion: 1,
    }
    mocks.guard.mockResolvedValue(undefined)
    mocks.readJson.mockResolvedValue(requestBody)
    mocks.targetResolve.mockResolvedValue({ id: 'target-project-1' })
    mocks.bindingFind.mockResolvedValue({ id: 'binding-1' })
    mocks.prepare.mockImplementation(
      async (_input: unknown, _client: unknown, hooks: { onExternalEffectStarted?: (operationId: string) => void }) => {
        hooks.onExternalEffectStarted?.('receive-operation-1')
        throw new ServiceError('The fetched source snapshot has an invalid dependency graph.', 'VALIDATION', 400)
      },
    )
    const response = await POST(
      new Request('http://localhost/internal/coordinator/collaboration/prepare', { method: 'POST' }),
      {
        params: Promise.resolve({ operation: ['collaboration', 'prepare'] }),
      },
    )
    await expect(response.json()).resolves.toMatchObject({
      code: 'VALIDATION',
      operationOutcome: 'unknown',
      targetOutcome: 'not_evaluated',
      retry: {
        safe: true,
        strategy: 'read_state_then_retry',
        nextAction: {
          tool: 'collaboration_get',
          arguments: { target: 'target-1', operationId: 'receive-operation-1' },
        },
      },
    })
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
