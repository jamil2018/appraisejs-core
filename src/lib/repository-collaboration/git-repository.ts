import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { GitCommandError, runGit, runGitAllowFailure } from './git-runner'
import { readCollaborationSnapshot } from './reader'

const collaborationDirectory = 'appraise/collaboration'
const safeBranch = /^(?!-)[A-Za-z0-9][A-Za-z0-9._/-]*$/u
const safeRemote = /^(?!-)[A-Za-z0-9][A-Za-z0-9._-]*$/u
const gitObject = /^[0-9a-f]{40,64}$/u

export interface GitRepositoryStatus {
  repositoryRoot: string
  commonDirectory: string
  head: string
  branch: string | null
  mergeOrRebaseInProgress: boolean
  stagedPaths: string[]
  worktreePaths: string[]
  untrackedPaths: string[]
}

export interface GitRepositoryIdentity extends GitRepositoryStatus {
  remoteUrl: string
}

/** The receive classification is derived from the operation-owned fetched ref,
 * never from a caller supplied revision.  `foreignPaths` is present only for a
 * true Git divergence so callers can distinguish a safe Appraise-only review
 * from a required external handoff. */
export type PinnedReceiveClassification =
  | { kind: 'EQUAL' }
  | { kind: 'REMOTE_AHEAD' }
  | { kind: 'LOCAL_AHEAD' }
  | { kind: 'UNRELATED' }
  | { kind: 'DIVERGED'; foreignPaths: string[] }

function assertRemote(remote: string): void {
  if (!safeRemote.test(remote)) throw new Error('Configured Git remote is invalid.')
}

function assertBranch(branch: string): void {
  if (!safeBranch.test(branch) || branch.includes('..') || branch.endsWith('/'))
    throw new Error('Configured Git branch is invalid.')
}

function assertCommit(commit: string): void {
  if (!gitObject.test(commit)) throw new Error('Git commit identity is invalid.')
}

function assertOperationId(operationId: string): void {
  if (!/^[A-Za-z0-9_-]{8,200}$/u.test(operationId)) throw new Error('Collaboration operation identity is invalid.')
}

function parseNulPaths(output: string): string[] {
  return output.split('\0').filter(Boolean)
}

function statusPaths(output: string): Pick<GitRepositoryStatus, 'stagedPaths' | 'worktreePaths' | 'untrackedPaths'> {
  const stagedPaths: string[] = []
  const worktreePaths: string[] = []
  const untrackedPaths: string[] = []
  for (const entry of parseNulPaths(output)) {
    if (entry.startsWith('# ')) continue
    if (entry.startsWith('? ')) {
      untrackedPaths.push(entry.slice(2))
      continue
    }
    if (entry.startsWith('! ')) continue
    const match = /^[12u] ([.MADRCU?])([.MADRCU?]) .+? (.+)$/u.exec(entry)
    if (!match) continue
    const [, indexStatus, worktreeStatus, filePath] = match
    if (indexStatus !== '.') stagedPaths.push(filePath)
    if (worktreeStatus !== '.') worktreePaths.push(filePath)
  }
  return { stagedPaths, worktreePaths, untrackedPaths }
}

async function gitCommonDirectory(repositoryRoot: string): Promise<string> {
  const value = (await runGit(repositoryRoot, { kind: 'rev-parse', args: ['--git-common-dir'] })).stdout.trim()
  return realpath(path.resolve(repositoryRoot, value))
}

async function inProgress(repositoryRoot: string): Promise<boolean> {
  const refs = ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD']
  const outcomes = await Promise.all(
    refs.map(ref => runGitAllowFailure(repositoryRoot, { kind: 'rev-parse', args: ['-q', '--verify', ref] })),
  )
  return outcomes.some(result => result.exitCode === 0)
}

export async function inspectRepository(repositoryRootInput: string, remote?: string): Promise<GitRepositoryIdentity> {
  const suppliedRoot = await realpath(repositoryRootInput)
  const topLevel = await runGit(suppliedRoot, { kind: 'rev-parse', args: ['--show-toplevel'] })
  const repositoryRoot = await realpath(topLevel.stdout.trim())
  if (repositoryRoot !== suppliedRoot)
    throw new Error('Collaboration Git commands require the verified repository root.')
  const [headResult, branchResult, commonDirectory, statusResult, operationInProgress] = await Promise.all([
    runGit(repositoryRoot, { kind: 'rev-parse', args: ['HEAD'] }),
    runGitAllowFailure(repositoryRoot, { kind: 'symbolic-ref', args: ['HEAD'] }),
    gitCommonDirectory(repositoryRoot),
    runGit(repositoryRoot, { kind: 'status' }),
    inProgress(repositoryRoot),
  ])
  const status = statusPaths(statusResult.stdout)
  const remoteUrl = remote
    ? (assertRemote(remote), (await runGit(repositoryRoot, { kind: 'remote-url', remote })).stdout.trim())
    : ''
  return {
    repositoryRoot,
    commonDirectory,
    head: headResult.stdout.trim(),
    branch: branchResult.exitCode === 0 ? branchResult.stdout.trim() : null,
    mergeOrRebaseInProgress: operationInProgress,
    remoteUrl,
    ...status,
  }
}

function isCollaborationPath(filePath: string): boolean {
  return filePath === collaborationDirectory || filePath.startsWith(`${collaborationDirectory}/`)
}

function requireCleanForIntegration(status: GitRepositoryStatus): void {
  if (status.mergeOrRebaseInProgress) throw new Error('Git has a merge, rebase, or another pending operation.')
  if (status.stagedPaths.length || status.worktreePaths.length || status.untrackedPaths.length) {
    throw new Error('Fast-forward integration requires a clean index and worktree.')
  }
}

async function commitRangePaths(repositoryRoot: string, older: string, newer: string): Promise<string[]> {
  assertCommit(older)
  assertCommit(newer)
  return parseNulPaths((await runGit(repositoryRoot, { kind: 'diff-names', range: `${older}..${newer}` })).stdout)
}

export async function fetchTrackedRef(input: {
  repositoryRoot: string
  remote: string
  branch: string
}): Promise<{ fetchedCommit: string }> {
  assertRemote(input.remote)
  assertBranch(input.branch)
  const identity = await inspectRepository(input.repositoryRoot, input.remote)
  await runGit(identity.repositoryRoot, { kind: 'fetch', remote: input.remote, branch: input.branch })
  const fetched = (
    await runGit(identity.repositoryRoot, { kind: 'rev-parse', args: ['FETCH_HEAD^{commit}'] })
  ).stdout.trim()
  assertCommit(fetched)
  return { fetchedCommit: fetched }
}

/** Fetch into a private, operation-owned ref so concurrent fetches cannot move FETCH_HEAD. */
export async function fetchOperationSourceRef(input: {
  repositoryRoot: string
  remote: string
  branch: string
  operationId: string
}): Promise<{ fetchedCommit: string; fetchedTree: string; sourceRef: string }> {
  const fetched = await fetchOperationRef({ ...input, refKind: 'source', includeTree: true })
  if (!fetched.fetchedTree) throw new Error('The fetched collaboration source ref has no tree.')
  return { fetchedCommit: fetched.fetchedCommit, fetchedTree: fetched.fetchedTree, sourceRef: fetched.sourceRef }
}

/** Fetch a fresh remote observation into a separate operation-owned ref.
 * Recovery must not overwrite the source ref that prepared the operation. */
export async function fetchOperationRecoveryRef(input: {
  repositoryRoot: string
  remote: string
  branch: string
  operationId: string
}): Promise<{ fetchedCommit: string; sourceRef: string }> {
  const fetched = await fetchOperationRef({ ...input, refKind: 'recovery-remote', includeTree: false })
  return { fetchedCommit: fetched.fetchedCommit, sourceRef: fetched.sourceRef }
}

async function fetchOperationRef(input: {
  repositoryRoot: string
  remote: string
  branch: string
  operationId: string
  refKind: 'source' | 'recovery-remote'
  includeTree: boolean
}): Promise<{ fetchedCommit: string; fetchedTree: string | null; sourceRef: string }> {
  assertRemote(input.remote)
  assertBranch(input.branch)
  assertOperationId(input.operationId)
  const identity = await inspectRepository(input.repositoryRoot, input.remote)
  const sourceRef = `refs/appraise/collaboration/${input.operationId}/${input.refKind}`
  await runGit(identity.repositoryRoot, {
    kind: 'fetch-operation-ref',
    remote: input.remote,
    branch: input.branch,
    destinationRef: sourceRef,
  })
  const [commit, tree] = await Promise.all([
    runGit(identity.repositoryRoot, { kind: 'rev-parse', args: [`${sourceRef}^{commit}`] }),
    input.includeTree
      ? runGit(identity.repositoryRoot, { kind: 'rev-parse', args: [`${sourceRef}^{tree}`] })
      : Promise.resolve(null),
  ])
  const fetchedCommit = commit.stdout.trim()
  assertCommit(fetchedCommit)
  const fetchedTree = tree?.stdout.trim() ?? null
  if (fetchedTree) assertCommit(fetchedTree)
  return { fetchedCommit, fetchedTree, sourceRef }
}

/** Read the strict exchange snapshot from an immutable commit, never the live worktree. */
export async function readCollaborationSnapshotAtCommit(input: {
  repositoryRoot: string
  commit: string
  operationId: string
}) {
  assertCommit(input.commit)
  assertOperationId(input.operationId)
  const identity = await inspectRepository(input.repositoryRoot)
  const worktreePath = await mkdtemp(path.join(os.tmpdir(), `appraise-collaboration-read-${input.operationId}-`))
  await rm(worktreePath, { recursive: true, force: true })
  try {
    await runGit(identity.repositoryRoot, { kind: 'worktree-add-detached', worktreePath, commit: input.commit })
    return await readCollaborationSnapshot(path.join(worktreePath, collaborationDirectory))
  } finally {
    await runGitAllowFailure(identity.repositoryRoot, { kind: 'worktree-remove', worktreePath })
    await rm(worktreePath, { recursive: true, force: true })
  }
}

/** Verifies an already-created commit against the intent durable before commit. */
export async function verifyExactCollaborationCommit(input: {
  repositoryRoot: string
  operationId: string
  commit: string
  expectedParent: string
  expectedSnapshotHash: string
}): Promise<{ matched: boolean; parent: string; tree: string; snapshotHash: string | null }> {
  assertOperationId(input.operationId)
  assertCommit(input.commit)
  assertCommit(input.expectedParent)
  const identity = await inspectRepository(input.repositoryRoot)
  const [parent, tree, paths] = await Promise.all([
    runGit(identity.repositoryRoot, { kind: 'rev-parse', args: [`${input.commit}^`] }),
    runGit(identity.repositoryRoot, { kind: 'rev-parse', args: [`${input.commit}^{tree}`] }),
    commitRangePaths(identity.repositoryRoot, input.expectedParent, input.commit),
  ])
  const snapshot = await readCollaborationSnapshotAtCommit({
    repositoryRoot: identity.repositoryRoot,
    commit: input.commit,
    operationId: input.operationId,
  }).catch(() => null)
  const committedParent = parent.stdout.trim()
  const committedTree = tree.stdout.trim()
  const snapshotHash = snapshot?.snapshotHash ?? null
  return {
    matched:
      committedParent === input.expectedParent &&
      snapshotHash === input.expectedSnapshotHash &&
      paths.length > 0 &&
      paths.every(isCollaborationPath),
    parent: committedParent,
    tree: committedTree,
    snapshotHash,
  }
}

export async function isCommitAncestor(input: {
  repositoryRoot: string
  ancestor: string
  descendant: string
}): Promise<boolean> {
  assertCommit(input.ancestor)
  assertCommit(input.descendant)
  const identity = await inspectRepository(input.repositoryRoot)
  const result = await runGitAllowFailure(identity.repositoryRoot, {
    kind: 'merge-base-is-ancestor',
    older: input.ancestor,
    newer: input.descendant,
  })
  return result.exitCode === 0
}

export async function classifyPinnedReceive(input: {
  repositoryRoot: string
  sourceRevision: string
  targetRevision: string
}): Promise<PinnedReceiveClassification> {
  assertCommit(input.sourceRevision)
  assertCommit(input.targetRevision)
  const identity = await inspectRepository(input.repositoryRoot)
  if (identity.head !== input.targetRevision) throw new Error('Local Git HEAD changed after receive preparation.')
  if (input.sourceRevision === input.targetRevision) return { kind: 'EQUAL' }
  const [targetAncestor, sourceAncestor] = await Promise.all([
    runGitAllowFailure(identity.repositoryRoot, {
      kind: 'merge-base-is-ancestor',
      older: input.targetRevision,
      newer: input.sourceRevision,
    }),
    runGitAllowFailure(identity.repositoryRoot, {
      kind: 'merge-base-is-ancestor',
      older: input.sourceRevision,
      newer: input.targetRevision,
    }),
  ])
  if (targetAncestor.exitCode === 0) return { kind: 'REMOTE_AHEAD' }
  if (sourceAncestor.exitCode === 0) return { kind: 'LOCAL_AHEAD' }
  const base = await runGitAllowFailure(identity.repositoryRoot, {
    kind: 'merge-base',
    left: input.targetRevision,
    right: input.sourceRevision,
  })
  if (base.exitCode !== 0 || !base.stdout.trim()) return { kind: 'UNRELATED' }
  const mergeBase = base.stdout.trim()
  const [local, remote] = await Promise.all([
    runGit(identity.repositoryRoot, { kind: 'diff-names', range: `${mergeBase}..${input.targetRevision}` }),
    runGit(identity.repositoryRoot, { kind: 'diff-names', range: `${mergeBase}..${input.sourceRevision}` }),
  ])
  const foreignPaths = [...new Set([...parseNulPaths(local.stdout), ...parseNulPaths(remote.stdout)])]
    .filter(filePath => !isCollaborationPath(filePath))
    .sort((left, right) => left.localeCompare(right))
  return { kind: 'DIVERGED', foreignPaths }
}

export async function fastForwardPinned(input: {
  repositoryRoot: string
  remote: string
  branch: string
  expectedHead: string
  pinnedCommit: string
}): Promise<{ previousHead: string; head: string }> {
  assertBranch(input.branch)
  assertCommit(input.expectedHead)
  assertCommit(input.pinnedCommit)
  const identity = await inspectRepository(input.repositoryRoot, input.remote)
  requireCleanForIntegration(identity)
  if (identity.branch !== input.branch) throw new Error('Checked-out branch does not match the collaboration binding.')
  if (identity.head !== input.expectedHead) throw new Error('Local Git HEAD changed after preparation.')
  const changedPaths = await commitRangePaths(identity.repositoryRoot, input.expectedHead, input.pinnedCommit)
  if (changedPaths.some(filePath => !isCollaborationPath(filePath))) {
    throw new Error('Fast-forward integration includes changes outside appraise/collaboration.')
  }
  await runGit(identity.repositoryRoot, { kind: 'merge-fast-forward', commit: input.pinnedCommit })
  const head = (await runGit(identity.repositoryRoot, { kind: 'rev-parse', args: ['HEAD'] })).stdout.trim()
  if (head !== input.pinnedCommit) throw new Error('Fast-forward integration did not reach the prepared commit.')
  return { previousHead: input.expectedHead, head }
}

export async function commitExactCollaborationPaths(input: {
  repositoryRoot: string
  remote: string
  branch: string
  expectedHead: string
  expectedSnapshotHash?: string
  message: string
}): Promise<{ commit: string; parent: string; tree: string; snapshotHash: string | null }> {
  assertBranch(input.branch)
  assertCommit(input.expectedHead)
  const identity = await inspectRepository(input.repositoryRoot, input.remote)
  if (identity.mergeOrRebaseInProgress) throw new Error('Git has a merge, rebase, or another pending operation.')
  if (identity.branch !== input.branch) throw new Error('Checked-out branch does not match the collaboration binding.')
  if (identity.head !== input.expectedHead) throw new Error('Local Git HEAD changed after preparation.')
  if (identity.stagedPaths.length) throw new Error('A clean index is required before a collaboration-only commit.')
  await runGit(identity.repositoryRoot, { kind: 'add-collaboration' })
  const stagedPaths = parseNulPaths(
    (await runGit(identity.repositoryRoot, { kind: 'diff-names', cached: true })).stdout,
  )
  if (!stagedPaths.length) throw new Error('No collaboration changes are available to commit.')
  if (stagedPaths.some(filePath => !isCollaborationPath(filePath))) {
    throw new Error('The collaboration commit would include files outside appraise/collaboration.')
  }
  const snapshot = input.expectedSnapshotHash
    ? await readCollaborationSnapshot(path.join(identity.repositoryRoot, collaborationDirectory))
    : null
  if (snapshot && snapshot.snapshotHash !== input.expectedSnapshotHash)
    throw new Error('The collaboration snapshot changed after preparation.')
  await runGit(identity.repositoryRoot, { kind: 'commit-collaboration', message: input.message })
  const [commit, parent, tree] = await Promise.all([
    runGit(identity.repositoryRoot, { kind: 'rev-parse', args: ['HEAD'] }),
    runGit(identity.repositoryRoot, { kind: 'rev-parse', args: ['HEAD^'] }),
    runGit(identity.repositoryRoot, { kind: 'rev-parse', args: ['HEAD^{tree}'] }),
  ])
  const committed = commit.stdout.trim()
  const committedParent = parent.stdout.trim()
  const committedTree = tree.stdout.trim()
  if (committedParent !== input.expectedHead) throw new Error('Collaboration commit parent changed after preparation.')
  const committedPaths = await commitRangePaths(identity.repositoryRoot, committedParent, committed)
  if (!committedPaths.length || committedPaths.some(filePath => !isCollaborationPath(filePath))) {
    throw new Error('The resulting collaboration commit contains paths outside appraise/collaboration.')
  }
  return {
    commit: committed,
    parent: committedParent,
    tree: committedTree,
    snapshotHash: snapshot?.snapshotHash ?? null,
  }
}

export async function readRemoteRef(input: {
  repositoryRoot: string
  remote: string
  branch: string
}): Promise<string | null> {
  assertRemote(input.remote)
  assertBranch(input.branch)
  const identity = await inspectRepository(input.repositoryRoot, input.remote)
  const result = await runGitAllowFailure(identity.repositoryRoot, {
    kind: 'ls-remote',
    remote: input.remote,
    branch: input.branch,
  })
  // `ls-remote --exit-code` uses 2 only when the remote was reached but the
  // requested ref is absent. Treating authentication/DNS/transport errors as
  // absence could turn an uncertain push into a destructive retry.
  if (result.exitCode === 2) return null
  if (result.exitCode !== 0)
    throw new Error(`Unable to observe the configured remote branch: ${result.stderr || 'Git ls-remote failed.'}`)
  const commit = result.stdout.trim().split(/\s+/u)[0] ?? ''
  assertCommit(commit)
  return commit
}

export async function pushPinnedCommit(input: {
  repositoryRoot: string
  remote: string
  branch: string
  commit: string
  expectedRemoteCommit: string | null
  expectedParent?: string
}): Promise<{ status: 'pushed' | 'confirmed-after-uncertain'; remoteCommit: string }> {
  assertRemote(input.remote)
  assertBranch(input.branch)
  assertCommit(input.commit)
  const identity = await inspectRepository(input.repositoryRoot, input.remote)
  if (identity.head !== input.commit) throw new Error('Only the current operation-produced HEAD may be pushed.')
  if (input.expectedParent) {
    assertCommit(input.expectedParent)
    const parent = (await runGit(identity.repositoryRoot, { kind: 'rev-parse', args: ['HEAD^'] })).stdout.trim()
    if (parent !== input.expectedParent) throw new Error('The operation-produced commit parent changed before push.')
  }
  const observed = await readRemoteRef({
    repositoryRoot: identity.repositoryRoot,
    remote: input.remote,
    branch: input.branch,
  })
  if (observed !== input.expectedRemoteCommit) throw new Error('Remote branch changed after preparation.')
  if (observed) {
    const ancestry = await runGitAllowFailure(identity.repositoryRoot, {
      kind: 'merge-base-is-ancestor',
      older: observed,
      newer: input.commit,
    })
    if (ancestry.exitCode !== 0) throw new Error('The operation commit does not descend from the pinned remote commit.')
    const pushedPaths = await commitRangePaths(identity.repositoryRoot, observed, input.commit)
    if (!pushedPaths.length || pushedPaths.some(filePath => !isCollaborationPath(filePath))) {
      throw new Error('The outgoing commit range includes paths outside appraise/collaboration.')
    }
  }
  try {
    await runGit(identity.repositoryRoot, {
      kind: 'push-commit',
      remote: input.remote,
      branch: input.branch,
      commit: input.commit,
    })
    return { status: 'pushed', remoteCommit: input.commit }
  } catch (error) {
    const remoteCommit = await readRemoteRef({
      repositoryRoot: identity.repositoryRoot,
      remote: input.remote,
      branch: input.branch,
    })
    if (remoteCommit === input.commit) return { status: 'confirmed-after-uncertain', remoteCommit }
    if (error instanceof GitCommandError) throw new Error(`Git push failed: ${error.diagnostic}`)
    throw error
  }
}

export function collaborationGitLockKey(commonDirectory: string): string {
  return `collaboration-git:${createHash('sha256').update(commonDirectory).digest('hex')}`
}
