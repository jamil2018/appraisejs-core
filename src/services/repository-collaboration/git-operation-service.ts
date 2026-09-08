import type { CollaborationPermission, Prisma, PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  canonicalJson,
  collaborationHash,
  commitExactCollaborationPaths,
  createDivergentMergeCommit,
  cleanupDivergentReconciliationWorktree,
  fetchOperationRecoveryRef,
  fastForwardPinned,
  isCommitAncestor,
  inspectRepository,
  pushPinnedCommit,
  readRemoteRef,
  restoreCollaborationIndex,
  verifyExactCollaborationCommit,
} from '@/lib/repository-collaboration'
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
    acceptedDigest: string | null
    sourceRevision: string | null
    targetRevision: string | null
    binding: { repositoryRoot: string; remoteName: string; trackedBranch: string; portableProjectId: string }
  }
  step: {
    ordinal: number
    kind: CollaborationGitStep
    requiredPermission: CollaborationPermission
    requestVersion: number
    intentJson: string
    intentHash: string
    executorEpoch: number
  }
  lease: CollaborationMutationLease
}

function gitStepIntent(input: {
  operation: {
    id: string
    intent: string
    preparedDigest: string | null
    sourceRevision: string | null
    targetRevision: string | null
  }
  step: { ordinal: number; kind: CollaborationGitStep; requiredPermission: CollaborationPermission }
  requestVersion: number
  executorEpoch: number
  fencingToken: number
  commit?: { expectedParent: string; expectedSnapshotHash: string }
}): Record<string, unknown> {
  return {
    schema: 'appraise.repository-collaboration.git-step-intent/v1',
    operationId: input.operation.id,
    operationIntent: input.operation.intent,
    preparedDigest: input.operation.preparedDigest,
    ordinal: input.step.ordinal,
    kind: input.step.kind,
    requiredPermission: input.step.requiredPermission,
    requestVersion: input.requestVersion,
    executorEpoch: input.executorEpoch,
    fencingToken: input.fencingToken,
    sourceRevision: input.operation.sourceRevision,
    targetRevision: input.operation.targetRevision,
    ...(input.commit ? { commit: input.commit } : {}),
  }
}

async function persistGitStepIntent(
  transaction: Prisma.TransactionClient,
  input: {
    operation: { id: string; version: number }
    step: { ordinal: number; kind: CollaborationGitStep }
    requestVersion: number
    executorEpoch: number
    fencingToken: number
    intent: Record<string, unknown>
    intentJson: string
    intentHash: string
    lockKey: string
  },
) {
  const updated = await transaction.collaborationOperation.update({
    where: { id: input.operation.id },
    data: { state: 'APPLYING', executorEpoch: input.executorEpoch, version: { increment: 1 } },
    include: { binding: true },
  })
  await transaction.collaborationOperationStep.update({
    where: { operationId_ordinal: { operationId: input.operation.id, ordinal: input.step.ordinal } },
    data: {
      state: 'RUNNING',
      requestVersion: input.requestVersion,
      intentJson: input.intentJson,
      intentHash: input.intentHash,
      executorEpoch: input.executorEpoch,
      startedVersion: updated.version,
      fencingToken: input.fencingToken,
      startedAt: new Date(),
    },
  })
  await transaction.collaborationOperationArtifact.create({
    data: {
      operationId: input.operation.id,
      kind: `GIT_STEP_INTENT_${input.step.ordinal}`,
      revision: input.executorEpoch,
      payloadJson: input.intentJson,
      payloadHash: input.intentHash,
    },
  })
  await appendCollaborationJournalEntry(
    transaction,
    input.operation.id,
    `GIT_${input.step.kind}_INTENT`,
    { intent: input.intent, intentHash: input.intentHash, lockKey: input.lockKey },
    'STARTED',
  )
  return updated
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
    let commit: { expectedParent: string; expectedSnapshotHash: string } | undefined
    if (step.kind === 'CREATE_COMMIT') {
      const installation = await transaction.collaborationOperationArtifact.findFirst({
        where: { operationId: operation.id, kind: 'STEP_INSTALL_SNAPSHOT' },
        orderBy: { revision: 'desc' },
      })
      if (!installation || !operation.targetRevision)
        throw new ServiceError('No exact installed snapshot and parent are persisted for this commit.', 'CONFLICT', 409)
      let installed: { publishedSnapshotHash?: unknown }
      try {
        installed = JSON.parse(installation.payloadJson) as { publishedSnapshotHash?: unknown }
      } catch {
        throw new ServiceError('The installed snapshot receipt is invalid.', 'CONFLICT', 409)
      }
      if (typeof installed.publishedSnapshotHash !== 'string')
        throw new ServiceError('The installed snapshot receipt is invalid.', 'CONFLICT', 409)
      commit = { expectedParent: operation.targetRevision, expectedSnapshotHash: installed.publishedSnapshotHash }
    }
    const lease = await acquireCollaborationGitMutationLock(transaction, commonDirectory, operation.id)
    const executorEpoch = operation.executorEpoch + 1
    const intent = gitStepIntent({
      operation,
      step,
      requestVersion: input.expectedVersion,
      executorEpoch,
      fencingToken: lease.fencingToken,
      commit,
    })
    const intentJson = canonicalJson(intent)
    const intentHash = collaborationHash(intent)
    const updated = await persistGitStepIntent(transaction, {
      operation,
      step,
      requestVersion: input.expectedVersion,
      executorEpoch,
      fencingToken: lease.fencingToken,
      intent,
      intentJson,
      intentHash,
      lockKey: lease.lockKey,
    })
    return {
      operation: updated,
      step: { ...step, requestVersion: input.expectedVersion, intentJson, intentHash, executorEpoch },
      lease,
    }
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
    if (
      !persisted ||
      persisted.requestVersion !== started.step.requestVersion ||
      persisted.intentHash !== started.step.intentHash ||
      persisted.executorEpoch !== started.step.executorEpoch ||
      persisted.fencingToken !== started.lease.fencingToken
    )
      throw new ServiceError('The persisted Git step fence or intent changed before completion.', 'CONFLICT', 409)
    const evidenceHash = collaborationHash(details)
    const completedVersion = operation.version + 1
    await transaction.collaborationOperationStep.update({
      where: { operationId_ordinal: { operationId: operation.id, ordinal: persisted.ordinal } },
      data: {
        state: 'COMPLETED',
        evidenceJson: canonicalJson(details),
        evidenceHash,
        completedVersion,
        completedAt: new Date(),
      },
    })
    await transaction.collaborationOperationArtifact.create({
      data: {
        operationId: operation.id,
        kind: `STEP_${started.step.kind}`,
        revision: 1,
        payloadJson: canonicalJson(details),
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

function parseCreateCommitIntent(intentJson: string): {
  expectedParent: string
  expectedSnapshotHash: string
} {
  let intent: { commit?: { expectedParent?: unknown; expectedSnapshotHash?: unknown } }
  try {
    intent = JSON.parse(
      // The step's immutable intent is written in the transaction that fences
      // the external effect; do not derive recovery identity from mutable
      // operation revisions after the commit may have happened.
      intentJson,
    ) as typeof intent
  } catch {
    throw new ServiceError('The persisted commit intent is invalid.', 'CONFLICT', 409)
  }
  const commit = intent.commit
  if (
    !commit ||
    typeof commit.expectedParent !== 'string' ||
    !/^[a-f0-9]{40,64}$/u.test(commit.expectedParent) ||
    typeof commit.expectedSnapshotHash !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(commit.expectedSnapshotHash)
  ) {
    throw new ServiceError('The persisted commit intent has no exact parent and snapshot identity.', 'CONFLICT', 409)
  }
  return { expectedParent: commit.expectedParent, expectedSnapshotHash: commit.expectedSnapshotHash }
}

function persistedCreateCommitIntent(started: StartedGitStep) {
  return parseCreateCommitIntent(started.step.intentJson)
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
      const commitIntent = persistedCreateCommitIntent(started)
      const committed = await commitExactCollaborationPaths({
        repositoryRoot: binding.repositoryRoot,
        remote: binding.remoteName,
        branch: binding.trackedBranch,
        expectedHead: commitIntent.expectedParent,
        expectedSnapshotHash: commitIntent.expectedSnapshotHash,
        message: `Appraise collaboration ${started.operation.intent.toLowerCase()} ${started.operation.id}`,
      })
      return completeStep(client, started, committed, {
        sourceRevision: committed.commit,
        targetRevision: committed.parent,
      })
    }
    case 'CREATE_MERGE_COMMIT': {
      const proposal = await client.collaborationOperationArtifact.findFirst({
        where: { operationId: started.operation.id, kind: 'DIVERGENT_ACCEPTED_PROPOSAL' },
        orderBy: { revision: 'desc' },
      })
      if (!proposal) throw new ServiceError('No designated accepted divergent proposal is available.', 'CONFLICT', 409)
      const payload = JSON.parse(proposal.payloadJson) as { review?: { reviewDigest?: unknown }; records?: unknown[] }
      if (!payload.review || !Array.isArray(payload.records))
        throw new ServiceError('The designated accepted divergent proposal is invalid.', 'CONFLICT', 409)
      if (
        proposal.payloadHash !== collaborationHash(payload) ||
        payload.review.reviewDigest !== started.operation.acceptedDigest
      )
        throw new ServiceError('The designated accepted proposal digest does not match the operation.', 'CONFLICT', 409)
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
      const proposal = await client.collaborationOperationArtifact.findFirst({
        where: { operationId: started.operation.id, kind: 'DIVERGENT_PREPARATION' },
        orderBy: { revision: 'desc' },
      })
      if (!proposal) throw new ServiceError('No original proposal worktree cleanup artifact exists.', 'CONFLICT', 409)
      const original = JSON.parse(proposal.payloadJson) as Parameters<typeof cleanupDivergentReconciliationWorktree>[0]
      if (proposal.payloadHash !== collaborationHash(original))
        throw new ServiceError('Original proposal worktree artifact is invalid.', 'CONFLICT', 409)
      const accepted = await client.collaborationOperationArtifact.findFirst({
        where: { operationId: started.operation.id, kind: 'DIVERGENT_ACCEPTED_PROPOSAL' },
        orderBy: { revision: 'desc' },
      })
      const acceptedPayload = accepted
        ? (JSON.parse(accepted.payloadJson) as { review?: { proposedSnapshotHash?: string } })
        : null
      if (
        !accepted ||
        accepted.payloadHash !== collaborationHash(acceptedPayload) ||
        typeof acceptedPayload?.review?.proposedSnapshotHash !== 'string'
      )
        throw new ServiceError('No exact accepted proposal cleanup snapshot is persisted.', 'CONFLICT', 409)
      const [mergeCleanup, proposalCleanup] = await Promise.all([
        cleanupDivergentReconciliationWorktree(evidence.preparation),
        cleanupDivergentReconciliationWorktree(original, {
          expectedSnapshotHash: acceptedPayload.review.proposedSnapshotHash,
        }),
      ])
      if (mergeCleanup.status === 'RETAINED_FOR_RECOVERY' || proposalCleanup.status === 'RETAINED_FOR_RECOVERY')
        throw new ServiceError('A divergent worktree remains dirty and requires recovery review.', 'CONFLICT', 409, {
          mergeCleanup,
          proposalCleanup,
        })
      return completeStep(client, started, { mergeCleanup, proposalCleanup })
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

async function observeOperationRepository(binding: {
  repositoryRoot: string
  remoteName: string
  trackedBranch: string
}) {
  const [status, remoteRevision] = await Promise.all([
    inspectRepository(binding.repositoryRoot, binding.remoteName),
    readRemoteRef({
      repositoryRoot: binding.repositoryRoot,
      remote: binding.remoteName,
      branch: binding.trackedBranch,
    }),
  ])
  return { status, remoteRevision }
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
  const digest = input.preparedDigest.startsWith('sha256:')
    ? input.preparedDigest.slice('sha256:'.length)
    : input.preparedDigest
  const replay = await client.collaborationOperationStep.findFirst({
    where: {
      operationId: operation.id,
      state: 'COMPLETED',
      requestVersion: input.expectedVersion,
      completedVersion: operation.version,
    },
  })
  if (replay && operation.preparedDigest === digest && operation.idempotencyKey === input.idempotencyKey)
    return operation
  const identity = await inspectRepository(operation.binding.repositoryRoot, operation.binding.remoteName)
  const started = await startStep(client, input, identity.commonDirectory)
  if (!started) return operation
  try {
    return await withCollaborationGitMutationLeaseHeartbeat(client, started.lease, () =>
      executeStartedGitStep(started, client),
    )
  } catch (error) {
    // A Git command can fail after the external effect has become durable but
    // before its response reaches us. Keep the fenced step APPLYING/RUNNING so
    // recovery can inspect the exact intent and classify the outcome safely.
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
  const { status, remoteRevision } = await observeOperationRepository(operation.binding)
  const running = operation.steps.find(step => step.state === 'RUNNING')
  if (!running || operation.state !== 'APPLYING') {
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

  const recovery = await client.$transaction(async transaction => {
    const lease = await acquireCollaborationGitMutationLock(transaction, status.commonDirectory, operation.id)
    const executorEpoch = operation.executorEpoch + 1
    await transaction.collaborationOperation.update({
      where: { id: operation.id },
      data: { executorEpoch },
    })
    await appendCollaborationJournalEntry(
      transaction,
      operation.id,
      'GIT_RECOVERY_EPOCH_ACQUIRED',
      { executorEpoch, lockKey: lease.lockKey, fencingToken: lease.fencingToken },
      'STARTED',
    )
    return { lease, executorEpoch }
  })
  try {
    return await withCollaborationGitMutationLeaseHeartbeat(client, recovery.lease, async () => {
      // Observations occur only after the new lock epoch is held. A recovery
      // never guesses that an old executor's external effect succeeded.
      const { status: observed, remoteRevision: observedRemote } = await observeOperationRepository(operation.binding)
      // The branch tip alone is not proof after an uncertain push: another
      // writer may have advanced it after our exact commit landed. Fetch into a
      // distinct recovery ref, preserving the preparation source ref, before
      // checking ancestry under the newly acquired mutation lease.
      const recoveredRemote =
        running.kind === 'PUSH_REMOTE'
          ? await fetchOperationRecoveryRef({
              repositoryRoot: operation.binding.repositoryRoot,
              remote: operation.binding.remoteName,
              branch: operation.binding.trackedBranch,
              operationId: operation.id,
            })
          : null
      let recoveredRevisions: { sourceRevision?: string; targetRevision?: string } = {}
      const classification = await (async () => {
        switch (running.kind as CollaborationGitStep) {
          case 'FAST_FORWARD_LOCAL':
            if (operation.sourceRevision && observed.head === operation.sourceRevision) {
              recoveredRevisions = { targetRevision: observed.head }
              return 'VERIFIED_COMPLETED' as const
            }
            if (operation.targetRevision && observed.head === operation.targetRevision)
              return 'SAFE_NO_EFFECT_RETRY' as const
            return 'AMBIGUOUS_BLOCK' as const
          case 'CREATE_COMMIT':
            try {
              const commitIntent = parseCreateCommitIntent(running.intentJson!)
              const verified = await verifyExactCollaborationCommit({
                repositoryRoot: operation.binding.repositoryRoot,
                operationId: operation.id,
                commit: observed.head,
                expectedParent: commitIntent.expectedParent,
                expectedSnapshotHash: commitIntent.expectedSnapshotHash,
              })
              if (verified.matched) {
                recoveredRevisions = {
                  sourceRevision: observed.head,
                  targetRevision: commitIntent.expectedParent,
                }
                return 'VERIFIED_COMPLETED' as const
              }
              if (observed.head === commitIntent.expectedParent) return 'SAFE_NO_EFFECT_RETRY' as const
              return 'AMBIGUOUS_BLOCK' as const
            } catch {
              return 'AMBIGUOUS_BLOCK' as const
            }
          case 'PUSH_REMOTE':
            if (
              operation.sourceRevision &&
              recoveredRemote &&
              (await isCommitAncestor({
                repositoryRoot: operation.binding.repositoryRoot,
                ancestor: operation.sourceRevision,
                descendant: recoveredRemote.fetchedCommit,
              }))
            ) {
              recoveredRevisions = { targetRevision: recoveredRemote.fetchedCommit }
              return 'VERIFIED_COMPLETED' as const
            }
            if (recoveredRemote?.fetchedCommit === operation.targetRevision) return 'SAFE_NO_EFFECT_RETRY' as const
            return 'AMBIGUOUS_BLOCK' as const
          // A merge path is intentionally prepared before review, but a crash
          // during the fresh merge worktree creation leaves no safe commit ID.
          // Cleanup likewise retains its artifacts until a completed receipt
          // proves the worktree identity. Both must block rather than infer.
          case 'CREATE_MERGE_COMMIT':
          case 'CLEANUP_WORKTREE':
          case 'FINALIZE':
            return 'AMBIGUOUS_BLOCK' as const
        }
      })()
      if (classification === 'SAFE_NO_EFFECT_RETRY' && running.kind === 'CREATE_COMMIT') {
        await restoreCollaborationIndex(operation.binding.repositoryRoot)
      }
      return await client.$transaction(async transaction => {
        await assertCollaborationGitMutationLock(transaction, recovery.lease)
        const current = await transaction.collaborationOperation.findUnique({
          where: { id: operation.id },
          include: { steps: true },
        })
        const currentStep = current?.steps.find(step => step.ordinal === running.ordinal)
        if (!current || !currentStep || current.state !== 'APPLYING' || currentStep.state !== 'RUNNING') {
          throw new ServiceError('The applying Git operation changed before recovery.', 'CONFLICT', 409)
        }
        if (!currentStep.intentJson || !currentStep.intentHash || currentStep.executorEpoch === null) {
          await transaction.collaborationOperationStep.update({
            where: { operationId_ordinal: { operationId: current.id, ordinal: currentStep.ordinal } },
            data: { state: 'BLOCKED', evidenceJson: canonicalJson({ code: 'LEGACY_INTENT_MISSING' }) },
          })
          await transaction.collaborationOperation.update({
            where: { id: current.id },
            data: {
              state: 'BLOCKED',
              blockerJson: canonicalJson({ code: 'LEGACY_INTENT_MISSING' }),
              version: { increment: 1 },
            },
          })
          throw new ServiceError(
            'Legacy applying Git operation has no immutable intent; prepare it again.',
            'CONFLICT',
            409,
          )
        }
        const executorEpoch = recovery.executorEpoch
        if (current.executorEpoch !== executorEpoch)
          throw new ServiceError('The recovery executor epoch was replaced before classification.', 'CONFLICT', 409)
        const details = {
          classification,
          recoveredFromExecutorEpoch: currentStep.executorEpoch,
          executorEpoch,
          localHead: observed.head,
          remoteRevision: recoveredRemote?.fetchedCommit ?? observedRemote,
        }
        if (classification === 'SAFE_NO_EFFECT_RETRY') {
          await transaction.collaborationOperationStep.update({
            where: { operationId_ordinal: { operationId: current.id, ordinal: currentStep.ordinal } },
            data: { state: 'PENDING', completedAt: null },
          })
          await appendCollaborationJournalEntry(
            transaction,
            current.id,
            `GIT_${currentStep.kind}_RECOVERY`,
            details,
            'COMPLETED',
          )
          return transaction.collaborationOperation.update({
            where: { id: current.id },
            data: { state: 'READY', executorEpoch, version: { increment: 1 } },
          })
        }
        if (classification === 'VERIFIED_COMPLETED') {
          const completedVersion = current.version + 1
          await transaction.collaborationOperationStep.update({
            where: { operationId_ordinal: { operationId: current.id, ordinal: currentStep.ordinal } },
            data: {
              state: 'COMPLETED',
              evidenceJson: canonicalJson(details),
              evidenceHash: collaborationHash(details),
              completedVersion,
              completedAt: new Date(),
            },
          })
          await transaction.collaborationOperationArtifact.create({
            data: {
              operationId: current.id,
              kind: `STEP_${currentStep.kind}`,
              revision: 2,
              payloadJson: canonicalJson(details),
              payloadHash: collaborationHash(details),
            },
          })
          await appendCollaborationJournalEntry(
            transaction,
            current.id,
            `GIT_${currentStep.kind}_RECOVERY`,
            details,
            'COMPLETED',
          )
          return transaction.collaborationOperation.update({
            where: { id: current.id },
            data: { ...recoveredRevisions, state: 'READY', executorEpoch, version: { increment: 1 } },
          })
        }
        await transaction.collaborationOperationStep.update({
          where: { operationId_ordinal: { operationId: current.id, ordinal: currentStep.ordinal } },
          data: { state: 'BLOCKED', evidenceJson: canonicalJson(details), evidenceHash: collaborationHash(details) },
        })
        await appendCollaborationJournalEntry(
          transaction,
          current.id,
          `GIT_${currentStep.kind}_RECOVERY`,
          details,
          'BLOCKED',
        )
        return transaction.collaborationOperation.update({
          where: { id: current.id },
          data: { state: 'BLOCKED', executorEpoch, blockerJson: canonicalJson(details), version: { increment: 1 } },
        })
      })
    })
  } finally {
    await client.$transaction(transaction => releaseCollaborationGitMutationLock(transaction, recovery.lease))
  }
}
