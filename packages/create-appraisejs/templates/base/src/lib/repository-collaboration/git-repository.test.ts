import { execFile as execFileCallback } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import {
  commitExactCollaborationPaths,
  fetchOperationSourceRef,
  fastForwardPinned,
  fetchTrackedRef,
  inspectRepository,
  pushPinnedCommit,
  readRemoteRef,
} from '@/lib/repository-collaboration'
import {
  acquireCollaborationGitMutationLock,
  releaseCollaborationGitMutationLock,
} from '@/services/repository-collaboration/git-mutation-lock-service'

const execFile = promisify(execFileCallback)
const fixtures: string[] = []

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fs.rm(fixture, { recursive: true, force: true })))
})

async function git(cwd: string, args: string[]) {
  return execFile('git', args, { cwd, encoding: 'utf8' })
}

async function write(root: string, relativePath: string, content: string) {
  const target = path.join(root, relativePath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content)
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-git-collaboration-'))
  fixtures.push(root)
  const remote = path.join(root, 'remote.git')
  const repository = path.join(root, 'repository')
  await git(root, ['init', '--bare', remote])
  await fs.mkdir(repository)
  await git(repository, ['init', '-b', 'appraise-0.5'])
  await git(repository, ['config', 'user.name', 'Appraise Test'])
  await git(repository, ['config', 'user.email', 'appraise@example.test'])
  await write(repository, 'README.md', 'initial\n')
  await git(repository, ['add', 'README.md'])
  await git(repository, ['commit', '-m', 'initial'])
  await git(repository, ['remote', 'add', 'origin', remote])
  await git(repository, ['push', '-u', 'origin', 'appraise-0.5'])
  const head = (await git(repository, ['rev-parse', 'HEAD'])).stdout.trim()
  return { root, remote, repository, head }
}

async function collaborationChange(repository: string, contents = '{"version":1}\n') {
  await write(repository, 'appraise/collaboration/manifest.json', contents)
}

describe('bounded collaboration Git operations', () => {
  it('does not confuse an unreachable remote with a verified absent branch', async () => {
    const { repository } = await fixture()
    await git(repository, ['remote', 'set-url', 'origin', path.join(repository, 'missing-remote.git')])

    await expect(
      readRemoteRef({ repositoryRoot: repository, remote: 'origin', branch: 'appraise-0.5' }),
    ).rejects.toThrow('Unable to observe the configured remote branch')
  })

  it('commits only collaboration paths and preserves unrelated unstaged and untracked files', async () => {
    const { repository, head } = await fixture()
    await write(repository, 'README.md', 'local unrelated edit\n')
    await write(repository, 'scratch.txt', 'untracked\n')
    await collaborationChange(repository)

    const committed = await commitExactCollaborationPaths({
      repositoryRoot: repository,
      remote: 'origin',
      branch: 'appraise-0.5',
      expectedHead: head,
      message: 'Appraise collaboration publish test',
    })

    expect(committed.parent).toBe(head)
    expect((await git(repository, ['diff', '--name-only'])).stdout).toContain('README.md')
    expect(await fs.readFile(path.join(repository, 'scratch.txt'), 'utf8')).toBe('untracked\n')
    expect((await git(repository, ['show', '--name-only', '--format=', 'HEAD'])).stdout.trim()).toBe(
      'appraise/collaboration/manifest.json',
    )
  })

  it('refuses a collaboration commit when unrelated paths are already staged', async () => {
    const { repository, head } = await fixture()
    await write(repository, 'README.md', 'staged unrelated edit\n')
    await git(repository, ['add', 'README.md'])
    await collaborationChange(repository)

    await expect(
      commitExactCollaborationPaths({
        repositoryRoot: repository,
        remote: 'origin',
        branch: 'appraise-0.5',
        expectedHead: head,
        message: 'must not commit mixed index',
      }),
    ).rejects.toThrow('clean index')
    expect((await git(repository, ['diff', '--cached', '--name-only'])).stdout.trim()).toBe('README.md')
    expect((await git(repository, ['rev-parse', 'HEAD'])).stdout.trim()).toBe(head)
  })

  it('honors a rejecting local hook and does not bypass it', async () => {
    const { repository, head } = await fixture()
    await collaborationChange(repository)
    const hooksDirectory = (await git(repository, ['rev-parse', '--git-path', 'hooks'])).stdout.trim()
    await write(repository, `${hooksDirectory}/pre-commit`, '#!/bin/sh\necho hook rejection >&2\nexit 1\n')
    await fs.chmod(path.join(repository, hooksDirectory, 'pre-commit'), 0o755)

    await expect(
      commitExactCollaborationPaths({
        repositoryRoot: repository,
        remote: 'origin',
        branch: 'appraise-0.5',
        expectedHead: head,
        message: 'hook must run',
      }),
    ).rejects.toThrow('hook rejection')
    expect((await git(repository, ['rev-parse', 'HEAD'])).stdout.trim()).toBe(head)
    expect((await git(repository, ['diff', '--cached', '--name-only'])).stdout.trim()).toBe(
      'appraise/collaboration/manifest.json',
    )
  })

  it('fetches a pinned commit and fast-forwards only an all-collaboration range', async () => {
    const { root, remote, repository, head } = await fixture()
    const author = path.join(root, 'author')
    await git(root, ['clone', '-b', 'appraise-0.5', remote, author])
    await git(author, ['config', 'user.name', 'Remote Author'])
    await git(author, ['config', 'user.email', 'author@example.test'])
    await collaborationChange(author)
    await git(author, ['add', 'appraise/collaboration/manifest.json'])
    await git(author, ['commit', '-m', 'remote collaboration update'])
    await git(author, ['push', 'origin', 'appraise-0.5'])
    const remoteHead = (await git(author, ['rev-parse', 'HEAD'])).stdout.trim()

    expect(await fetchTrackedRef({ repositoryRoot: repository, remote: 'origin', branch: 'appraise-0.5' })).toEqual({
      fetchedCommit: remoteHead,
    })
    await expect(
      fastForwardPinned({
        repositoryRoot: repository,
        remote: 'origin',
        branch: 'appraise-0.5',
        expectedHead: head,
        pinnedCommit: remoteHead,
      }),
    ).resolves.toMatchObject({ head: remoteHead })
  })

  it('pins a fetched source in an operation-owned ref instead of shared FETCH_HEAD', async () => {
    const { root, remote, repository } = await fixture()
    const author = path.join(root, 'author-owned-ref')
    await git(root, ['clone', '-b', 'appraise-0.5', remote, author])
    await git(author, ['config', 'user.name', 'Remote Author'])
    await git(author, ['config', 'user.email', 'author@example.test'])
    await collaborationChange(author)
    await git(author, ['add', 'appraise/collaboration/manifest.json'])
    await git(author, ['commit', '-m', 'remote collaboration update'])
    await git(author, ['push', 'origin', 'appraise-0.5'])
    const remoteHead = (await git(author, ['rev-parse', 'HEAD'])).stdout.trim()

    await expect(
      fetchOperationSourceRef({
        repositoryRoot: repository,
        remote: 'origin',
        branch: 'appraise-0.5',
        operationId: 'operation-owned-ref-123',
      }),
    ).resolves.toMatchObject({
      fetchedCommit: remoteHead,
      sourceRef: 'refs/appraise/collaboration/operation-owned-ref-123/source',
    })
  })

  it('rejects a remote advance instead of force pushing', async () => {
    const { root, remote, repository, head } = await fixture()
    await collaborationChange(repository)
    const commit = await commitExactCollaborationPaths({
      repositoryRoot: repository,
      remote: 'origin',
      branch: 'appraise-0.5',
      expectedHead: head,
      message: 'local collaboration publish',
    })
    const author = path.join(root, 'author')
    await git(root, ['clone', '-b', 'appraise-0.5', remote, author])
    await git(author, ['config', 'user.name', 'Remote Author'])
    await git(author, ['config', 'user.email', 'author@example.test'])
    await write(author, 'README.md', 'remote advance\n')
    await git(author, ['add', 'README.md'])
    await git(author, ['commit', '-m', 'remote advance'])
    await git(author, ['push', 'origin', 'appraise-0.5'])

    await expect(
      pushPinnedCommit({
        repositoryRoot: repository,
        remote: 'origin',
        branch: 'appraise-0.5',
        commit: commit.commit,
        expectedRemoteCommit: head,
      }),
    ).rejects.toThrow('Remote branch changed')
  })

  it('rejects an absent remote branch before pushing any unpublished ancestry', async () => {
    const { remote, repository, head } = await fixture()
    await collaborationChange(repository)
    const commit = await commitExactCollaborationPaths({
      repositoryRoot: repository,
      remote: 'origin',
      branch: 'appraise-0.5',
      expectedHead: head,
      message: 'unpublished collaboration commit',
    })
    await git(remote, ['update-ref', '-d', 'refs/heads/appraise-0.5'])

    await expect(
      pushPinnedCommit({
        repositoryRoot: repository,
        remote: 'origin',
        branch: 'appraise-0.5',
        commit: commit.commit,
        expectedRemoteCommit: head,
      }),
    ).rejects.toThrow('REMOTE_BRANCH_ABSENT')
    expect(await readRemoteRef({ repositoryRoot: repository, remote: 'origin', branch: 'appraise-0.5' })).toBeNull()
  })

  it('confirms a push after an intentionally lost local response', async () => {
    const { root, repository, head } = await fixture()
    await collaborationChange(repository)
    const commit = await commitExactCollaborationPaths({
      repositoryRoot: repository,
      remote: 'origin',
      branch: 'appraise-0.5',
      expectedHead: head,
      message: 'lost response publish',
    })
    const bin = path.join(root, 'bin')
    const realGit = (await execFile('which', ['git'], { encoding: 'utf8' })).stdout.trim()
    await fs.mkdir(bin)
    await write(
      bin,
      'git',
      `#!/bin/sh\n\"${realGit}\" \"$@\"\nstatus=$?\nif [ \"$1\" = push ]; then exit 1; fi\nexit $status\n`,
    )
    await fs.chmod(path.join(bin, 'git'), 0o755)
    const priorPath = process.env.PATH
    process.env.PATH = `${bin}${path.delimiter}${priorPath ?? ''}`
    try {
      await expect(
        pushPinnedCommit({
          repositoryRoot: repository,
          remote: 'origin',
          branch: 'appraise-0.5',
          commit: commit.commit,
          expectedRemoteCommit: head,
        }),
      ).resolves.toEqual({ status: 'confirmed-after-uncertain', remoteCommit: commit.commit })
    } finally {
      process.env.PATH = priorPath
    }
    expect(await readRemoteRef({ repositoryRoot: repository, remote: 'origin', branch: 'appraise-0.5' })).toBe(
      commit.commit,
    )
  })

  it('shares a fenced database lock between linked worktrees with one common Git directory', async () => {
    const { root, repository } = await fixture()
    const linked = path.join(root, 'linked')
    await git(repository, ['worktree', 'add', '--detach', linked, 'HEAD'])
    const [primary, secondary] = await Promise.all([inspectRepository(repository), inspectRepository(linked)])
    expect(secondary.commonDirectory).toBe(primary.commonDirectory)
    const databasePath = path.join(root, 'locks.db')
    await copyMigratedTestDatabase(databasePath)
    const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}?connection_limit=1` } } })
    try {
      const first = await client.$transaction(transaction =>
        acquireCollaborationGitMutationLock(transaction, primary.commonDirectory, 'first-owner'),
      )
      await expect(
        client.$transaction(transaction =>
          acquireCollaborationGitMutationLock(transaction, secondary.commonDirectory, 'second-owner'),
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      await client.$transaction(transaction => releaseCollaborationGitMutationLock(transaction, first))
    } finally {
      await client.$disconnect()
    }
  })
})
