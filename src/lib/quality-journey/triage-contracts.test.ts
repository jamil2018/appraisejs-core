import { describe, expect, it } from 'vitest'
import {
  qualityJourneyReportReviewSchema,
  qualityJourneyTriagePrepareSchema,
  qualityJourneyTriageReportSchema,
  qualityJourneyTriageSubmitSchema,
  qualityJourneyRoleDefinitions,
} from './index'

const digest = (character: string) => `sha256:${character.repeat(64)}`

function report() {
  return {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    reportRevisionId: 'report-r1',
    executionCycleId: 'execution-cycle-1',
    cycleId: 'cycle-1',
    inputHash: digest('a'),
    summary: 'The failed checkout run has complete sealed evidence.',
    findings: [
      {
        findingId: 'finding-1',
        testRunId: 'test-run-1',
        evidenceReceiptId: 'evidence-1',
        scenarioRevisionId: 'scenario-r1',
        requirementIds: ['REQ-CHECKOUT-1'],
        kind: 'TARGET_DEFECT' as const,
        targetOutcome: 'FAILED' as const,
        confidence: 'HIGH' as const,
        rationale: 'The sealed screenshot and trace reproduce the failed confirmation.',
        competingHypotheses: [],
        unresolved: false,
        postmortem: {
          observation: 'Confirmation is absent.',
          expectedBehavior: 'Confirmation is displayed.',
          causalAnalysis: 'The target returned a failed confirmation response.',
          nextAction: 'Correct confirmation handling in the target.',
        },
      },
    ],
    coverage: [
      {
        requirementId: 'REQ-CHECKOUT-1',
        scenarioRevisionIds: ['scenario-r1'],
        testRunIds: ['test-run-1'],
        outcome: 'FAILED' as const,
        rationale: 'The one accepted scenario failed with sealed evidence.',
      },
    ],
    residualRisks: ['The fix needs a fresh execution cycle.'],
    recommendations: ['Correct confirmation handling and rerun the scenario.'],
  }
}

describe('Quality Journey Phase 8 triage contracts', () => {
  it('accepts a bounded report and exact report-review preconditions', () => {
    expect(qualityJourneyTriageReportSchema.parse(report()).reportRevisionId).toBe('report-r1')
    expect(
      qualityJourneyReportReviewSchema.parse({
        journeyId: 'journey-1',
        targetProjectId: 'target-1',
        reportRevisionId: 'report-r1',
        expectedReportHash: digest('b'),
        expectedStateHash: digest('c'),
        idempotencyKey: 'review-1',
        feedback: 'Revise the complete report using the sealed source cycle.',
      }),
    ).toMatchObject({ reportRevisionId: 'report-r1' })
  })

  it('rejects target-failure promotion, resolved inconclusive findings, duplicate requirements, and extra report fields', () => {
    const targetFinding = report().findings[0]!
    expect(() =>
      qualityJourneyTriageReportSchema.parse({
        ...report(),
        findings: [{ ...targetFinding, targetOutcome: 'NOT_EVALUATED' }],
      }),
    ).toThrow()
    expect(() =>
      qualityJourneyTriageReportSchema.parse({
        ...report(),
        findings: [{ ...targetFinding, kind: 'INCONCLUSIVE', targetOutcome: 'NOT_EVALUATED', unresolved: false }],
      }),
    ).toThrow()
    expect(() =>
      qualityJourneyTriageReportSchema.parse({
        ...report(),
        findings: [{ ...targetFinding, requirementIds: ['REQ-CHECKOUT-1', 'REQ-CHECKOUT-1'] }],
      }),
    ).toThrow()
    expect(() =>
      qualityJourneyTriageReportSchema.parse({ ...report(), producerNarrative: 'untrusted worker context' }),
    ).toThrow()
  })

  it('requires the specialized report submit shape and keeps Triager authority narrow', () => {
    const submit = {
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      workItemId: 'work-1',
      attemptId: 'attempt-1',
      leaseId: 'lease-1',
      ownerToken: 'owner-token',
      idempotencyKey: 'submit-1',
      report: report(),
      result: {
        schemaVersion: 'appraise.quality-journey/v1',
        assignmentId: 'assignment-1',
        workItemId: 'work-1',
        attemptId: 'attempt-1',
        roleContractDigest: digest('d'),
        inputHash: digest('a'),
        role: 'TRIAGER',
        status: 'COMPLETED',
        outputs: [],
        evidenceReceipts: [],
        assumptions: [],
        blockers: [],
        unresolvedQuestions: [],
        submittedAt: '2026-09-05T00:00:00.000Z',
      },
    }
    expect(qualityJourneyTriageSubmitSchema.parse(submit).workItemId).toBe('work-1')
    expect(qualityJourneyTriageSubmitSchema.safeParse({ ...submit, genericCompletion: true }).success).toBe(false)
    expect(
      qualityJourneyTriagePrepareSchema.safeParse({
        journeyId: 'journey-1',
        targetProjectId: 'target-1',
        executionCycleId: 'cycle-1',
        report: report(),
      }).success,
    ).toBe(false)

    const triager = qualityJourneyRoleDefinitions.find(role => role.role === 'TRIAGER')!
    expect(triager.permittedTools).toEqual(['artifact.read', 'evidence.read', 'report.propose'])
    expect(triager.forbiddenCapabilities).toEqual(
      expect.arrayContaining(['Modify automation during attribution', 'Rewrite historical results', 'Approve closure']),
    )
  })
})
