import { describe, expect, it, vi } from 'vitest'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { deleteLocators, detectAndCreateConflicts } from './locator-service'

vi.mock('@/lib/locator-picker/session-manager', () => ({
  locatorPickerSessionManager: {},
}))

vi.mock('@/lib/automation/projection-service', () => ({
  automationProjectionService: {
    syncLocatorGroup: vi.fn().mockResolvedValue(undefined),
    createEmptyLocatorGroup: vi.fn().mockResolvedValue(undefined),
    syncLocatorMap: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/config/db-config', () => ({
  default: {
    locator: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
    },
    conflictResolution: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import prisma from '@/config/db-config'

describe('detectAndCreateConflicts', () => {
  it('returns 0 when no other locators in group', async () => {
    vi.mocked(prisma.locator.findMany).mockResolvedValue([])

    await expect(
      detectAndCreateConflicts('loc-1', 'btn', '//x', 'group-1'),
    ).resolves.toBe(0)
    expect(prisma.conflictResolution.create).not.toHaveBeenCalled()
  })
})

describe('deleteLocators', () => {
  it('deletes locators and syncs the affected locator group files', async () => {
    vi.mocked(prisma.locator.findMany).mockResolvedValue([
      { locatorGroupId: 'group-1' },
      { locatorGroupId: 'group-1' },
      { locatorGroupId: 'group-2' },
    ] as never)
    vi.mocked(prisma.locator.deleteMany).mockResolvedValue({ count: 3 } as never)

    await expect(deleteLocators(['loc-1', 'loc-2', 'loc-3'])).resolves.toEqual({ count: 3 })
    expect(prisma.locator.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['loc-1', 'loc-2', 'loc-3'] } },
    })
    expect(automationProjectionService.syncLocatorGroup).toHaveBeenCalledWith('group-1')
    expect(automationProjectionService.syncLocatorGroup).toHaveBeenCalledWith('group-2')
  })
})
