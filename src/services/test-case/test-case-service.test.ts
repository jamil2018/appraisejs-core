import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StepParameterType, TagType, TemplateStepIcon } from '@prisma/client'
import { createTestCaseFromInput, updateTestCaseFromInput, deleteTestCasesByIds } from './test-case-service'

vi.mock('@/config/db-config', () => ({
  default: {
    testSuite: { findMany: vi.fn() },
    tag: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
    testCase: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    testCaseStep: { findMany: vi.fn(), deleteMany: vi.fn() },
    testCaseStepParameter: { deleteMany: vi.fn() },
  },
}))

vi.mock('@/lib/automation/projection-service', () => ({
  automationProjectionService: {
    generateFeature: vi.fn().mockResolvedValue(undefined),
  },
}))

import prisma from '@/config/db-config'
import { automationProjectionService } from '@/lib/automation/projection-service'

const baseInput = {
  title: 'Login works',
  description: 'Checks login',
  testSuiteIds: ['suite-a'],
  tagIds: ['tag-1'],
  steps: [
    {
      gherkinStep: 'Given I log in',
      label: 'Login',
      icon: TemplateStepIcon.ACTION,
      parameters: [
        {
          name: 'username',
          value: 'demo@example.com',
          type: StepParameterType.STRING,
          order: 0,
        },
      ],
      order: 0,
      templateStepId: 'template-1',
    },
  ],
}

function createMockTx() {
  return {
    testRunTestCase: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    review: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    linkedJiraTicket: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    testCaseStepParameter: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    testCaseStep: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    tag: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    testCase: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  }
}

describe('deleteTestCasesByIds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads suites and tags, runs transactional deletes, then regenerates features for affected suites', async () => {
    vi.mocked(prisma.testSuite.findMany).mockResolvedValue([{ id: 'suite-a' }, { id: 'suite-b' }] as never)
    vi.mocked(prisma.tag.findMany).mockResolvedValue([{ id: 'tag-1' }] as never)

    const tx = createMockTx()
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      await fn(tx)
    })

    await deleteTestCasesByIds(['tc-1', 'tc-2'])

    expect(prisma.testSuite.findMany).toHaveBeenCalled()
    expect(prisma.tag.findMany).toHaveBeenCalled()
    expect(tx.testCase.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['tc-1', 'tc-2'] } },
    })
    expect(tx.tag.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['tag-1'] } },
    })
    expect(automationProjectionService.generateFeature).toHaveBeenCalledWith('suite-a')
    expect(automationProjectionService.generateFeature).toHaveBeenCalledWith('suite-b')
  })

  it('still completes transaction when no suites need feature regeneration', async () => {
    vi.mocked(prisma.testSuite.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.tag.findMany).mockResolvedValue([] as never)
    const tx = createMockTx()
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      await fn(tx)
    })

    await deleteTestCasesByIds(['tc-x'])

    expect(automationProjectionService.generateFeature).not.toHaveBeenCalled()
    expect(tx.testCase.deleteMany).toHaveBeenCalled()
  })
})

describe('createTestCaseFromInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates an identifier tag, persists the test case, and regenerates affected features', async () => {
    vi.mocked(prisma.tag.create).mockResolvedValue({ id: 'identifier-tag' } as never)
    vi.mocked(prisma.testCase.create).mockResolvedValue({
      id: 'tc-1',
      TestSuite: [{ id: 'suite-a' }],
    } as never)

    const result = await createTestCaseFromInput(baseInput)

    expect(result).toEqual({
      id: 'tc-1',
      TestSuite: [{ id: 'suite-a' }],
    })
    expect(prisma.tag.create).toHaveBeenCalledWith({
      data: {
        name: expect.stringMatching(/^tc_/),
        type: TagType.IDENTIFIER,
        tagExpression: expect.stringMatching(/^@tc_/),
      },
    })
    expect(prisma.testCase.create).toHaveBeenCalled()
    expect(automationProjectionService.generateFeature).toHaveBeenCalledWith('suite-a')
  })
})

describe('updateTestCaseFromInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('replaces steps, preserves identifier tags, and regenerates affected suite features', async () => {
    vi.mocked(prisma.testSuite.findMany).mockResolvedValue([{ id: 'suite-a' }] as never)
    vi.mocked(prisma.testCaseStep.findMany).mockResolvedValue([{ id: 'step-1' }] as never)
    vi.mocked(prisma.testCase.findUnique).mockResolvedValue({
      id: 'tc-1',
      tags: [{ id: 'identifier-tag' }],
    } as never)
    vi.mocked(prisma.testCase.update).mockResolvedValue({
      id: 'tc-1',
      steps: [],
    } as never)

    const result = await updateTestCaseFromInput(baseInput, 'tc-1')

    expect(result).toEqual({ id: 'tc-1', steps: [] })
    expect(prisma.testCaseStepParameter.deleteMany).toHaveBeenCalledWith({
      where: { testCaseStepId: { in: ['step-1'] } },
    })
    expect(prisma.testCaseStep.deleteMany).toHaveBeenCalledWith({
      where: { testCaseId: 'tc-1' },
    })
    expect(prisma.testCase.update).toHaveBeenCalledWith({
      where: { id: 'tc-1' },
      data: expect.objectContaining({
        title: 'Login works',
        description: 'Checks login',
        tags: {
          set: [{ id: 'identifier-tag' }, { id: 'tag-1' }],
        },
      }),
      include: {
        steps: true,
      },
    })
    expect(automationProjectionService.generateFeature).toHaveBeenCalledWith('suite-a')
  })
})
