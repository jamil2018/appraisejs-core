import { createHash } from 'node:crypto'

import type { CollaborationOperation, Prisma, PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  assertDivergentReconciliationReview,
  cleanupDivergentReconciliationWorktree,
  collaborationHash,
  collaborationRecordSchema,
  prepareDivergentReconciliation,
  managedDivergentWorktreePath,
  prepareThreeWayCollaboration,
  recordKey,
  restoreDivergentReconciliationSource,
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
  assertCollaborationGitMutationIdentity,
  assertCollaborationGitMutationLock,
  releaseCollaborationGitMutationLock,
  withCollaborationGitMutationLeaseHeartbeat,
  type CollaborationMutationLease,
  type CollaborationGitIdentityInspector,
} from './git-mutation-lock-service'
import { activeRedeemedHandoffTicket } from './handoff-ticket-session-service'

type Transaction = Prisma.TransactionClient
type DivergentOperationWithBinding = Prisma.CollaborationOperationGetPayload<{ include: { binding: true } }>

const divergentDecisionRecordKey = '__appraise_divergent_proposal__'

type PreparedPayload = {
  local: CollaborationRecord[]
  baselines: CollaborationRecord[]
}
type DivergentWorktreeIntent = {
  schema: 'appraise.repository-collaboration.divergent-worktree-intent/v1'
  operationId: string
  repositoryRoot: string
  commonDirectory: string
  worktreePath: string
  sourceRevision: string
  targetRevision: string
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

export type DivergentGitMutationHooks = {
  /** Test-only seam for path-retarget races around filesystem effects. */
  inspectRepository?: CollaborationGitIdentityInspector
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
  return { operation, lease, commonDirectory: identity.commonDirectory }
}

async function releasePreparationLease(client: PrismaClient, lease: CollaborationMutationLease) {
  await client.$transaction(transaction => releaseCollaborationGitMutationLock(transaction, lease))
}

async function assertLockedDivergentRepositoryIdentity(
  binding: { repositoryRoot: string; remoteName: string },
  commonDirectory: string,
  hooks?: DivergentGitMutationHooks,
) {
  await assertCollaborationGitMutationIdentity(
    binding.repositoryRoot,
    commonDirectory,
    binding.remoteName,
    hooks?.inspectRepository,
  )
}

async function persistDivergentWorktreeIntent(
  transaction: Transaction,
  operation: DivergentOperationWithBinding,
  commonDirectory: string,
  lease: CollaborationMutationLease,
) {
  await assertCollaborationGitMutationLock(transaction, lease)
  const intent: DivergentWorktreeIntent = {
    schema: 'appraise.repository-collaboration.divergent-worktree-intent/v1',
    operationId: operation.id,
    repositoryRoot: operation.binding.repositoryRoot,
    commonDirectory,
    worktreePath: managedDivergentWorktreePath(operation.id),
    sourceRevision: operation.sourceRevision!,
    targetRevision: operation.targetRevision!,
  }
  const existing = await transaction.collaborationOperationArtifact.findFirst({
    where: { operationId: operation.id, kind: 'DIVERGENT_WORKTREE_INTENT' },
    orderBy: { revision: 'desc' },
  })
  if (existing) {
    if (existing.payloadHash !== collaborationHash(intent) || existing.payloadJson !== JSON.stringify(intent)) {
      throw new ServiceError(
        'The persisted divergent worktree identity does not match this operation.',
        'CONFLICT',
        409,
      )
    }
    return intent
  }
  await transaction.collaborationOperationArtifact.create({
    data: {
      operationId: operation.id,
      kind: 'DIVERGENT_WORKTREE_INTENT',
      revision: 1,
      payloadJson: JSON.stringify(intent),
      payloadHash: collaborationHash(intent),
    },
  })
  await appendCollaborationJournalEntry(transaction, operation.id, 'DIVERGENT_WORKTREE_INTENT', intent, 'STARTED')
  return intent
}

async function acquireDivergentMutationLease(client: PrismaClient, operation: DivergentOperationWithBinding) {
  const identity = await inspectRepository(operation.binding.repositoryRoot, operation.binding.remoteName)
  const lease = await client.$transaction(transaction =>
    acquireCollaborationGitMutationLock(transaction, identity.commonDirectory, operation.id),
  )
  return { identity, lease }
}

/** Runs a worktree removal under the shared Git common-directory fence. The
 * caller owns the durable meaning of the cleanup result, but certification is
 * always made while the same lease still proves both repository identities. */
async function cleanupDivergentWorktreeUnderMutationLease(input: {
  operation: DivergentOperationWithBinding
  preparation: DivergentReconciliationPreparation
  expectedSnapshotHash?: string
  client: PrismaClient
  hooks?: DivergentGitMutationHooks
  recordCleanup: (
    cleanup: Awaited<ReturnType<typeof cleanupDivergentReconciliationWorktree>>,
    lease: CollaborationMutationLease,
  ) => Promise<void>
}) {
  const { identity, lease } = await acquireDivergentMutationLease(input.client, input.operation)
  try {
    return await withCollaborationGitMutationLeaseHeartbeat(input.client, lease, async () => {
      await input.client.$transaction(transaction => assertCollaborationGitMutationLock(transaction, lease))
      await assertLockedDivergentRepositoryIdentity(input.operation.binding, identity.commonDirectory, input.hooks)
      const cleanup = await cleanupDivergentReconciliationWorktree(input.preparation, {
        expectedSnapshotHash: input.expectedSnapshotHash,
      })
      await assertLockedDivergentRepositoryIdentity(input.operation.binding, identity.commonDirectory, input.hooks)
      await input.recordCleanup(cleanup, lease)
      return cleanup
    })
  } finally {
    await input.client.$transaction(transaction => releaseCollaborationGitMutationLock(transaction, lease))
  }
}

/**
 * Builds an isolated source worktree while holding the same fenced lock used
 * by ordinary Git steps. The lease is deliberately released before an agent
 * reviews content; it is reacquired at every later mutation boundary.
 */
export async function prepareDivergentCollaborationReconciliation(
  input: { operationId: string; expectedVersion: number; preparedDigest: string; queueAfterPreparation?: boolean },
  client: PrismaClient = prisma,
  hooks?: DivergentGitMutationHooks,
): Promise<DivergentReconciliationPreparation> {
  const started = await acquirePreparationLease(client, input)
  try {
    const preparation = await withCollaborationGitMutationLeaseHeartbeat(client, started.lease, async () => {
      await assertLockedDivergentRepositoryIdentity(started.operation.binding, started.commonDirectory, hooks)
      const intent = await client.$transaction(transaction =>
        persistDivergentWorktreeIntent(transaction, started.operation, started.commonDirectory, started.lease),
      )
      const prepared = await prepareDivergentReconciliation({
        repositoryRoot: started.operation.binding.repositoryRoot,
        operationId: started.operation.id,
        sourceRevision: started.operation.sourceRevision!,
        targetRevision: started.operation.targetRevision!,
        worktreePath: intent.worktreePath,
      })
      await assertLockedDivergentRepositoryIdentity(started.operation.binding, started.commonDirectory, hooks)
      return prepared
    })
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
      } else {
        await transaction.collaborationOperation.update({
          where: { id: operation.id },
          data: { state: 'READY', acceptedDigest: null, leaseOwner: null, leaseExpiresAt: null },
        })
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
    preparation.worktreePath !== managedDivergentWorktreePath(operation.id) ||
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

async function assertFreshProposalAttempt(
  transaction: Transaction,
  operation: CollaborationOperation,
  fence: DivergentProposalWorkerFence,
  now: Date,
) {
  await assertFreshWorkerFence(transaction, fence, now)
  if (
    operation.intent !== 'RECONCILE' ||
    operation.state !== 'WAITING_FOR_AGENT' ||
    operation.fencingToken !== fence.fencingToken ||
    operation.leaseOwner !== fence.workerId ||
    !operation.leaseExpiresAt ||
    operation.leaseExpiresAt <= now ||
    operation.cancelledAt
  ) {
    throw new ServiceError('The worker lease was replaced before the proposal mutation.', 'CONFLICT', 409)
  }
  const attempt = await transaction.collaborationAttempt.findFirst({
    where: {
      id: fence.attemptId,
      operationId: operation.id,
      workerId: fence.workerId,
      fencingToken: fence.fencingToken,
      claimTokenHash: leaseTokenHash(fence.leaseToken),
      state: 'RUNNING',
      leaseExpiresAt: { gt: now },
    },
    select: { id: true },
  })
  if (!attempt) throw new ServiceError('The worker attempt was replaced before the proposal mutation.', 'CONFLICT', 409)
}

async function assertDivergentProposalMutationFence(input: {
  client: PrismaClient
  operation: DivergentOperationWithBinding
  proposal: { operationId: string; expectedVersion: number; preparedDigest: string }
  lease: CollaborationMutationLease
  commonDirectory: string
  workerFence?: DivergentProposalWorkerFence
}) {
  await input.client.$transaction(async transaction => {
    const current = await loadPreparedOperation(transaction, input.proposal)
    await assertProposalHasNoDecisionOrAcceptance(transaction, current)
    await assertCollaborationGitMutationLock(transaction, input.lease)
    if (input.workerFence)
      await assertFreshProposalAttempt(transaction, current, input.workerFence, currentProposalPersistenceTime())
  })
  await assertCollaborationGitMutationIdentity(
    input.operation.binding.repositoryRoot,
    input.commonDirectory,
    input.operation.binding.remoteName,
  )
}

async function assertProposalHasNoDecisionOrAcceptance(
  transaction: Transaction,
  operation: Pick<CollaborationOperation, 'id' | 'acceptedDigest'>,
) {
  const [decision, acceptedArtifact, reviewedArtifact] = await Promise.all([
    transaction.collaborationDecision.findFirst({
      where: { operationId: operation.id },
      select: { id: true },
    }),
    transaction.collaborationOperationArtifact.findFirst({
      where: { operationId: operation.id, kind: 'DIVERGENT_ACCEPTED_PROPOSAL' },
      select: { id: true },
    }),
    transaction.collaborationOperationArtifact.findFirst({
      where: { operationId: operation.id, kind: 'DIVERGENT_PROPOSAL_REVIEW' },
      select: { id: true },
    }),
  ])
  if (operation.acceptedDigest || decision || acceptedArtifact || reviewedArtifact) {
    throw new ServiceError(
      'A divergent proposal cannot replace a reviewed decision or accepted artifact.',
      'CONFLICT',
      409,
    )
  }
}

async function recoverDivergentProposalMutation(input: {
  client: PrismaClient
  operation: DivergentOperationWithBinding
  preparation: DivergentReconciliationPreparation
  lease: CollaborationMutationLease
  commonDirectory: string
  cause: unknown
}) {
  const details = {
    worktreePath: input.preparation.worktreePath,
    sourceRevision: input.preparation.sourceRevision,
    message: input.cause instanceof Error ? input.cause.message : String(input.cause),
  }
  await input.client.$transaction(async transaction => {
    await assertCollaborationGitMutationLock(transaction, input.lease)
    await appendCollaborationJournalEntry(
      transaction,
      input.operation.id,
      'DIVERGENT_PROPOSAL_MUTATION_RECOVERY',
      details,
      'STARTED',
    )
  })
  try {
    await assertCollaborationGitMutationIdentity(
      input.operation.binding.repositoryRoot,
      input.commonDirectory,
      input.operation.binding.remoteName,
    )
    await restoreDivergentReconciliationSource(input.preparation)
    await assertCollaborationGitMutationIdentity(
      input.operation.binding.repositoryRoot,
      input.commonDirectory,
      input.operation.binding.remoteName,
    )
    await input.client.$transaction(async transaction => {
      await assertCollaborationGitMutationLock(transaction, input.lease)
      await appendCollaborationJournalEntry(
        transaction,
        input.operation.id,
        'DIVERGENT_PROPOSAL_MUTATION_RECOVERY',
        details,
        'COMPLETED',
      )
    })
  } catch (error) {
    await input.client.$transaction(async transaction => {
      await assertCollaborationGitMutationLock(transaction, input.lease)
      await transaction.collaborationOperation.updateMany({
        where: { id: input.operation.id, state: 'WAITING_FOR_AGENT' },
        data: {
          state: 'BLOCKED',
          blockerJson: JSON.stringify({
            kind: 'DIVERGENT_PROPOSAL_MUTATION_RECOVERY_REQUIRED',
            message: error instanceof Error ? error.message : String(error),
          }),
        },
      })
      await appendCollaborationJournalEntry(
        transaction,
        input.operation.id,
        'DIVERGENT_PROPOSAL_MUTATION_RECOVERY',
        { ...details, recoveryError: error instanceof Error ? error.message : String(error) },
        'BLOCKED',
      )
    })
    throw asServiceError(error)
  }
}

async function validateDivergentProposalUnderMutationLease(input: {
  client: PrismaClient
  operation: DivergentOperationWithBinding
  preparation: DivergentReconciliationPreparation
  proposal: {
    operationId: string
    expectedVersion: number
    preparedDigest: string
    records: CollaborationRecord[]
  }
  workerFence?: DivergentProposalWorkerFence
  hooks?: DivergentProposalHooks
}) {
  const { identity, lease } = await acquireDivergentMutationLease(input.client, input.operation)
  let mutationAttempted = false
  try {
    return await withCollaborationGitMutationLeaseHeartbeat(input.client, lease, async () => {
      await assertDivergentProposalMutationFence({
        client: input.client,
        operation: input.operation,
        proposal: input.proposal,
        lease,
        commonDirectory: identity.commonDirectory,
        workerFence: input.workerFence,
      })
      mutationAttempted = true
      const review = await validateDivergentReconciliationProposal({
        preparation: input.preparation,
        records: input.proposal.records,
      })
      await input.hooks?.afterValidation?.()
      await assertDivergentProposalMutationFence({
        client: input.client,
        operation: input.operation,
        proposal: input.proposal,
        lease,
        commonDirectory: identity.commonDirectory,
        workerFence: input.workerFence,
      })
      return review
    })
  } catch (error) {
    if (mutationAttempted) {
      await recoverDivergentProposalMutation({
        client: input.client,
        operation: input.operation,
        preparation: input.preparation,
        lease,
        commonDirectory: identity.commonDirectory,
        cause: error,
      })
    }
    throw error
  } finally {
    await input.client.$transaction(transaction => releaseCollaborationGitMutationLock(transaction, lease))
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
  workerFence?: DivergentProposalWorkerFence,
  hooks?: DivergentProposalHooks,
): Promise<{
  review: DivergentReconciliationReview
  databaseReviewDigest: string
  requiresDecision: boolean
  operationVersion: number
}> {
  const operation = await client.$transaction(async transaction => {
    const current = await loadPreparedOperation(transaction, input)
    await assertProposalHasNoDecisionOrAcceptance(transaction, current)
    if (workerFence) await assertFreshWorkerFence(transaction, workerFence, currentProposalPersistenceTime())
    return current
  })
  const { preparation } = await storedDivergentPreparation(operation, client)
  try {
    const review = await validateDivergentProposalUnderMutationLease({
      client,
      operation,
      preparation,
      proposal: input,
      workerFence,
      hooks,
    })
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
      await assertProposalHasNoDecisionOrAcceptance(transaction, current)
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

/**
 * Removes only the durable, operation-owned proposal worktree after a REJECT
 * decision.  This is intentionally a second boundary after the decision
 * transaction: Git worktree removal must be serialized by the shared common
 * directory lease, rather than running while the authority transaction is
 * open.  Coordinator callers that decide inside an authority transaction must
 * invoke this after that transaction commits.
 */
export async function cleanupRejectedDivergentCollaborationWorktree(
  operationId: string,
  client: PrismaClient = prisma,
  hooks?: DivergentGitMutationHooks,
) {
  const operation = await client.collaborationOperation.findUnique({
    where: { id: operationId },
    include: { binding: true },
  })
  if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  if (operation.intent !== 'RECONCILE' || operation.state !== 'CANCELLED' || !operation.cancelledAt) {
    throw new ServiceError('No rejected divergent proposal requires cleanup.', 'CONFLICT', 409)
  }
  const rejected = await client.collaborationDecision.findFirst({
    where: { operationId: operation.id, recordKey: divergentDecisionRecordKey, kind: 'REJECT' },
    select: { id: true },
  })
  if (!rejected) throw new ServiceError('No rejected divergent proposal requires cleanup.', 'CONFLICT', 409)
  const { preparation } = await storedDivergentPreparation(operation, client)
  const reviewedArtifact = await client.collaborationOperationArtifact.findFirst({
    where: { operationId: operation.id, kind: 'DIVERGENT_PROPOSAL_REVIEW' },
    orderBy: { revision: 'desc' },
  })
  let proposedSnapshotHash: string | undefined
  try {
    const reviewPayload = reviewedArtifact ? (JSON.parse(reviewedArtifact.payloadJson) as { review?: unknown }) : null
    const review = reviewPayload?.review as { proposedSnapshotHash?: unknown } | undefined
    if (
      !reviewedArtifact ||
      reviewedArtifact.payloadHash !== collaborationHash(reviewPayload) ||
      typeof review?.proposedSnapshotHash !== 'string'
    )
      throw new Error('invalid reviewed proposal artifact')
    proposedSnapshotHash = review.proposedSnapshotHash
  } catch {
    throw new ServiceError('The rejected divergent proposal has no exact reviewed snapshot.', 'CONFLICT', 409)
  }
  try {
    return await cleanupDivergentWorktreeUnderMutationLease({
      operation,
      preparation,
      expectedSnapshotHash: proposedSnapshotHash,
      client,
      hooks,
      recordCleanup: async (cleanup, lease) => {
        // The reviewed artifact names the sole collaboration-only worktree
        // delta that may be removed. Any altered or foreign content is retained.
        if (cleanup.status === 'RETAINED_FOR_RECOVERY')
          throw new ServiceError('Rejected proposal worktree was retained for recovery.', 'CONFLICT', 409, cleanup)
        await client.$transaction(async transaction => {
          await assertCollaborationGitMutationLock(transaction, lease)
          await appendCollaborationJournalEntry(
            transaction,
            operation.id,
            'DIVERGENT_PROPOSAL_REJECT_CLEANUP',
            cleanup,
            'COMPLETED',
          )
        })
      },
    })
  } catch (error) {
    // This is a blocker, not evidence that cleanup completed. The durable
    // decision remains available for conservative recovery.
    await client.collaborationOperation.updateMany({
      where: { id: operation.id, state: 'CANCELLED' },
      data: {
        state: 'BLOCKED',
        blockerJson: JSON.stringify({
          kind: 'DIVERGENT_REJECT_CLEANUP_REQUIRED',
          message: error instanceof Error ? error.message : String(error),
        }),
      },
    })
    throw asServiceError(error)
  }
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
    // A Prisma client can complete the post-decision filesystem boundary here.
    // The public coordinator supplies a transaction for receipt consumption;
    // it invokes the exported helper only after that transaction commits.
    if ('$transaction' in client) await cleanupRejectedDivergentCollaborationWorktree(operation.id, client)
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
  hooks?: DivergentGitMutationHooks,
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
  return cleanupDivergentWorktreeUnderMutationLease({
    operation,
    preparation,
    client,
    hooks,
    recordCleanup: async (outcome, lease) => {
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
    },
  })
}
