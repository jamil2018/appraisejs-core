import type { CollaborationPermission, PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  collaborationHash,
  commitExactCollaborationPaths,
  createDivergentMergeCommit,
  cleanupDivergentReconciliationWorktree,
  fastForwardPinned,
  inspectRepository,
  pushPinnedCommit,
  readRemoteRef,
} from '@/lib/repository-collaboration'
import { ServiceError } from '@/services/shared/errors'

import { requireCollaborationPermission } from './binding-service'
import { appendCollaborationJournalEntry } from './collaboration-journal-service'
import {
  acquireCollaborationGitMutationLock,
  assertCollaborationGitMutationLock,
  releaseCollaborationGitMutationLock,
  type CollaborationMutationLease,
} from './git-mutation-lock-service'

type CollaborationGitStep =
  'FAST_FORWARD_LOCAL' | 'CREATE_COMMIT' | 'CREATE_MERGE_COMMIT' | 'PUSH_REMOTE' | 'CLEANUP_WORKTREE' | 'FINALIZE'

export interface ExecuteCollaborationGitStepInput {
  operationId: string
  expectedVersion: number
  preparedDigest: string
  idempotencyKey: string
}

function assertStepInput(
  operation: { version: number; preparedDigest: string | null; idempotencyKey: string; state: string },
  input: ExecuteCollaborationGitStepInput,
) {
  const digest = input.preparedDigest.startsWith('sha256:')
    ? input.preparedDigest.slice('sha256:'.length)
    : input.preparedDigest
  if (operation.version !== input.expectedVersion || operation.preparedDigest !== digest)
    throw new ServiceError('The collaboration operation changed after preparation.', 'CONFLICT', 409)
  if (operation.idempotencyKey !== input.idempotencyKey)
    throw new ServiceError('The operation idempotency key does not match.', 'CONFLICT', 409)
  if (!['READY', 'COMPLETED'].includes(operation.state))
    throw new ServiceError('The collaboration operation is not ready for execution.', 'CONFLICT', 409)
}

type StartedGitStep = {
  operation: {
    id: string
    version: number
    intent: string
    preparedDigest: string | null
    sourceRevision: string | null
    targetRevision: string | null
    binding: { repositoryRoot: string; remoteName: string; trackedBranch: string }
  }
  step: { ordinal: number; kind: CollaborationGitStep; requiredPermission: CollaborationPermission }
  lease: CollaborationMutationLease
}

async function startStep(
  client: PrismaClient,
  input: ExecuteCollaborationGitStepInput,
  commonDirectory: string,
): Promise<StartedGitStep | null> {
  return client.$transaction(async transaction => {
    const operation = await transaction.collaborationOperation.findUnique({
      where: { id: input.operationId },
      include: { binding: true, steps: { orderBy: { ordinal: 'asc' } } },
    })
    if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
    assertStepInput(operation, input)
    if (operation.state === 'COMPLETED') return null
    const next = operation.steps.find(step => step.state === 'PENDING')
    if (!next) {
      await transaction.collaborationOperation.update({
        where: { id: operation.id },
        data: { state: 'BLOCKED', blockerJson: JSON.stringify({ code: 'LEGACY_PLAN_MISSING' }) },
      })
      throw new ServiceError(
        'Legacy operation has no safe persisted execution plan; prepare it again.',
        'CONFLICT',
        409,
      )
    }
    if (
      next.prerequisiteDigest !== operation.preparedDigest ||
      operation.steps.some(step => step.ordinal < next.ordinal && step.state !== 'COMPLETED')
    )
      throw new ServiceError('The persisted operation plan is not eligible for its next step.', 'CONFLICT', 409)
    if (
      ![
        'FAST_FORWARD_LOCAL',
        'CREATE_COMMIT',
        'CREATE_MERGE_COMMIT',
        'PUSH_REMOTE',
        'CLEANUP_WORKTREE',
        'FINALIZE',
      ].includes(next.kind)
    )
      throw new ServiceError(`The next operation step (${next.kind}) is not a Git step.`, 'CONFLICT', 409)
    const step = {
      ordinal: next.ordinal,
      kind: next.kind as CollaborationGitStep,
      requiredPermission: next.requiredPermission,
    }
    await requireCollaborationPermission(
      transaction,
      operation.bindingId,
      step.requiredPermission,
      operation.policyVersion,
    )
    const lease = await acquireCollaborationGitMutationLock(transaction, commonDirectory, operation.id)
    const updated = await transaction.collaborationOperation.update({
      where: { id: operation.id },
      data: { state: 'APPLYING', version: { increment: 1 } },
      include: { binding: true },
    })
    await transaction.collaborationOperationStep.update({
      where: { operationId_ordinal: { operationId: operation.id, ordinal: step.ordinal } },
      data: {
        state: 'RUNNING',
        startedVersion: updated.version,
        fencingToken: lease.fencingToken,
        startedAt: new Date(),
      },
    })
    await appendCollaborationJournalEntry(
      transaction,
      operation.id,
      `GIT_${step.kind}_INTENT`,
      { expectedVersion: input.expectedVersion, lockKey: lease.lockKey, fencingToken: lease.fencingToken },
      'STARTED',
    )
    return { operation: updated, step, lease }
  })
}

async function completeStep(
  client: PrismaClient,
  started: StartedGitStep,
  details: Record<string, unknown>,
  revisions: { sourceRevision?: string; targetRevision?: string } = {},
) {
  return client.$transaction(async transaction => {
    await assertCollaborationGitMutationLock(transaction, started.lease)
    const operation = await transaction.collaborationOperation.findUnique({
      where: { id: started.operation.id },
      include: { steps: true },
    })
    if (!operation || operation.version !== started.operation.version || operation.state !== 'APPLYING')
      throw new ServiceError('The collaboration step was replaced before completion.', 'CONFLICT', 409)
    const persisted = operation.steps.find(step => step.ordinal === started.step.ordinal && step.state === 'RUNNING')
    if (!persisted) throw new ServiceError('The persisted Git step was replaced before completion.', 'CONFLICT', 409)
    const evidenceHash = collaborationHash(details)
    await transaction.collaborationOperationStep.update({
      where: { operationId_ordinal: { operationId: operation.id, ordinal: persisted.ordinal } },
      data: { state: 'COMPLETED', evidenceJson: JSON.stringify(details), evidenceHash, completedAt: new Date() },
    })
    await transaction.collaborationOperationArtifact.create({
      data: {
        operationId: operation.id,
        kind: `STEP_${started.step.kind}`,
        revision: 1,
        payloadJson: JSON.stringify(details),
        payloadHash: evidenceHash,
      },
    })
    await appendCollaborationJournalEntry(
      transaction,
      operation.id,
      `GIT_${started.step.kind}_OBSERVED`,
      details,
      'COMPLETED',
    )
    const terminal = operation.steps.every(step => step.id === persisted.id || step.state === 'COMPLETED')
    return transaction.collaborationOperation.update({
      where: { id: operation.id },
      data: {
        ...revisions,
        state: terminal ? 'COMPLETED' : 'READY',
        ...(terminal
          ? { completedAt: new Date(), receiptJson: JSON.stringify(details), receiptHash: evidenceHash }
          : {}),
        version: { increment: 1 },
      },
    })
  })
}

async function blockStep(client: PrismaClient, started: StartedGitStep, error: unknown) {
  const message = error instanceof Error ? error.message : 'Git collaboration step failed.'
  return client.$transaction(async transaction => {
    await assertCollaborationGitMutationLock(transaction, started.lease)
    const operation = await transaction.collaborationOperation.findUnique({ where: { id: started.operation.id } })
    if (!operation || operation.version !== started.operation.version) return null
    await transaction.collaborationOperationStep.update({
      where: { operationId_ordinal: { operationId: operation.id, ordinal: started.step.ordinal } },
      data: {
        state: 'BLOCKED',
        evidenceJson: JSON.stringify({ message }),
        evidenceHash: collaborationHash({ message }),
        completedAt: new Date(),
      },
    })
    await appendCollaborationJournalEntry(
      transaction,
      operation.id,
      `GIT_${started.step.kind}_OBSERVED`,
      { message },
      'BLOCKED',
    )
    return transaction.collaborationOperation.update({
      where: { id: operation.id },
      data: {
        state: 'BLOCKED',
        blockerJson: JSON.stringify({ step: started.step.kind, message }),
        version: { increment: 1 },
      },
    })
  })
}

async function executeStartedGitStep(started: StartedGitStep, client: PrismaClient) {
  const binding = started.operation.binding
  switch (started.step.kind) {
    case 'FAST_FORWARD_LOCAL': {
      if (!started.operation.sourceRevision || !started.operation.targetRevision)
        throw new ServiceError('Pinned source and target revisions are required for fast-forward.', 'CONFLICT', 409)
      const integrated = await fastForwardPinned({
        repositoryRoot: binding.repositoryRoot,
        remote: binding.remoteName,
        branch: binding.trackedBranch,
        expectedHead: started.operation.targetRevision,
        pinnedCommit: started.operation.sourceRevision,
      })
      return completeStep(client, started, integrated, { targetRevision: integrated.head })
    }
    case 'CREATE_COMMIT': {
      const identity = await inspectRepository(binding.repositoryRoot, binding.remoteName)
      const committed = await commitExactCollaborationPaths({
        repositoryRoot: binding.repositoryRoot,
        remote: binding.remoteName,
        branch: binding.trackedBranch,
        expectedHead: started.operation.targetRevision ?? identity.head,
        message: `Appraise collaboration ${started.operation.intent.toLowerCase()} ${started.operation.id}`,
      })
      return completeStep(client, started, committed, {
        sourceRevision: committed.commit,
        targetRevision: committed.parent,
      })
    }
    case 'CREATE_MERGE_COMMIT': {
      const proposal = await client.collaborationOperationArtifact.findFirst({
        where: { operationId: started.operation.id, kind: 'DIVERGENT_PROPOSAL_REVIEW' },
        orderBy: { revision: 'desc' },
      })
      if (!proposal) throw new ServiceError('No persisted divergent proposal is available.', 'CONFLICT', 409)
      const payload = JSON.parse(proposal.payloadJson) as { review?: unknown; records?: unknown[] }
      if (!payload.review || !Array.isArray(payload.records))
        throw new ServiceError('The persisted divergent proposal is invalid.', 'CONFLICT', 409)
      const evidence = await createDivergentMergeCommit({
        review: payload.review as Parameters<typeof createDivergentMergeCommit>[0]['review'],
        records: payload.records as Parameters<typeof createDivergentMergeCommit>[0]['records'],
      })
      return completeStep(client, started, { ...evidence }, { sourceRevision: evidence.mergeCommit })
    }
    case 'PUSH_REMOTE': {
      if (!started.operation.sourceRevision)
        throw new ServiceError('A collaboration commit is required before push.', 'CONFLICT', 409)
      const merge = await client.collaborationOperationArtifact.findFirst({
        where: { operationId: started.operation.id, kind: 'STEP_CREATE_MERGE_COMMIT' },
        orderBy: { revision: 'desc' },
      })
      const expectedRemoteCommit = merge
        ? ((JSON.parse(merge.payloadJson) as { parents?: [string, string] }).parents?.[0] ?? null)
        : started.operation.targetRevision
      const pushed = await pushPinnedCommit({
        repositoryRoot: binding.repositoryRoot,
        remote: binding.remoteName,
        branch: binding.trackedBranch,
        commit: started.operation.sourceRevision,
        expectedRemoteCommit,
        expectedParent: merge ? undefined : (started.operation.targetRevision ?? undefined),
      })
      return completeStep(
        client,
        started,
        { ...pushed, operationId: started.operation.id, operationDigest: started.operation.preparedDigest },
        { targetRevision: pushed.remoteCommit },
      )
    }
    case 'CLEANUP_WORKTREE': {
      const merge = await client.collaborationOperationArtifact.findFirst({
        where: { operationId: started.operation.id, kind: 'STEP_CREATE_MERGE_COMMIT' },
        orderBy: { revision: 'desc' },
      })
      if (!merge) throw new ServiceError('No merge worktree cleanup artifact exists.', 'CONFLICT', 409)
      const evidence = JSON.parse(merge.payloadJson) as {
        preparation?: Parameters<typeof cleanupDivergentReconciliationWorktree>[0]
      }
      if (!evidence.preparation) throw new ServiceError('Merge cleanup artifact is invalid.', 'CONFLICT', 409)
      const cleanup = await cleanupDivergentReconciliationWorktree(evidence.preparation)
      if (cleanup.status === 'RETAINED_FOR_RECOVERY')
        throw new ServiceError('Merge worktree remains dirty and requires recovery review.', 'CONFLICT', 409, cleanup)
      return completeStep(client, started, cleanup)
    }
    case 'FINALIZE':
      return completeStep(client, started, {
        operationId: started.operation.id,
        operationDigest: started.operation.preparedDigest,
      })
  }
}

export async function getCollaborationGitStatus(bindingId: string, client: PrismaClient = prisma) {
  const binding = await client.collaborationBinding.findUnique({ where: { id: bindingId } })
  if (!binding) throw new ServiceError('Collaboration binding was not found.', 'NOT_FOUND', 404)
  const status = await inspectRepository(binding.repositoryRoot, binding.remoteName)
  const remoteRevision = await readRemoteRef({
    repositoryRoot: binding.repositoryRoot,
    remote: binding.remoteName,
    branch: binding.trackedBranch,
  })
  await client.collaborationBinding.update({ where: { id: binding.id }, data: { lastObservedAt: new Date() } })
  return { ...status, remoteRevision }
}

/** Executes only the derived next persisted Git step; terminal exact replay is immutable. */
export async function executeCollaborationGitStep(
  input: ExecuteCollaborationGitStepInput,
  client: PrismaClient = prisma,
) {
  const operation = await client.collaborationOperation.findUnique({
    where: { id: input.operationId },
    include: { binding: true },
  })
  if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  const identity = await inspectRepository(operation.binding.repositoryRoot, operation.binding.remoteName)
  const started = await startStep(client, input, identity.commonDirectory)
  if (!started) return operation
  try {
    return await executeStartedGitStep(started, client)
  } catch (error) {
    await blockStep(client, started, error)
    if (error instanceof ServiceError) throw error
    throw new ServiceError(error instanceof Error ? error.message : 'Git collaboration step failed.', 'CONFLICT', 409)
  } finally {
    await client.$transaction(transaction => releaseCollaborationGitMutationLock(transaction, started.lease))
  }
}

export async function recoverCollaborationGitOperation(operationId: string, client: PrismaClient = prisma) {
  const operation = await client.collaborationOperation.findUnique({
    where: { id: operationId },
    include: {
      binding: true,
      journalEntries: { orderBy: { sequence: 'asc' } },
      steps: { orderBy: { ordinal: 'asc' } },
    },
  })
  if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  const [status, remoteRevision] = await Promise.all([
    inspectRepository(operation.binding.repositoryRoot, operation.binding.remoteName),
    readRemoteRef({
      repositoryRoot: operation.binding.repositoryRoot,
      remote: operation.binding.remoteName,
      branch: operation.binding.trackedBranch,
    }),
  ])
  return {
    operationId: operation.id,
    state: operation.state,
    operationDigest: operation.preparedDigest,
    localHead: status.head,
    remoteRevision,
    pushConfirmed: Boolean(operation.sourceRevision && remoteRevision === operation.sourceRevision),
    steps: operation.steps.map(step => ({
      ordinal: step.ordinal,
      kind: step.kind,
      state: step.state,
      evidenceHash: step.evidenceHash,
    })),
    journal: operation.journalEntries.map(entry => ({
      boundary: entry.boundary,
      status: entry.status,
      details: JSON.parse(entry.detailsJson) as unknown,
    })),
    recoveryDigest: collaborationHash({
      operationId: operation.id,
      localHead: status.head,
      remoteRevision,
      steps: operation.steps.map(step => [step.ordinal, step.state]),
    }),
  }
}
