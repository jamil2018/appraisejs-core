import { z } from 'zod'

import { qualityJourneyIdentifierSchema } from '@/lib/quality-journey/contracts'

const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/)

export const chatAnalysisReviewSchema = z
  .object({
    journeyId: qualityJourneyIdentifierSchema,
    revisionId: qualityJourneyIdentifierSchema,
    reviewHash: hash,
    stateHash: hash,
  })
  .strict()

export type ChatAnalysisReview = z.infer<typeof chatAnalysisReviewSchema>

export const chatAnalysisQuestionSchema = z
  .object({
    journeyId: qualityJourneyIdentifierSchema,
    revisionId: qualityJourneyIdentifierSchema,
    questionId: qualityJourneyIdentifierSchema,
    stateHash: hash,
  })
  .strict()

export type ChatAnalysisQuestion = z.infer<typeof chatAnalysisQuestionSchema>
