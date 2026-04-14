import { describe, expect, it, vi } from 'vitest'
import { automationProjectionService } from '@/lib/automation/projection-service'
import {
  checkLocatorGroupNameUnique,
  createLocatorGroup,
  deleteLocatorGroups,
  getLocatorGroupByIdOrThrow,
  updateLocatorGroup,
} from './locator-group-service'

vi.mock('@/config/db-config', () => ({
  default: {
    locatorGroup: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/locator-group-file-utils', () => ({
  getLocatorGroupFilePath: vi.fn().mockResolvedValue('/tmp/group.json'),
}))

vi.mock('@/lib/automation/projection-service', () => ({
  automationProjectionService: {
    createEmptyLocatorGroup: vi.fn().mockResolvedValue(undefined),
    syncLocatorMap: vi.fn().mockResolvedValue(undefined),
    moveLocatorGroup: vi.fn().mockResolvedValue(undefined),
    renameLocatorGroup: vi.fn().mockResolvedValue(undefined),
    syncLocatorGroup: vi.fn().mockResolvedValue(true),
    deleteLocatorMapEntries: vi.fn().mockResolvedValue(undefined),
    deleteLocatorGroup: vi.fn().mockResolvedValue(undefined),
  },
}))

import prisma from '@/config/db-config'

describe('getLocatorGroupByIdOrThrow', () => {
  it('throws when locator group is missing', async () => {
    vi.mocked(prisma.locatorGroup.findUnique).mockResolvedValue(null)
    await expect(getLocatorGroupByIdOrThrow('missing')).rejects.toMatchObject({
      message: 'Locator group not found',
      statusCode: 404,
    })
  })
})

describe('checkLocatorGroupNameUnique', () => {
  it('returns false when name is taken', async () => {
    vi.mocked(prisma.locatorGroup.findFirst).mockResolvedValue({ id: 'lg1' } as never)
    await expect(checkLocatorGroupNameUnique('Taken')).resolves.toBe(false)
  })

  it('returns true when name is free', async () => {
    vi.mocked(prisma.locatorGroup.findFirst).mockResolvedValue(null)
    await expect(checkLocatorGroupNameUnique('Free')).resolves.toBe(true)
  })
})

describe('createLocatorGroup', () => {
  it('creates the group and syncs its files', async () => {
    vi.mocked(prisma.locatorGroup.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.locatorGroup.create).mockResolvedValue({ id: 'group-1', name: 'Home' } as never)

    await expect(
      createLocatorGroup({
        name: 'Home',
        moduleId: 'module-1',
        route: '/home',
        locators: ['loc-1'],
      }),
    ).resolves.toEqual({ id: 'group-1', name: 'Home' })

    expect(automationProjectionService.createEmptyLocatorGroup).toHaveBeenCalledWith('group-1')
    expect(automationProjectionService.syncLocatorMap).toHaveBeenCalledWith('Home', '/home')
  })
})

describe('updateLocatorGroup', () => {
  it('renames the group and updates the locator map when the name changes', async () => {
    vi.mocked(prisma.locatorGroup.findUnique).mockResolvedValue({
      id: 'group-1',
      name: 'Old Name',
      moduleId: 'module-1',
      route: '/old',
      module: { id: 'module-1' },
    } as never)
    vi.mocked(prisma.locatorGroup.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.locatorGroup.update).mockResolvedValue({
      id: 'group-1',
      name: 'New Name',
      module: { name: 'Core' },
    } as never)

    await updateLocatorGroup('group-1', {
      name: 'New Name',
      moduleId: 'module-1',
      route: '/new',
      locators: ['loc-1'],
    })

    expect(automationProjectionService.renameLocatorGroup).toHaveBeenCalledWith('group-1', 'New Name', 'Old Name')
    expect(automationProjectionService.syncLocatorMap).toHaveBeenCalledWith('/old', '/new', 'Old Name', 'New Name')
  })
})

describe('deleteLocatorGroups', () => {
  it('deletes locator map entries, group files, and db records', async () => {
    vi.mocked(prisma.locatorGroup.findMany).mockResolvedValue([{ name: 'Home' }] as never)
    vi.mocked(prisma.locatorGroup.deleteMany).mockResolvedValue({ count: 1 } as never)

    await expect(deleteLocatorGroups(['group-1'])).resolves.toEqual(['group-1'])
    expect(automationProjectionService.deleteLocatorMapEntries).toHaveBeenCalledWith(['Home'])
    expect(automationProjectionService.deleteLocatorGroup).toHaveBeenCalledWith('group-1')
    expect(prisma.locatorGroup.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['group-1'] } },
    })
  })
})
