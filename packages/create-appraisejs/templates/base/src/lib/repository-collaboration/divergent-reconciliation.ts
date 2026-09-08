import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { collaborationHash } from './canonical'
import { type CollaborationRecord } from './contracts'
import { installCollaborationSnapshot } from './filesystem'
import { inspectRepository } from './git-repository'
import { runGit } from './git-runner'
import { readCollaborationSnapshot } from './reader'
import { buildCollaborationSnapshotFiles } from './snapshot'

const collaborationRoot = path.join('appraise', 'collaboration')
const commitPattern = /^[0-9a-f]{40,64}$/u
const operationPattern = /^[A-Za-z0-9_-]{1,120}$/u

type SourceState = {
  sourceRevision: string
  sourceTree: string
  targetRevision: string
  targetTree: string
}

export class DivergentReconciliationError extends Error {
  constructor(
    readonly code: 'FOREIGN_FILE_CONFLICT' | 'STALE_SOURCE' | 'INVALID_PROPOSAL' | 'RECOVERY_REQUIRED',
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'DivergentReconciliationError'
  }
}

export interface DivergentReconciliationPreparation extends SourceState {
  operationId: string
  repositoryRoot: string
  worktreePath: string
  mergeBaseRevision: string
  sourceSnapshotHash: string
  portableProjectId: string
  collaborationPaths: string[]
}

export interface DivergentReconciliationReview {
  preparation: DivergentReconciliationPreparation
  proposedSnapshotHash: string
  proposalDigest: string
  reviewDigest: string
}

export type DivergentWorktreeCleanup =
  | { status: 'NO_WORKTREE' }
  | { status: 'REMOVED' }
  | { status: 'RETAINED_FOR_RECOVERY'; worktreePath: string; changedPaths: string[] }

function assertCommit(value: string, label: string): void {
  if (!commitPattern.test(value)) throw new Error(`${label} must be a full Git object identity.`)
}

function assertOperationId(operationId: string): void {
  if (!operationPattern.test(operationId)) throw new Error('Collaboration operation identity is invalid.')
}

function isCollaborationPath(filePath: string): boolean {
  return filePath === 'appraise/collaboration' || filePath.startsWith('appraise/collaboration/')
}

function paths(output: string): string[] {
  return output
    .split('\0')
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
}

async function treeFor(repositoryRoot: string, revision: string): Promise<string> {
  const tree = (await runGit(repositoryRoot, { kind: 'rev-parse', args: [`${revision}^{tree}`] })).stdout.trim()
  assertCommit(tree, 'Git tree')
  return tree
}

async function commitFor(repositoryRoot: string, revision: string): Promise<string> {
  const commit = (await runGit(repositoryRoot, { kind: 'rev-parse', args: [`${revision}^{commit}`] })).stdout.trim()
  assertCommit(commit, 'Git commit')
  return commit
}

async function changedPaths(repositoryRoot: string, older: string, newer: string): Promise<string[]> {
  return paths((await runGit(repositoryRoot, { kind: 'diff-names', range: `${older}..${newer}` })).stdout)
}

function temporaryWorktreePath(operationId: string): string {
  assertOperationId(operationId)
  return path.join(os.tmpdir(), `appraise-collaboration-${operationId}-${randomUUID()}`)
}

async function sourceState(input: {
  repositoryRoot: string
  sourceRevision: string
  targetRevision: string
}): Promise<SourceState> {
  assertCommit(input.sourceRevision, 'Source revision')
  assertCommit(input.targetRevision, 'Target revision')
  const identity = await inspectRepository(input.repositoryRoot)
  if (identity.head !== input.targetRevision) {
    throw new DivergentReconciliationError('STALE_SOURCE', 'The target Git HEAD changed after divergent preparation.', {
      expectedTargetRevision: input.targetRevision,
      actualTargetRevision: identity.head,
    })
  }
  const sourceRevision = await commitFor(identity.repositoryRoot, input.sourceRevision)
  if (sourceRevision !== input.sourceRevision) {
    throw new DivergentReconciliationError('STALE_SOURCE', 'The supplied source revision did not resolve exactly.', {
      expectedSourceRevision: input.sourceRevision,
      actualSourceRevision: sourceRevision,
    })
  }
  return {
    sourceRevision,
    sourceTree: await treeFor(identity.repositoryRoot, sourceRevision),
    targetRevision: identity.head,
    targetTree: await treeFor(identity.repositoryRoot, identity.head),
  }
}

async function ensureCollaborationOnlyDivergence(
  repositoryRoot: string,
  source: SourceState,
): Promise<{
  mergeBaseRevision: string
  collaborationPaths: string[]
}> {
  const mergeBaseRevision = (
    await runGit(repositoryRoot, { kind: 'merge-base', left: source.targetRevision, right: source.sourceRevision })
  ).stdout.trim()
  assertCommit(mergeBaseRevision, 'Git merge base')
  const changed = [
    ...(await changedPaths(repositoryRoot, mergeBaseRevision, source.targetRevision)),
    ...(await changedPaths(repositoryRoot, mergeBaseRevision, source.sourceRevision)),
  ]
  const foreignPaths = [...new Set(changed.filter(filePath => !isCollaborationPath(filePath)))].sort()
  if (foreignPaths.length) {
    throw new DivergentReconciliationError(
      'FOREIGN_FILE_CONFLICT',
      'Divergent reconciliation is restricted to appraise/collaboration; code or foreign-file changes require external handoff.',
      { mergeBaseRevision, foreignPaths },
    )
  }
  return { mergeBaseRevision, collaborationPaths: [...new Set(changed)].sort() }
}

/**
 * Creates a detached worktree at the pinned source revision. It deliberately
 * refuses every divergent range that touches a non-collaboration path, so an
 * agent never receives code-conflict authority.
 */
export async function prepareDivergentReconciliation(input: {
  repositoryRoot: string
  operationId: string
  sourceRevision: string
  targetRevision: string
}): Promise<DivergentReconciliationPreparation> {
  assertOperationId(input.operationId)
  const source = await sourceState(input)
  const identity = await inspectRepository(input.repositoryRoot)
  const divergence = await ensureCollaborationOnlyDivergence(identity.repositoryRoot, source)
  const worktreePath = temporaryWorktreePath(input.operationId)
  await runGit(identity.repositoryRoot, {
    kind: 'worktree-add-detached',
    worktreePath,
    commit: source.sourceRevision,
  })
  try {
    const snapshot = await readCollaborationSnapshot(path.join(worktreePath, collaborationRoot))
    return {
      operationId: input.operationId,
      repositoryRoot: identity.repositoryRoot,
      worktreePath,
      ...source,
      ...divergence,
      sourceSnapshotHash: snapshot.snapshotHash,
      portableProjectId: snapshot.manifest.portableProjectId,
    }
  } catch (error) {
    await runGit(identity.repositoryRoot, { kind: 'worktree-remove', worktreePath })
    throw error
  }
}

async function assertPreparedSource(preparation: DivergentReconciliationPreparation): Promise<void> {
  const current = await sourceState({
    repositoryRoot: preparation.repositoryRoot,
    sourceRevision: preparation.sourceRevision,
    targetRevision: preparation.targetRevision,
  })
  if (current.sourceTree !== preparation.sourceTree || current.targetTree !== preparation.targetTree) {
    throw new DivergentReconciliationError('STALE_SOURCE', 'The reviewed Git tree changed after preparation.', {
      expectedSourceTree: preparation.sourceTree,
      actualSourceTree: current.sourceTree,
      expectedTargetTree: preparation.targetTree,
      actualTargetTree: current.targetTree,
    })
  }
}

function assertProposal(records: CollaborationRecord[], portableProjectId: string): void {
  try {
    const snapshot = buildCollaborationSnapshotFiles(records, portableProjectId)
    if (snapshot.manifest.portableProjectId !== portableProjectId) {
      throw new Error('Portable project identity does not match the divergent preparation.')
    }
  } catch (error) {
    throw new DivergentReconciliationError(
      'INVALID_PROPOSAL',
      error instanceof Error ? `The proposed collaboration records are invalid: ${error.message}` : 'Invalid proposal.',
    )
  }
}

/** Validates a complete, whole-record proposal and writes it only to the detached worktree. */
export async function validateDivergentReconciliationProposal(input: {
  preparation: DivergentReconciliationPreparation
  records: CollaborationRecord[]
}): Promise<DivergentReconciliationReview> {
  await assertPreparedSource(input.preparation)
  assertProposal(input.records, input.preparation.portableProjectId)
  const current = await readCollaborationSnapshot(path.join(input.preparation.worktreePath, collaborationRoot))
  if (current.snapshotHash !== input.preparation.sourceSnapshotHash) {
    throw new DivergentReconciliationError('STALE_SOURCE', 'The isolated worktree changed outside this proposal.', {
      expectedSnapshotHash: input.preparation.sourceSnapshotHash,
      actualSnapshotHash: current.snapshotHash,
    })
  }
  const snapshot = buildCollaborationSnapshotFiles(input.records, input.preparation.portableProjectId)
  const installed = await installCollaborationSnapshot({
    repositoryRoot: input.preparation.worktreePath,
    operationId: `${input.preparation.operationId}-proposal`,
    snapshot,
    expectedPreviousSnapshotHash: input.preparation.sourceSnapshotHash,
  })
  if (installed.status !== 'succeeded') {
    throw new DivergentReconciliationError(
      'STALE_SOURCE',
      'The isolated collaboration snapshot changed before proposal installation.',
      {
        ...installed,
      },
    )
  }
  await assertCollaborationOnlyWorktree(input.preparation.worktreePath, 'The proposed worktree contains files outside')
  const proposalDigest = collaborationHash({ records: snapshot.manifest.records, snapshotHash: snapshot.snapshotHash })
  return {
    preparation: input.preparation,
    proposedSnapshotHash: snapshot.snapshotHash,
    proposalDigest,
    reviewDigest: collaborationHash({
      operationId: input.preparation.operationId,
      sourceRevision: input.preparation.sourceRevision,
      sourceTree: input.preparation.sourceTree,
      targetRevision: input.preparation.targetRevision,
      targetTree: input.preparation.targetTree,
      sourceSnapshotHash: input.preparation.sourceSnapshotHash,
      proposedSnapshotHash: snapshot.snapshotHash,
      proposalDigest,
    }),
  }
}

/** Rechecks every source identity immediately before a reviewed proposal is integrated. */
export async function assertDivergentReconciliationReview(review: DivergentReconciliationReview): Promise<void> {
  await assertPreparedSource(review.preparation)
  const snapshot = await readCollaborationSnapshot(path.join(review.preparation.worktreePath, collaborationRoot))
  if (snapshot.snapshotHash !== review.proposedSnapshotHash) {
    throw new DivergentReconciliationError(
      'STALE_SOURCE',
      'The reviewed worktree snapshot changed after proposal review.',
      {
        expectedSnapshotHash: review.proposedSnapshotHash,
        actualSnapshotHash: snapshot.snapshotHash,
      },
    )
  }
  await assertCollaborationOnlyWorktree(
    review.preparation.worktreePath,
    'The reviewed worktree contains foreign changes',
  )
}

async function assertCollaborationOnlyWorktree(worktreePath: string, message: string): Promise<void> {
  const changed = paths((await runGit(worktreePath, { kind: 'diff-names' })).stdout)
  const foreignPaths = changed.filter(filePath => !isCollaborationPath(filePath))
  if (foreignPaths.length) {
    throw new DivergentReconciliationError('FOREIGN_FILE_CONFLICT', `${message}.`, {
      foreignPaths,
    })
  }
}

function isOwnedTemporaryWorktree(worktreePath: string): boolean {
  const expectedParent = path.resolve(os.tmpdir())
  const candidate = path.resolve(worktreePath)
  return path.dirname(candidate) === expectedParent && path.basename(candidate).startsWith('appraise-collaboration-')
}

/**
 * Only clean, Appraise-created worktrees are removed automatically. Dirty or
 * ambiguous worktrees are retained as recovery evidence for human review.
 */
export async function cleanupDivergentReconciliationWorktree(
  preparation: DivergentReconciliationPreparation,
): Promise<DivergentWorktreeCleanup> {
  if (!isOwnedTemporaryWorktree(preparation.worktreePath)) {
    throw new DivergentReconciliationError(
      'RECOVERY_REQUIRED',
      'The divergent worktree is not an Appraise temporary path.',
      {
        worktreePath: preparation.worktreePath,
      },
    )
  }
  try {
    await fs.lstat(preparation.worktreePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'NO_WORKTREE' }
    throw error
  }
  const status = await inspectRepository(preparation.worktreePath)
  const [staged, unstaged] = await Promise.all([
    runGit(preparation.worktreePath, { kind: 'diff-names', cached: true }),
    runGit(preparation.worktreePath, { kind: 'diff-names' }),
  ])
  const changedPaths = [...new Set([...paths(staged.stdout), ...paths(unstaged.stdout)])].sort()
  if (status.untrackedPaths.length) changedPaths.push('UNTRACKED_CONTENT')
  if ((status.stagedPaths.length || status.worktreePaths.length) && !changedPaths.length) {
    changedPaths.push('UNPARSEABLE_GIT_STATUS')
  }
  if (changedPaths.length)
    return { status: 'RETAINED_FOR_RECOVERY', worktreePath: preparation.worktreePath, changedPaths }
  await runGit(preparation.repositoryRoot, { kind: 'worktree-remove', worktreePath: preparation.worktreePath })
  return { status: 'REMOVED' }
}
