import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import path from 'node:path'

import { GitCommandError, runGit, runGitAllowFailure } from './git-runner'

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
  message: string
}): Promise<{ commit: string; parent: string; tree: string }> {
  assertBranch(input.branch)
  assertCommit(input.expectedHead)
  const identity = await inspectRepository(input.repositoryRoot, input.remote)
  if (identity.mergeOrRebaseInProgress) throw new Error('Git has a merge, rebase, or another pending operation.')
  if (identity.branch !== input.branch) throw new Error('Checked-out branch does not match the collaboration binding.')
  if (identity.head !== input.expectedHead) throw new Error('Local Git HEAD changed after preparation.')
  if (identity.stagedPaths.some(filePath => !isCollaborationPath(filePath))) {
    throw new Error('Unrelated staged changes block a collaboration-only commit.')
  }
  await runGit(identity.repositoryRoot, { kind: 'add-collaboration' })
  const stagedPaths = parseNulPaths(
    (await runGit(identity.repositoryRoot, { kind: 'diff-names', cached: true })).stdout,
  )
  if (!stagedPaths.length) throw new Error('No collaboration changes are available to commit.')
  if (stagedPaths.some(filePath => !isCollaborationPath(filePath))) {
    throw new Error('The collaboration commit would include files outside appraise/collaboration.')
  }
  await runGit(identity.repositoryRoot, { kind: 'commit-collaboration', message: input.message })
  const [commit, parent, tree] = await Promise.all([
    runGit(identity.repositoryRoot, { kind: 'rev-parse', args: ['HEAD'] }),
    runGit(identity.repositoryRoot, { kind: 'rev-parse', args: ['HEAD^'] }),
    runGit(identity.repositoryRoot, { kind: 'rev-parse', args: ['HEAD^{tree}'] }),
  ])
  return { commit: commit.stdout.trim(), parent: parent.stdout.trim(), tree: tree.stdout.trim() }
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
  if (result.exitCode !== 0) return null
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
}): Promise<{ status: 'pushed' | 'confirmed-after-uncertain'; remoteCommit: string }> {
  assertRemote(input.remote)
  assertBranch(input.branch)
  assertCommit(input.commit)
  const identity = await inspectRepository(input.repositoryRoot, input.remote)
  const observed = await readRemoteRef({
    repositoryRoot: identity.repositoryRoot,
    remote: input.remote,
    branch: input.branch,
  })
  if (observed !== input.expectedRemoteCommit) throw new Error('Remote branch changed after preparation.')
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
