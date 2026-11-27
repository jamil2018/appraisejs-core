import { z } from 'zod'

import { qualityJourneyIdentifierSchema } from '@/lib/quality-journey/contracts'

const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/)

export const chatScenarioReviewSchema = z
  .object({
    journeyId: qualityJourneyIdentifierSchema,
    portfolioId: qualityJourneyIdentifierSchema,
    portfolioRevisionId: qualityJourneyIdentifierSchema,
    portfolioHash: digest,
    reviewHash: digest,
    stateHash: digest,
    pendingScenarioRevisionIds: z.array(qualityJourneyIdentifierSchema).min(1).max(512),
  })
  .strict()

export type ChatScenarioReview = z.infer<typeof chatScenarioReviewSchema>

export function isScenarioApprovalRequest(text: string) {
  return /^(?:please\s+)?approve\s+(?:the\s+)?(?:pending\s+)?scenarios[.!?]?$/i.test(text.trim())
}
