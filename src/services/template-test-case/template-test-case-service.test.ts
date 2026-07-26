import { describe, expect, it, vi } from 'vitest'
import { createTemplateTestCase, getTemplateTestCaseByIdOrThrow } from './template-test-case-service'

vi.mock('@/config/db-config', () => ({
  default: {
    templateTestCase: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    stepDefinition: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import prisma from '@/config/db-config'

describe('getTemplateTestCaseByIdOrThrow', () => {
  it('throws when template test case is missing', async () => {
    vi.mocked(prisma.templateTestCase.findFirst).mockResolvedValue(null)
    await expect(getTemplateTestCaseByIdOrThrow('missing', 'project-1')).rejects.toMatchObject({
      message: 'Template test case not found',
      statusCode: 404,
    })
  })
})

describe('createTemplateTestCase mutation boundary', () => {
  it('does not create a template test case for an invalid Step Invocation', async () => {
    await expect(
      createTemplateTestCase(
        {
          title: 'Invalid template invocation',
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

    expect(prisma.templateTestCase.create).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
