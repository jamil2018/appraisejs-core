import { describe, expect, it, vi } from 'vitest'
import { getTemplateTestCaseByIdOrThrow } from './template-test-case-service'

vi.mock('@/config/db-config', () => ({
  default: {
    templateTestCase: {
      findUnique: vi.fn(),
    },
  },
}))

import prisma from '@/config/db-config'

describe('getTemplateTestCaseByIdOrThrow', () => {
  it('throws when template test case is missing', async () => {
    vi.mocked(prisma.templateTestCase.findUnique).mockResolvedValue(null)
    await expect(getTemplateTestCaseByIdOrThrow('missing')).rejects.toMatchObject({
      message: 'Template test case not found',
      statusCode: 404,
    })
  })
})
