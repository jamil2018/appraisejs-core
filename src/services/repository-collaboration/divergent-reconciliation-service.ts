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
  releaseCollaborationGitMutationLock,
  type CollaborationMutationLease,
} from './git-mutation-lock-service'

type Transaction = Prisma.TransactionClient

type PreparedPayload = {
  local: CollaborationRecord[]
  baselines: CollaborationRecord[]
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
  input: { operationId: string; expectedVersion: number; preparedDigest: string },
  client: PrismaClient = prisma,
): Promise<DivergentReconciliationPreparation> {
  const started = await acquirePreparationLease(client, input)
  try {
    const preparation = await prepareDivergentReconciliation({
      repositoryRoot: started.operation.binding.repositoryRoot,
      operationId: started.operation.id,
      sourceRevision: started.operation.sourceRevision!,
      targetRevision: started.operation.targetRevision!,
    })
    await client.$transaction(async transaction => {
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
): Promise<{ review: DivergentReconciliationReview; databaseReviewDigest: string; requiresDecision: boolean }> {
  const operation = await client.$transaction(transaction => loadPreparedOperation(transaction, input))
  const storedPreparation = await client.collaborationOperationArtifact.findFirst({
    where: { operationId: operation.id, kind: 'DIVERGENT_PREPARATION' },
    orderBy: { revision: 'desc' },
  })
  if (!storedPreparation) throw new ServiceError('The divergent worktree was not durably prepared.', 'CONFLICT', 409)
  const preparation = JSON.parse(storedPreparation.payloadJson) as DivergentReconciliationPreparation
  if (
    storedPreparation.payloadHash !== collaborationHash(preparation) ||
    preparation.operationId !== operation.id ||
    preparation.repositoryRoot !== operation.binding.repositoryRoot ||
    preparation.sourceRevision !== operation.sourceRevision ||
    preparation.targetRevision !== operation.targetRevision
  )
    throw new ServiceError('The persisted divergent worktree does not belong to this exact operation.', 'CONFLICT', 409)
  try {
    const review = await validateDivergentReconciliationProposal({
      preparation,
      records: input.records,
    })
    const payload = parsePreparedPayload(operation)
    const databaseReview = prepareThreeWayCollaboration({
      incoming: input.records,
      localByKey: new Map(payload.local.map(record => [recordKey(record), record])),
      baselineByKey: new Map(payload.baselines.map(record => [recordKey(record), record])),
    })
    const databaseReviewDigest = collaborationHash(databaseReview)
    const requiresDecision = databaseReview.some(record => record.requiresDecision)
    await client.$transaction(async transaction => {
      await loadPreparedOperation(transaction, input)
      await transaction.collaborationOperationArtifact.create({
        data: {
          operationId: operation.id,
          kind: 'DIVERGENT_PROPOSAL_REVIEW',
          revision: 1,
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
    })
    return { review, databaseReviewDigest, requiresDecision }
  } catch (error) {
    throw asServiceError(error)
  }
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
  const operation = await client.collaborationOperation.findUnique({ where: { id: input.operationId } })
  if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  const outcome = await cleanupDivergentReconciliationWorktree(input.preparation)
  await client.$transaction(async transaction => {
    await appendCollaborationJournalEntry(
      transaction,
      operation.id,
      'DIVERGENT_WORKTREE_RECOVERY',
      outcome,
      'COMPLETED',
    )
  })
  return outcome
}
