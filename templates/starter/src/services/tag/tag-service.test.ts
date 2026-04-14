import { describe, expect, it, vi } from 'vitest'
import { getTagByIdOrThrow } from './tag-service'

vi.mock('@/config/db-config', () => ({
  default: {
    tag: {
      findUnique: vi.fn(),
    },
  },
}))

import prisma from '@/config/db-config'

describe('getTagByIdOrThrow', () => {
  it('throws when tag missing', async () => {
    vi.mocked(prisma.tag.findUnique).mockResolvedValue(null)
    await expect(getTagByIdOrThrow('id')).rejects.toMatchObject({
      message: 'Tag not found',
      statusCode: 404,
    })
  })
})
