import { describe, expect, it, vi } from 'vitest'

import { registerRepositoryCollaborationOperations } from './domains/repository-collaboration.js'
import type { McpRegistryContext } from './registry.js'

function harness() {
  const handlers = new Map<string, (input: unknown) => Promise<unknown>>()
  const api = {
    collaborationStatus: vi.fn().mockResolvedValue({}),
    collaborationConnect: vi.fn().mockResolvedValue({}),
    collaborationPolicyUpdate: vi.fn().mockResolvedValue({}),
    collaborationPrepare: vi.fn().mockResolvedValue({}),
    collaborationGet: vi.fn().mockResolvedValue({}),
    collaborationDecide: vi.fn().mockResolvedValue({}),
    collaborationExecute: vi.fn().mockResolvedValue({}),
    collaborationUndoPrepare: vi.fn().mockResolvedValue({}),
    collaborationWorkerRegister: vi.fn().mockResolvedValue({}),
    collaborationWorkClaim: vi.fn().mockResolvedValue({}),
    collaborationWorkHeartbeat: vi.fn().mockResolvedValue({}),
    collaborationWorkComplete: vi.fn().mockResolvedValue({}),
    collaborationHandoffRedeem: vi.fn().mockResolvedValue({}),
  }
  registerRepositoryCollaborationOperations({
    server: {
      registerTool: (name: string, _config: unknown, handler: (input: unknown) => Promise<unknown>) =>
        handlers.set(name, handler),
    },
    api,
  } as unknown as McpRegistryContext)
  return { handlers, api }
}

describe('repository collaboration MCP tools', () => {
  it('exposes the complete planned parity surface', () => {
    expect([...harness().handlers.keys()]).toEqual([
      'collaboration_status',
      'collaboration_policy_update',
      'collaboration_decide',
      'collaboration_connect',
      'collaboration_prepare',
      'collaboration_get',
      'collaboration_execute',
      'collaboration_undo_prepare',
      'collaboration_worker_register',
      'collaboration_work_claim',
      'collaboration_work_heartbeat',
      'collaboration_work_complete',
      'collaboration_handoff_redeem',
    ])
  })

  it('forwards only a strict, project-bound execute request', async () => {
    const { handlers, api } = harness()
    const input = {
      target: 'target-1',
      operationId: 'operation-1',
      expectedVersion: 2,
      preparedDigest: `sha256:${'a'.repeat(64)}`,
      idempotencyKey: 'execute-1',
    }
    await handlers.get('collaboration_execute')!(input)
    expect(api.collaborationExecute).toHaveBeenCalledWith(input)
    await expect(handlers.get('collaboration_execute')!({ ...input, repositoryRoot: '/forged' })).rejects.toThrow()
    expect(api.collaborationExecute).toHaveBeenCalledTimes(1)
    await expect(handlers.get('collaboration_execute')!({ ...input, gitStep: 'FETCH' })).rejects.toThrow()
  })

  it('forwards receipt-protected policy and exact decision mutations without placing the receipt in the request body', async () => {
    const { handlers, api } = harness()
    const authorityReceipt = 'a'.repeat(43)
    const policy = {
      target: 'target-1',
      expectedPolicyVersion: 2,
      changes: { INTEGRATE: true },
      authorityReceipt,
    }
    const decision = {
      target: 'target-1',
      operationId: 'operation-1',
      expectedVersion: 2,
      preparedDigest: `sha256:${'b'.repeat(64)}`,
      decisions: [{ recordKey: 'module:one', decision: 'USE_INCOMING' as const }],
      authorityReceipt,
    }
    await handlers.get('collaboration_policy_update')!(policy)
    await handlers.get('collaboration_decide')!(decision)
    expect(api.collaborationPolicyUpdate).toHaveBeenCalledWith(
      { target: 'target-1', expectedPolicyVersion: 2, changes: { INTEGRATE: true } },
      authorityReceipt,
    )
    expect(api.collaborationDecide).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'operation-1', decisions: decision.decisions }),
      authorityReceipt,
    )
    await expect(handlers.get('collaboration_policy_update')!({ ...policy, forged: true })).rejects.toThrow()
    await expect(handlers.get('collaboration_decide')!({ ...decision, authorityReceipt: 'forged' })).rejects.toThrow()
    await expect(
      handlers.get('collaboration_decide')!({ ...decision, reviewDigest: `sha256:${'c'.repeat(64)}` }),
    ).rejects.toThrow()
  })

  it('rejects generic undo preparation and requires the dedicated undo endpoint', async () => {
    const { handlers, api } = harness()
    await expect(
      handlers.get('collaboration_prepare')!({
        target: 'target-1',
        intent: 'UNDO',
        idempotencyKey: 'undo-1',
        expectedPolicyVersion: 1,
      }),
    ).rejects.toThrow()
    expect(api.collaborationPrepare).not.toHaveBeenCalled()
  })

  it('forwards only ticket redemption identifiers, never a caller-provided scope or proposal', async () => {
    const { handlers, api } = harness()
    const input = { target: 'target-1', token: 'ticket-1', redeemedBy: 'interactive-agent' }
    await handlers.get('collaboration_handoff_redeem')!(input)
    expect(api.collaborationHandoffRedeem).toHaveBeenCalledWith(input)
    await expect(
      handlers.get('collaboration_handoff_redeem')!({ ...input, scope: { repositoryRoot: '/forged' } }),
    ).rejects.toThrow()
    await expect(
      handlers.get('collaboration_handoff_redeem')!({ ...input, proposal: { records: [] } }),
    ).rejects.toThrow()
  })
})
