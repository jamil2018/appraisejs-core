import prisma from '@/config/db-config'
import { reviewSchema } from '@/constants/form-opts/review-form-opts'
import { ServiceError } from '@/services/shared/errors'
import { Prisma } from '@prisma/client'
import type { Review } from '@prisma/client'
import type { z } from 'zod'

const reviewListInclude = {
  testCase: {
    select: { title: true },
  },
} as const

export type ReviewWithTestCaseTitle = Prisma.ReviewGetPayload<{ include: typeof reviewListInclude }>

export async function listReviewsWithTestCaseTitle(): Promise<ReviewWithTestCaseTitle[]> {
  return prisma.review.findMany({
    include: reviewListInclude,
  })
}

export async function deleteReviews(ids: string[]): Promise<void> {
  await prisma.review.deleteMany({ where: { id: { in: ids } } })
}

export async function getReviewByIdOrThrow(id: string): Promise<Review> {
  const review = await prisma.review.findUnique({ where: { id } })
  if (!review) {
    throw new ServiceError('Review not found', 'NOT_FOUND', 404)
  }
  return review
}

export async function updateReview(id: string | undefined, value: z.infer<typeof reviewSchema>): Promise<Review> {
  if (!id) {
    throw new ServiceError('Review id is required', 'VALIDATION', 400)
  }
  return prisma.review.update({ where: { id }, data: value })
}

export async function createReview(value: z.infer<typeof reviewSchema>): Promise<Review> {
  return prisma.review.create({ data: value })
}
