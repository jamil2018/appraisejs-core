import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import type { AgentPreflightReceiptInput } from '@/lib/agent-preflight/contracts'

import { listLatestAgentPreflightReceipts, recordAgentPreflightReceipt } from './agent-preflight-service'

function readyInput(): AgentPreflightReceiptInput {
  return {
    coordinatorId: 'codex-task',
    expectedTargetWorkspacePath: '/targets/notes',
    capabilities: {
      mcpSurfaceVersion: '2026-07-18.unified-agent-preflight',
      mcpContractHash: `sha256:${'a'.repeat(64)}`,
      serverStartedAt: '2026-07-18T03:00:00.000Z',
    },
    preflight: {
      schemaVersion: 'appraise.agent-preflight/v1',
      status: 'ready',
      ready: true,
      layers: {
        applicationAndIdentity: { status: 'ready', checks: [{ id: 'application', status: 'ok' }] },
        activeMcpTransport: {
          status: 'ready',
          message: 'The MCP request reached this server.',
          serverStartedAt: '2026-07-18T03:00:00.000Z',
          mcpSurfaceVersion: '2026-07-18.unified-agent-preflight',
          mcpContractHash: `sha256:${'a'.repeat(64)}`,
        },
        contractCompatibility: {
          status: 'ready',
          expected: {
            mcpSurfaceVersion: '2026-07-18.unified-agent-preflight',
            mcpContractHash: `sha256:${'a'.repeat(64)}`,
          },
          observed: {
            mcpSurfaceVersion: '2026-07-18.unified-agent-preflight',
            mcpContractHash: `sha256:${'a'.repeat(64)}`,
          },
          message: 'The MCP contract matches.',
          reconnect: { required: false },
        },
        currentTaskCapabilities: {
          status: 'ready',
          tools: { status: 'ready', missing: [] },
          resources: { status: 'ready', missing: [] },
          message: 'All sentinels are visible.',
        },
        targetProjectBinding: {
          status: 'ready',
          expectedCanonicalPath: '/targets/notes',
          matchedScope: 'target',
          message: 'The target is registered.',
        },
      },
    },
  }
}

function storedReceipt(input = readyInput(), id = 'receipt-1') {
  return {
    id,
    coordinatorId: input.coordinatorId,
    schemaVersion: input.preflight.schemaVersion,
    status: input.preflight.status,
    ready: input.preflight.ready,
    snapshotHash: 'sha256:receipt',
    snapshotJson: JSON.stringify(input.preflight),
    expectedCanonicalPath: input.expectedTargetWorkspacePath ?? null,
    targetProjectId: 'target-1',
    mcpSurfaceVersion: input.capabilities.mcpSurfaceVersion,
    mcpServerStartedAt: new Date(input.capabilities.serverStartedAt),
    observedAt: new Date('2026-07-18T03:01:00.000Z'),
    createdAt: new Date('2026-07-18T03:01:00.000Z'),
  }
}

describe('agent preflight receipts', () => {
  it('persists an idempotent, target-scoped receipt for UI presentation', async () => {
    const input = readyInput()
    const upsert = vi.fn().mockImplementation(({ create }) => storedReceipt(input, create.id))
    const client = {
      targetProject: { findFirst: vi.fn().mockResolvedValue({ id: 'target-1' }) },
      agentPreflightReceipt: { upsert },
    } as unknown as PrismaClient

    const receipt = await recordAgentPreflightReceipt(input, client)

    expect(receipt).toMatchObject({ status: 'ready', ready: true, targetProjectId: 'target-1' })
    expect(client.targetProject.findFirst).toHaveBeenCalledWith({
      where: { canonicalPath: '/targets/notes', kind: 'LOCAL_WORKSPACE' },
      select: { id: true },
    })
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ targetProjectId: 'target-1', expectedCanonicalPath: '/targets/notes' }),
        update: {},
      }),
    )
  })

  it('rejects a receipt whose claimed binding differs from the request', async () => {
    const input = readyInput()
    input.expectedTargetWorkspacePath = '/targets/other'

    await expect(recordAgentPreflightReceipt(input, {} as PrismaClient)).rejects.toThrow(
      'target binding does not match',
    )
  })

  it('hydrates presentation-only fields omitted by an otherwise valid preflight producer', async () => {
    const input = readyInput()
    const legacy = structuredClone(input) as unknown as Record<string, unknown>
    const layers = (legacy.preflight as { layers: Record<string, Record<string, unknown>> }).layers
    delete layers.applicationAndIdentity.checks
    delete layers.activeMcpTransport.message
    delete layers.activeMcpTransport.mcpContractHash
    delete layers.contractCompatibility
    delete layers.currentTaskCapabilities.message
    delete layers.targetProjectBinding.message
    const upsert = vi.fn().mockImplementation(({ create }) => ({ ...storedReceipt(input), ...create }))
    const client = {
      targetProject: { findFirst: vi.fn().mockResolvedValue({ id: 'target-1' }) },
      agentPreflightReceipt: { upsert },
    } as unknown as PrismaClient

    const receipt = await recordAgentPreflightReceipt(legacy, client)

    expect(receipt.preflight.layers.applicationAndIdentity.checks).toEqual([])
    expect(receipt.preflight.layers.activeMcpTransport.message).toBeTruthy()
  })

  it('projects only the latest receipt for each requested project', async () => {
    const latest = storedReceipt(readyInput(), 'latest')
    const older = {
      ...latest,
      id: 'older',
      targetProjectId: 'target-2',
      observedAt: new Date('2026-07-18T02:00:00.000Z'),
    }
    const client = {
      agentPreflightReceipt: { findFirst: vi.fn().mockResolvedValueOnce(latest).mockResolvedValueOnce(older) },
    } as unknown as PrismaClient

    await expect(listLatestAgentPreflightReceipts(['target-1', 'target-2'], client)).resolves.toMatchObject({
      'target-1': { id: 'latest' },
      'target-2': { id: 'older' },
    })
  })
})
