import { describe, expect, it, vi } from 'vitest'
import { ROOT_MODULE_UUID } from '@/constants/form-opts/module-form-opts'
import { createModule, deleteModules, getModuleByIdOrThrow, updateModule } from './module-service'

vi.mock('@/config/db-config', () => ({
  default: {
    module: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

import prisma from '@/config/db-config'
const targetProjectId = 'project-1'

describe('getModuleByIdOrThrow', () => {
  it('throws NOT_FOUND when module missing', async () => {
    vi.mocked(prisma.module.findFirst).mockResolvedValue(null)
    await expect(getModuleByIdOrThrow('missing', targetProjectId)).rejects.toMatchObject({
      message: 'Module not found',
      statusCode: 404,
    })
  })
})

describe('createModule', () => {
  it('normalizes the root parent id without generating target artifacts', async () => {
    vi.mocked(prisma.module.create).mockResolvedValue({ id: 'module-1', name: 'Checkout' } as never)

    await expect(
      createModule(
        {
          name: 'Checkout',
          parentId: ROOT_MODULE_UUID,
        },
        targetProjectId,
      ),
    ).resolves.toEqual({ id: 'module-1', name: 'Checkout' })

    expect(prisma.module.create).toHaveBeenCalledWith({
      data: {
        name: 'Checkout',
        targetProjectId,
        parentId: null,
      },
    })
  })
})

describe('updateModule', () => {
  it('updates the module without generating path-dependent artifacts', async () => {
    vi.mocked(prisma.module.update).mockResolvedValue({ id: 'module-1', name: 'Checkout' } as never)
    vi.mocked(prisma.module.findFirst)
      .mockResolvedValueOnce({ id: 'module-1' } as never)
      .mockResolvedValueOnce({ id: 'parent-1' } as never)

    await expect(
      updateModule(
        'module-1',
        {
          name: 'Checkout',
          parentId: 'parent-1',
        },
        targetProjectId,
      ),
    ).resolves.toEqual({ id: 'module-1', name: 'Checkout' })

    expect(prisma.module.update).toHaveBeenCalledWith({
      where: { id: 'module-1' },
      data: {
        name: 'Checkout',
        parentId: 'parent-1',
      },
    })
  })
})

describe('deleteModules', () => {
  it('deletes modules without generating path-dependent artifacts', async () => {
    vi.mocked(prisma.module.deleteMany).mockResolvedValue({ count: 2 } as never)

    await deleteModules(['module-1', 'module-2'], targetProjectId)

    expect(prisma.module.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['module-1', 'module-2'] }, targetProjectId },
    })
  })
})
