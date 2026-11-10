import type { Prisma } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { findFirst, create, findMany, transaction, prepareMutation, randomUUID } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  findMany: vi.fn(),
  transaction: vi.fn(),
  prepareMutation: vi.fn(),
  randomUUID: vi.fn(),
}))

vi.mock('node:crypto', async importOriginal => ({
  ...(await importOriginal<typeof import('node:crypto')>()),
  randomUUID,
}))

vi.mock('@/services/coordinator/quality-journey-shared-resource-guard-service', () => ({
  prepareSharedResourceMutationInTransaction: prepareMutation,
}))

vi.mock('@/config/db-config', () => ({
  default: {
    $transaction: transaction,
    module: { findFirst, create, findMany },
  },
}))

import {
  buildModuleHierarchy,
  buildModuleHierarchyInTransaction,
  findModuleByPath,
  getAllModulesWithPaths,
} from './module-hierarchy-builder'

// The boundary is mocked explicitly; this is transaction routing evidence,
// not a substitute for real Prisma rollback or SRP1 coverage validation.
const tx = { module: { findFirst, create, findMany } } as unknown as Prisma.TransactionClient
const existingModule = (id: string, name: string, parentId: string | null) => ({
  id,
  name,
  parentId,
  targetProjectId: 'project-1',
  archivedAt: null,
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  findFirst.mockResolvedValue(null)
  create.mockImplementation(async ({ data }) => ({ ...data }))
  transaction.mockImplementation(async effect => effect(tx))
  randomUUID.mockReturnValueOnce('new-module-1').mockReturnValueOnce('new-module-2').mockReturnValueOnce('new-module-3')
})

afterEach(() => vi.restoreAllMocks())

describe('module hierarchy builder project ownership', () => {
  it('prepares every new identity in one batch before creating the complete target-owned chain', async () => {
    const trace: string[] = []
    prepareMutation.mockImplementation(async () => {
      trace.push('batch')
    })
    create.mockImplementation(async ({ data }) => {
      trace.push(data.name)
      return { ...data }
    })

    await expect(buildModuleHierarchy('/Payments/Checkout', 'project-1')).resolves.toBe('new-module-2')

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(findFirst).toHaveBeenNthCalledWith(1, {
      where: { name: 'Payments', parentId: null, targetProjectId: 'project-1', archivedAt: null },
    })
    expect(prepareMutation).toHaveBeenCalledExactlyOnceWith(tx, 'project-1', {
      existing: [],
      newRoots: [
        { kind: 'MODULE', resourceId: 'new-module-1' },
        { kind: 'MODULE', resourceId: 'new-module-2' },
      ],
      deleted: [],
    })
    expect(trace).toEqual(['batch', 'Payments', 'Checkout'])
    expect(create).toHaveBeenNthCalledWith(1, {
      data: { id: 'new-module-1', name: 'Payments', parentId: null, targetProjectId: 'project-1' },
    })
    expect(create).toHaveBeenNthCalledWith(2, {
      data: { id: 'new-module-2', name: 'Checkout', parentId: 'new-module-1', targetProjectId: 'project-1' },
    })
  })

  it('returns an exact existing hierarchy with no mutation batch or insert', async () => {
    findFirst
      .mockResolvedValueOnce(existingModule('module-1', 'Payments', null))
      .mockResolvedValueOnce(existingModule('module-2', 'Checkout', 'module-1'))

    await expect(buildModuleHierarchyInTransaction('/Payments/Checkout', 'project-1', tx)).resolves.toBe('module-2')

    expect(findFirst).toHaveBeenNthCalledWith(2, {
      where: { name: 'Checkout', parentId: 'module-1', targetProjectId: 'project-1', archivedAt: null },
    })
    expect(prepareMutation).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(randomUUID).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  it('returns an existing default root with no guard write', async () => {
    findFirst.mockResolvedValueOnce(existingModule('root-id', 'root', null))

    await expect(buildModuleHierarchy('/', 'project-1')).resolves.toBe('root-id')

    expect(prepareMutation).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('reserves a missing default root under its prepared identity', async () => {
    await expect(buildModuleHierarchy('', 'project-1')).resolves.toBe('new-module-1')

    expect(prepareMutation).toHaveBeenCalledExactlyOnceWith(tx, 'project-1', {
      existing: [],
      newRoots: [{ kind: 'MODULE', resourceId: 'new-module-1' }],
      deleted: [],
    })
    expect(create).toHaveBeenCalledExactlyOnceWith({
      data: { id: 'new-module-1', name: 'root', parentId: null, targetProjectId: 'project-1' },
    })
    expect(console.log).toHaveBeenCalledWith('Created root module for features without module path')
  })

  it('uses an existing parent only as a foreign-key read and batches the entire missing suffix', async () => {
    findFirst.mockResolvedValueOnce(existingModule('module-1', 'Payments', null)).mockResolvedValueOnce(null)

    await expect(buildModuleHierarchy('/Payments/Checkout/Review', 'project-1')).resolves.toBe('new-module-2')

    expect(prepareMutation).toHaveBeenCalledExactlyOnceWith(tx, 'project-1', {
      existing: [],
      newRoots: [{ kind: 'MODULE', resourceId: 'new-module-1' }, { kind: 'MODULE', resourceId: 'new-module-2' }],
      deleted: [],
    })
    expect(create).toHaveBeenNthCalledWith(1, {
      data: { id: 'new-module-1', name: 'Checkout', parentId: 'module-1', targetProjectId: 'project-1' },
    })
    expect(create).toHaveBeenNthCalledWith(2, {
      data: { id: 'new-module-2', name: 'Review', parentId: 'new-module-1', targetProjectId: 'project-1' },
    })
  })

  it.each([
    { ...existingModule('foreign-parent', 'Payments', null), targetProjectId: 'project-2' },
    { ...existingModule('wrong-parent', 'Payments', 'foreign-parent') },
    { ...existingModule('archived-parent', 'Payments', null), archivedAt: new Date('2026-10-24T00:00:00Z') },
  ])('refuses a mismatched existing parent before any guard or resource write', async parent => {
    findFirst.mockResolvedValueOnce(parent)

    await expect(buildModuleHierarchy('/Payments/Checkout', 'project-1')).rejects.toThrow('active target path')

    expect(prepareMutation).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it.each([
    [undefined as unknown as string, 'project-1'],
    ['/Payments', ''],
    [`/${Array.from({ length: 4097 }, () => 'segment').join('/')}`, 'project-1'],
  ])('refuses invalid or unbounded input before semantic reads or writes', async (path, target) => {
    await expect(buildModuleHierarchyInTransaction(path, target, tx)).rejects.toThrow()

    expect(findFirst).not.toHaveBeenCalled()
    expect(prepareMutation).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('propagates batch refusal without creating any part of the hierarchy', async () => {
    const refusal = new Error('retained identity or unavailable coverage')
    prepareMutation.mockRejectedValueOnce(refusal)

    await expect(buildModuleHierarchy('/Payments/Checkout', 'project-1')).rejects.toBe(refusal)

    expect(prepareMutation).toHaveBeenCalledTimes(1)
    expect(create).not.toHaveBeenCalled()
  })

  it('leaves a later insertion failure with the same owning transaction rather than committing a prefix', async () => {
    const committed: string[] = []
    const refusal = new Error('second insert failed')
    transaction.mockImplementationOnce(async effect => {
      const staged: string[] = []
      create.mockImplementation(async ({ data }) => {
        if (staged.length === 1) throw refusal
        staged.push(data.id)
        return { ...data }
      })
      const outcome = await effect(tx)
      committed.push(...staged)
      return outcome
    })

    await expect(buildModuleHierarchy('/Payments/Checkout', 'project-1')).rejects.toBe(refusal)

    expect(committed).toEqual([])
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(prepareMutation).toHaveBeenCalledExactlyOnceWith(tx, 'project-1', {
      existing: [],
      newRoots: [{ kind: 'MODULE', resourceId: 'new-module-1' }, { kind: 'MODULE', resourceId: 'new-module-2' }],
      deleted: [],
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
      where: { targetProjectId: 'project-1', archivedAt: null },
    })
  })
})
