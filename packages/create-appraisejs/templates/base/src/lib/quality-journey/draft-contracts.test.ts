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

it('binds Claude Code to the draft while retaining the legacy Codex digest', () => {
  const input = { requirement: { objective: 'Check checkout' }, version: 1 }
  expect(hashQualityJourneyDraft({ ...input, managedWorkerProvider: 'CODEX' })).toBe(hashQualityJourneyDraft(input))
  expect(hashQualityJourneyDraft({ ...input, managedWorkerProvider: 'CLAUDE_CODE' })).not.toBe(
    hashQualityJourneyDraft(input),
  )
})

it('keeps guided completeness stricter than canonical objective-only ingress', () => {
  expect(() => parseGuidedQualityJourneyRequirement({ objective: 'Check checkout' })).toThrow('Complete')
})
