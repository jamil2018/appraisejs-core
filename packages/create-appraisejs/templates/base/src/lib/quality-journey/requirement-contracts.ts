import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { qualityJourneyIdentifierSchema } from './contracts'

/**
 * Versioned, user-authored intake captured before Requirement Analyzer work
 * begins. `schemaVersion` remains optional for the objective-only ingress used
 * by existing coding-harness prompts; structured submissions should declare it.
 */
export const qualityJourneyRequirementVersion = 'appraise.quality-journey-requirement/v1' as const

const text = z.string().trim().min(1).max(8_000)
const uniqueTextList = (max: number, label: string) =>
  z
    .array(text)
    .max(max)
    .superRefine((values, context) => {
      if (new Set(values).size !== values.length)
        context.addIssue({ code: 'custom', message: `${label} must not contain duplicates.` })
    })
const environmentIds = z
  .array(qualityJourneyIdentifierSchema)
  .max(64)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length)
      context.addIssue({ code: 'custom', message: 'Environment IDs must not contain duplicates.' })
  })

const qualityJourneyCoverageRigorSchema = z.enum(['FOCUSED', 'STANDARD', 'COMPREHENSIVE'])
const qualityJourneyTestDimensionSchema = z.enum([
  'FUNCTIONAL',
  'END_TO_END',
  'API',
  'INTEGRATION',
  'ACCESSIBILITY',
  'PERFORMANCE',
  'SECURITY',
  'VISUAL',
  'COMPATIBILITY',
  'EXPLORATORY',
  'CUSTOM',
])

const testDimensions = z
  .array(qualityJourneyTestDimensionSchema)
  .max(32)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length)
      context.addIssue({ code: 'custom', message: 'Test dimensions must not contain duplicates.' })
  })

/**
 * The canonical durable representation of a requirement-intake revision.
 * Every provided field is binding user intent; omitted fields remain open for
 * Requirement Analyzer inquiry.
 */
export const qualityJourneyRequirementSchema = z
  .object({
    schemaVersion: z.literal(qualityJourneyRequirementVersion).optional(),
    objective: text,
    context: text.optional(),
    coverageRigor: qualityJourneyCoverageRigorSchema.optional(),
    testDimensions: testDimensions.optional(),
    includedScope: uniqueTextList(128, 'Included scope').optional(),
    excludedScope: uniqueTextList(128, 'Excluded scope').optional(),
    environmentIds: environmentIds.optional(),
    actors: uniqueTextList(128, 'Actors').optional(),
    testDataNeeds: uniqueTextList(128, 'Test-data needs').optional(),
    constraints: uniqueTextList(256, 'Constraints').optional(),
    risks: uniqueTextList(256, 'Risks').optional(),
    desiredEvidenceSignals: uniqueTextList(256, 'Desired evidence signals').optional(),
  })
  .strict()

export type QualityJourneyRequirementV1 = z.infer<typeof qualityJourneyRequirementSchema>
export type QualityJourneyRequirement = QualityJourneyRequirementV1

export function parseQualityJourneyRequirement(value: unknown): QualityJourneyRequirementV1 {
  const requirement = qualityJourneyRequirementSchema.parse(value)
  const sort = <T extends string>(values: readonly T[]) => [...values].sort((left, right) => left.localeCompare(right))
  return {
    ...requirement,
    ...(requirement.testDimensions ? { testDimensions: sort(requirement.testDimensions) } : {}),
    ...(requirement.includedScope ? { includedScope: sort(requirement.includedScope) } : {}),
    ...(requirement.excludedScope ? { excludedScope: sort(requirement.excludedScope) } : {}),
    ...(requirement.environmentIds ? { environmentIds: sort(requirement.environmentIds) } : {}),
    ...(requirement.actors ? { actors: sort(requirement.actors) } : {}),
    ...(requirement.testDataNeeds ? { testDataNeeds: sort(requirement.testDataNeeds) } : {}),
    ...(requirement.constraints ? { constraints: sort(requirement.constraints) } : {}),
    ...(requirement.risks ? { risks: sort(requirement.risks) } : {}),
    ...(requirement.desiredEvidenceSignals ? { desiredEvidenceSignals: sort(requirement.desiredEvidenceSignals) } : {}),
  }
}

/** Hash the parsed, canonical requirement so object key and collection order
 * cannot change an otherwise identical immutable intake revision. */
export function hashQualityJourneyRequirement(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(canonicalContractJson(parseQualityJourneyRequirement(value)))
    .digest('hex')}`
}
