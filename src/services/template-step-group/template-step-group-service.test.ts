import { describe, expect, it, vi } from 'vitest'
import { getTemplateStepGroupByIdOrThrow, listTemplateStepGroups } from './template-step-group-service'

vi.mock('@/config/db-config', () => ({
  default: {
    templateStepGroup: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

import prisma from '@/config/db-config'

describe('getTemplateStepGroupByIdOrThrow', () => {
  it('lists the shared group library without a project filter', async () => {
    vi.mocked(prisma.templateStepGroup.findMany).mockResolvedValue([])
    await expect(listTemplateStepGroups()).resolves.toEqual([])
    expect(prisma.templateStepGroup.findMany).toHaveBeenCalledWith()
  })

  it('throws when template step group is missing', async () => {
    vi.mocked(prisma.templateStepGroup.findUnique).mockResolvedValue(null)
    await expect(getTemplateStepGroupByIdOrThrow('missing')).rejects.toMatchObject({
      message: 'Template step group not found',
      statusCode: 404,
    })
  })
})
