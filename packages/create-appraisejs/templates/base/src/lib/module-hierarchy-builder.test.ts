import { describe, expect, it, vi } from 'vitest'

const { findFirst, create, findMany } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  findMany: vi.fn(),
}))

vi.mock('@/config/db-config', () => ({
  default: {
    module: { findFirst, create, findMany },
  },
}))

import { buildModuleHierarchy, findModuleByPath, getAllModulesWithPaths } from './module-hierarchy-builder'

describe('module hierarchy builder project ownership', () => {
  it('creates every path segment within the explicit target project', async () => {
    findFirst.mockResolvedValue(null)
    create.mockResolvedValueOnce({ id: 'module-1' }).mockResolvedValueOnce({ id: 'module-2' })

    await expect(buildModuleHierarchy('/Payments/Checkout', 'project-1')).resolves.toBe('module-2')

    expect(findFirst).toHaveBeenNthCalledWith(1, {
      where: { name: 'Payments', parentId: null, targetProjectId: 'project-1' },
    })
    expect(create).toHaveBeenNthCalledWith(1, {
      data: { name: 'Payments', parentId: null, targetProjectId: 'project-1' },
    })
    expect(create).toHaveBeenNthCalledWith(2, {
      data: { name: 'Checkout', parentId: 'module-1', targetProjectId: 'project-1' },
    })
  })

  it('reads module paths only from the requested target project', async () => {
    findMany.mockResolvedValue([
      { id: 'module-1', name: 'Payments', parentId: null },
      { id: 'module-2', name: 'Checkout', parentId: 'module-1' },
    ])

    await expect(getAllModulesWithPaths('project-1')).resolves.toEqual([
      { id: 'module-1', name: 'Payments', parentId: null, path: '/Payments' },
      { id: 'module-2', name: 'Checkout', parentId: 'module-1', path: '/Payments/Checkout' },
    ])
    await expect(findModuleByPath('/Payments/Checkout', 'project-1')).resolves.toBe('module-2')

    expect(findMany).toHaveBeenCalledWith({
      where: { targetProjectId: 'project-1' },
    })
  })
})
