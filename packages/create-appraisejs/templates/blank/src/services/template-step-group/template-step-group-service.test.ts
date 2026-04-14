import { describe, expect, it, vi } from 'vitest'
import { getTemplateStepGroupByIdOrThrow } from './template-step-group-service'

vi.mock('@/config/db-config', () => ({
  default: {
    templateStepGroup: {
      findUnique: vi.fn(),
    },
  },
}))

import prisma from '@/config/db-config'

describe('getTemplateStepGroupByIdOrThrow', () => {
  it('throws when template step group is missing', async () => {
    vi.mocked(prisma.templateStepGroup.findUnique).mockResolvedValue(null)
    await expect(getTemplateStepGroupByIdOrThrow('missing')).rejects.toMatchObject({
      message: 'Template step group not found',
      statusCode: 404,
    })
  })
})
