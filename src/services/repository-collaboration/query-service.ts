import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { ServiceError } from '@/services/shared/errors'

import { runCollaborationSchedulerTick } from './queue-service'

function preparedSummary(preparedJson: string | null) {
  if (!preparedJson) return { changeCount: 0, decisionCount: 0, reviewItems: [] }
  const value = JSON.parse(preparedJson) as {
    prepared?: Array<{ recordKey?: string; disposition?: string; requiresDecision?: boolean }>
  }
  const prepared = Array.isArray(value.prepared) ? value.prepared : []
  return {
    changeCount: prepared.length,
    decisionCount: prepared.filter(record => record.requiresDecision).length,
    reviewItems: prepared
      .filter(record => record.requiresDecision && record.recordKey)
      .map(record => ({ recordKey: record.recordKey!, disposition: record.disposition ?? 'CONFLICT' })),
  }
}

export async function getCollaborationStatus(
  targetProjectId: string,
  client: PrismaClient = prisma,
  options: { now?: Date; observeRemote?: (bindingId: string) => Promise<void> } = {},
) {
  const now = options.now ?? new Date()
  await runCollaborationSchedulerTick({ now, observeRemote: options.observeRemote }, client)
  const binding = await client.collaborationBinding.findUnique({
    where: { targetProjectId },
    include: {
      policyGrants: { where: { revokedAt: null }, orderBy: { permission: 'asc' } },
      operations: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { decisions: { select: { recordKey: true, kind: true, createdAt: true } } },
      },
      notifications: { where: { readAt: null }, orderBy: { createdAt: 'desc' }, take: 20 },
      workers: {
        where: { connectionState: 'CONNECTED', expiresAt: { gt: now } },
        orderBy: { lastHeartbeatAt: 'desc' },
        select: { workerIdentity: true, capabilitiesJson: true, lastHeartbeatAt: true, expiresAt: true },
      },
    },
  })
  if (!binding) return null
  return {
    id: binding.id,
    portableProjectId: binding.portableProjectId,
    remoteName: binding.remoteName,
    trackedBranch: binding.trackedBranch,
    enabled: binding.enabled,
    policyVersion: binding.policyVersion,
    connectionState: binding.connectionState,
    connection: {
      mode: binding.workers.length ? 'CONNECTED_WORKER' : 'INTERACTIVE_HANDOFF',
      workerAvailable: binding.workers.length > 0,
      nativeWakeSupported: false,
      observedCapabilities: (() => {
        try {
          const parsed = JSON.parse(binding.observedCapabilitiesJson) as unknown
          return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
        } catch {
          return []
        }
      })(),
      workers: binding.workers.map(worker => ({
        identity: worker.workerIdentity,
        capabilities: JSON.parse(worker.capabilitiesJson) as string[],
        lastHeartbeatAt: worker.lastHeartbeatAt,
        expiresAt: worker.expiresAt,
      })),
    },
    lastObservedAt: binding.lastObservedAt,
    lastRemoteCheckAt: binding.lastRemoteCheckAt,
    grants: binding.policyGrants.map(grant => ({ permission: grant.permission, enabled: grant.enabled })),
    operations: binding.operations.map(operation => ({
      id: operation.id,
      intent: operation.intent,
      trigger: operation.trigger,
      state: operation.state,
      version: operation.version,
      idempotencyKey: operation.idempotencyKey,
      sourceRevision: operation.sourceRevision,
      targetRevision: operation.targetRevision,
      preparedDigest: operation.preparedDigest,
      acceptedDigest: operation.acceptedDigest,
      blocker: operation.blockerJson ? (JSON.parse(operation.blockerJson) as unknown) : null,
      receiptHash: operation.receiptHash,
      createdAt: operation.createdAt,
      updatedAt: operation.updatedAt,
      completedAt: operation.completedAt,
      decisions: operation.decisions,
      ...preparedSummary(operation.preparedJson),
    })),
    notifications: binding.notifications.map(notification => ({
      id: notification.id,
      operationId: notification.operationId,
      kind: notification.kind,
      message: notification.message,
      actionable: notification.actionable,
      createdAt: notification.createdAt,
    })),
  }
}

export async function requireCollaborationOperationForProject(
  operationId: string,
  targetProjectId: string,
  client: PrismaClient = prisma,
) {
  const operation = await client.collaborationOperation.findFirst({
    where: { id: operationId, binding: { targetProjectId } },
    include: {
      decisions: true,
      journalEntries: { orderBy: { sequence: 'asc' } },
      steps: { orderBy: { ordinal: 'asc' } },
    },
  })
  if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  return operation
}
