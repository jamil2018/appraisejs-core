import { expect, it } from 'vitest'

import { assertStructuredRequirementTraceability } from './quality-journey-analysis-service'

function charter(sourceRefs: string[]) {
  return {
    schemaVersion: 'appraise.quality-journey/v1',
    charterId: 'charter',
    analysisRevisionId: 'analysis-1',
    journeyId: 'journey-1',
    targetProjectId: 'target-1',
    cycleId: 'cycle-1',
    requirementRevisionId: 'requirement-1',
    objectives: ['Validate checkout'],
    scope: { included: ['Checkout'], excluded: [] },
    actors: [],
    requirements: [{ requirementId: 'REQ-1', statement: 'Checkout works', sourceRefs }],
    obligations: [
      {
        obligationId: 'OBL-1',
        requirementId: 'REQ-1',
        statement: 'Observe checkout',
        acceptanceSignals: ['Order ID'],
      },
    ],
    constraints: [],
    assumptions: [],
    risks: [],
    acceptanceSignals: ['Order ID'],
    retiredRequirementIds: [],
    questions: [],
    resolvedQuestionAnswerIds: [],
  }
}

it('requires every supplied structured field to remain traceable in Analyzer output', () => {
  const requirement = {
    objective: 'Validate checkout',
    context: 'A checkout redesign is shipping.',
    coverageRigor: 'STANDARD',
    testDimensions: ['FUNCTIONAL'],
    environmentIds: ['staging'],
    desiredEvidenceSignals: ['Order ID'],
  }
  expect(() => assertStructuredRequirementTraceability(requirement, charter(['brief:1']))).toThrow(
    'objective, context, coverageRigor, testDimensions, environmentIds, desiredEvidenceSignals',
  )
  expect(() =>
    assertStructuredRequirementTraceability(
      requirement,
      charter([
        'intake.objective',
        'intake.context',
        'intake.coverageRigor',
        'intake.testDimensions',
        'intake.environmentIds',
        'intake.desiredEvidenceSignals',
      ]),
    ),
  ).not.toThrow()
})

it('keeps objective-only harness intake compatible with existing charters', () => {
  expect(() =>
    assertStructuredRequirementTraceability({ objective: 'Validate checkout' }, charter(['brief:1'])),
  ).not.toThrow()
})
