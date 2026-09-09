import { execFile as execFileCallback } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

import type { CollaborationRecord } from './contracts'
import {
  DivergentReconciliationError,
  assertDivergentReconciliationReview,
  cleanupDivergentReconciliationWorktree,
  createDivergentMergeCommit,
  prepareDivergentReconciliation,
  validateDivergentReconciliationProposal,
} from './divergent-reconciliation'
import { inspectRepository } from './git-repository'
import { buildCollaborationSnapshotFiles } from './snapshot'

const execFile = promisify(execFileCallback)
const fixtures: string[] = []
const worktrees: string[] = []

afterEach(async () => {
  await Promise.all(
    worktrees.splice(0).map(async worktree => {
      try {
        await execFile('git', ['worktree', 'remove', '--force', worktree], { encoding: 'utf8' })
      } catch {
        await fs.rm(worktree, { recursive: true, force: true })
      }
    }),
  )
  await Promise.all(fixtures.splice(0).map(fixture => fs.rm(fixture, { recursive: true, force: true })))
})

async function git(cwd: string, args: string[]) {
  return execFile('git', args, { cwd, encoding: 'utf8' })
}

function record(name: string): CollaborationRecord {
  return {
    format: 'appraise.repository-collaboration/v1',
    portableProjectId: 'portable-project',
    portableId: 'module-one',
    version: 1,
    archived: false,
    kind: 'module',
    payload: { name, parentPortableId: null },
  }
}

async function writeSnapshot(repository: string, records: CollaborationRecord[]) {
  const snapshot = buildCollaborationSnapshotFiles(records)
  for (const [relativePath, content] of snapshot.files) {
    const target = path.join(repository, 'appraise', 'collaboration', relativePath)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content)
  }
}

async function commitSnapshot(repository: string, name: string, records: CollaborationRecord[]) {
  await fs.rm(path.join(repository, 'appraise', 'collaboration'), { recursive: true, force: true })
  await writeSnapshot(repository, records)
  await git(repository, ['add', 'appraise/collaboration'])
  await git(repository, ['commit', '-m', name])
  return (await git(repository, ['rev-parse', 'HEAD'])).stdout.trim()
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-divergent-reconciliation-'))
  fixtures.push(root)
  const repository = path.join(root, 'repository')
  await fs.mkdir(repository)
  await git(repository, ['init', '-b', 'appraise-0.5'])
  await git(repository, ['config', 'user.name', 'Appraise Test'])
  await git(repository, ['config', 'user.email', 'appraise@example.test'])
  await fs.writeFile(path.join(repository, 'README.md'), 'initial\n')
  await fs.writeFile(path.join(repository, '.gitignore'), 'operator-notes.txt\n')
  await writeSnapshot(repository, [record('base')])
  await git(repository, ['add', '.'])
  await git(repository, ['commit', '-m', 'base'])
  const base = (await git(repository, ['rev-parse', 'HEAD'])).stdout.trim()
  await git(repository, ['checkout', '-b', 'source', base])
  const sourceRevision = await commitSnapshot(repository, 'source collaboration', [record('incoming')])
  await git(repository, ['checkout', 'appraise-0.5'])
  const targetRevision = await commitSnapshot(repository, 'target collaboration', [record('local')])
  return { repository, sourceRevision, targetRevision }
}

describe('divergent collaboration reconciliation', () => {
  it('accepts a complete valid proposal in an isolated worktree and retains it for exact review', async () => {
    const { repository, sourceRevision, targetRevision } = await fixture()
    const preparation = await prepareDivergentReconciliation({
      repositoryRoot: repository,
      operationId: 'divergent-valid',
      sourceRevision,
      targetRevision,
    })
    worktrees.push(preparation.worktreePath)

    const review = await validateDivergentReconciliationProposal({ preparation, records: [record('resolved')] })

    expect(review.proposedSnapshotHash).toMatch(/^[a-f0-9]{64}$/)
    expect(review.reviewDigest).toMatch(/^[a-f0-9]{64}$/)
    await expect(assertDivergentReconciliationReview(review)).resolves.toBeUndefined()
    await expect(cleanupDivergentReconciliationWorktree(preparation)).resolves.toMatchObject({
      status: 'RETAINED_FOR_RECOVERY',
      changedPaths: expect.arrayContaining(['appraise/collaboration/manifest.json']),
    })
  })

  it('removes only an exact collaboration-only reviewed snapshot and retains unrelated untracked notes', async () => {
    const { repository, sourceRevision, targetRevision } = await fixture()
    const approved = await prepareDivergentReconciliation({
      repositoryRoot: repository,
      operationId: 'divergent-approved-dirty-cleanup',
      sourceRevision,
      targetRevision,
    })
    worktrees.push(approved.worktreePath)
    const approvedReview = await validateDivergentReconciliationProposal({
      preparation: approved,
      records: [record('approved')],
    })
    await expect(
      cleanupDivergentReconciliationWorktree(approved, {
        expectedSnapshotHash: approvedReview.proposedSnapshotHash,
      }),
    ).resolves.toEqual({ status: 'REMOVED' })
    worktrees.pop()

    const adversarial = await prepareDivergentReconciliation({
      repositoryRoot: repository,
      operationId: 'divergent-operator-notes-cleanup',
      sourceRevision,
      targetRevision,
    })
    worktrees.push(adversarial.worktreePath)
    const adversarialReview = await validateDivergentReconciliationProposal({
      preparation: adversarial,
      records: [record('adversarial')],
    })
    await fs.writeFile(path.join(adversarial.worktreePath, 'operator-notes.txt'), 'retain this evidence\n')
    expect((await inspectRepository(adversarial.worktreePath)).ignoredPaths).toContain('operator-notes.txt')
    await expect(
      cleanupDivergentReconciliationWorktree(adversarial, {
        expectedSnapshotHash: adversarialReview.proposedSnapshotHash,
      }),
    ).resolves.toMatchObject({
      status: 'RETAINED_FOR_RECOVERY',
      changedPaths: expect.arrayContaining(['operator-notes.txt']),
    })
    await expect(fs.readFile(path.join(adversarial.worktreePath, 'operator-notes.txt'), 'utf8')).resolves.toBe(
      'retain this evidence\n',
    )
  })

  it('rejects malformed whole-record proposals without changing the source worktree', async () => {
    const { repository, sourceRevision, targetRevision } = await fixture()
    const preparation = await prepareDivergentReconciliation({
      repositoryRoot: repository,
      operationId: 'divergent-invalid',
      sourceRevision,
      targetRevision,
    })
    worktrees.push(preparation.worktreePath)

    await expect(
      validateDivergentReconciliationProposal({
        preparation,
        records: [
          { ...record('bad'), payload: { name: 42, parentPortableId: null } } as unknown as CollaborationRecord,
        ],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PROPOSAL' })
    await expect(cleanupDivergentReconciliationWorktree(preparation)).resolves.toEqual({ status: 'REMOVED' })
    worktrees.pop()
  })

  it('rejects a reviewed proposal when the target source becomes stale', async () => {
    const { repository, sourceRevision, targetRevision } = await fixture()
    const preparation = await prepareDivergentReconciliation({
      repositoryRoot: repository,
      operationId: 'divergent-stale',
      sourceRevision,
      targetRevision,
    })
    worktrees.push(preparation.worktreePath)
    const review = await validateDivergentReconciliationProposal({ preparation, records: [record('resolved')] })
    await commitSnapshot(repository, 'later target change', [record('later-local')])

    await expect(assertDivergentReconciliationReview(review)).rejects.toMatchObject({ code: 'STALE_SOURCE' })
  })

  it('hands off every divergence that includes a foreign file', async () => {
    const { repository, sourceRevision, targetRevision } = await fixture()
    await git(repository, ['checkout', 'source'])
    await fs.writeFile(path.join(repository, 'foreign-code.ts'), 'export const foreign = true\n')
    await git(repository, ['add', 'foreign-code.ts'])
    await git(repository, ['commit', '-m', 'foreign change'])
    const foreignSource = (await git(repository, ['rev-parse', 'HEAD'])).stdout.trim()
    await git(repository, ['checkout', 'appraise-0.5'])

    await expect(
      prepareDivergentReconciliation({
        repositoryRoot: repository,
        operationId: 'divergent-foreign',
        sourceRevision: foreignSource,
        targetRevision,
      }),
    ).rejects.toMatchObject({ code: 'FOREIGN_FILE_CONFLICT' } satisfies Partial<DivergentReconciliationError>)
    expect(sourceRevision).toMatch(/^[a-f0-9]{40}$/)
  })

  it('removes an untouched temporary worktree and reports its cleanup receipt', async () => {
    const { repository, sourceRevision, targetRevision } = await fixture()
    const preparation = await prepareDivergentReconciliation({
      repositoryRoot: repository,
      operationId: 'divergent-cleanup',
      sourceRevision,
      targetRevision,
    })
    worktrees.push(preparation.worktreePath)

    await expect(cleanupDivergentReconciliationWorktree(preparation)).resolves.toEqual({ status: 'REMOVED' })
    worktrees.pop()
    await expect(cleanupDivergentReconciliationWorktree(preparation)).resolves.toEqual({ status: 'NO_WORKTREE' })
  })

  it('preserves substituted and mismatched managed worktrees instead of deleting them', async () => {
    const { repository, sourceRevision, targetRevision } = await fixture()
    const substituted = await prepareDivergentReconciliation({
      repositoryRoot: repository,
      operationId: 'divergent-substituted-cleanup',
      sourceRevision,
      targetRevision,
    })
    await git(repository, ['worktree', 'remove', '--force', substituted.worktreePath])
    await fs.symlink(repository, substituted.worktreePath, 'dir')
    await expect(cleanupDivergentReconciliationWorktree(substituted)).rejects.toMatchObject({
      code: 'RECOVERY_REQUIRED',
    } satisfies Partial<DivergentReconciliationError>)
    expect((await fs.lstat(substituted.worktreePath)).isSymbolicLink()).toBe(true)
    await fs.unlink(substituted.worktreePath)

    const mismatched = await prepareDivergentReconciliation({
      repositoryRoot: repository,
      operationId: 'divergent-mismatched-cleanup',
      sourceRevision,
      targetRevision,
    })
    worktrees.push(mismatched.worktreePath)
    await git(mismatched.worktreePath, ['checkout', '--detach', targetRevision])
    await expect(cleanupDivergentReconciliationWorktree(mismatched)).rejects.toMatchObject({
      code: 'RECOVERY_REQUIRED',
    } satisfies Partial<DivergentReconciliationError>)
    await expect(fs.access(mismatched.worktreePath)).resolves.toBeUndefined()
  })

  it('preserves a verified worktree when Git refuses removal', async () => {
    const { repository, sourceRevision, targetRevision } = await fixture()
    const preparation = await prepareDivergentReconciliation({
      repositoryRoot: repository,
      operationId: 'divergent-locked-cleanup',
      sourceRevision,
      targetRevision,
    })
    worktrees.push(preparation.worktreePath)
    await git(repository, ['worktree', 'lock', preparation.worktreePath, '--reason', 'cleanup refusal regression'])
    await expect(cleanupDivergentReconciliationWorktree(preparation)).rejects.toThrow()
    await expect(fs.access(preparation.worktreePath)).resolves.toBeUndefined()
    await git(repository, ['worktree', 'unlock', preparation.worktreePath])
    await expect(cleanupDivergentReconciliationWorktree(preparation)).resolves.toEqual({ status: 'REMOVED' })
    worktrees.pop()
  })

  it('creates an exact two-parent merge commit containing only the reviewed whole-record snapshot', async () => {
    const { repository, sourceRevision, targetRevision } = await fixture()
    const preparation = await prepareDivergentReconciliation({
      repositoryRoot: repository,
      operationId: 'divergent-merge',
      sourceRevision,
      targetRevision,
    })
    worktrees.push(preparation.worktreePath)
    const review = await validateDivergentReconciliationProposal({ preparation, records: [record('resolved')] })
    const evidence = await createDivergentMergeCommit({ review, records: [record('resolved')] })
    worktrees.push(evidence.preparation.worktreePath)

    expect(evidence.parents).toEqual([sourceRevision, targetRevision])
    expect(evidence.snapshotHash).toMatch(/^[a-f0-9]{64}$/)
  })
})
