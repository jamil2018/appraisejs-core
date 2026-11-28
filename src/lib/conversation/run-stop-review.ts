import { z } from 'zod'
import { qualityJourneyIdentifierSchema } from '@/lib/quality-journey/contracts'

export const runStopReviewSchema = z
  .object({
    journeyId: qualityJourneyIdentifierSchema,
    executionCycleId: qualityJourneyIdentifierSchema,
    expectedStateHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict()
export type RunStopReview = z.infer<typeof runStopReviewSchema>

export function isRunStopRequest(content: string) {
  return /^(?:please\s+)?stop\s+this\s+run[.!?]?$/i.test(content.trim())
}
