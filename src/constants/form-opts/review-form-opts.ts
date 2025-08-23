import { ReviewStatus } from '@prisma/client'
import { formOptions } from '@tanstack/react-form/nextjs'
import { z } from 'zod'

export const reviewSchema = z.object({
  testCaseId: z.string().min(1, { message: 'Test case is required' }),
  status: z.nativeEnum(ReviewStatus),
  comments: z.string().optional(),
  reviewerId: z.string().min(1, { message: 'Reviewer is required' }),
})

export type Review = z.infer<typeof reviewSchema>

export const formOpts = formOptions({
  defaultValues: {
    testCaseId: '',
    status: 'PENDING',
    comments: '',
    reviewerId: '',
  },
  validators: {
    onChange: reviewSchema,
  },
})
