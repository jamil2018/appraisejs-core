import { describe, expect, it, vi } from 'vitest'
import { getTemplateStepByIdOrThrow, listTemplateSteps } from './template-step-service'

vi.mock('@/config/db-config', () => ({
  default: {
    templateStep: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

import prisma from '@/config/db-config'

describe('getTemplateStepByIdOrThrow', () => {
  it('lists the shared step library without a project filter', async () => {
    vi.mocked(prisma.templateStep.findMany).mockResolvedValue([])
    await expect(listTemplateSteps()).resolves.toEqual([])
    expect(prisma.templateStep.findMany).toHaveBeenCalledWith({
      include: {
        parameters: { select: { id: true, name: true } },
        templateStepGroup: true,
      },
    })
  })

  it('throws when template step is missing', async () => {
    vi.mocked(prisma.templateStep.findUnique).mockResolvedValue(null)
    await expect(getTemplateStepByIdOrThrow('missing')).rejects.toMatchObject({
      message: 'Template step not found',
      statusCode: 404,
    })
  })
})
