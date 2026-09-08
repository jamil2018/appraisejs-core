import { randomUUID } from 'node:crypto'

import type { Prisma } from '@prisma/client'

import { collaborationGitLockKey } from '@/lib/repository-collaboration/git-repository'
import { ServiceError } from '@/services/shared/errors'

type Transaction = Prisma.TransactionClient

export interface CollaborationMutationLease {
  lockKey: string
  ownerId: string
  fencingToken: number
  leaseExpiresAt: Date
}

const defaultLeaseMs = 60_000

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
  durationMs = defaultLeaseMs,
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
