import { createHash } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  agentPreflightReceiptInputSchema,
  agentPreflightSchema,
  type AgentPreflightReceiptSummary,
} from '@/lib/agent-preflight/contracts'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { ServiceError } from '@/services/shared/errors'

function snapshotHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
}

function receiptSummary(receipt: {
  id: string
  coordinatorId: string
  status: string
  ready: boolean
  snapshotHash: string
  snapshotJson: string
  targetProjectId: string | null
  observedAt: Date
  mcpSurfaceVersion: string
  mcpServerStartedAt: Date
}): AgentPreflightReceiptSummary {
  return {
    id: receipt.id,
    coordinatorId: receipt.coordinatorId,
    status: agentPreflightSchema.shape.status.parse(receipt.status),
    ready: receipt.ready,
    snapshotHash: receipt.snapshotHash,
    targetProjectId: receipt.targetProjectId,
    observedAt: receipt.observedAt,
    mcpSurfaceVersion: receipt.mcpSurfaceVersion,
    mcpServerStartedAt: receipt.mcpServerStartedAt,
    preflight: agentPreflightSchema.parse(JSON.parse(receipt.snapshotJson)),
  }
}

export async function recordAgentPreflightReceipt(
  input: unknown,
  client: PrismaClient = prisma,
): Promise<AgentPreflightReceiptSummary> {
  const value = agentPreflightReceiptInputSchema.parse(input)
  const expectedCanonicalPath = value.expectedTargetWorkspacePath?.trim()
  const preflightExpected = value.preflight.layers.targetProjectBinding.expectedCanonicalPath
  if (expectedCanonicalPath !== preflightExpected) {
    throw new ServiceError('Agent preflight target binding does not match its receipt request.', 'CONFLICT')
  }

  const targetProject = expectedCanonicalPath
    ? await client.targetProject.findFirst({
        where: { canonicalPath: expectedCanonicalPath, kind: 'LOCAL_WORKSPACE' },
        select: { id: true },
      })
    : null
  if (value.preflight.layers.targetProjectBinding.matchedScope === 'target' && !targetProject) {
    throw new ServiceError('Agent preflight references a target project that is not registered.', 'CONFLICT')
  }

  const snapshotJson = canonicalContractJson(value.preflight)
  const hash = snapshotHash({
    coordinatorId: value.coordinatorId,
    expectedCanonicalPath,
    preflight: value.preflight,
    capabilities: value.capabilities,
  })
  const receipt = await client.agentPreflightReceipt.upsert({
    where: { coordinatorId_snapshotHash: { coordinatorId: value.coordinatorId, snapshotHash: hash } },
    create: {
      coordinatorId: value.coordinatorId,
      schemaVersion: value.preflight.schemaVersion,
      status: value.preflight.status,
      ready: value.preflight.ready,
      snapshotHash: hash,
      snapshotJson,
      expectedCanonicalPath,
      targetProjectId: targetProject?.id,
      mcpSurfaceVersion: value.capabilities.mcpSurfaceVersion,
      mcpServerStartedAt: new Date(value.capabilities.serverStartedAt),
    },
    update: {},
  })
  return receiptSummary(receipt)
}

export async function listLatestAgentPreflightReceipts(
  targetProjectIds: string[],
  client: PrismaClient = prisma,
): Promise<Record<string, AgentPreflightReceiptSummary>> {
  if (targetProjectIds.length === 0) return {}
  const receipts = await Promise.all(
    targetProjectIds.map(targetProjectId =>
      client.agentPreflightReceipt.findFirst({
        where: { targetProjectId },
        orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
      }),
    ),
  )
  const latest: Record<string, AgentPreflightReceiptSummary> = {}
  for (const receipt of receipts) {
    if (receipt?.targetProjectId) latest[receipt.targetProjectId] = receiptSummary(receipt)
  }
  return latest
}
