import { describe, expect, it } from 'vitest'
import type { QualityJourneyTriageReport } from '@/lib/quality-journey'
import type { TriageInput } from './quality-journey-triage-input'
import { validateQualityJourneyTriageReport } from './quality-journey-triage-validation'

const digest = (character: string) => `sha256:${character.repeat(64)}`

function input(): TriageInput {
  return {
    journeyId: 'journey-1',
    targetProjectId: 'target-1',
    executionCycleId: 'execution-cycle-1',
    cycleId: 'cycle-1',
    analysis: {
      artifactId: 'analysis-1',
      revisionId: 'analysis-r1',
      contentHash: digest('a'),
      content: {
        requirements: [
          { requirementId: 'REQ-PASS', statement: 'A completed order is confirmed.' },
          { requirementId: 'REQ-FAIL', statement: 'A failed confirmation is attributed.' },
        ],
      },
    },
    scenarios: [
      {
        artifactId: 'scenario-pass',
        revisionId: 'scenario-pass-r1',
        contentHash: digest('b'),
        intent: { requirementIds: ['REQ-PASS'] },
      },
      {
        artifactId: 'scenario-fail',
        revisionId: 'scenario-fail-r1',
        contentHash: digest('c'),
        intent: { requirementIds: ['REQ-FAIL'] },
      },
    ],
    runs: [
      {
        testRunId: 'run-pass',
        runId: 'managed-pass',
        scenarioRevisionId: 'scenario-pass-r1',
        evidenceReceiptId: 'evidence-pass',
        receiptHash: digest('d'),
        evidence: { result: 'PASSED', status: 'COMPLETED', evidenceHealth: 'valid', missingArtifacts: [] },
      },
      {
        testRunId: 'run-fail',
        runId: 'managed-fail',
        scenarioRevisionId: 'scenario-fail-r1',
        evidenceReceiptId: 'evidence-fail',
        receiptHash: digest('e'),
        evidence: { result: 'FAILED', status: 'COMPLETED', evidenceHealth: 'valid', missingArtifacts: [] },
      },
    ],
  }
}

function report(): QualityJourneyTriageReport {
  return {
    schemaVersion: 'appraise.quality-journey/v1',
    reportRevisionId: 'report-r1',
    executionCycleId: 'execution-cycle-1',
    cycleId: 'cycle-1',
    inputHash: digest('f'),
    summary: 'The valid sealed failure is attributed to the target.',
    findings: [
      {
        findingId: 'finding-fail',
        testRunId: 'run-fail',
        evidenceReceiptId: 'evidence-fail',
        scenarioRevisionId: 'scenario-fail-r1',
        requirementIds: ['REQ-FAIL'],
        kind: 'TARGET_DEFECT',
        targetOutcome: 'FAILED',
        confidence: 'HIGH',
        rationale: 'The sealed trace reproduces the failed confirmation.',
        competingHypotheses: [],
        unresolved: false,
        postmortem: {
          observation: 'Confirmation was missing.',
          expectedBehavior: 'Confirmation is shown.',
          causalAnalysis: 'The target did not render confirmation.',
          nextAction: 'Correct target confirmation handling.',
        },
      },
    ],
    coverage: [
      {
        requirementId: 'REQ-PASS',
        scenarioRevisionIds: ['scenario-pass-r1'],
        testRunIds: ['run-pass'],
        outcome: 'PASSED',
        rationale: 'The accepted scenario passed with complete evidence.',
      },
      {
        requirementId: 'REQ-FAIL',
        scenarioRevisionIds: ['scenario-fail-r1'],
        testRunIds: ['run-fail'],
        outcome: 'FAILED',
        rationale: 'The accepted scenario failed with complete evidence.',
      },
    ],
    residualRisks: ['The target correction needs a new execution cycle.'],
    recommendations: ['Correct confirmation handling and rerun the scenario.'],
  }
}

describe('Quality Journey triage report validation', () => {
  it('accepts exact lineage and derives passed and failed coverage from sealed runs', () => {
    expect(() => validateQualityJourneyTriageReport(report(), input())).not.toThrow()
  })

  it('rejects omitted or duplicate material attribution', () => {
    expect(() => validateQualityJourneyTriageReport({ ...report(), findings: [] }, input())).toThrow(
      'Every material outcome',
    )
    expect(() =>
      validateQualityJourneyTriageReport(
        { ...report(), findings: [report().findings[0]!, { ...report().findings[0]!, findingId: 'forged-duplicate' }] },
        input(),
      ),
    ).toThrow('Every material outcome')
  })

  it('rejects forged evidence, cross-scenario requirements, stale cycles, and target defects without valid sealed evidence', () => {
    const forgedEvidence = {
      ...report(),
      findings: [{ ...report().findings[0]!, evidenceReceiptId: 'evidence-forged' }],
    }
    expect(() => validateQualityJourneyTriageReport(forgedEvidence, input())).toThrow(
      'Finding run, evidence, scenario, or requirement linkage',
    )
    const crossScenario = {
      ...report(),
      findings: [{ ...report().findings[0]!, scenarioRevisionId: 'scenario-pass-r1', requirementIds: ['REQ-PASS'] }],
    }
    expect(() => validateQualityJourneyTriageReport(crossScenario, input())).toThrow(
      'Finding run, evidence, scenario, or requirement linkage',
    )
    expect(() => validateQualityJourneyTriageReport({ ...report(), executionCycleId: 'stale-cycle' }, input())).toThrow(
      'Report source cycle or predecessor',
    )

    const invalidEvidence = input()
    invalidEvidence.runs[1]!.evidence.evidenceHealth = 'invalid'
    expect(() => validateQualityJourneyTriageReport(report(), invalidEvidence)).toThrow(
      'A target defect requires a failed run with complete valid sealed evidence',
    )
  })

  it('rejects coverage claims and remediation that do not match the frozen scope', () => {
    expect(() =>
      validateQualityJourneyTriageReport(
        { ...report(), coverage: [{ ...report().coverage[0]!, outcome: 'FAILED' }, report().coverage[1]!] },
        input(),
      ),
    ).toThrow('Coverage outcome')
    expect(() =>
      validateQualityJourneyTriageReport(
        {
          ...report(),
          remediation: {
            kind: 'AUTOMATION_CORRECTION',
            findingIds: ['finding-fail'],
            scenarioRevisionIds: ['scenario-fail-r1'],
            scope: 'Change the step realization.',
          },
        },
        input(),
      ),
    ).toThrow('Automation remediation requires resolved automation-realization findings')
  })
})
