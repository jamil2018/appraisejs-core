import { z } from 'zod'

import { qualityJourneyIdentifierSchema } from './contracts'

const id = qualityJourneyIdentifierSchema

export const qualityJourneyTriageEvidenceMaxBytes = 2 * 1024 * 1024
const qualityJourneyTriageEvidencePageMaxBytes = 64 * 1024

const qualityJourneyTriageEvidenceArtifactKindSchema = z.enum(['report', 'log'])
export const qualityJourneyTriageEvidenceReadSchema = z
  .object({
    journeyId: id,
    targetProjectId: id,
    workItemId: id,
    attemptId: id,
    leaseId: id,
    ownerToken: z.string().min(1),
    receiptId: id,
    artifactKind: qualityJourneyTriageEvidenceArtifactKindSchema,
    offset: z.coerce.number().int().min(0).max(qualityJourneyTriageEvidenceMaxBytes).default(0),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(qualityJourneyTriageEvidencePageMaxBytes)
      .default(qualityJourneyTriageEvidencePageMaxBytes),
  })
  .strict()
