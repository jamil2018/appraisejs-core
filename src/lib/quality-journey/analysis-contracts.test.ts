import { describe, expect, it } from 'vitest'
import { analysisCharterSchema, hashAnalysisCharter, qualityJourneyRoleDefinitions } from './index'

function charter() {
  return {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    charterId: 'charter-checkout',
    analysisRevisionId: 'analysis-revision-1',
    journeyId: 'journey-1',
    targetProjectId: 'target-1',
    cycleId: 'cycle-1',
    requirementRevisionId: 'requirement-revision-1',
    objectives: ['Allow a shopper to complete checkout.'],
    scope: { included: ['Checkout'], excluded: ['Payment provider internals'] },
    actors: ['Shopper'],
    requirements: [
      { requirementId: 'REQ-CHECKOUT-1', statement: 'A shopper can submit an order.', sourceRefs: ['brief:1'] },
    ],
    obligations: [
      {
        obligationId: 'OBL-CHECKOUT-1',
        requirementId: 'REQ-CHECKOUT-1',
        statement: 'Order submission is confirmed.',
        acceptanceSignals: ['Confirmation is visible.'],
      },
    ],
    constraints: [],
    assumptions: [],
    risks: [],
    acceptanceSignals: ['Order confirmation'],
    retiredRequirementIds: [],
    questions: [
      {
        questionId: 'QUESTION-PAYMENT',
        prompt: 'Which payment method is in scope?',
        required: true,
        rationale: 'Payment behavior changes coverage.',
      },
    ],
    resolvedQuestionAnswerIds: [],
  }
}

describe('Quality Journey analysis contracts', () => {
  it('hashes an exact immutable charter and preserves stable requirement IDs', () => {
    const parsed = analysisCharterSchema.parse(charter())
    expect(hashAnalysisCharter(parsed)).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(parsed.obligations[0].requirementId).toBe('REQ-CHECKOUT-1')
  })

  it('rejects duplicate requirement IDs and obligations without a requirement', () => {
    expect(() =>
      analysisCharterSchema.parse({
        ...charter(),
        requirements: [charter().requirements[0], charter().requirements[0]],
      }),
    ).toThrow()
    expect(() =>
      analysisCharterSchema.parse({
        ...charter(),
        obligations: [{ ...charter().obligations[0], requirementId: 'REQ-MISSING' }],
      }),
    ).toThrow()
    expect(() => analysisCharterSchema.parse({ ...charter(), retiredRequirementIds: ['REQ-CHECKOUT-1'] })).toThrow()
  })

  it('retains explicit Analyzer negative authority', () => {
    const analyzer = qualityJourneyRoleDefinitions.find(role => role.role === 'REQUIREMENT_ANALYZER')!
    expect(analyzer.permittedTools).toEqual(['artifact.read', 'artifact.propose'])
    expect(analyzer.forbiddenCapabilities).toEqual(
      expect.arrayContaining(['Approve analysis', 'Observe the target', 'Design or implement automation']),
    )
  })
})
