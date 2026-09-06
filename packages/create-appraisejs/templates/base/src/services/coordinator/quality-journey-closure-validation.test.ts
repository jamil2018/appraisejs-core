import { expect, it } from 'vitest'
import {
  journeyArtifactLinkSchema,
  journeyClosureSchema,
  qualityJourneyTriageReportSchema,
} from '@/lib/quality-journey'
import { qualityJourneyClosureItems } from './quality-journey-closure-validation'
import type { TriageInput } from './quality-journey-triage-input'
const digest = `sha256:${'a'.repeat(64)}`
it('keeps maximum-length report/risk identities bounded with exact provenance', () => {
  const id = 'a'.repeat(200)
  const input: TriageInput = {
    journeyId: 'j',
    targetProjectId: 'p',
    cycleId: 'c',
    executionCycleId: 'e',
    analysis: { artifactId: 'analysis', revisionId: 'analysis-r1', contentHash: digest, content: { requirements: [] } },
    scenarios: [],
    runs: [],
  }
  const report = qualityJourneyTriageReportSchema.parse({
    schemaVersion: 'appraise.quality-journey/v1',
    reportRevisionId: id,
    executionCycleId: 'e',
    cycleId: 'c',
    inputHash: digest,
    summary: 'Unverified scope',
    findings: [],
    coverage: [
      { requirementId: id, scenarioRevisionIds: [], testRunIds: [], outcome: 'NOT_EVALUATED', rationale: 'Unverified' },
    ],
    residualRisks: ['No sentinel interpretation'],
    recommendations: ['Review'],
  })
  const items = qualityJourneyClosureItems(report, digest, input)
  expect(items.every(item => item.itemId.length <= 200)).toBe(true)
  expect(items).toEqual(qualityJourneyClosureItems(report, digest, input))
  expect(() =>
    journeyClosureSchema.parse({
      schemaVersion: 'appraise.quality-journey/v1',
      closureId: 'closure',
      journeyId: 'j',
      cycleId: 'c',
      reportRevision: { kind: 'TEST_REPORT_ANALYSIS_REVISION', artifactId: id, revisionId: id, contentHash: digest },
      decision: 'RISK_ACCEPTED',
      actorId: 'USER',
      unresolvedItems: items,
      closedAt: '2026-09-05T00:00:00.000Z',
      riskAcceptance: {
        rationale: 'Accepted',
        acceptedItemIds: items.map(item => item.itemId),
        acceptedAt: '2026-09-05T00:00:00.000Z',
      },
    }),
  ).not.toThrow()
})
it('accepts only the two precise closure/follow-up link shapes', () => {
  const reference = (kind: string) => ({ kind, artifactId: 'artifact', revisionId: 'revision', contentHash: digest })
  const base = {
    schemaVersion: 'appraise.quality-journey/v1',
    linkId: 'link',
    journeyId: 'j',
    targetProjectId: 'p',
    cycleId: 'c',
  }
  expect(
    journeyArtifactLinkSchema.safeParse({
      ...base,
      relation: 'APPROVES',
      source: reference('JOURNEY_CLOSURE'),
      target: reference('TEST_REPORT_ANALYSIS_REVISION'),
    }).success,
  ).toBe(true)
  expect(
    journeyArtifactLinkSchema.safeParse({
      ...base,
      relation: 'APPROVES',
      source: reference('JOURNEY_CLOSURE'),
      target: reference('SCENARIO_REVISION'),
    }).success,
  ).toBe(false)
  expect(
    journeyArtifactLinkSchema.safeParse({
      ...base,
      relation: 'FOLLOWS',
      source: reference('JOURNEY_REVISION'),
      target: reference('JOURNEY_CLOSURE'),
    }).success,
  ).toBe(true)
})
