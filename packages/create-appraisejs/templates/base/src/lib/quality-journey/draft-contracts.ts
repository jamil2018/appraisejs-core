import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { qualityJourneyRequirementSchema, type QualityJourneyRequirement } from './requirement-contracts'

const qualityJourneyDraftRequirementSchema = qualityJourneyRequirementSchema.partial().strict()
export type QualityJourneyDraftRequirement = z.infer<typeof qualityJourneyDraftRequirementSchema>

export function parseQualityJourneyDraftRequirement(value: unknown): QualityJourneyDraftRequirement {
  return qualityJourneyDraftRequirementSchema.parse(value)
}

/** Draft identity is intentionally domain separated from immutable requirement hashes. */
export function hashQualityJourneyDraft(input: {
  requirement: QualityJourneyDraftRequirement
  predecessorJourneyId?: string
  version: number
}): string {
  return `sha256:${createHash('sha256')
    .update(
      canonicalContractJson({
        kind: 'QUALITY_JOURNEY_DRAFT',
        version: input.version,
        requirement: input.requirement,
        predecessorJourneyId: input.predecessorJourneyId ?? null,
      }),
    )
    .digest('hex')}`
}

/** Guided UI confirmation deliberately remains stricter than objective-only APIs. */
export function parseGuidedQualityJourneyRequirement(value: unknown): QualityJourneyRequirement {
  const requirement = qualityJourneyRequirementSchema.parse(value)
  const missing = [
    !requirement.testDimensions?.length && 'at least one type of check',
    !requirement.includedScope?.length && 'included behavior',
    !requirement.environmentIds?.length && 'a test location',
    !requirement.desiredEvidenceSignals?.length && 'how we will know it works',
  ].filter(Boolean)
  if (missing.length) throw new Error(`Complete ${missing.join(', ')} before confirming this brief.`)
  return requirement
}
