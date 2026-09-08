import { describe, expect, it, vi } from 'vitest'
import { ROOT_MODULE_UUID } from '@/constants/form-opts/module-form-opts'
import { createModule, deleteModules, getModuleByIdOrThrow, listModules, updateModule } from './module-service'

vi.mock('@/config/db-config', () => ({
  default: {
    module: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
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
      where: { id: { in: ['module-1', 'module-2'] }, targetProjectId, archivedAt: null, collaborationManaged: false },
    })
  })

  it('does not destructively delete collaboration-managed modules', async () => {
    vi.clearAllMocks()
    vi.mocked(prisma.module.findFirst).mockResolvedValueOnce({ id: 'module-1' } as never)

    await expect(deleteModules(['module-1'], targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    expect(prisma.module.deleteMany).not.toHaveBeenCalled()
  })
})

describe('listModules', () => {
  it('excludes archived modules from active authoring', async () => {
    vi.mocked(prisma.module.findMany).mockResolvedValue([] as never)

    await listModules(targetProjectId)

    expect(prisma.module.findMany).toHaveBeenCalledWith({
      where: { targetProjectId, archivedAt: null },
      include: { parent: { select: { name: true } } },
    })
  })
})
