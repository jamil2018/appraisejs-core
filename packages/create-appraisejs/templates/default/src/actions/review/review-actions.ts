'use server'

import prisma from '@/config/db-config'
import { reviewSchema } from '@/constants/form-opts/review-form-opts'
import { ActionResponse } from '@/types/form/actionHandler'
import { Review } from '@prisma/client'
import { revalidatePath } from 'next/cache'

import { z } from 'zod'

export interface ReviewWithRelations extends Review {
  testCase: {
    title: string
  }
  reviewer: {
    username: string
  }
}

export async function getReviewsByReviewerAction(): Promise<ActionResponse> {
  try {
    // Since auth is removed, return all reviews (or you may want to remove this function)
    const reviews = await prisma.review.findMany({
      include: {
        testCase: {
          select: {
            title: true,
          },
        },
      },
    })
    return {
      status: 200,
      data: reviews,
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}

export async function getAllReviewsByCreatorAction(): Promise<ActionResponse> {
  try {
    // Since auth is removed, return all reviews (or you may want to remove this function)
    const reviews = await prisma.review.findMany({
      include: {
        testCase: {
          select: {
            title: true,
          },
        },
      },
    })
    return {
      status: 200,
      data: reviews,
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}

export async function deleteReviewAction(id: string[]): Promise<ActionResponse> {
  try {
    await prisma.review.deleteMany({
      where: { id: { in: id } },
    })
    revalidatePath('/reviews')
    return {
      status: 200,
      data: 'Review deleted successfully',
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}

export async function getReviewByIdAction(id: string): Promise<ActionResponse> {
  try {
    const review = await prisma.review.findUnique({
      where: { id },
    })
    return {
      status: 200,
      data: review,
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}

export async function updateReviewAction(
  _prev: unknown,
  value: z.infer<typeof reviewSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    const updatedReview = await prisma.review.update({
      where: { id },
      data: value,
    })
    revalidatePath('/reviews')
    return {
      status: 200,
      data: updatedReview,
      message: 'Review updated successfully',
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
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
      data: newReview,
      message: 'Review created successfully',
    }
  } catch (e) {
    return {
      status: 500,
      error: `Server error occurred: ${e}`,
    }
  }
}
