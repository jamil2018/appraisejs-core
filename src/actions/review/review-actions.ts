'use server'

import prisma from '@/config/db-config'
import { reviewSchema } from '@/constants/form-opts/review-form-opts'
import { ActionResponse } from '@/types/form/actionHandler'
import { Review } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { unknownErrorToActionResponse } from '@/services/shared/errors'

export interface ReviewWithRelations extends Review {
  testCase: {
    title: string
  }
  reviewer: {
    username: string
  }
}

async function fetchAllReviewsWithTestCaseTitle() {
  return prisma.review.findMany({
    include: {
      testCase: {
        select: {
          title: true,
        },
      },
    },
  })
}

/** Lists all reviews (auth removed; previously filtered by reviewer). */
export async function getReviewsByReviewerAction(): Promise<ActionResponse> {
  try {
    const reviews = await fetchAllReviewsWithTestCaseTitle()
    return {
      status: 200,
      success: true,
      data: reviews,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

/** @deprecated Use getReviewsByReviewerAction — identical behavior after auth removal. */
export async function getAllReviewsByCreatorAction(): Promise<ActionResponse> {
  return getReviewsByReviewerAction()
}

export async function deleteReviewAction(id: string[]): Promise<ActionResponse> {
  try {
    await prisma.review.deleteMany({
      where: { id: { in: id } },
    })
    revalidatePath('/reviews')
    return {
      status: 200,
      success: true,
      data: 'Review deleted successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getReviewByIdAction(id: string): Promise<ActionResponse> {
  try {
    const review = await prisma.review.findUnique({
      where: { id },
    })
    if (!review) {
      return {
        status: 404,
        success: false,
        error: 'Review not found',
      }
    }
    return {
      status: 200,
      success: true,
      data: review,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function updateReviewAction(
  _prev: unknown,
  value: z.infer<typeof reviewSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    reviewSchema.parse(value)
    if (!id) {
      return {
        status: 400,
        success: false,
        error: 'Review id is required',
      }
    }
    const updatedReview = await prisma.review.update({
      where: { id },
      data: value,
    })
    revalidatePath('/reviews')
    return {
      status: 200,
      success: true,
      data: updatedReview,
      message: 'Review updated successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function createReviewAction(_prev: unknown, value: z.infer<typeof reviewSchema>): Promise<ActionResponse> {
  try {
    reviewSchema.parse(value)
    const newReview = await prisma.review.create({
      data: {
        ...value,
      },
    })
    revalidatePath('/reviews')
    return {
      status: 200,
      success: true,
      data: newReview,
      message: 'Review created successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}
