import { createHash } from 'node:crypto'

import type { CollaborationOperation, Prisma, PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  assertDivergentReconciliationReview,
  cleanupDivergentReconciliationWorktree,
  collaborationHash,
  collaborationRecordSchema,
  prepareDivergentReconciliation,
  prepareThreeWayCollaboration,
  recordKey,
  validateDivergentReconciliationProposal,
  type CollaborationRecord,
  type DivergentReconciliationPreparation,
  type DivergentReconciliationReview,
} from '@/lib/repository-collaboration'
import { inspectRepository } from '@/lib/repository-collaboration/git-repository'
import { ServiceError } from '@/services/shared/errors'

import { requireCollaborationPermission } from './binding-service'
import { appendCollaborationJournalEntry } from './collaboration-journal-service'
import {
  acquireCollaborationGitMutationLock,
  assertCollaborationGitMutationLock,
  releaseCollaborationGitMutationLock,
  withCollaborationGitMutationLeaseHeartbeat,
  type CollaborationMutationLease,
} from './git-mutation-lock-service'
import { activeRedeemedHandoffTicket } from './handoff-ticket-session-service'

type Transaction = Prisma.TransactionClient

const divergentDecisionRecordKey = '__appraise_divergent_proposal__'

type PreparedPayload = {
  local: CollaborationRecord[]
  baselines: CollaborationRecord[]
}

/**
 * The durable identity presented by a worker when it submits a proposal. The
 * proposal worktree is an external boundary, so the final database mutation
 * must re-check this identity instead of trusting an earlier preflight read.
 */
export type DivergentProposalWorkerFence = {
  attemptId: string
  workerId: string
  fencingToken: number
  leaseToken: string
  now: Date
}

export type DivergentProposalHooks = {
  /** Test-only seam for proving that a lease replacement after filesystem
   * validation cannot persist a stale proposal. */
  afterValidation?: () => Promise<void> | void
}

function currentProposalPersistenceTime() {
  return new Date()
}

function leaseTokenHash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function parsePreparedPayload(operation: CollaborationOperation): PreparedPayload {
  try {
    const raw = JSON.parse(operation.preparedJson ?? '') as Partial<PreparedPayload>
    if (!Array.isArray(raw.local) || !Array.isArray(raw.baselines)) throw new Error('missing record arrays')
    return {
      local: raw.local.map(record => collaborationRecordSchema.parse(record)),
      baselines: raw.baselines.map(record => collaborationRecordSchema.parse(record)),
    }
  } catch {
    throw new ServiceError('The operation has no valid prepared reconciliation payload.', 'CONFLICT', 409)
  }
}

function assertOperationVersion(
  operation: Pick<CollaborationOperation, 'version' | 'preparedDigest' | 'sourceRevision' | 'targetRevision'>,
  input: { expectedVersion: number; preparedDigest: string },
): void {
  const digest = input.preparedDigest.startsWith('sha256:')
    ? input.preparedDigest.slice('sha256:'.length)
    : input.preparedDigest
  if (operation.version !== input.expectedVersion || operation.preparedDigest !== digest) {
    throw new ServiceError('The collaboration operation changed after divergent preparation.', 'CONFLICT', 409)
  }
  if (!operation.sourceRevision || !operation.targetRevision) {
    throw new ServiceError('Divergent reconciliation requires pinned source and target Git revisions.', 'CONFLICT', 409)
  }
}

function asServiceError(error: unknown): ServiceError {
  if (error instanceof ServiceError) return error
  return new ServiceError(error instanceof Error ? error.message : 'Divergent reconciliation failed.', 'CONFLICT', 409)
}

async function loadPreparedOperation(
  transaction: Transaction,
  input: { operationId: string; expectedVersion: number; preparedDigest: string },
) {
  const operation = await transaction.collaborationOperation.findUnique({
    where: { id: input.operationId },
    include: { binding: true },
  })
  if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  assertOperationVersion(operation, input)
  await requireCollaborationPermission(transaction, operation.bindingId, 'PREPARE', operation.policyVersion)
  return operation
}

async function acquirePreparationLease(
  client: PrismaClient,
  input: { operationId: string; expectedVersion: number; preparedDigest: string },
) {
  const operation = await client.collaborationOperation.findUnique({
    where: { id: input.operationId },
    include: { binding: true },
  })
  if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  assertOperationVersion(operation, input)
  const identity = await inspectRepository(operation.binding.repositoryRoot)
  const lease = await client.$transaction(async transaction => {
    await loadPreparedOperation(transaction, input)
    const acquired = await acquireCollaborationGitMutationLock(transaction, identity.commonDirectory, operation.id)
    await appendCollaborationJournalEntry(
      transaction,
      operation.id,
      'DIVERGENT_WORKTREE_PREPARING',
      { expectedVersion: input.expectedVersion, preparedDigest: input.preparedDigest, lockKey: acquired.lockKey },
      'STARTED',
    )
    return acquired
  })
  return { operation, lease }
}

async function releasePreparationLease(client: PrismaClient, lease: CollaborationMutationLease) {
  await client.$transaction(transaction => releaseCollaborationGitMutationLock(transaction, lease))
}

/**
 * Builds an isolated source worktree while holding the same fenced lock used
 * by ordinary Git steps. The lease is deliberately released before an agent
 * reviews content; it is reacquired at every later mutation boundary.
 */
export async function prepareDivergentCollaborationReconciliation(
  input: { operationId: string; expectedVersion: number; preparedDigest: string; queueAfterPreparation?: boolean },
  client: PrismaClient = prisma,
): Promise<DivergentReconciliationPreparation> {
  const started = await acquirePreparationLease(client, input)
  try {
    const preparation = await withCollaborationGitMutationLeaseHeartbeat(client, started.lease, () =>
      prepareDivergentReconciliation({
        repositoryRoot: started.operation.binding.repositoryRoot,
        operationId: started.operation.id,
        sourceRevision: started.operation.sourceRevision!,
        targetRevision: started.operation.targetRevision!,
      }),
    )
    await client.$transaction(async transaction => {
      await assertCollaborationGitMutationLock(transaction, started.lease)
      const operation = await loadPreparedOperation(transaction, input)
      await transaction.collaborationOperationArtifact.create({
        data: {
          operationId: operation.id,
          kind: 'DIVERGENT_PREPARATION',
          revision: 1,
          payloadJson: JSON.stringify(preparation),
          payloadHash: collaborationHash(preparation),
        },
      })
      await appendCollaborationJournalEntry(
        transaction,
        operation.id,
        'DIVERGENT_WORKTREE_PREPARED',
        {
          sourceRevision: preparation.sourceRevision,
          sourceTree: preparation.sourceTree,
          targetRevision: preparation.targetRevision,
          targetTree: preparation.targetTree,
          sourceSnapshotHash: preparation.sourceSnapshotHash,
          worktreePath: preparation.worktreePath,
        },
        'COMPLETED',
      )
      if (input.queueAfterPreparation) {
        await transaction.collaborationOperation.update({
          where: { id: operation.id },
          data: {
            state: 'QUEUED',
            queueKey: 'PENDING',
            nextAttemptAt: new Date(),
            leaseOwner: null,
            leaseExpiresAt: null,
            acceptedDigest: null,
          },
        })
        await appendCollaborationJournalEntry(
          transaction,
          operation.id,
          'DIVERGENT_WORKTREE_QUEUED',
          { preparedDigest: operation.preparedDigest },
          'COMPLETED',
        )
      }
    })
    return preparation
  } catch (error) {
    await client.$transaction(async transaction => {
      const operation = await transaction.collaborationOperation.findUnique({ where: { id: input.operationId } })
      if (operation)
        await appendCollaborationJournalEntry(
          transaction,
          operation.id,
          'DIVERGENT_WORKTREE_PREPARING',
          { message: error instanceof Error ? error.message : 'Divergent preparation failed.' },
          'BLOCKED',
        )
    })
    throw asServiceError(error)
  } finally {
    await releasePreparationLease(client, started.lease)
  }
}

async function storedDivergentPreparation(
  operation: Awaited<ReturnType<typeof loadPreparedOperation>>,
  client: Pick<PrismaClient, 'collaborationOperationArtifact'>,
) {
  const artifact = await client.collaborationOperationArtifact.findFirst({
    where: { operationId: operation.id, kind: 'DIVERGENT_PREPARATION' },
    orderBy: { revision: 'desc' },
  })
  if (!artifact) throw new ServiceError('The divergent worktree was not durably prepared.', 'CONFLICT', 409)
  let preparation: DivergentReconciliationPreparation
  try {
    preparation = JSON.parse(artifact.payloadJson) as DivergentReconciliationPreparation
  } catch {
    throw new ServiceError('The persisted divergent worktree is invalid.', 'CONFLICT', 409)
  }
  if (
    artifact.payloadHash !== collaborationHash(preparation) ||
    preparation.operationId !== operation.id ||
    preparation.repositoryRoot !== operation.binding.repositoryRoot ||
    preparation.sourceRevision !== operation.sourceRevision ||
    preparation.targetRevision !== operation.targetRevision
  ) {
    throw new ServiceError('The persisted divergent worktree does not belong to this exact operation.', 'CONFLICT', 409)
  }
  return { artifact, preparation }
}

async function assertFreshWorkerFence(transaction: Transaction, fence: DivergentProposalWorkerFence, now: Date) {
  const worker = await transaction.collaborationWorker.findUnique({ where: { id: fence.workerId } })
  if (!worker || worker.connectionState !== 'CONNECTED' || worker.expiresAt <= now) {
    throw new ServiceError('The worker session expired before proposal persistence.', 'CONFLICT', 409)
  }
  await activeRedeemedHandoffTicket(transaction, worker, now)
}

/**
 * Agents submit complete record projections, never text patches or Git
 * commands. This validates both the strict snapshot and the normal three-way
 * database classification before a human decision can integrate it.
 */
export async function proposeDivergentCollaborationReconciliation(
  input: {
    operationId: string
    expectedVersion: number
    preparedDigest: string
    records: CollaborationRecord[]
  },
  client: PrismaClient = prisma,
  workerFence?: DivergentProposalWorkerFence,
  hooks?: DivergentProposalHooks,
): Promise<{
  review: DivergentReconciliationReview
  databaseReviewDigest: string
  requiresDecision: boolean
  operationVersion: number
}> {
  const operation = await client.$transaction(transaction => loadPreparedOperation(transaction, input))
  const { preparation } = await storedDivergentPreparation(operation, client)
  try {
    const review = await validateDivergentReconciliationProposal({
      preparation,
      records: input.records,
    })
    await hooks?.afterValidation?.()
    const payload = parsePreparedPayload(operation)
    const databaseReview = prepareThreeWayCollaboration({
      incoming: input.records,
      localByKey: new Map(payload.local.map(record => [recordKey(record), record])),
      baselineByKey: new Map(payload.baselines.map(record => [recordKey(record), record])),
    })
    const databaseReviewDigest = collaborationHash(databaseReview)
    const requiresDecision = databaseReview.some(record => record.requiresDecision)
    const updated = await client.$transaction(async transaction => {
      const current = await loadPreparedOperation(transaction, input)
      const nextVersion = current.version + 1
      if (workerFence) {
        const persistenceNow = currentProposalPersistenceTime()
        await assertFreshWorkerFence(transaction, workerFence, persistenceNow)
        // This is the authoritative proposal boundary. A lease may expire or
        // be replaced while the worker validates its isolated worktree; only
        // the current attempt can make that validation durable.
        const fenced = await transaction.collaborationOperation.updateMany({
          where: {
            id: current.id,
            intent: 'RECONCILE',
            state: 'WAITING_FOR_AGENT',
            version: input.expectedVersion,
            preparedDigest: current.preparedDigest,
            fencingToken: workerFence.fencingToken,
            leaseOwner: workerFence.workerId,
            leaseExpiresAt: { gt: persistenceNow },
            cancelledAt: null,
          },
          data: {
            state: 'WAITING_FOR_DECISION',
            acceptedDigest: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            queueKey: null,
            blockerJson: JSON.stringify({ kind: 'DIVERGENT_PROPOSAL_REVIEW', reviewDigest: review.reviewDigest }),
            version: { increment: 1 },
          },
        })
        if (fenced.count !== 1)
          throw new ServiceError(
            'The worker lease was replaced before the proposal could be persisted.',
            'CONFLICT',
            409,
          )

        const consumedAttempt = await transaction.collaborationAttempt.updateMany({
          where: {
            id: workerFence.attemptId,
            operationId: current.id,
            workerId: workerFence.workerId,
            fencingToken: workerFence.fencingToken,
            claimTokenHash: leaseTokenHash(workerFence.leaseToken),
            state: 'RUNNING',
            leaseExpiresAt: { gt: persistenceNow },
          },
          data: {
            state: 'PROPOSAL_SUBMITTED',
            resultJson: JSON.stringify({ reviewDigest: review.reviewDigest }),
            completedAt: persistenceNow,
          },
        })
        if (consumedAttempt.count !== 1)
          throw new ServiceError(
            'The worker attempt was replaced before the proposal could be persisted.',
            'CONFLICT',
            409,
          )
      }
      if (!workerFence && current.state !== 'READY') {
        throw new ServiceError(
          'A divergent proposal may be submitted only from its initial ready state.',
          'CONFLICT',
          409,
        )
      }
      const prior = await transaction.collaborationOperationArtifact.findFirst({
        where: { operationId: operation.id, kind: 'DIVERGENT_PROPOSAL_REVIEW' },
        orderBy: { revision: 'desc' },
      })
      await transaction.collaborationOperationArtifact.create({
        data: {
          operationId: operation.id,
          kind: 'DIVERGENT_PROPOSAL_REVIEW',
          revision: (prior?.revision ?? 0) + 1,
          payloadJson: JSON.stringify({ review, databaseReviewDigest, requiresDecision, records: input.records }),
          payloadHash: collaborationHash({ review, databaseReviewDigest, requiresDecision, records: input.records }),
        },
      })
      await appendCollaborationJournalEntry(
        transaction,
        input.operationId,
        'DIVERGENT_PROPOSAL_REVIEWED',
        { reviewDigest: review.reviewDigest, databaseReviewDigest, requiresDecision },
        'COMPLETED',
      )
      // A proposal is review material, not acceptance.  It immediately loses
      // the worker lease and invalidates any earlier executable decision.
      if (workerFence) return { version: nextVersion }
      return transaction.collaborationOperation.update({
        where: { id: operation.id },
        data: {
          state: 'WAITING_FOR_DECISION',
          acceptedDigest: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          queueKey: null,
          blockerJson: JSON.stringify({ kind: 'DIVERGENT_PROPOSAL_REVIEW', reviewDigest: review.reviewDigest }),
          version: { increment: 1 },
        },
        select: { version: true },
      })
    })
    return { review, databaseReviewDigest, requiresDecision, operationVersion: updated.version }
  } catch (error) {
    throw asServiceError(error)
  }
}

type DivergentProposalDecisionInput = {
  operationId: string
  expectedVersion: number
  preparedDigest: string
  reviewDigest: string
  decision: 'ACCEPT' | 'REJECT'
  trustedPrincipalId: string
  provenance: 'local-ui' | 'authenticated-host'
}

async function reviewedProposal(
  transaction: Transaction,
  input: Pick<DivergentProposalDecisionInput, 'operationId' | 'reviewDigest'>,
) {
  const artifact = await transaction.collaborationOperationArtifact.findFirst({
    where: { operationId: input.operationId, kind: 'DIVERGENT_PROPOSAL_REVIEW' },
    orderBy: { revision: 'desc' },
  })
  if (!artifact) throw new ServiceError('No divergent proposal is available for decision.', 'CONFLICT', 409)
  let payload: { review?: DivergentReconciliationReview; records?: CollaborationRecord[] }
  try {
    payload = JSON.parse(artifact.payloadJson) as typeof payload
  } catch {
    throw new ServiceError('The divergent proposal artifact is invalid.', 'CONFLICT', 409)
  }
  if (
    artifact.payloadHash !== collaborationHash(payload) ||
    !payload.review ||
    !Array.isArray(payload.records) ||
    payload.review.reviewDigest !==
      (input.reviewDigest.startsWith('sha256:') ? input.reviewDigest.slice(7) : input.reviewDigest)
  )
    throw new ServiceError('The decision does not name the exact reviewed divergent proposal.', 'CONFLICT', 409)
  return { artifact, payload }
}

/** Decision authority is deliberately separate from proposal production.  An
 * accept binds one immutable artifact and its canonical review digest; later
 * execution never searches for a newer proposal. */
export async function decideDivergentCollaborationProposal(
  input: DivergentProposalDecisionInput,
  client: PrismaClient | Transaction = prisma,
) {
  if (!['local-ui', 'authenticated-host'].includes(input.provenance))
    throw new ServiceError('Divergent proposal decisions require trusted provenance.', 'UNAUTHORIZED', 403)
  const digest = input.preparedDigest.startsWith('sha256:') ? input.preparedDigest.slice(7) : input.preparedDigest
  const reviewDigest = input.reviewDigest.startsWith('sha256:') ? input.reviewDigest.slice(7) : input.reviewDigest
  const decideInTransaction = async (transaction: Transaction) => {
    const operation = await transaction.collaborationOperation.findUnique({ where: { id: input.operationId } })
    if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
    await requireCollaborationPermission(transaction, operation.bindingId, 'RESOLVE', operation.policyVersion)
    if (
      operation.intent !== 'RECONCILE' ||
      operation.state !== 'WAITING_FOR_DECISION' ||
      operation.version !== input.expectedVersion ||
      operation.preparedDigest !== digest
    )
      throw new ServiceError('The divergent proposal decision is stale.', 'CONFLICT', 409)
    const proposal = await reviewedProposal(transaction, input)
    const resolution = { reviewDigest, decision: input.decision }
    await transaction.collaborationDecision.upsert({
      where: { operationId_recordKey: { operationId: operation.id, recordKey: divergentDecisionRecordKey } },
      create: {
        operationId: operation.id,
        recordKey: divergentDecisionRecordKey,
        kind: input.decision,
        resolutionJson: JSON.stringify(resolution),
        resolutionDigest: collaborationHash(resolution),
        trustedPrincipalId: input.trustedPrincipalId,
        provenance: input.provenance,
      },
      update: {},
    })
    if (input.decision === 'ACCEPT') {
      await transaction.collaborationOperationArtifact.create({
        data: {
          operationId: operation.id,
          kind: 'DIVERGENT_ACCEPTED_PROPOSAL',
          revision: 1,
          payloadJson: proposal.artifact.payloadJson,
          payloadHash: proposal.artifact.payloadHash,
        },
      })
      return transaction.collaborationOperation.update({
        where: { id: operation.id },
        data: { state: 'READY', acceptedDigest: reviewDigest, blockerJson: null, version: { increment: 1 } },
      })
    }
    return transaction.collaborationOperation.update({
      where: { id: operation.id },
      data: { state: 'CANCELLED', acceptedDigest: null, cancelledAt: new Date(), version: { increment: 1 } },
    })
  }
  const operation =
    '$transaction' in client
      ? await (client as PrismaClient).$transaction(decideInTransaction)
      : await decideInTransaction(client)
  if (input.decision === 'REJECT') {
    const artifact = await client.collaborationOperationArtifact.findFirst({
      where: { operationId: operation.id, kind: 'DIVERGENT_PREPARATION' },
      orderBy: { revision: 'desc' },
    })
    try {
      if (!artifact) throw new Error('missing original proposal worktree preparation')
      const preparation = JSON.parse(artifact.payloadJson) as DivergentReconciliationPreparation
      if (artifact.payloadHash !== collaborationHash(preparation))
        throw new Error('tampered proposal worktree artifact')
      const cleanup = await cleanupDivergentReconciliationWorktree(preparation)
      if (cleanup.status === 'RETAINED_FOR_RECOVERY') throw new Error('proposal worktree retained for recovery')
      if ('$transaction' in client) {
        await (client as PrismaClient).$transaction(transaction =>
          appendCollaborationJournalEntry(
            transaction,
            operation.id,
            'DIVERGENT_PROPOSAL_REJECT_CLEANUP',
            cleanup,
            'COMPLETED',
          ),
        )
      } else {
        await appendCollaborationJournalEntry(
          client,
          operation.id,
          'DIVERGENT_PROPOSAL_REJECT_CLEANUP',
          cleanup,
          'COMPLETED',
        )
      }
    } catch (error) {
      await client.collaborationOperation.update({
        where: { id: operation.id },
        data: {
          state: 'BLOCKED',
          blockerJson: JSON.stringify({ kind: 'DIVERGENT_REJECT_CLEANUP_REQUIRED', message: String(error) }),
        },
      })
      throw new ServiceError('Rejected proposal worktree was retained for recovery.', 'CONFLICT', 409)
    }
  }
  return operation
}

/** Rechecks the exact operation and source state just before an integration step. */
export async function assertDivergentCollaborationReadyForIntegration(
  input: {
    operationId: string
    expectedVersion: number
    preparedDigest: string
    review: DivergentReconciliationReview
  },
  client: PrismaClient = prisma,
): Promise<{ reviewDigest: string }> {
  const operation = await client.$transaction(transaction => loadPreparedOperation(transaction, input))
  if (input.review.preparation.operationId !== operation.id) {
    throw new ServiceError('The reviewed divergent proposal belongs to a different operation.', 'CONFLICT', 409)
  }
  try {
    await assertDivergentReconciliationReview(input.review)
  } catch (error) {
    throw asServiceError(error)
  }
  await client.$transaction(async transaction => {
    await loadPreparedOperation(transaction, input)
    await appendCollaborationJournalEntry(
      transaction,
      operation.id,
      'DIVERGENT_INTEGRATION_BOUND',
      { reviewDigest: input.review.reviewDigest, proposedSnapshotHash: input.review.proposedSnapshotHash },
      'COMPLETED',
    )
  })
  return { reviewDigest: input.review.reviewDigest }
}

export async function recoverDivergentCollaborationWorktree(
  input: { operationId: string; preparation: DivergentReconciliationPreparation },
  client: PrismaClient = prisma,
) {
  if (input.preparation.operationId !== input.operationId) {
    throw new ServiceError('The divergent recovery artifact belongs to another operation.', 'CONFLICT', 409)
  }
  const operation = await client.collaborationOperation.findUnique({
    where: { id: input.operationId },
    include: { binding: true },
  })
  if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  const { preparation } = await storedDivergentPreparation(operation, client)
  if (collaborationHash(input.preparation) !== collaborationHash(preparation)) {
    throw new ServiceError('The divergent recovery request does not match its durable preparation.', 'CONFLICT', 409)
  }
  const identity = await inspectRepository(operation.binding.repositoryRoot, operation.binding.remoteName)
  const lease = await client.$transaction(transaction =>
    acquireCollaborationGitMutationLock(transaction, identity.commonDirectory, operation.id),
  )
  try {
    return await withCollaborationGitMutationLeaseHeartbeat(client, lease, async () => {
      const outcome = await cleanupDivergentReconciliationWorktree(preparation)
      await client.$transaction(async transaction => {
        await assertCollaborationGitMutationLock(transaction, lease)
        await appendCollaborationJournalEntry(
          transaction,
          operation.id,
          'DIVERGENT_WORKTREE_RECOVERY',
          outcome,
          'COMPLETED',
        )
      })
      return outcome
    })
  } finally {
    await client.$transaction(transaction => releaseCollaborationGitMutationLock(transaction, lease))
  }
}
