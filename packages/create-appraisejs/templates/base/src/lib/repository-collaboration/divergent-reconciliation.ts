import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { collaborationHash } from './canonical'
import { type CollaborationRecord } from './contracts'
import { installCollaborationSnapshot } from './filesystem'
import { inspectRepository, readCollaborationSnapshotAtCommit } from './git-repository'
import { runGit, runGitAllowFailure } from './git-runner'
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

export interface DivergentMergeCommitEvidence {
  mergeCommit: string
  mergeTree: string
  parents: [string, string]
  preparation: DivergentReconciliationPreparation
  snapshotHash: string
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

/** The sole server-derived worktree location for a reconciliation operation. */
export function managedDivergentWorktreePath(operationId: string): string {
  assertOperationId(operationId)
  return path.join(os.tmpdir(), `appraise-collaboration-${operationId}`)
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
  worktreePath?: string
}): Promise<DivergentReconciliationPreparation> {
  assertOperationId(input.operationId)
  const source = await sourceState(input)
  const identity = await inspectRepository(input.repositoryRoot)
  const divergence = await ensureCollaborationOnlyDivergence(identity.repositoryRoot, source)
  const worktreePath = input.worktreePath ?? managedDivergentWorktreePath(input.operationId)
  if (worktreePath !== managedDivergentWorktreePath(input.operationId)) {
    throw new DivergentReconciliationError('RECOVERY_REQUIRED', 'The divergent worktree path is not server-derived.')
  }
  try {
    const entry = await fs.lstat(worktreePath)
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new DivergentReconciliationError(
        'RECOVERY_REQUIRED',
        'The divergent worktree path is not a managed directory.',
      )
    }
    const existing = await inspectRepository(worktreePath)
    if (existing.commonDirectory !== identity.commonDirectory || existing.head !== source.sourceRevision) {
      throw new DivergentReconciliationError(
        'RECOVERY_REQUIRED',
        'The existing divergent worktree does not match its operation.',
      )
    }
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
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
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

/** Restores the operation-owned proposal worktree to its exact pinned source
 * snapshot after a stale worker loses authority between filesystem mutation
 * and durable proposal persistence. */
export async function restoreDivergentReconciliationSource(
  preparation: DivergentReconciliationPreparation,
): Promise<void> {
  const [repository, worktree, current, source] = await Promise.all([
    inspectRepository(preparation.repositoryRoot),
    inspectRepository(preparation.worktreePath),
    readCollaborationSnapshot(path.join(preparation.worktreePath, collaborationRoot)),
    readCollaborationSnapshotAtCommit({
      repositoryRoot: preparation.repositoryRoot,
      commit: preparation.sourceRevision,
      operationId: preparation.operationId,
    }),
  ])
  if (worktree.commonDirectory !== repository.commonDirectory || worktree.head !== preparation.sourceRevision) {
    throw new DivergentReconciliationError(
      'RECOVERY_REQUIRED',
      'The divergent worktree cannot be restored because its pinned identity changed.',
    )
  }
  if (source.snapshotHash !== preparation.sourceSnapshotHash) {
    throw new DivergentReconciliationError(
      'RECOVERY_REQUIRED',
      'The pinned source snapshot does not match the divergent preparation.',
    )
  }
  const restored = await installCollaborationSnapshot({
    repositoryRoot: preparation.worktreePath,
    operationId: `${preparation.operationId}-proposal-recovery`,
    snapshot: buildCollaborationSnapshotFiles(source.records, source.manifest.portableProjectId),
    expectedPreviousSnapshotHash: current.snapshotHash,
  })
  if (restored.status !== 'succeeded') {
    throw new DivergentReconciliationError(
      'RECOVERY_REQUIRED',
      'The divergent proposal worktree changed before automatic recovery.',
      restored,
    )
  }
  const recovered = await readCollaborationSnapshot(path.join(preparation.worktreePath, collaborationRoot))
  if (recovered.snapshotHash !== preparation.sourceSnapshotHash) {
    throw new DivergentReconciliationError(
      'RECOVERY_REQUIRED',
      'The divergent proposal worktree could not be restored to its pinned source snapshot.',
    )
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

async function replaceWorktreeSnapshot(
  worktreePath: string,
  snapshot: ReturnType<typeof buildCollaborationSnapshotFiles>,
) {
  const root = await fs.realpath(worktreePath)
  const destination = path.join(root, collaborationRoot)
  const staging = path.join(root, `appraise/.collaboration-merge-${randomUUID()}`)
  await fs.mkdir(staging, { recursive: true, mode: 0o700 })
  for (const [relativePath, content] of snapshot.files) {
    const target = path.resolve(staging, relativePath)
    if (!target.startsWith(`${staging}${path.sep}`)) throw new Error('Divergent snapshot path escapes staging.')
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
    await fs.writeFile(target, content, { flag: 'wx', mode: 0o600 })
  }
  await fs.rm(destination, { recursive: true, force: true })
  await fs.rename(staging, destination)
}

/** Creates the reviewed, two-parent merge only inside a fresh Appraise worktree. */
export async function createDivergentMergeCommit(input: {
  review: DivergentReconciliationReview
  records: CollaborationRecord[]
}): Promise<DivergentMergeCommitEvidence> {
  await assertDivergentReconciliationReview(input.review)
  const preparation = await prepareDivergentReconciliation({
    repositoryRoot: input.review.preparation.repositoryRoot,
    operationId: `${input.review.preparation.operationId}-merge`,
    sourceRevision: input.review.preparation.sourceRevision,
    targetRevision: input.review.preparation.targetRevision,
  })
  const merged = await runGitAllowFailure(preparation.worktreePath, {
    kind: 'merge-no-commit',
    commit: preparation.targetRevision,
  })
  if (merged.exitCode !== 0 && merged.exitCode !== 1) {
    throw new DivergentReconciliationError(
      'RECOVERY_REQUIRED',
      'The owned merge worktree entered an ambiguous Git state.',
      {
        diagnostic: merged.stderr,
      },
    )
  }
  const snapshot = buildCollaborationSnapshotFiles(input.records, preparation.portableProjectId)
  await replaceWorktreeSnapshot(preparation.worktreePath, snapshot)
  await runGit(preparation.worktreePath, { kind: 'add-collaboration' })
  const unmerged = paths((await runGit(preparation.worktreePath, { kind: 'unmerged-paths' })).stdout)
  if (unmerged.length) {
    throw new DivergentReconciliationError(
      'RECOVERY_REQUIRED',
      'The reviewed collaboration merge still has unmerged paths.',
      {
        unmerged,
      },
    )
  }
  await assertCollaborationOnlyWorktree(preparation.worktreePath, 'The merge worktree contains foreign changes')
  await runGit(preparation.worktreePath, {
    kind: 'commit-merge-collaboration',
    message: `Appraise collaboration reconcile ${preparation.operationId}`,
  })
  const [mergeCommit, firstParent, secondParent, mergeTree] = await Promise.all([
    commitFor(preparation.worktreePath, 'HEAD'),
    commitFor(preparation.worktreePath, 'HEAD^1'),
    commitFor(preparation.worktreePath, 'HEAD^2'),
    treeFor(preparation.worktreePath, 'HEAD'),
  ])
  if (firstParent !== preparation.sourceRevision || secondParent !== preparation.targetRevision) {
    throw new DivergentReconciliationError(
      'RECOVERY_REQUIRED',
      'The merge commit parents do not match the reviewed revisions.',
      {
        firstParent,
        secondParent,
      },
    )
  }
  const installed = await readCollaborationSnapshot(path.join(preparation.worktreePath, collaborationRoot))
  if (installed.snapshotHash !== snapshot.snapshotHash) {
    throw new DivergentReconciliationError(
      'RECOVERY_REQUIRED',
      'The merge commit does not contain the reviewed collaboration snapshot.',
    )
  }
  return {
    mergeCommit,
    mergeTree,
    parents: [firstParent, secondParent],
    preparation,
    snapshotHash: snapshot.snapshotHash,
  }
}

function isOwnedTemporaryWorktree(worktreePath: string): boolean {
  const candidate = path.resolve(worktreePath)
  const operationId = path.basename(candidate).slice('appraise-collaboration-'.length)
  return candidate === managedDivergentWorktreePath(operationId)
}

async function verifiedDivergentWorktreeForCleanup(
  preparation: DivergentReconciliationPreparation,
  expectedWorktreeHead: string,
) {
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
    const entry = await fs.lstat(preparation.worktreePath)
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new DivergentReconciliationError(
        'RECOVERY_REQUIRED',
        'The divergent worktree path is not a managed directory during cleanup.',
      )
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  const [repository, worktree] = await Promise.all([
    inspectRepository(preparation.repositoryRoot),
    inspectRepository(preparation.worktreePath),
  ])
  if (worktree.commonDirectory !== repository.commonDirectory || worktree.head !== expectedWorktreeHead) {
    throw new DivergentReconciliationError(
      'RECOVERY_REQUIRED',
      'The divergent worktree identity does not match its pinned source revision during cleanup.',
      {
        expectedCommonDirectory: repository.commonDirectory,
        actualCommonDirectory: worktree.commonDirectory,
        expectedSourceRevision: expectedWorktreeHead,
        actualHead: worktree.head,
      },
    )
  }
  return worktree
}

async function changedDivergentWorktreePaths(
  preparation: DivergentReconciliationPreparation,
  untrackedPaths: string[],
) {
  const [staged, unstaged] = await Promise.all([
    runGit(preparation.worktreePath, { kind: 'diff-names', cached: true }),
    runGit(preparation.worktreePath, { kind: 'diff-names' }),
  ])
  const changedPaths = [...new Set([...paths(staged.stdout), ...paths(unstaged.stdout)])].sort()
  return [...new Set([...changedPaths, ...untrackedPaths])].sort()
}

async function hasExpectedDivergentProposalSnapshot(
  preparation: DivergentReconciliationPreparation,
  expectedSnapshotHash: string | undefined,
  changedPaths: string[],
) {
  if (!expectedSnapshotHash || changedPaths.some(filePath => !isCollaborationPath(filePath))) return false
  try {
    await assertCollaborationOnlyWorktree(preparation.worktreePath, 'The cleanup worktree contains foreign changes')
    const snapshot = await readCollaborationSnapshot(path.join(preparation.worktreePath, collaborationRoot))
    return snapshot.snapshotHash === expectedSnapshotHash
  } catch {
    return false
  }
}

/**
 * Only clean, Appraise-created worktrees are removed automatically. Dirty or
 * ambiguous worktrees are retained as recovery evidence for human review.
 */
export async function cleanupDivergentReconciliationWorktree(
  preparation: DivergentReconciliationPreparation,
  options: { expectedSnapshotHash?: string; expectedWorktreeHead?: string } = {},
): Promise<DivergentWorktreeCleanup> {
  const expectedWorktreeHead = options.expectedWorktreeHead ?? preparation.sourceRevision
  const status = await verifiedDivergentWorktreeForCleanup(preparation, expectedWorktreeHead)
  if (!status) return { status: 'NO_WORKTREE' }
  const changedPaths = await changedDivergentWorktreePaths(preparation, status.untrackedPaths)
  if ((status.stagedPaths.length || status.worktreePaths.length) && !changedPaths.length) {
    changedPaths.push('UNPARSEABLE_GIT_STATUS')
  }
  if (
    changedPaths.length &&
    (await hasExpectedDivergentProposalSnapshot(preparation, options.expectedSnapshotHash, changedPaths))
  ) {
    await runGit(preparation.repositoryRoot, {
      kind: 'worktree-remove',
      worktreePath: preparation.worktreePath,
      force: true,
    })
    return { status: 'REMOVED' }
  }
  if (changedPaths.length)
    return { status: 'RETAINED_FOR_RECOVERY', worktreePath: preparation.worktreePath, changedPaths }
  await runGit(preparation.repositoryRoot, { kind: 'worktree-remove', worktreePath: preparation.worktreePath })
  return { status: 'REMOVED' }
}
