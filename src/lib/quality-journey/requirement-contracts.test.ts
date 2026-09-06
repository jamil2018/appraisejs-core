import { describe, expect, it } from 'vitest'
import {
  hashQualityJourneyRequirement,
  parseQualityJourneyRequirement,
  qualityJourneyRequirementSchema,
  qualityJourneyRequirementVersion,
} from './requirement-contracts'

const completeRequirement = {
  schemaVersion: qualityJourneyRequirementVersion,
  objective: 'A shopper can complete checkout with a saved payment method.',
  context: 'The checkout is hosted in the production-like staging environment.',
  coverageRigor: 'COMPREHENSIVE' as const,
  testDimensions: ['VISUAL', 'FUNCTIONAL', 'END_TO_END', 'ACCESSIBILITY'] as const,
  includedScope: ['Payment confirmation', 'Saved payment method'],
  excludedScope: ['Gift cards'],
  environmentIds: ['environment-staging', 'environment-browser'],
  actors: ['Shopper', 'Support agent'],
  testDataNeeds: ['Saved card account'],
  constraints: ['Do not create real charges'],
  risks: ['Payment provider intermittency'],
  desiredEvidenceSignals: ['Order confirmation is visible', 'No payment authorization error is recorded'],
}

describe('Quality Journey requirement intake contract', () => {
  it('accepts objective-only compatibility input and the complete v1 structured intake', () => {
    expect(parseQualityJourneyRequirement({ objective: 'Verify checkout.' })).toEqual({ objective: 'Verify checkout.' })
    expect(parseQualityJourneyRequirement(completeRequirement)).toMatchObject({
      schemaVersion: qualityJourneyRequirementVersion,
      coverageRigor: 'COMPREHENSIVE',
      testDimensions: ['ACCESSIBILITY', 'END_TO_END', 'FUNCTIONAL', 'VISUAL'],
      environmentIds: ['environment-browser', 'environment-staging'],
    })
  })

  it('rejects malformed enums, identifiers, duplicate intent, and undeclared fields', () => {
    expect(
      qualityJourneyRequirementSchema.safeParse({ objective: 'Verify checkout.', coverageRigor: 'SMOKE' }).success,
    ).toBe(false)
    expect(
      qualityJourneyRequirementSchema.safeParse({ objective: 'Verify checkout.', environmentIds: ['invalid id'] })
        .success,
    ).toBe(false)
    expect(
      qualityJourneyRequirementSchema.safeParse({ objective: 'Verify checkout.', actors: ['Shopper', 'Shopper'] })
        .success,
    ).toBe(false)
    expect(qualityJourneyRequirementSchema.safeParse({ objective: 'Verify checkout.', unknown: true }).success).toBe(
      false,
    )
  })

  it('uses a stable canonical hash after normalizing unordered binding-intent collections', () => {
    const reordered = {
      ...completeRequirement,
      testDimensions: [...completeRequirement.testDimensions].reverse(),
      environmentIds: [...completeRequirement.environmentIds].reverse(),
      desiredEvidenceSignals: [...completeRequirement.desiredEvidenceSignals].reverse(),
    }
    expect(hashQualityJourneyRequirement(completeRequirement)).toBe(hashQualityJourneyRequirement(reordered))
  })
})
