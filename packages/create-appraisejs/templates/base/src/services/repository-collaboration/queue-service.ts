import { createHash, randomUUID } from 'node:crypto'

import type { CollaborationOperationIntent, CollaborationOperationState, Prisma, PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { canonicalJson } from '@/lib/repository-collaboration'
import { ServiceError } from '@/services/shared/errors'

import { requireCollaborationPermission } from './binding-service'
import { getCollaborationGitStatus } from './git-operation-service'

type Transaction = Prisma.TransactionClient
type Clock = Date

const queuedKey = 'PENDING'
const terminalStates: CollaborationOperationState[] = ['COMPLETED', 'FAILED', 'CANCELLED', 'SUPERSEDED']
const leaseableStates: CollaborationOperationState[] = ['QUEUED', 'PREPARING']

export interface ScheduleCollaborationOperationInput {
  bindingId: string
  intent: CollaborationOperationIntent
  idempotencyKey: string
  trigger: string
  policyVersion: number
  sourceRevision?: string
  targetRevision?: string
  sourceSnapshotHash?: string
  now?: Clock
  debounceMs?: number
}

export interface ClaimedCollaborationWork {
  operationId: string
  attemptId: string
  attemptNumber: number
  fencingToken: number
  leaseToken: string
  leaseExpiresAt: Date
}

function tokenHash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function nextAttemptNumber(attempt: { attemptNumber: number } | null) {
  return (attempt?.attemptNumber ?? 0) + 1
}

function isTerminal(state: CollaborationOperationState) {
  return terminalStates.includes(state)
}

function isLeaseable(state: CollaborationOperationState) {
  return leaseableStates.includes(state)
}

function assertQueueInput(input: ScheduleCollaborationOperationInput) {
  if (!input.idempotencyKey.trim() || !input.trigger.trim()) {
    throw new ServiceError('A trigger and idempotency key are required.', 'VALIDATION', 400)
  }
}

async function bindingForSchedule(transaction: Transaction, input: ScheduleCollaborationOperationInput) {
  const binding = await transaction.collaborationBinding.findUnique({ where: { id: input.bindingId } })
  if (!binding) throw new ServiceError('Collaboration binding was not found.', 'NOT_FOUND', 404)
  if (!binding.enabled) throw new ServiceError('Collaboration is disabled for this target.', 'UNAUTHORIZED', 403)
  if (binding.policyVersion !== input.policyVersion) {
    throw new ServiceError('Collaboration policy changed before scheduling.', 'CONFLICT', 409)
  }
  return binding
}

function queueData(input: ScheduleCollaborationOperationInput, now: Clock) {
  return {
    intent: input.intent,
    trigger: input.trigger,
    sourceRevision: input.sourceRevision,
    targetRevision: input.targetRevision,
    sourceSnapshotHash: input.sourceSnapshotHash,
    nextAttemptAt: new Date(now.getTime() + (input.debounceMs ?? 2_000)),
  }
}

async function existingIdempotency(transaction: Transaction, input: ScheduleCollaborationOperationInput) {
  const existing = await transaction.collaborationOperation.findUnique({
    where: { bindingId_idempotencyKey: { bindingId: input.bindingId, idempotencyKey: input.idempotencyKey } },
  })
  if (!existing) return null
  if (existing.intent !== input.intent) {
    throw new ServiceError('The idempotency key belongs to a different operation.', 'CONFLICT', 409)
  }
  return existing
}

async function updateQueuedOperation(
  transaction: Transaction,
  operationId: string,
  input: ScheduleCollaborationOperationInput,
  now: Clock,
) {
  return transaction.collaborationOperation.update({
    where: { id: operationId },
    data: queueData(input, now),
  })
}

async function activeOperation(transaction: Transaction, bindingId: string) {
  return transaction.collaborationOperation.findFirst({
    where: { bindingId, state: { notIn: terminalStates }, queueKey: null },
    orderBy: { createdAt: 'asc' },
  })
}

async function findQueuedOperation(transaction: Transaction, bindingId: string) {
  return transaction.collaborationOperation.findUnique({
    where: { bindingId_queueKey: { bindingId, queueKey: queuedKey } },
  })
}

async function createQueuedOperation(
  transaction: Transaction,
  input: ScheduleCollaborationOperationInput,
  now: Clock,
  predecessorId?: string,
) {
  return transaction.collaborationOperation.create({
    data: {
      bindingId: input.bindingId,
      idempotencyKey: input.idempotencyKey,
      policyVersion: input.policyVersion,
      queueKey: queuedKey,
      state: 'QUEUED',
      predecessorId,
      ...queueData(input, now),
    },
  })
}

/**
 * Joins a trigger burst to the one replaceable queued record. Once a record is
 * accepted or leased, incoming observations are captured by an immutable
 * successor instead of rewriting the in-flight snapshot.
 */
export async function scheduleCollaborationOperation(
  input: ScheduleCollaborationOperationInput,
  client: PrismaClient = prisma,
) {
  assertQueueInput(input)
  const now = input.now ?? new Date()
  return client.$transaction(async transaction => {
    await bindingForSchedule(transaction, input)
    const replay = await existingIdempotency(transaction, input)
    if (replay) return replay
    const queued = await findQueuedOperation(transaction, input.bindingId)
    if (queued) return updateQueuedOperation(transaction, queued.id, input, now)
    const active = await activeOperation(transaction, input.bindingId)
    return createQueuedOperation(transaction, input, now, active?.id)
  })
}

function leaseExpiration(now: Clock, leaseMs: number) {
  return new Date(now.getTime() + leaseMs)
}

async function operationForClaim(transaction: Transaction, operationId: string, now: Clock) {
  const operation = await transaction.collaborationOperation.findUnique({ where: { id: operationId } })
  if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  if (!isLeaseable(operation.state) || (operation.nextAttemptAt && operation.nextAttemptAt > now)) {
    throw new ServiceError('Collaboration operation is not currently claimable.', 'CONFLICT', 409)
  }
  if (operation.cancelledAt || isTerminal(operation.state)) {
    throw new ServiceError('Collaboration operation is no longer active.', 'CONFLICT', 409)
  }
  return operation
}

async function assertWorkerCanClaim(transaction: Transaction, workerId: string, bindingId: string, now: Clock) {
  const worker = await transaction.collaborationWorker.findFirst({ where: { id: workerId, bindingId } })
  if (!worker || worker.expiresAt <= now || worker.connectionState !== 'CONNECTED') {
    throw new ServiceError('No active registered worker can claim this operation.', 'CONFLICT', 409)
  }
  if (!worker.trustedPrincipalId || !worker.provenance || !worker.capabilitiesHash) {
    throw new ServiceError('Worker registration lacks trusted provenance.', 'UNAUTHORIZED', 403)
  }
  return worker
}

async function latestAttempt(transaction: Transaction, operationId: string) {
  return transaction.collaborationAttempt.findFirst({ where: { operationId }, orderBy: { attemptNumber: 'desc' } })
}

export async function claimCollaborationOperationInTransaction(
  transaction: Transaction,
  input: { operationId: string; workerId: string; now: Clock; leaseMs?: number },
): Promise<ClaimedCollaborationWork> {
  const now = input.now
  const leaseMs = input.leaseMs ?? 30_000
  if (leaseMs < 1_000 || leaseMs > 300_000) throw new ServiceError('Lease duration is out of range.', 'VALIDATION', 400)
  const operation = await operationForClaim(transaction, input.operationId, now)
  await requireCollaborationPermission(transaction, operation.bindingId, 'PREPARE', operation.policyVersion)
  await assertWorkerCanClaim(transaction, input.workerId, operation.bindingId, now)
  const leaseToken = randomUUID()
  const expiresAt = leaseExpiration(now, leaseMs)
  const claimed = await transaction.collaborationOperation.updateMany({
    where: {
      id: operation.id,
      state: { in: leaseableStates },
      cancelledAt: null,
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    data: {
      state: 'WAITING_FOR_AGENT',
      queueKey: null,
      leaseOwner: input.workerId,
      leaseExpiresAt: expiresAt,
      fencingToken: { increment: 1 },
      nextAttemptAt: null,
    },
  })
  if (claimed.count !== 1) {
    throw new ServiceError('The collaboration operation was claimed or changed concurrently.', 'CONFLICT', 409)
  }
  const current = await transaction.collaborationOperation.findUniqueOrThrow({ where: { id: operation.id } })
  const previous = await latestAttempt(transaction, current.id)
  const attempt = await transaction.collaborationAttempt.create({
    data: {
      operationId: current.id,
      workerId: input.workerId,
      attemptNumber: nextAttemptNumber(previous),
      fencingToken: current.fencingToken,
      state: 'RUNNING',
      claimTokenHash: tokenHash(leaseToken),
      leaseExpiresAt: expiresAt,
      heartbeatAt: now,
    },
  })
  return {
    operationId: current.id,
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    fencingToken: current.fencingToken,
    leaseToken,
    leaseExpiresAt: expiresAt,
  }
}

export async function claimCollaborationOperation(
  input: { operationId: string; workerId: string; now?: Clock; leaseMs?: number },
  client: PrismaClient = prisma,
): Promise<ClaimedCollaborationWork> {
  const now = input.now ?? new Date()
  return client.$transaction(transaction => claimCollaborationOperationInTransaction(transaction, { ...input, now }))
}

async function assertedAttempt(
  transaction: Transaction,
  input: { operationId: string; attemptId: string; workerId: string; fencingToken: number; leaseToken: string },
  now: Clock,
) {
  const attempt = await transaction.collaborationAttempt.findFirst({
    where: { id: input.attemptId, operationId: input.operationId },
  })
  const operation = await transaction.collaborationOperation.findUnique({ where: { id: input.operationId } })
  if (!attempt || !operation) throw new ServiceError('Work attempt identity is stale.', 'CONFLICT', 409)
  assertAttemptIdentity(attempt, operation, input)
  assertAttemptLease(attempt, input.leaseToken, now)
  assertAttemptOwnership(operation, input)
  return { attempt, operation }
}

/** A worker must still own its exact fence before it can cause external
 * proposal validation.  Kept public for the worker facade, but it does not
 * disclose any repository data or mutate operation state. */
export async function assertCollaborationProposalAttempt(
  input: {
    operationId: string
    attemptId: string
    workerId: string
    fencingToken: number
    leaseToken: string
    now?: Clock
  },
  client: PrismaClient = prisma,
) {
  const now = input.now ?? new Date()
  return client.$transaction(async transaction => {
    const { attempt, operation } = await assertedAttempt(transaction, input, now)
    if (attempt.state !== 'RUNNING' || operation.state !== 'WAITING_FOR_AGENT' || operation.intent !== 'RECONCILE')
      throw new ServiceError('This worker attempt cannot submit a reconciliation proposal.', 'CONFLICT', 409)
    return operation
  })
}

function assertAttemptIdentity(
  attempt: { workerId: string | null; fencingToken: number },
  operation: { id: string },
  input: { workerId: string; fencingToken: number },
) {
  if (attempt.workerId !== input.workerId || attempt.fencingToken !== input.fencingToken) {
    throw new ServiceError('Work attempt identity is stale.', 'CONFLICT', 409)
  }
}

function assertAttemptLease(
  attempt: { claimTokenHash: string | null; leaseExpiresAt: Date | null } | null,
  leaseToken: string,
  now: Clock,
) {
  if (
    !attempt ||
    attempt.claimTokenHash !== tokenHash(leaseToken) ||
    !attempt.leaseExpiresAt ||
    attempt.leaseExpiresAt <= now
  ) {
    throw new ServiceError('Work attempt lease has expired.', 'CONFLICT', 409)
  }
}

function assertAttemptOwnership(
  operation: { fencingToken: number; leaseOwner: string | null; cancelledAt: Date | null } | null,
  input: { workerId: string; fencingToken: number },
) {
  if (
    !operation ||
    operation.fencingToken !== input.fencingToken ||
    operation.leaseOwner !== input.workerId ||
    operation.cancelledAt
  ) {
    throw new ServiceError('Work attempt no longer owns this operation.', 'CONFLICT', 409)
  }
}

export async function heartbeatCollaborationOperation(
  input: {
    operationId: string
    attemptId: string
    workerId: string
    fencingToken: number
    leaseToken: string
    now?: Clock
    leaseMs?: number
  },
  client: PrismaClient = prisma,
) {
  const now = input.now ?? new Date()
  const expiresAt = leaseExpiration(now, input.leaseMs ?? 30_000)
  return client.$transaction(async transaction => {
    const { attempt, operation } = await assertedAttempt(transaction, input, now)
    const renewedAttempt = await transaction.collaborationAttempt.updateMany({
      where: {
        id: attempt.id,
        operationId: operation.id,
        workerId: input.workerId,
        fencingToken: input.fencingToken,
        claimTokenHash: tokenHash(input.leaseToken),
        state: 'RUNNING',
        leaseExpiresAt: { gt: now },
      },
      data: { heartbeatAt: now, leaseExpiresAt: expiresAt },
    })
    if (renewedAttempt.count !== 1) throw new ServiceError('Work attempt lease has expired.', 'CONFLICT', 409)
    const renewedOperation = await transaction.collaborationOperation.updateMany({
      where: {
        id: operation.id,
        state: 'WAITING_FOR_AGENT',
        fencingToken: input.fencingToken,
        leaseOwner: input.workerId,
        leaseExpiresAt: { gt: now },
        cancelledAt: null,
      },
      data: { leaseExpiresAt: expiresAt },
    })
    if (renewedOperation.count !== 1)
      throw new ServiceError('Work attempt no longer owns this operation.', 'CONFLICT', 409)
    const renewedWorker = await transaction.collaborationWorker.updateMany({
      where: { id: input.workerId, connectionState: 'CONNECTED', expiresAt: { gt: now } },
      data: { lastHeartbeatAt: now, expiresAt },
    })
    if (renewedWorker.count !== 1) throw new ServiceError('Worker registration expired.', 'CONFLICT', 409)
    return transaction.collaborationOperation.findUniqueOrThrow({ where: { id: operation.id } })
  })
}

export async function cancelCollaborationOperation(
  input: { operationId: string; reason: string; now?: Clock },
  client: PrismaClient = prisma,
) {
  if (!input.reason.trim()) throw new ServiceError('A cancellation reason is required.', 'VALIDATION', 400)
  const now = input.now ?? new Date()
  return client.$transaction(async transaction => {
    const operation = await transaction.collaborationOperation.findUnique({ where: { id: input.operationId } })
    if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
    if (operation.state === 'COMPLETED') {
      throw new ServiceError('A completed operation is evidence and cannot be cancelled as undone.', 'CONFLICT', 409)
    }
    await transaction.collaborationAttempt.updateMany({
      where: { operationId: operation.id, state: { in: ['CLAIMED', 'RUNNING'] } },
      data: { state: 'CANCELLED', cancelledAt: now },
    })
    return transaction.collaborationOperation.update({
      where: { id: operation.id },
      data: {
        state: 'CANCELLED',
        cancelledAt: now,
        queueKey: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        blockerJson: canonicalJson({ kind: 'CANCELLED', reason: input.reason }),
      },
    })
  })
}

export async function recoverExpiredCollaborationLeases(now: Clock = new Date(), client: PrismaClient = prisma) {
  const expired = await client.collaborationOperation.findMany({
    where: { state: 'WAITING_FOR_AGENT', leaseExpiresAt: { lte: now }, cancelledAt: null },
  })
  return Promise.all(expired.map(operation => recoverExpiredOperation(operation.id, now, client)))
}

async function recoverExpiredOperation(operationId: string, now: Clock, client: PrismaClient) {
  return client.$transaction(async transaction => {
    const operation = await transaction.collaborationOperation.findUnique({ where: { id: operationId } })
    if (
      !operation ||
      operation.state !== 'WAITING_FOR_AGENT' ||
      !operation.leaseExpiresAt ||
      operation.leaseExpiresAt > now
    )
      return null
    const queued = await findQueuedOperation(transaction, operation.bindingId)
    const recovery = await transaction.collaborationOperation.updateMany({
      where: {
        id: operationId,
        state: 'WAITING_FOR_AGENT',
        fencingToken: operation.fencingToken,
        leaseExpiresAt: { lte: now },
        cancelledAt: null,
      },
      data: queued
        ? { state: 'SUPERSEDED', supersededById: queued.id, leaseOwner: null, leaseExpiresAt: null }
        : { state: 'QUEUED', queueKey: queuedKey, leaseOwner: null, leaseExpiresAt: null, nextAttemptAt: now },
    })
    if (recovery.count !== 1) return null
    await transaction.collaborationAttempt.updateMany({
      where: {
        operationId,
        fencingToken: operation.fencingToken,
        state: { in: ['CLAIMED', 'RUNNING'] },
      },
      data: { state: 'EXPIRED', completedAt: now },
    })
    return transaction.collaborationOperation.findUniqueOrThrow({ where: { id: operationId } })
  })
}

export async function acquireCollaborationMutationLock(
  input: { lockKey: string; ownerId: string; now?: Clock; leaseMs?: number },
  client: PrismaClient = prisma,
) {
  const now = input.now ?? new Date()
  const leaseExpiresAt = leaseExpiration(now, input.leaseMs ?? 30_000)
  return client.$transaction(async transaction => {
    const lock = await transaction.collaborationMutationLock.findUnique({ where: { lockKey: input.lockKey } })
    if (lock && lock.leaseExpiresAt > now && lock.ownerId !== input.ownerId) {
      throw new ServiceError('Another collaboration mutator owns the shared repository lock.', 'CONFLICT', 409)
    }
    return transaction.collaborationMutationLock.upsert({
      where: { lockKey: input.lockKey },
      create: { lockKey: input.lockKey, ownerId: input.ownerId, leaseExpiresAt },
      update: { ownerId: input.ownerId, leaseExpiresAt, fencingToken: { increment: 1 } },
    })
  })
}

export async function notifyCollaboration(
  input: {
    bindingId: string
    operationId?: string
    dedupeKey: string
    kind: string
    message: string
    actionable?: boolean
  },
  client: PrismaClient = prisma,
) {
  return client.collaborationNotification.upsert({
    where: { bindingId_dedupeKey: { bindingId: input.bindingId, dedupeKey: input.dedupeKey } },
    create: { ...input, actionable: input.actionable ?? false },
    update: { message: input.message, actionable: input.actionable ?? false },
  })
}

async function requireCollaborationBinding(bindingId: string, client: PrismaClient) {
  const binding = await client.collaborationBinding.findUnique({ where: { id: bindingId } })
  if (!binding) throw new ServiceError('Collaboration binding was not found.', 'NOT_FOUND', 404)
  return binding
}

export async function recordRemoteCollaborationCheck(
  input: { bindingId: string; outcome: 'success' | 'transient_failure' | 'authentication_failure'; now?: Clock },
  client: PrismaClient = prisma,
) {
  const now = input.now ?? new Date()
  const binding = await requireCollaborationBinding(input.bindingId, client)
  const backoff =
    input.outcome === 'success'
      ? 300
      : input.outcome === 'transient_failure'
        ? Math.min(binding.remoteBackoffSeconds * 2, 1_800)
        : 0
  return client.collaborationBinding.update({
    where: { id: binding.id },
    data: {
      connectionState: input.outcome === 'success' ? 'CONNECTED' : 'STALE',
      lastRemoteCheckAt: now,
      remoteBackoffSeconds: input.outcome === 'success' ? 300 : backoff || binding.remoteBackoffSeconds,
      // An authentication failure needs human credential repair. Keeping this
      // null is safe because the durable flag excludes it from scheduler due
      // selection below; it also makes the paused state explicit to readers.
      nextRemoteCheckAt: backoff ? new Date(now.getTime() + backoff * 1_000) : null,
      remoteAuthRepairRequired: input.outcome === 'authentication_failure',
      remoteCheckError:
        input.outcome === 'success'
          ? null
          : input.outcome === 'authentication_failure'
            ? 'Repository authentication needs repair before automatic checks can resume.'
            : binding.remoteCheckError,
    },
  })
}

type RemoteCheckOutcome = 'success' | 'transient_failure' | 'authentication_failure'

function remoteFailureOutcome(error: unknown): RemoteCheckOutcome {
  const message = error instanceof Error ? error.message : ''
  return /auth|credential|permission denied|access denied/i.test(message)
    ? 'authentication_failure'
    : 'transient_failure'
}

async function observeDueRemoteBinding(
  binding: { id: string },
  client: PrismaClient,
  observeRemote?: (bindingId: string) => Promise<void>,
): Promise<RemoteCheckOutcome> {
  try {
    if (observeRemote) await observeRemote(binding.id)
    else await getCollaborationGitStatus(binding.id, client)
    return 'success'
  } catch (error) {
    return remoteFailureOutcome(error)
  }
}

/**
 * Runs one startup/reconnect-safe scheduler pass. The default observer performs
 * the bounded repository/remote status check; tests can inject only that I/O
 * edge while keeping queue, policy, and recovery state real.
 */
export async function runCollaborationSchedulerTick(
  input: { now?: Clock; observeRemote?: (bindingId: string) => Promise<void> } = {},
  client: PrismaClient = prisma,
) {
  const now = input.now ?? new Date()
  const recovered = await recoverExpiredCollaborationLeases(now, client)
  const dueBindings = await client.collaborationBinding.findMany({
    where: {
      enabled: true,
      remoteAuthRepairRequired: false,
      OR: [{ nextRemoteCheckAt: null }, { nextRemoteCheckAt: { lte: now } }],
    },
    select: { id: true },
  })
  const remoteChecks = [] as Array<{ bindingId: string; outcome: RemoteCheckOutcome }>
  for (const binding of dueBindings) {
    const outcome = await observeDueRemoteBinding(binding, client, input.observeRemote)
    await recordRemoteCollaborationCheck({ bindingId: binding.id, outcome, now }, client)
    remoteChecks.push({ bindingId: binding.id, outcome })
  }
  return { recovered: recovered.filter(Boolean), remoteChecks }
}

/**
 * An explicit local-user retry after credentials have been repaired. This is
 * deliberately not a public coordinator command: a bearer cannot clear a
 * durable authentication-repair boundary or cause repeated credential use.
 */
export async function retryCollaborationRemoteCheck(
  input: { bindingId: string; now?: Clock; observeRemote?: (bindingId: string) => Promise<void> },
  client: PrismaClient = prisma,
) {
  const now = input.now ?? new Date()
  const binding = await requireCollaborationBinding(input.bindingId, client)
  const outcome = await observeDueRemoteBinding(binding, client, input.observeRemote)
  return recordRemoteCollaborationCheck({ bindingId: binding.id, outcome, now }, client)
}
