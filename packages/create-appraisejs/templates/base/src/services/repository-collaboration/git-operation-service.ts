import type { CollaborationPermission, PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  collaborationHash,
  commitExactCollaborationPaths,
  fastForwardPinned,
  fetchTrackedRef,
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

export type CollaborationGitStep = 'FETCH' | 'FAST_FORWARD' | 'COMMIT' | 'PUSH'

export interface ExecuteCollaborationGitStepInput {
  operationId: string
  expectedVersion: number
  preparedDigest: string
  idempotencyKey: string
  step: CollaborationGitStep
}

function permissionForStep(step: CollaborationGitStep): CollaborationPermission {
  switch (step) {
    case 'FETCH':
      return 'OBSERVE'
    case 'FAST_FORWARD':
      return 'INTEGRATE'
    case 'COMMIT':
      return 'COMMIT'
    case 'PUSH':
      return 'PUSH'
  }
}

function assertStepInput(
  operation: {
    version: number
    preparedDigest: string | null
    idempotencyKey: string
    state: string
  },
  input: ExecuteCollaborationGitStepInput,
) {
  if (operation.version !== input.expectedVersion || operation.preparedDigest !== input.preparedDigest) {
    throw new ServiceError('The collaboration operation changed after preparation.', 'CONFLICT', 409)
  }
  if (operation.idempotencyKey !== input.idempotencyKey) {
    throw new ServiceError('The operation idempotency key does not match.', 'CONFLICT', 409)
  }
  if (!['READY', 'APPLYING', 'COMPLETED'].includes(operation.state)) {
    throw new ServiceError('The collaboration operation is not ready for a Git step.', 'CONFLICT', 409)
  }
}

async function startStep(client: PrismaClient, input: ExecuteCollaborationGitStepInput, commonDirectory: string) {
  return client.$transaction(async transaction => {
    const operation = await transaction.collaborationOperation.findUnique({
      where: { id: input.operationId },
      include: { binding: true },
    })
    if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
    assertStepInput(operation, input)
    await requireCollaborationPermission(
      transaction,
      operation.bindingId,
      permissionForStep(input.step),
      operation.policyVersion,
    )
    const lease = await acquireCollaborationGitMutationLock(transaction, commonDirectory, operation.id)
    await appendCollaborationJournalEntry(
      transaction,
      operation.id,
      `GIT_${input.step}_INTENT`,
      {
        expectedVersion: input.expectedVersion,
        sourceRevision: operation.sourceRevision,
        targetRevision: operation.targetRevision,
        lockKey: lease.lockKey,
        fencingToken: lease.fencingToken,
      },
      'STARTED',
    )
    const updated = await transaction.collaborationOperation.update({
      where: { id: operation.id },
      data: { state: 'APPLYING', version: { increment: 1 } },
      include: { binding: true },
    })
    return { operation: updated, lease }
  })
}

async function completeStep(
  client: PrismaClient,
  operationId: string,
  expectedVersion: number,
  lease: CollaborationMutationLease,
  step: CollaborationGitStep,
  details: Record<string, unknown>,
  revisions: { sourceRevision?: string; targetRevision?: string } = {},
) {
  return client.$transaction(async transaction => {
    await assertCollaborationGitMutationLock(transaction, lease)
    const operation = await transaction.collaborationOperation.findUnique({ where: { id: operationId } })
    if (!operation || operation.version !== expectedVersion || operation.state !== 'APPLYING') {
      throw new ServiceError('The collaboration Git step was replaced before completion.', 'CONFLICT', 409)
    }
    await appendCollaborationJournalEntry(transaction, operationId, `GIT_${step}_OBSERVED`, details, 'COMPLETED')
    return transaction.collaborationOperation.update({
      where: { id: operationId },
      data: {
        ...revisions,
        state: 'READY',
        version: { increment: 1 },
      },
    })
  })
}

async function blockStep(
  client: PrismaClient,
  operationId: string,
  expectedVersion: number,
  lease: CollaborationMutationLease,
  step: CollaborationGitStep,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : 'Git collaboration step failed.'
  return client.$transaction(async transaction => {
    await assertCollaborationGitMutationLock(transaction, lease)
    const operation = await transaction.collaborationOperation.findUnique({ where: { id: operationId } })
    if (!operation || operation.version !== expectedVersion) return null
    await appendCollaborationJournalEntry(transaction, operationId, `GIT_${step}_OBSERVED`, { message }, 'BLOCKED')
    return transaction.collaborationOperation.update({
      where: { id: operationId },
      data: { state: 'BLOCKED', blockerJson: JSON.stringify({ step, message }), version: { increment: 1 } },
    })
  })
}

type StartedGitStep = Awaited<ReturnType<typeof startStep>>
type RepositoryIdentity = Awaited<ReturnType<typeof inspectRepository>>

async function fetchStep(started: StartedGitStep, client: PrismaClient, identity: RepositoryIdentity) {
  const binding = started.operation.binding
  const fetched = await fetchTrackedRef({
    repositoryRoot: binding.repositoryRoot,
    remote: binding.remoteName,
    branch: binding.trackedBranch,
  })
  return completeStep(
    client,
    started.operation.id,
    started.operation.version,
    started.lease,
    'FETCH',
    { fetchedCommit: fetched.fetchedCommit },
    { sourceRevision: fetched.fetchedCommit, targetRevision: identity.head },
  )
}

async function fastForwardStep(started: StartedGitStep, client: PrismaClient) {
  const binding = started.operation.binding
  if (!started.operation.sourceRevision || !started.operation.targetRevision) {
    throw new ServiceError('A fetched commit and prepared local HEAD are required for integration.', 'CONFLICT', 409)
  }
  const integrated = await fastForwardPinned({
    repositoryRoot: binding.repositoryRoot,
    remote: binding.remoteName,
    branch: binding.trackedBranch,
    expectedHead: started.operation.targetRevision,
    pinnedCommit: started.operation.sourceRevision,
  })
  return completeStep(
    client,
    started.operation.id,
    started.operation.version,
    started.lease,
    'FAST_FORWARD',
    integrated,
    {
      targetRevision: integrated.head,
    },
  )
}

async function commitStep(started: StartedGitStep, client: PrismaClient, identity: RepositoryIdentity) {
  const binding = started.operation.binding
  const committed = await commitExactCollaborationPaths({
    repositoryRoot: binding.repositoryRoot,
    remote: binding.remoteName,
    branch: binding.trackedBranch,
    expectedHead: started.operation.targetRevision ?? identity.head,
    message: `Appraise collaboration ${started.operation.intent.toLowerCase()} ${started.operation.id}`,
  })
  return completeStep(client, started.operation.id, started.operation.version, started.lease, 'COMMIT', committed, {
    sourceRevision: committed.commit,
    targetRevision: committed.parent,
  })
}

async function pushStep(started: StartedGitStep, client: PrismaClient) {
  const binding = started.operation.binding
  if (!started.operation.sourceRevision) {
    throw new ServiceError('A collaboration commit is required before push.', 'CONFLICT', 409)
  }
  const pushed = await pushPinnedCommit({
    repositoryRoot: binding.repositoryRoot,
    remote: binding.remoteName,
    branch: binding.trackedBranch,
    commit: started.operation.sourceRevision,
    expectedRemoteCommit: started.operation.targetRevision,
  })
  const receipt = { ...pushed, operationId: started.operation.id, operationDigest: started.operation.preparedDigest }
  return completeStep(client, started.operation.id, started.operation.version, started.lease, 'PUSH', receipt, {
    targetRevision: pushed.remoteCommit,
  })
}

const gitStepExecutors = {
  FETCH: fetchStep,
  FAST_FORWARD: fastForwardStep,
  COMMIT: commitStep,
  PUSH: pushStep,
}

async function runPreparedStep(
  input: ExecuteCollaborationGitStepInput,
  client: PrismaClient,
  identity: Awaited<ReturnType<typeof inspectRepository>>,
) {
  const started = await startStep(client, input, identity.commonDirectory)
  try {
    return gitStepExecutors[input.step](started, client, identity)
  } catch (error) {
    await blockStep(client, started.operation.id, started.operation.version, started.lease, input.step, error)
    if (error instanceof ServiceError) throw error
    throw new ServiceError(error instanceof Error ? error.message : 'Git collaboration step failed.', 'CONFLICT', 409)
  } finally {
    await client.$transaction(transaction => releaseCollaborationGitMutationLock(transaction, started.lease))
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

/** Executes one fixed, persisted Git step. Repository arguments are never supplied by the caller. */
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
  return runPreparedStep(input, client, identity)
}

/**
 * Recovery performs only observation. It never retries a push or rewrites
 * history; callers can decide from the returned durable journal and remote ref.
 */
export async function recoverCollaborationGitOperation(operationId: string, client: PrismaClient = prisma) {
  const operation = await client.collaborationOperation.findUnique({
    where: { id: operationId },
    include: { binding: true, journalEntries: { orderBy: { sequence: 'asc' } } },
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
  const pushConfirmed = Boolean(operation.sourceRevision && remoteRevision === operation.sourceRevision)
  return {
    operationId: operation.id,
    state: operation.state,
    operationDigest: operation.preparedDigest,
    localHead: status.head,
    remoteRevision,
    pushConfirmed,
    journal: operation.journalEntries.map(entry => ({
      boundary: entry.boundary,
      status: entry.status,
      details: JSON.parse(entry.detailsJson) as unknown,
    })),
    recoveryDigest: collaborationHash({
      operationId: operation.id,
      localHead: status.head,
      remoteRevision,
      pushConfirmed,
    }),
  }
}
