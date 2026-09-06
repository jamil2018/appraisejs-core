import { expect, it } from 'vitest'
import { hashQualityJourneyDraft, parseGuidedQualityJourneyRequirement } from './draft-contracts'

it('binds a draft hash to its version and predecessor', () => {
  const requirement = { objective: 'Check checkout' }
  expect(hashQualityJourneyDraft({ requirement, version: 1 })).not.toBe(
    hashQualityJourneyDraft({ requirement, version: 2 }),
  )
  expect(hashQualityJourneyDraft({ requirement, version: 1 })).not.toBe(
    hashQualityJourneyDraft({ requirement, version: 1, predecessorJourneyId: 'journey-1' }),
  )
})

it('keeps guided completeness stricter than canonical objective-only ingress', () => {
  expect(() => parseGuidedQualityJourneyRequirement({ objective: 'Check checkout' })).toThrow('Complete')
})
