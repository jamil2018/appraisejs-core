import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveConflictsByEntityIds } from './conflict-service'

vi.mock('@/config/db-config', () => ({
  default: {
    conflictResolution: {
      updateMany: vi.fn(),
    },
  },
}))

import prisma from '@/config/db-config'

describe('resolveConflictsByEntityIds', () => {
  beforeEach(() => {
    vi.mocked(prisma.conflictResolution.updateMany).mockReset()
  })

  it('returns updated count', async () => {
    vi.mocked(prisma.conflictResolution.updateMany).mockResolvedValue({ count: 2 })
    await expect(resolveConflictsByEntityIds(['a', 'b'])).resolves.toBe(2)
    expect(prisma.conflictResolution.updateMany).toHaveBeenCalledWith({
      where: { entityId: { in: ['a', 'b'] } },
      data: { resolved: true },
    })
  })

  it('throws ServiceError when nothing matched', async () => {
    vi.mocked(prisma.conflictResolution.updateMany).mockResolvedValue({ count: 0 })
    await expect(resolveConflictsByEntityIds(['x'])).rejects.toThrow('No conflicts found')
  })
})
