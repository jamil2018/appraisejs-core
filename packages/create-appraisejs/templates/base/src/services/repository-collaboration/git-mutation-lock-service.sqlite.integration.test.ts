import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'

import {
  acquireCollaborationGitMutationLock,
  assertCollaborationGitMutationLock,
  renewCollaborationGitMutationLock,
  releaseCollaborationGitMutationLock,
  withCollaborationGitMutationLeaseHeartbeat,
} from './git-mutation-lock-service'

const workspaces: string[] = []

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-collaboration-git-lock-'))
  workspaces.push(workspace)
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  return new PrismaClient({ datasources: { db: { url: `file:${databasePath}?connection_limit=1` } } })
}

describe('collaboration Git mutation lock', () => {
  it('uses owner and fencing CAS for renewal, rejection, and eventual replacement', async () => {
    const client = await fixture()
    const started = new Date('2026-09-09T00:00:00.000Z')
    try {
      const first = await client.$transaction(transaction =>
        acquireCollaborationGitMutationLock(transaction, '/verified/common.git', 'first-owner', 10_000, started),
      )
      await expect(
        client.$transaction(transaction =>
          acquireCollaborationGitMutationLock(
            transaction,
            '/verified/common.git',
            'second-owner',
            10_000,
            new Date(started.getTime() + 5_000),
          ),
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })

      const renewed = await client.$transaction(transaction =>
        renewCollaborationGitMutationLock(transaction, first, 10_000, new Date(started.getTime() + 9_000)),
      )
      await expect(
        client.$transaction(transaction =>
          acquireCollaborationGitMutationLock(
            transaction,
            '/verified/common.git',
            'second-owner',
            10_000,
            new Date(started.getTime() + 11_000),
          ),
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })

      const replacement = await client.$transaction(transaction =>
        acquireCollaborationGitMutationLock(
          transaction,
          '/verified/common.git',
          'second-owner',
          10_000,
          new Date(started.getTime() + 20_000),
        ),
      )
      expect(replacement.fencingToken).toBe(first.fencingToken + 1)
      await expect(
        client.$transaction(transaction =>
          assertCollaborationGitMutationLock(transaction, renewed, new Date(started.getTime() + 20_000)),
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(
        await client.$transaction(transaction => releaseCollaborationGitMutationLock(transaction, renewed)),
      ).toMatchObject({ count: 0 })
    } finally {
      await client.$disconnect()
    }
  })

  it('renews while a long external effect is pending and leaves the lease held until it finishes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-09T00:00:00.000Z'))
    let lock = {
      lockKey: 'collaboration-git:long-effect',
      ownerId: 'long-owner',
      fencingToken: 1,
      leaseExpiresAt: new Date(Date.now() + 10_000),
    }
    const transaction = {
      collaborationMutationLock: {
        async updateMany(input: {
          where: { ownerId: string; fencingToken: number; leaseExpiresAt: { gt: Date } }
          data: { leaseExpiresAt: Date }
        }) {
          if (
            input.where.ownerId !== lock.ownerId ||
            input.where.fencingToken !== lock.fencingToken ||
            lock.leaseExpiresAt <= input.where.leaseExpiresAt.gt
          )
            return { count: 0 }
          lock = { ...lock, leaseExpiresAt: input.data.leaseExpiresAt }
          return { count: 1 }
        },
        async findUnique() {
          return lock
        },
      },
    }
    const client = {
      $transaction: async <T>(callback: (value: typeof transaction) => Promise<T>) => callback(transaction),
    } as unknown as PrismaClient
    try {
      const lease = { ...lock }
      let completeWork: (() => void) | undefined
      const running = withCollaborationGitMutationLeaseHeartbeat(
        client,
        lease,
        () =>
          new Promise<void>(resolve => {
            completeWork = resolve
          }),
        { durationMs: 10_000, heartbeatMs: 1_000 },
      )

      await vi.advanceTimersByTimeAsync(12_000)
      expect(lock.leaseExpiresAt.getTime()).toBeGreaterThan(Date.now())
      completeWork?.()
      await expect(running).resolves.toBeUndefined()
    } finally {
      // The client is an in-memory deterministic timer seam.
    }
  })
})
