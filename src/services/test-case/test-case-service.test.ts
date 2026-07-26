import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/config/db-config', () => ({
  default: {
    testSuite: { findMany: vi.fn() },
    tag: { findMany: vi.fn(), create: vi.fn() },
    stepDefinition: { findMany: vi.fn() },
    testCase: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import prisma from '@/config/db-config'
import { createTestCaseFromInput } from './test-case-service'

const db = prisma as unknown as {
  testSuite: { findMany: ReturnType<typeof vi.fn> }
  tag: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }
  testCase: { create: ReturnType<typeof vi.fn> }
  $transaction: ReturnType<typeof vi.fn>
}

describe('createTestCaseFromInput mutation boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.testSuite.findMany.mockResolvedValue([{ id: 'suite-1' }])
    db.tag.findMany.mockResolvedValue([{ id: 'tag-1' }])
  })

  it('does not create identifier tags or test cases for an invalid Step Invocation', async () => {
    await expect(
      createTestCaseFromInput(
        {
          title: 'Invalid step invocation',
          testSuiteIds: ['suite-1'],
          tagIds: ['tag-1'],
          flowBlocks: [],
          steps: [
            {
              gherkinStep: 'Given invalid metadata',
              label: 'Invalid metadata',
              icon: 'MOUSE',
              parameters: [],
              order: 0,
              invocation: {},
            },
          ],
        } as never,
        'project-1',
      ),
    ).rejects.toThrow()

    expect(db.tag.create).not.toHaveBeenCalled()
    expect(db.testCase.create).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})
