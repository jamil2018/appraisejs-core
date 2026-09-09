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
  advisorySeedDigest?: string
}): string {
  return `sha256:${createHash('sha256')
    .update(
      canonicalContractJson({
        kind: 'QUALITY_JOURNEY_DRAFT',
        version: input.version,
        requirement: input.requirement,
        predecessorJourneyId: input.predecessorJourneyId ?? null,
        ...(input.advisorySeedDigest ? { advisorySeedDigest: input.advisorySeedDigest } : {}),
      }),
    )
    .digest('hex')}`
}

export type QualityJourneyDraftReuseSeedIdentity = {
  kind: 'ANALYSIS' | 'SCENARIO'
  assetPortableId: string
  sourceVersion: number
  sourcePayloadHash: string
  sourceRevision?: string | null
  contentHash: string
}

/**
 * Shared material is advisory only, but the selected, normalized set is
 * still bound to a mutable draft version before confirmation.
 */
export function hashQualityJourneyDraftReuseSeeds(values: readonly QualityJourneyDraftReuseSeedIdentity[]) {
  const seeds = [...values]
    .map(value => ({ ...value, sourceRevision: value.sourceRevision ?? null }))
    .sort((left, right) => canonicalContractJson(left).localeCompare(canonicalContractJson(right)))
  return `sha256:${createHash('sha256')
    .update(canonicalContractJson({ kind: 'QUALITY_JOURNEY_REUSE_SEEDS', seeds }))
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
