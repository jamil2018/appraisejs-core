import { describe, expect, it, vi } from 'vitest'
import { getReviewByIdOrThrow } from './review-service'

vi.mock('@/config/db-config', () => ({
  default: {
    review: {
      findUnique: vi.fn(),
    },
  },
}))

import prisma from '@/config/db-config'

describe('getReviewByIdOrThrow', () => {
  it('throws when review missing', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue(null)
    await expect(getReviewByIdOrThrow('id')).rejects.toMatchObject({
      message: 'Review not found',
      statusCode: 404,
    })
  })
})
