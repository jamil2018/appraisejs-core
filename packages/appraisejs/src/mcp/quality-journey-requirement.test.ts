import { expect, it } from 'vitest'
import { qualityJourneyRequirementSchema, qualityJourneyRequirementVersion } from './domains/quality-journey.js'

it('keeps MCP Quality Journey creation compatible with objective-only and strict for structured v1 intake', () => {
  expect(qualityJourneyRequirementSchema.parse({ objective: 'Verify checkout.' })).toEqual({
    objective: 'Verify checkout.',
  })
  expect(
    qualityJourneyRequirementSchema.parse({
      schemaVersion: qualityJourneyRequirementVersion,
      objective: 'Verify checkout.',
      coverageRigor: 'STANDARD',
      testDimensions: ['FUNCTIONAL', 'END_TO_END'],
      includedScope: ['Checkout'],
      environmentIds: ['environment-staging'],
      desiredEvidenceSignals: ['Confirmation is visible'],
    }),
  ).toMatchObject({ testDimensions: ['FUNCTIONAL', 'END_TO_END'] })
  expect(
    qualityJourneyRequirementSchema.safeParse({ objective: 'Verify checkout.', testDimensions: ['SMOKE'] }).success,
  ).toBe(false)
  expect(qualityJourneyRequirementSchema.safeParse({ objective: 'Verify checkout.', unknown: true }).success).toBe(
    false,
  )
})
