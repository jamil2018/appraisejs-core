import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'

import { sanitizeGitDiagnostic } from './git-diagnostics'

const execFile = promisify(execFileCallback)
const commandTimeoutMs = 30_000
const commandBufferBytes = 1_048_576

export type GitInvocation =
  | { kind: 'rev-parse'; args: readonly string[] }
  | { kind: 'symbolic-ref'; args: readonly string[] }
  | { kind: 'status' }
  | { kind: 'diff-names'; range?: string; cached?: boolean }
  | { kind: 'unmerged-paths' }
  | { kind: 'remote-url'; remote: string }
  | { kind: 'fetch'; remote: string; branch: string }
  | { kind: 'fetch-operation-ref'; remote: string; branch: string; destinationRef: string }
  | { kind: 'merge-fast-forward'; commit: string }
  | { kind: 'merge-no-commit'; commit: string }
  | { kind: 'add-collaboration' }
  | { kind: 'restore-collaboration-index' }
  | { kind: 'commit-collaboration'; message: string }
  | { kind: 'commit-merge-collaboration'; message: string }
  | { kind: 'push-commit'; remote: string; branch: string; commit: string }
  | { kind: 'ls-remote'; remote: string; branch: string }
  | { kind: 'merge-base'; left: string; right: string }
  | { kind: 'merge-base-is-ancestor'; older: string; newer: string }
  | { kind: 'worktree-add-detached'; worktreePath: string; commit: string }
  | { kind: 'worktree-remove'; worktreePath: string; force?: boolean }

type InvocationFor<Kind extends GitInvocation['kind']> = Extract<GitInvocation, { kind: Kind }>
type ArgumentBuilders = { [Kind in GitInvocation['kind']]: (input: InvocationFor<Kind>) => string[] }

const argumentBuilders: ArgumentBuilders = {
  'rev-parse': input => ['rev-parse', ...input.args],
  'symbolic-ref': input => ['symbolic-ref', '--quiet', '--short', ...input.args],
  status: () => ['status', '--porcelain=v2', '-z', '--branch', '--ignored=matching'],
  'diff-names': input => [
    'diff',
    '--name-only',
    '-z',
    ...(input.cached ? ['--cached'] : []),
    ...(input.range ? [input.range] : []),
  ],
  'unmerged-paths': () => ['diff', '--name-only', '-z', '--diff-filter=U'],
  'remote-url': input => ['remote', 'get-url', input.remote],
  fetch: input => ['fetch', '--no-tags', input.remote, `refs/heads/${input.branch}`],
  'fetch-operation-ref': input => [
    'fetch',
    '--no-tags',
    input.remote,
    `refs/heads/${input.branch}:${input.destinationRef}`,
  ],
  'merge-fast-forward': input => ['merge', '--ff-only', input.commit],
  'merge-no-commit': input => ['merge', '--no-ff', '--no-commit', input.commit],
  'add-collaboration': () => ['add', '--', 'appraise/collaboration'],
  'restore-collaboration-index': () => ['restore', '--staged', '--', 'appraise/collaboration'],
  'commit-collaboration': input => ['commit', '-m', input.message],
  'commit-merge-collaboration': input => ['commit', '-m', input.message],
  'push-commit': input => ['push', input.remote, `${input.commit}:refs/heads/${input.branch}`],
  'ls-remote': input => ['ls-remote', '--exit-code', input.remote, `refs/heads/${input.branch}`],
  'merge-base': input => ['merge-base', input.left, input.right],
  'merge-base-is-ancestor': input => ['merge-base', '--is-ancestor', input.older, input.newer],
  'worktree-add-detached': input => ['worktree', 'add', '--detach', input.worktreePath, input.commit],
  'worktree-remove': input => ['worktree', 'remove', ...(input.force ? ['--force'] : []), input.worktreePath],
}

function argvFor(invocation: GitInvocation): string[] {
  return (argumentBuilders[invocation.kind] as (input: GitInvocation) => string[])(invocation)
}

export interface GitCommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

export class GitCommandError extends Error {
  constructor(
    readonly invocation: GitInvocation,
    readonly exitCode: number | null,
    readonly diagnostic: string,
  ) {
    super(diagnostic || `Git ${invocation.kind} failed.`)
    this.name = 'GitCommandError'
  }
}

/**
 * Executes only Appraise-owned Git argument vectors. This intentionally does
 * not expose a generic command or shell escape hatch to callers or agents.
 */
export async function runGit(repositoryRoot: string, invocation: GitInvocation): Promise<GitCommandResult> {
  try {
    const result = await execFile('git', argvFor(invocation), {
      cwd: repositoryRoot,
      windowsHide: true,
      timeout: commandTimeoutMs,
      maxBuffer: commandBufferBytes,
      encoding: 'utf8',
    })
    return { stdout: String(result.stdout), stderr: String(result.stderr), exitCode: 0 }
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { code?: number | string; stdout?: string; stderr?: string }
    const diagnostic = sanitizeGitDiagnostic(
      [failure.message, failure.stderr, failure.stdout].filter(Boolean).join('\n'),
    )
    throw new GitCommandError(invocation, typeof failure.code === 'number' ? failure.code : null, diagnostic)
  }
}

export async function runGitAllowFailure(repositoryRoot: string, invocation: GitInvocation): Promise<GitCommandResult> {
  try {
    return await runGit(repositoryRoot, invocation)
  } catch (error) {
    if (!(error instanceof GitCommandError)) throw error
    return { stdout: '', stderr: error.diagnostic, exitCode: error.exitCode ?? 1 }
  }
}
