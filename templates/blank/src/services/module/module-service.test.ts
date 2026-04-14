import { describe, expect, it, vi } from 'vitest'
import { ROOT_MODULE_UUID } from '@/constants/form-opts/module-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { createModule, deleteModules, getModuleByIdOrThrow, updateModule } from './module-service'

vi.mock('@/config/db-config', () => ({
  default: {
    module: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/automation/projection-service', () => ({
  automationProjectionService: {
    regenerateAllPathDependentArtifacts: vi.fn().mockResolvedValue(undefined),
  },
}))

import prisma from '@/config/db-config'

describe('getModuleByIdOrThrow', () => {
  it('throws NOT_FOUND when module missing', async () => {
    vi.mocked(prisma.module.findUnique).mockResolvedValue(null)
    await expect(getModuleByIdOrThrow('missing')).rejects.toMatchObject({
      message: 'Module not found',
      statusCode: 404,
    })
  })
})

describe('createModule', () => {
  it('normalizes the root parent id and regenerates artifacts', async () => {
    vi.mocked(prisma.module.create).mockResolvedValue({ id: 'module-1', name: 'Checkout' } as never)

    await expect(
      createModule({
        name: 'Checkout',
        parentId: ROOT_MODULE_UUID,
      }),
    ).resolves.toEqual({ id: 'module-1', name: 'Checkout' })

    expect(prisma.module.create).toHaveBeenCalledWith({
      data: {
        name: 'Checkout',
        parentId: null,
      },
    })
    expect(automationProjectionService.regenerateAllPathDependentArtifacts).toHaveBeenCalled()
  })
})

describe('updateModule', () => {
  it('updates the module and regenerates path-dependent artifacts', async () => {
    vi.mocked(prisma.module.update).mockResolvedValue({ id: 'module-1', name: 'Checkout' } as never)

    await expect(
      updateModule('module-1', {
        name: 'Checkout',
        parentId: 'parent-1',
      }),
    ).resolves.toEqual({ id: 'module-1', name: 'Checkout' })

    expect(prisma.module.update).toHaveBeenCalledWith({
      where: { id: 'module-1' },
      data: {
        name: 'Checkout',
        parentId: 'parent-1',
      },
    })
    expect(automationProjectionService.regenerateAllPathDependentArtifacts).toHaveBeenCalled()
  })
})

describe('deleteModules', () => {
  it('deletes modules and regenerates path-dependent artifacts', async () => {
    vi.mocked(prisma.module.deleteMany).mockResolvedValue({ count: 2 } as never)

    await deleteModules(['module-1', 'module-2'])

    expect(prisma.module.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['module-1', 'module-2'] } },
    })
    expect(automationProjectionService.regenerateAllPathDependentArtifacts).toHaveBeenCalled()
  })
})
