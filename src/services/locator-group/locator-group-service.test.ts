import { describe, expect, it, vi } from 'vitest'
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
    module: { findFirst: vi.fn() },
    locator: { findMany: vi.fn() },
  },
}))

import prisma from '@/config/db-config'
const targetProjectId = 'project-1'

describe('getLocatorGroupByIdOrThrow', () => {
  it('throws when locator group is missing', async () => {
    vi.mocked(prisma.locatorGroup.findFirst).mockResolvedValue(null)
    await expect(getLocatorGroupByIdOrThrow('missing', targetProjectId)).rejects.toMatchObject({
      message: 'Locator group not found',
      statusCode: 404,
    })
  })
})

describe('checkLocatorGroupNameUnique', () => {
  it('returns false when name is taken', async () => {
    vi.mocked(prisma.locatorGroup.findFirst).mockResolvedValue({ id: 'lg1' } as never)
    await expect(checkLocatorGroupNameUnique('Taken', targetProjectId)).resolves.toBe(false)
  })

  it('returns true when name is free', async () => {
    vi.mocked(prisma.locatorGroup.findFirst).mockResolvedValue(null)
    await expect(checkLocatorGroupNameUnique('Free', targetProjectId)).resolves.toBe(true)
  })
})

describe('createLocatorGroup', () => {
  it('creates the group without synchronizing target files', async () => {
    vi.mocked(prisma.module.findFirst).mockResolvedValue({ id: 'module-1' } as never)
    vi.mocked(prisma.locator.findMany).mockResolvedValue([{ id: 'loc-1' }] as never)
    vi.mocked(prisma.locatorGroup.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.locatorGroup.create).mockResolvedValue({ id: 'group-1', name: 'Home' } as never)

    await expect(
      createLocatorGroup(
        {
          name: 'Home',
          moduleId: 'module-1',
          route: '/home',
          locators: ['loc-1'],
        },
        targetProjectId,
      ),
    ).resolves.toEqual({ id: 'group-1', name: 'Home' })
  })
})

describe('updateLocatorGroup', () => {
  it('renames the group without updating a locator map file', async () => {
    vi.mocked(prisma.locatorGroup.findFirst).mockResolvedValueOnce({
      id: 'group-1',
      name: 'Old Name',
      moduleId: 'module-1',
      route: '/old',
      module: { id: 'module-1' },
    } as never)
    vi.mocked(prisma.locatorGroup.findFirst).mockResolvedValueOnce(null)
    vi.mocked(prisma.module.findFirst).mockResolvedValue({ id: 'module-1' } as never)
    vi.mocked(prisma.locator.findMany).mockResolvedValue([{ id: 'loc-1' }] as never)
    vi.mocked(prisma.locatorGroup.update).mockResolvedValue({
      id: 'group-1',
      name: 'New Name',
      module: { name: 'Core' },
    } as never)

    await updateLocatorGroup(
      'group-1',
      {
        name: 'New Name',
        moduleId: 'module-1',
        route: '/new',
        locators: ['loc-1'],
      },
      targetProjectId,
    )
  })
})

describe('deleteLocatorGroups', () => {
  it('deletes database records without deleting target files', async () => {
    vi.mocked(prisma.locatorGroup.deleteMany).mockResolvedValue({ count: 1 } as never)

    await expect(deleteLocatorGroups(['group-1'], targetProjectId)).resolves.toEqual(['group-1'])
    expect(prisma.locatorGroup.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['group-1'] }, targetProjectId },
    })
  })
})
