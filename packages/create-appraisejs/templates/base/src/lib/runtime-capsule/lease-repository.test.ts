import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { RuntimeCapsuleLeaseRepository } from './lease-repository'

const validationHash = `sha256:${'a'.repeat(64)}`
const now = new Date('2026-07-11T00:00:00.000Z')
const identity = { projectId: 'project-one', validationHash, runId: 'run-one' }

function mockClient(current: Record<string, unknown> | null = null) {
  return {
    targetProject: { findUnique: vi.fn().mockResolvedValue({ id: 'project-one' }) },
    runtimeCapsuleLease: {
      findUnique: vi.fn().mockResolvedValue(current),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ...current, ownerToken: 'new-owner' }),
      create: vi.fn().mockResolvedValue({ ...identity, ownerToken: 'new-owner' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  }
}

describe('RuntimeCapsuleLeaseRepository', () => {
  it('rejects a foreign active owner', async () => {
    const client = mockClient({
      id: 'lease-one',
      ownerToken: 'other-owner',
      leaseExpiresAt: new Date(now.getTime() + 60_000),
      version: 1,
    })
    const repository = new RuntimeCapsuleLeaseRepository(client as unknown as PrismaClient, () => now)
    await expect(repository.acquire({ ...identity, ownerToken: 'new-owner' })).rejects.toThrow(/already active/)
  })

  it('claims an expired lease with version and expiry CAS', async () => {
    const client = mockClient({
      id: 'lease-one',
      ownerToken: 'old-owner',
      leaseExpiresAt: new Date(now.getTime() - 1),
      version: 4,
    })
    const repository = new RuntimeCapsuleLeaseRepository(client as unknown as PrismaClient, () => now)
    await repository.acquire({ ...identity, ownerToken: 'new-owner' })
    expect(client.runtimeCapsuleLease.updateMany).toHaveBeenCalledWith({
      where: { id: 'lease-one', version: 4, leaseExpiresAt: { lte: now } },
      data: {
        ownerToken: 'new-owner',
        leaseExpiresAt: new Date(now.getTime() + 30_000),
        version: { increment: 1 },
      },
    })
  })

  it('renews and releases only an exact unexpired owner token', async () => {
    const client = mockClient()
    const repository = new RuntimeCapsuleLeaseRepository(client as unknown as PrismaClient, () => now)
    await repository.renew({ ...identity, ownerToken: 'new-owner' })
    await expect(repository.release({ ...identity, ownerToken: 'new-owner' })).resolves.toBe(true)
    expect(client.runtimeCapsuleLease.deleteMany).toHaveBeenCalledWith({
      where: { targetProjectId: 'project-one', validationHash, runId: 'run-one', ownerToken: 'new-owner' },
    })
  })
})
