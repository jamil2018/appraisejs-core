import { describe, expect, it, vi } from 'vitest'

import { createStepBlock, getStepBlockByIdOrThrow, type StepBlockDetail } from './step-block-service'

vi.mock('@/config/db-config', () => ({
  default: {
    stepBlock: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    stepBlockStep: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import prisma from '@/config/db-config'

describe('step block service', () => {
  it('throws when a step block is missing', async () => {
    vi.mocked(prisma.stepBlock.findUnique).mockResolvedValue(null)

    await expect(getStepBlockByIdOrThrow('missing')).rejects.toMatchObject({
      message: 'Step block not found',
      statusCode: 404,
    })
  })

  it('creates ordered block steps with empty parameter maps', async () => {
    const createdStepBlock = {
      id: 'block-1',
      name: 'Login block',
      description: null,
      intent: 'Log in',
      createdAt: new Date(),
      updatedAt: new Date(),
      targetProjectId: null,
      steps: [],
    } satisfies StepBlockDetail

    vi.mocked(prisma.stepBlock.create).mockResolvedValue(createdStepBlock as never)

    await createStepBlock({
      name: ' Login block ',
      description: '',
      intent: ' Log in ',
      steps: [{ templateStepId: 'step-1' }, { templateStepId: 'step-2' }],
    })

    expect(prisma.stepBlock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Login block',
          description: null,
          intent: 'Log in',
          steps: {
            create: [
              { templateStepId: 'step-1', order: 0, parameterMap: '{}' },
              { templateStepId: 'step-2', order: 1, parameterMap: '{}' },
            ],
          },
        }),
      }),
    )
  })
})
