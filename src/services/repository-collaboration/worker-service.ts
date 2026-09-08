import { createHash, randomUUID } from 'node:crypto'

import type { Prisma, PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { canonicalJson, collaborationHash } from '@/lib/repository-collaboration'
import { ServiceError } from '@/services/shared/errors'

import {
  claimCollaborationOperation,
  heartbeatCollaborationOperation,
  recoverExpiredCollaborationLeases,
  submitCollaborationProposal,
  type ClaimedCollaborationWork,
} from './queue-service'

type Transaction = Prisma.TransactionClient
type TrustedProvenance = 'local-ui' | 'authenticated-host'

const trustedProvenances: TrustedProvenance[] = ['local-ui', 'authenticated-host']

export interface RegisterCollaborationWorkerInput {
  bindingId: string
  workerIdentity: string
  capabilities: string[]
  trustedPrincipalId: string
  provenance: TrustedProvenance
  now?: Date
  ttlMs?: number
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function assertTrustedRegistration(input: RegisterCollaborationWorkerInput) {
  if (!trustedProvenances.includes(input.provenance) || !input.trustedPrincipalId.trim()) {
    throw new ServiceError('Worker registration needs authenticated trusted provenance.', 'UNAUTHORIZED', 403)
  }
  if (!input.workerIdentity.trim()) throw new ServiceError('A worker identity is required.', 'VALIDATION', 400)
}

function canonicalCapabilities(capabilities: string[]) {
  const normalized = [...new Set(capabilities.map(capability => capability.trim()).filter(Boolean))].sort()
  if (normalized.length === 0) throw new ServiceError('At least one worker capability is required.', 'VALIDATION', 400)
  return normalized
}

function sessionExpiry(now: Date, ttlMs: number) {
  if (ttlMs < 5_000 || ttlMs > 300_000)
    throw new ServiceError('Worker session duration is out of range.', 'VALIDATION', 400)
  return new Date(now.getTime() + ttlMs)
}

/**
 * Registration records observed capabilities. It never claims that Appraise
 * can start or wake the worker; a connected session must already exist.
 */
export async function registerCollaborationWorker(
  input: RegisterCollaborationWorkerInput,
  client: PrismaClient = prisma,
) {
  assertTrustedRegistration(input)
  const now = input.now ?? new Date()
  const capabilities = canonicalCapabilities(input.capabilities)
  const sessionNonce = randomUUID()
  const capabilitiesJson = canonicalJson(capabilities)
  const expiresAt = sessionExpiry(now, input.ttlMs ?? 30_000)
  return client.$transaction(async transaction => {
    const binding = await transaction.collaborationBinding.findUnique({ where: { id: input.bindingId } })
    if (!binding) throw new ServiceError('Collaboration binding was not found.', 'NOT_FOUND', 404)
    if (!binding.enabled) throw new ServiceError('Collaboration is disabled for this target.', 'UNAUTHORIZED', 403)
    const worker = await transaction.collaborationWorker.upsert({
      where: { bindingId_workerIdentity: { bindingId: input.bindingId, workerIdentity: input.workerIdentity } },
      create: {
        bindingId: input.bindingId,
        workerIdentity: input.workerIdentity,
        capabilitiesJson,
        capabilitiesHash: collaborationHash(capabilities),
        trustedPrincipalId: input.trustedPrincipalId,
        provenance: input.provenance,
        sessionNonceHash: sha256(sessionNonce),
        connectionState: 'CONNECTED',
        registeredAt: now,
        lastHeartbeatAt: now,
        expiresAt,
      },
      update: {
        capabilitiesJson,
        capabilitiesHash: collaborationHash(capabilities),
        trustedPrincipalId: input.trustedPrincipalId,
        provenance: input.provenance,
        sessionNonceHash: sha256(sessionNonce),
        connectionState: 'CONNECTED',
        lastHeartbeatAt: now,
        expiresAt,
      },
    })
    await transaction.collaborationBinding.update({
      where: { id: input.bindingId },
      data: { connectionState: 'CONNECTED', observedCapabilitiesJson: capabilitiesJson, lastObservedAt: now },
    })
    return { worker, sessionNonce }
  })
}

async function registeredWorker(
  transaction: Transaction,
  input: { bindingId: string; workerIdentity: string; sessionNonce: string; now: Date },
) {
  const worker = await transaction.collaborationWorker.findUnique({
    where: { bindingId_workerIdentity: { bindingId: input.bindingId, workerIdentity: input.workerIdentity } },
  })
  if (!worker || worker.connectionState !== 'CONNECTED' || worker.expiresAt <= input.now) {
    throw new ServiceError('Worker is offline or its registration expired.', 'CONFLICT', 409)
  }
  if (worker.sessionNonceHash !== sha256(input.sessionNonce)) {
    throw new ServiceError('Worker session is not authenticated.', 'UNAUTHORIZED', 403)
  }
  return worker
}

export async function claimCollaborationWork(
  input: { bindingId: string; workerIdentity: string; sessionNonce: string; now?: Date; leaseMs?: number },
  client: PrismaClient = prisma,
): Promise<ClaimedCollaborationWork | null> {
  const now = input.now ?? new Date()
  // Reconnect is a recovery boundary: do not strand a previously leased
  // operation merely because no separate scheduler pass happened first.
  await recoverExpiredCollaborationLeases(now, client)
  const worker = await client.$transaction(transaction => registeredWorker(transaction, { ...input, now }))
  const next = await client.collaborationOperation.findFirst({
    where: {
      bindingId: input.bindingId,
      state: { in: ['QUEUED', 'PREPARING', 'WAITING_FOR_AGENT'] },
      nextAttemptAt: { lte: now },
      cancelledAt: null,
    },
    orderBy: { createdAt: 'asc' },
  })
  if (!next) return null
  return claimCollaborationOperation({ operationId: next.id, workerId: worker.id, now, leaseMs: input.leaseMs }, client)
}

export async function heartbeatCollaborationWork(
  input: {
    bindingId: string
    workerIdentity: string
    sessionNonce: string
    operationId: string
    attemptId: string
    fencingToken: number
    leaseToken: string
    now?: Date
    leaseMs?: number
  },
  client: PrismaClient = prisma,
) {
  const now = input.now ?? new Date()
  const worker = await client.$transaction(transaction => registeredWorker(transaction, { ...input, now }))
  return heartbeatCollaborationOperation({ ...input, workerId: worker.id, now }, client)
}

/** Workers can submit only a structured proposal. The central operation flow
 * retains authority to prepare, decide, mutate, and produce receipts. */
export async function completeCollaborationWork(
  input: {
    bindingId: string
    workerIdentity: string
    sessionNonce: string
    operationId: string
    attemptId: string
    fencingToken: number
    leaseToken: string
    proposal: Record<string, unknown>
    now?: Date
  },
  client: PrismaClient = prisma,
) {
  const now = input.now ?? new Date()
  const worker = await client.$transaction(transaction => registeredWorker(transaction, { ...input, now }))
  return submitCollaborationProposal({ ...input, workerId: worker.id, now }, client)
}

export async function createCollaborationHandoffTicket(
  input: { bindingId: string; operationId: string; scope: Record<string, unknown>; now?: Date; ttlMs?: number },
  client: PrismaClient = prisma,
) {
  const now = input.now ?? new Date()
  const ttlMs = input.ttlMs ?? 300_000
  if (ttlMs < 5_000 || ttlMs > 900_000) throw new ServiceError('Ticket duration is out of range.', 'VALIDATION', 400)
  const token = randomUUID()
  return client.$transaction(async transaction => {
    const operation = await transaction.collaborationOperation.findFirst({
      where: { id: input.operationId, bindingId: input.bindingId },
    })
    if (!operation || operation.cancelledAt || ['COMPLETED', 'CANCELLED', 'SUPERSEDED'].includes(operation.state)) {
      throw new ServiceError('A handoff ticket requires a pending operation.', 'CONFLICT', 409)
    }
    await transaction.collaborationHandoffTicket.updateMany({
      where: { operationId: input.operationId, redeemedAt: null, invalidatedAt: null },
      data: { invalidatedAt: now, invalidationReason: 'REPLACED' },
    })
    const ticket = await transaction.collaborationHandoffTicket.create({
      data: {
        bindingId: input.bindingId,
        operationId: input.operationId,
        tokenHash: sha256(token),
        scopeJson: canonicalJson(input.scope),
        expiresAt: new Date(now.getTime() + ttlMs),
      },
    })
    return { ticket, token }
  })
}

export async function redeemCollaborationHandoffTicket(
  input: { token: string; redeemedBy: string; now?: Date },
  client: PrismaClient = prisma,
) {
  if (!input.redeemedBy.trim()) throw new ServiceError('A redeeming worker identity is required.', 'VALIDATION', 400)
  const now = input.now ?? new Date()
  return client.$transaction(async transaction => {
    const ticket = await transaction.collaborationHandoffTicket.findUnique({
      where: { tokenHash: sha256(input.token) },
    })
    if (!ticket || ticket.redeemedAt || ticket.invalidatedAt || ticket.expiresAt <= now) {
      throw new ServiceError('Handoff ticket is invalid, expired, or already redeemed.', 'CONFLICT', 409)
    }
    const operation = await transaction.collaborationOperation.findFirst({
      where: { id: ticket.operationId, bindingId: ticket.bindingId },
    })
    if (!operation || operation.cancelledAt || ['COMPLETED', 'CANCELLED', 'SUPERSEDED'].includes(operation.state)) {
      throw new ServiceError('Handoff ticket no longer names pending work.', 'CONFLICT', 409)
    }
    const redeemed = await transaction.collaborationHandoffTicket.update({
      where: { id: ticket.id },
      data: { redeemedAt: now, redeemedBy: input.redeemedBy },
    })
    return {
      ticket: redeemed,
      scope: JSON.parse(redeemed.scopeJson) as Record<string, unknown>,
      operationId: operation.id,
    }
  })
}

export async function getCollaborationConnectionMode(
  bindingId: string,
  now: Date = new Date(),
  client: PrismaClient = prisma,
) {
  const [binding, activeWorker] = await Promise.all([
    client.collaborationBinding.findUnique({ where: { id: bindingId } }),
    client.collaborationWorker.findFirst({
      where: { bindingId, connectionState: 'CONNECTED', expiresAt: { gt: now } },
    }),
  ])
  if (!binding) throw new ServiceError('Collaboration binding was not found.', 'NOT_FOUND', 404)
  return {
    connectionState: activeWorker ? 'CONNECTED' : 'OFFLINE',
    workerAvailable: Boolean(activeWorker),
    nativeWakeSupported: false,
    interactiveFallback: 'PREPARED_HANDOFF_TICKET',
  } as const
}
