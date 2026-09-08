import { createHash, randomUUID } from 'node:crypto'

import type { Prisma, PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  canonicalJson,
  collaborationHash,
  collaborationRecordSchema,
  type CollaborationRecord,
} from '@/lib/repository-collaboration'
import { ServiceError } from '@/services/shared/errors'

import {
  claimCollaborationOperation,
  heartbeatCollaborationOperation,
  recoverExpiredCollaborationLeases,
  runCollaborationSchedulerTick,
  assertCollaborationProposalAttempt,
  type ClaimedCollaborationWork,
} from './queue-service'
import { proposeDivergentCollaborationReconciliation } from './divergent-reconciliation-service'

type Transaction = Prisma.TransactionClient
type TrustedProvenance = 'local-ui' | 'authenticated-host'
type WorkerCapability = 'proposal'
type WorkerRegistrationReconciler = (input: { now: Date }, client: PrismaClient) => Promise<unknown>

export type SanitizedCollaborationAssignment = {
  schema: 'appraise.repository-collaboration.worker-assignment/v1'
  operationId: string
  intent: 'RECONCILE'
  preparedDigest: string
  sourceRevision: string
  targetRevision: string
  records: CollaborationRecord[]
  output: { schema: 'appraise.repository-collaboration.divergent-proposal/v1'; required: ['records'] }
  constraints: readonly ['COLLABORATION_RECORDS_ONLY', 'NO_GIT_OR_DATABASE_MUTATIONS', 'WHOLE_RECORD_PROPOSAL']
}

const trustedProvenances: TrustedProvenance[] = ['local-ui', 'authenticated-host']
const allowedWorkerCapabilities = new Set<WorkerCapability>(['proposal'])

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
  if (
    normalized.some(
      (capability): capability is string => !allowedWorkerCapabilities.has(capability as WorkerCapability),
    )
  ) {
    throw new ServiceError('Worker registration includes an unsupported capability.', 'VALIDATION', 400)
  }
  return normalized
}

function requiredCapabilitiesForOperation(): readonly WorkerCapability[] {
  // All claimable worker work is a proposal-only handoff. In particular,
  // RECONCILE cannot be claimed by a session without proposal authority.
  return ['proposal']
}

function workerCapabilities(worker: { capabilitiesJson: string }): WorkerCapability[] {
  try {
    const parsed = JSON.parse(worker.capabilitiesJson) as unknown
    if (!Array.isArray(parsed) || parsed.some(capability => typeof capability !== 'string')) throw new Error()
    const capabilities = parsed.map(capability => capability.trim())
    if (capabilities.some(capability => !allowedWorkerCapabilities.has(capability as WorkerCapability)))
      throw new Error()
    return capabilities as WorkerCapability[]
  } catch {
    throw new ServiceError('Worker registration has invalid capabilities.', 'UNAUTHORIZED', 403)
  }
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
  reconcile: WorkerRegistrationReconciler = ({ now }, reconciliationClient) =>
    runCollaborationSchedulerTick({ now }, reconciliationClient),
) {
  assertTrustedRegistration(input)
  const now = input.now ?? new Date()
  const capabilities = canonicalCapabilities(input.capabilities)
  const sessionNonce = randomUUID()
  const capabilitiesJson = canonicalJson(capabilities)
  const expiresAt = sessionExpiry(now, input.ttlMs ?? 30_000)
  const registration = await client.$transaction(async transaction => {
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
  await reconcile({ now }, client)
  return registration
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

function assertWorkerCanClaimProposal(worker: { capabilitiesJson: string }) {
  const capabilities = new Set(workerCapabilities(worker))
  const missing = requiredCapabilitiesForOperation().filter(capability => !capabilities.has(capability))
  if (missing.length) {
    throw new ServiceError(
      `Worker lacks required collaboration capability: ${missing.join(', ')}.`,
      'UNAUTHORIZED',
      403,
    )
  }
}

function sanitizedAssignment(operation: {
  id: string
  intent: string
  preparedDigest: string | null
  sourceRevision: string | null
  targetRevision: string | null
  preparedJson: string | null
}): SanitizedCollaborationAssignment {
  if (
    operation.intent !== 'RECONCILE' ||
    !operation.preparedDigest ||
    !operation.sourceRevision ||
    !operation.targetRevision
  )
    throw new ServiceError('Claimed work has no durable reconciliation assignment.', 'CONFLICT', 409)
  let prepared: { incoming?: unknown[] }
  try {
    prepared = JSON.parse(operation.preparedJson ?? '{}') as typeof prepared
  } catch {
    throw new ServiceError('Claimed work has invalid prepared records.', 'CONFLICT', 409)
  }
  if (!Array.isArray(prepared.incoming))
    throw new ServiceError('Claimed work has no prepared records.', 'CONFLICT', 409)
  return {
    schema: 'appraise.repository-collaboration.worker-assignment/v1',
    operationId: operation.id,
    intent: 'RECONCILE',
    preparedDigest: `sha256:${operation.preparedDigest}`,
    sourceRevision: operation.sourceRevision,
    targetRevision: operation.targetRevision,
    records: prepared.incoming.map(record => collaborationRecordSchema.parse(record)),
    output: { schema: 'appraise.repository-collaboration.divergent-proposal/v1', required: ['records'] },
    constraints: ['COLLABORATION_RECORDS_ONLY', 'NO_GIT_OR_DATABASE_MUTATIONS', 'WHOLE_RECORD_PROPOSAL'],
  }
}

export async function getSanitizedCollaborationAssignment(
  input: { bindingId: string; operationId: string },
  client: PrismaClient = prisma,
) {
  const operation = await client.collaborationOperation.findFirst({
    where: { id: input.operationId, bindingId: input.bindingId, intent: 'RECONCILE' },
  })
  if (!operation) throw new ServiceError('The handoff operation is unavailable.', 'NOT_FOUND', 404)
  const preparation = await client.collaborationOperationArtifact.findFirst({
    where: { operationId: operation.id, kind: 'DIVERGENT_PREPARATION' },
  })
  if (!preparation) throw new ServiceError('The handoff operation is not durably prepared.', 'CONFLICT', 409)
  return sanitizedAssignment(operation)
}

export async function claimCollaborationWork(
  input: { bindingId: string; workerIdentity: string; sessionNonce: string; now?: Date; leaseMs?: number },
  client: PrismaClient = prisma,
): Promise<(ClaimedCollaborationWork & { assignment: SanitizedCollaborationAssignment }) | null> {
  const now = input.now ?? new Date()
  // Reconnect is a recovery boundary: do not strand a previously leased
  // operation merely because no separate scheduler pass happened first.
  await recoverExpiredCollaborationLeases(now, client)
  const worker = await client.$transaction(transaction => registeredWorker(transaction, { ...input, now }))
  const next = await client.collaborationOperation.findFirst({
    where: {
      bindingId: input.bindingId,
      state: { in: ['QUEUED'] },
      intent: 'RECONCILE',
      artifacts: { some: { kind: 'DIVERGENT_PREPARATION' } },
      nextAttemptAt: { lte: now },
      cancelledAt: null,
    },
    orderBy: { createdAt: 'asc' },
  })
  if (!next) return null
  assertWorkerCanClaimProposal(worker)
  const claim = await claimCollaborationOperation(
    { operationId: next.id, workerId: worker.id, now, leaseMs: input.leaseMs },
    client,
  )
  const operation = await client.collaborationOperation.findUnique({ where: { id: claim.operationId } })
  if (!operation) throw new ServiceError('Claimed work is unavailable.', 'CONFLICT', 409)
  return {
    ...claim,
    assignment: sanitizedAssignment(operation),
  }
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
    proposal: { records?: unknown }
    now?: Date
  },
  client: PrismaClient = prisma,
) {
  const now = input.now ?? new Date()
  const worker = await client.$transaction(transaction => registeredWorker(transaction, { ...input, now }))
  if (!input.proposal || Object.keys(input.proposal).length !== 1 || !Array.isArray(input.proposal.records))
    throw new ServiceError('A worker proposal must contain exactly one complete records array.', 'VALIDATION', 400)
  await assertCollaborationProposalAttempt({ ...input, workerId: worker.id, now }, client)
  const operation = await client.collaborationOperation.findUnique({ where: { id: input.operationId } })
  if (!operation?.preparedDigest) throw new ServiceError('Claimed work has no prepared digest.', 'CONFLICT', 409)
  const result = await proposeDivergentCollaborationReconciliation(
    {
      operationId: input.operationId,
      expectedVersion: operation.version,
      preparedDigest: operation.preparedDigest,
      records: input.proposal.records.map(record => collaborationRecordSchema.parse(record)),
    },
    client,
  )
  await client.collaborationAttempt.updateMany({
    where: { id: input.attemptId, operationId: input.operationId, workerId: worker.id, state: 'RUNNING' },
    data: {
      state: 'PROPOSAL_SUBMITTED',
      resultJson: canonicalJson({ reviewDigest: result.review.reviewDigest }),
      completedAt: now,
    },
  })
  return client.collaborationOperation.findUniqueOrThrow({ where: { id: input.operationId } })
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
