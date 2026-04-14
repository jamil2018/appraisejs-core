import { describe, expect, it, vi } from 'vitest'
import { getTemplateStepByIdOrThrow } from './template-step-service'

vi.mock('@/config/db-config', () => ({
  default: {
    templateStep: {
      findUnique: vi.fn(),
    },
  },
}))

import prisma from '@/config/db-config'

describe('getTemplateStepByIdOrThrow', () => {
  it('throws when template step is missing', async () => {
    vi.mocked(prisma.templateStep.findUnique).mockResolvedValue(null)
    await expect(getTemplateStepByIdOrThrow('missing')).rejects.toMatchObject({
      message: 'Template step not found',
      statusCode: 404,
    })
  })
})
