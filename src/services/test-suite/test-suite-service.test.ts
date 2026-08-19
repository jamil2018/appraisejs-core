import { describe, expect, it, vi } from 'vitest'
import { TagType } from '@prisma/client'
import { createTestSuiteFromInput, deleteTestSuitesByIds, updateTestSuiteFromInput } from './test-suite-service'

vi.mock('@/config/db-config', () => ({
  default: {
    tag: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    module: { findFirst: vi.fn() },
    testCase: { findMany: vi.fn() },
    testSuite: {
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/test-suite-identifier-service', () => ({
  getOrCreateTestSuiteIdentifierTagId: vi.fn().mockResolvedValue('identifier-tag'),
  ensureTestSuiteIdentifierTags: vi.fn().mockResolvedValue(undefined),
}))

import prisma from '@/config/db-config'
const targetProjectId = 'project-1'

describe('deleteTestSuitesByIds', () => {
  it('deletes suites and skips orphan-tag cleanup when no identifier tags', async () => {
    vi.mocked(prisma.tag.findMany).mockResolvedValue([])
    vi.mocked(prisma.testSuite.deleteMany).mockResolvedValue({ count: 0 })

    await deleteTestSuitesByIds(['suite-1'], targetProjectId)

    expect(prisma.testSuite.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['suite-1'] }, targetProjectId },
    })
    expect(prisma.tag.deleteMany).not.toHaveBeenCalled()
  })
})

describe('createTestSuiteFromInput', () => {
  it('creates a suite with an identifier tag without generating a feature file', async () => {
    vi.mocked(prisma.module.findFirst).mockResolvedValue({ id: 'module-1' } as never)
    vi.mocked(prisma.testCase.findMany).mockResolvedValue([{ id: 'tc-1' }] as never)
    vi.mocked(prisma.tag.findMany).mockResolvedValue([{ id: 'tag-1' }] as never)
    vi.mocked(prisma.$transaction).mockImplementation(async callback => {
      const tx = {
        tag: {
          create: vi.fn().mockResolvedValue({ id: 'identifier-tag' }),
        },
        testSuite: {
          create: vi.fn().mockResolvedValue({ id: 'suite-1', name: 'Login Suite' }),
        },
      }

      return callback(tx as never)
    })

    const result = await createTestSuiteFromInput(
      {
        name: 'Login Suite',
        description: 'Covers login',
        moduleId: 'module-1',
        testCases: ['tc-1'],
        tagIds: ['tag-1'],
      },
      targetProjectId,
    )

    expect(result).toEqual({ id: 'suite-1', name: 'Login Suite' })
  })
})

describe('updateTestSuiteFromInput', () => {
  it('updates database relationships when the name changes and preserves the identifier tag', async () => {
    vi.mocked(prisma.testSuite.findFirst).mockResolvedValue({
      id: 'suite-1',
      name: 'Old Name',
      moduleId: 'module-1',
      module: { id: 'module-1' },
      tags: [{ id: 'identifier-tag', type: TagType.IDENTIFIER }],
    } as never)
    vi.mocked(prisma.testSuite.update).mockResolvedValue({ id: 'suite-1' } as never)
    vi.mocked(prisma.module.findFirst).mockResolvedValue({ id: 'module-1' } as never)
    vi.mocked(prisma.testCase.findMany).mockResolvedValue([{ id: 'tc-1' }] as never)
    vi.mocked(prisma.tag.findMany).mockResolvedValue([{ id: 'tag-1' }] as never)

    await updateTestSuiteFromInput(
      {
        name: 'New Name',
        description: 'Updated',
        moduleId: 'module-1',
        testCases: ['tc-1'],
        tagIds: ['tag-1'],
      },
      'suite-1',
      targetProjectId,
    )

    expect(prisma.testSuite.update).toHaveBeenCalledWith({
      where: { id: 'suite-1' },
      data: {
        name: 'New Name',
        description: 'Updated',
        testCases: {
          set: [{ id: 'tc-1' }],
        },
        tags: {
          set: [{ id: 'identifier-tag' }, { id: 'tag-1' }],
        },
        module: {
          connect: {
            id: 'module-1',
          },
        },
      },
    })
  })
})
