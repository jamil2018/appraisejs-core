import { randomUUID } from 'node:crypto'

import type { Prisma, PrismaClient } from '@prisma/client'

import {
  collaborationGitLockKey,
  inspectRepository,
  type GitRepositoryIdentity,
} from '@/lib/repository-collaboration/git-repository'
import { ServiceError } from '@/services/shared/errors'

type Transaction = Prisma.TransactionClient

export interface CollaborationMutationLease {
  lockKey: string
  ownerId: string
  fencingToken: number
  leaseExpiresAt: Date
}

export type CollaborationGitIdentityInspector = (
  repositoryRoot: string,
  remote?: string,
) => Promise<Pick<GitRepositoryIdentity, 'commonDirectory'>>

/**
 * A mutation lease is keyed to Git's common directory, rather than the
 * configured path. Re-inspect that identity at the effect boundary so a
 * replaced symlink or retargeted repository path cannot reuse the old lock.
 */
export async function assertCollaborationGitMutationIdentity(
  repositoryRoot: string,
  expectedCommonDirectory: string,
  remote?: string,
  inspect: CollaborationGitIdentityInspector = inspectRepository,
) {
  const identity = await inspect(repositoryRoot, remote)
  if (identity.commonDirectory !== expectedCommonDirectory) {
    throw new ServiceError(
      'The collaboration repository identity changed while the mutation lease was held.',
      'CONFLICT',
      409,
    )
  }
  return identity
}

/**
 * The lease is deliberately long enough to tolerate a slow hook or remote,
 * while the holder renews it well before expiry.  The database row is still a
 * fence: a process which loses renewal must not persist a completion.
 */
const defaultCollaborationMutationLeaseMs = 5 * 60_000
const defaultCollaborationMutationHeartbeatMs = 30_000

function expiry(now: Date, durationMs: number): Date {
  if (!Number.isInteger(durationMs) || durationMs < 10_000 || durationMs > 10 * 60_000) {
    throw new ServiceError('Collaboration mutation lease duration is invalid.', 'VALIDATION', 400)
  }
  return new Date(now.getTime() + durationMs)
}

export async function acquireCollaborationGitMutationLock(
  transaction: Transaction,
  commonDirectory: string,
  ownerId: string = randomUUID(),
  durationMs = defaultCollaborationMutationLeaseMs,
  now = new Date(),
): Promise<CollaborationMutationLease> {
  const lockKey = collaborationGitLockKey(commonDirectory)
  const leaseExpiresAt = expiry(now, durationMs)
  const current = await transaction.collaborationMutationLock.findUnique({ where: { lockKey } })
  if (!current) {
    try {
      const created = await transaction.collaborationMutationLock.create({
        data: { lockKey, ownerId, fencingToken: 1, leaseExpiresAt },
      })
      return created
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error
    }
  }
  const locked = await transaction.collaborationMutationLock.findUnique({ where: { lockKey } })
  if (!locked || locked.leaseExpiresAt > now) {
    throw new ServiceError('A collaboration mutation is already active for this Git repository.', 'CONFLICT', 409)
  }
  const claimed = await transaction.collaborationMutationLock.updateMany({
    where: { lockKey, fencingToken: locked.fencingToken, leaseExpiresAt: { lte: now } },
    data: { ownerId, leaseExpiresAt, fencingToken: { increment: 1 } },
  })
  if (claimed.count !== 1)
    throw new ServiceError('Collaboration mutation lock changed during acquisition.', 'CONFLICT', 409)
  return transaction.collaborationMutationLock.findUniqueOrThrow({ where: { lockKey } })
}

/** Renew only the exact owner and fence, before the current lease expires. */
export async function renewCollaborationGitMutationLock(
  transaction: Transaction,
  lease: CollaborationMutationLease,
  durationMs = defaultCollaborationMutationLeaseMs,
  now = new Date(),
): Promise<CollaborationMutationLease> {
  const leaseExpiresAt = expiry(now, durationMs)
  const renewed = await transaction.collaborationMutationLock.updateMany({
    where: {
      lockKey: lease.lockKey,
      ownerId: lease.ownerId,
      fencingToken: lease.fencingToken,
      leaseExpiresAt: { gt: now },
    },
    data: { leaseExpiresAt },
  })
  if (renewed.count !== 1)
    throw new ServiceError('The collaboration mutation lease expired or was replaced.', 'CONFLICT', 409)
  return { ...lease, leaseExpiresAt }
}

export async function assertCollaborationGitMutationLock(
  transaction: Transaction,
  lease: CollaborationMutationLease,
  now = new Date(),
): Promise<void> {
  const current = await transaction.collaborationMutationLock.findUnique({ where: { lockKey: lease.lockKey } })
  if (
    !current ||
    current.ownerId !== lease.ownerId ||
    current.fencingToken !== lease.fencingToken ||
    current.leaseExpiresAt <= now
  ) {
    throw new ServiceError('The collaboration mutation lease expired or was replaced.', 'CONFLICT', 409)
  }
}

export async function releaseCollaborationGitMutationLock(transaction: Transaction, lease: CollaborationMutationLease) {
  return transaction.collaborationMutationLock.deleteMany({
    where: { lockKey: lease.lockKey, ownerId: lease.ownerId, fencingToken: lease.fencingToken },
  })
}

type MutationLockClient = Pick<PrismaClient, '$transaction'>

/**
 * Keep a durable mutation fence alive while an external Git/filesystem effect
 * is pending.  It intentionally does not hold a database transaction across
 * that effect.  A failed renewal fences the holder from recording success.
 */
export async function withCollaborationGitMutationLeaseHeartbeat<T>(
  client: MutationLockClient,
  lease: CollaborationMutationLease,
  work: () => Promise<T>,
  options: {
    durationMs?: number
    heartbeatMs?: number
  } = {},
): Promise<T> {
  const durationMs = options.durationMs ?? defaultCollaborationMutationLeaseMs
  // Validate via the same boundary used for acquisition without changing the
  // persisted lease.  A heartbeat must have room to run before expiry.
  expiry(new Date(), durationMs)
  const heartbeatMs =
    options.heartbeatMs ?? Math.min(defaultCollaborationMutationHeartbeatMs, Math.floor(durationMs / 3))
  if (!Number.isInteger(heartbeatMs) || heartbeatMs < 1_000 || heartbeatMs >= durationMs)
    throw new ServiceError('Collaboration mutation lease heartbeat interval is invalid.', 'VALIDATION', 400)

  let stopped = false
  let renewalFailure: unknown
  let renewal: Promise<void> = Promise.resolve()
  const renew = () => {
    renewal = renewal.then(async () => {
      if (stopped || renewalFailure) return
      try {
        const renewed = await client.$transaction(transaction =>
          renewCollaborationGitMutationLock(transaction, lease, durationMs),
        )
        lease.leaseExpiresAt = renewed.leaseExpiresAt
      } catch (error) {
        renewalFailure = error
      }
    })
    return renewal
  }
  const timer = setInterval(() => {
    void renew()
  }, heartbeatMs)
  timer.unref?.()
  try {
    const result = await work()
    await renewal
    if (renewalFailure) throw renewalFailure
    await client.$transaction(transaction => assertCollaborationGitMutationLock(transaction, lease))
    return result
  } finally {
    stopped = true
    clearInterval(timer)
    await renewal
  }
}
