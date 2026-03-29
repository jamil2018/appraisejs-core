'use server'

import { reviewSchema } from '@/constants/form-opts/review-form-opts'
import {
  createReview,
  deleteReviews,
  getReviewByIdOrThrow,
  listReviewsWithTestCaseTitle,
  updateReview,
} from '@/services/review/review-service'
import type { ReviewWithTestCaseTitle } from '@/services/review/review-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/** @deprecated Prefer `ReviewWithTestCaseTitle` from `@/services/review/review-service`. */
export type ReviewWithRelations = ReviewWithTestCaseTitle

export async function getReviewsByReviewerAction(): Promise<ActionResponse> {
  try {
    const reviews = await listReviewsWithTestCaseTitle()
    return {
      status: 200,
      success: true,
      data: reviews,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function deleteReviewAction(id: string[]): Promise<ActionResponse> {
  try {
    await deleteReviews(id)
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
    const review = await getReviewByIdOrThrow(id)
    return {
      status: 200,
      success: true,
      data: review,
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
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
    const updatedReview = await updateReview(id, value)
    revalidatePath('/reviews')
    return {
      status: 200,
      success: true,
      data: updatedReview,
      message: 'Review updated successfully',
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function createReviewAction(_prev: unknown, value: z.infer<typeof reviewSchema>): Promise<ActionResponse> {
  try {
    reviewSchema.parse(value)
    const newReview = await createReview(value)
    revalidatePath('/reviews')
    return {
      status: 200,
      success: true,
      data: newReview,
      message: 'Review created successfully',
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}
