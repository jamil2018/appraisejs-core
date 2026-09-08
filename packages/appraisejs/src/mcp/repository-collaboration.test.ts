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
    collaborationResolutionPropose: vi.fn().mockResolvedValue({}),
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
      'collaboration_connect',
      'collaboration_policy_update',
      'collaboration_prepare',
      'collaboration_get',
      'collaboration_resolution_propose',
      'collaboration_decide',
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

  it('does not accept client-supplied trusted principal or decision provenance', async () => {
    const { handlers, api } = harness()
    const input = {
      target: 'target-1',
      operationId: 'operation-1',
      expectedVersion: 2,
      preparedDigest: `sha256:${'a'.repeat(64)}`,
      decisions: [{ recordKey: 'module:module-1', decision: 'USE_INCOMING' }],
      trustedPrincipalId: 'forged-user',
      provenance: 'local-ui',
    }
    await expect(handlers.get('collaboration_decide')!(input)).rejects.toThrow()
    expect(api.collaborationDecide).not.toHaveBeenCalled()
  })
})
