import { z } from 'zod'
import { qualityJourneyIdentifierSchema as id } from './contracts'

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
export const qualityJourneyClosureInputSchema = z
  .object({
    journeyId: id,
    targetProjectId: id,
    reportRevisionId: id,
    expectedReportHash: digest,
    expectedStateHash: digest,
    idempotencyKey: id,
    decision: z.enum(['CLOSED', 'RISK_ACCEPTED']),
    rationale: z.string().trim().min(1).max(8_000).optional(),
    acceptedItemIds: z
      .array(id)
      .max(8192)
      .refine(values => new Set(values).size === values.length, 'Risk IDs must be unique.')
      .default([]),
  })
  .strict()
