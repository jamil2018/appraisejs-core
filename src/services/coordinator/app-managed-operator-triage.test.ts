import { describe, expect, it } from 'vitest'
import { reviewSealedRuns, composeOperatorReport, type OperatorFinding } from './app-managed-operator-triage'
import { validateQualityJourneyTriageReport } from './quality-journey-triage-validation'
import { qualityJourneyTriageReportSchema } from '@/lib/quality-journey'
import type { TriageInput } from './quality-journey-triage-input'

const digest = 'sha256:' + 'a'.repeat(64)
const input: TriageInput = {
  journeyId: 'journey',
  targetProjectId: 'project',
  executionCycleId: 'execution',
  cycleId: 'cycle',
  analysis: {
    artifactId: 'analysis',
    revisionId: 'revision',
    contentHash: digest,
    content: { requirements: [{ requirementId: 'req', statement: 'Show the order reference.' }] },
  },
  scenarios: [{ artifactId: 'scenario', revisionId: 'sr1', contentHash: digest, intent: { requirementIds: ['req'] } }],
  runs: [
    {
      testRunId: 'test',
      runId: 'run',
      scenarioRevisionId: 'sr1',
      evidenceReceiptId: 'receipt',
      receiptHash: digest,
      evidence: { result: 'FAILED', status: 'COMPLETED', evidenceHealth: 'valid', missingArtifacts: [] },
    },
  ],
}
const finding: OperatorFinding = {
  testRunId: 'test',
  kind: 'TARGET_DEFECT',
  observation: 'No order identifier appeared.',
  expectation: 'A receipt shows the order identifier.',
  nextAction: 'Show the order reference on the receipt.',
}
const artifact = {
  receiptId: 'receipt',
  artifactKind: 'report',
  contentHash: digest,
  size: 0,
  text: JSON.stringify([
    {
      tags: [],
      elements: [
        {
          tags: [],
          steps: [
            { keyword: 'Then', name: 'Show confirmation', result: { status: 'passed' } },
            {
              keyword: 'And',
              name: 'Show order reference',
              result: { status: 'failed', error_message: 'No order identifier appeared.' },
            },
          ],
        },
      ],
    },
  ]),
}

describe('operator review of sealed run evidence', () => {
  it('links the failed step to the original run, evidence, scenario, and approved requirement', () => {
    const runs = reviewSealedRuns(input, [artifact])
    expect(runs[0]?.steps.map(s => s.status)).toEqual(['passed', 'failed'])
    const report = qualityJourneyTriageReportSchema.parse({
      ...composeOperatorReport(input, runs, [finding]),
      schemaVersion: 'appraise.quality-journey/v1',
      executionCycleId: 'execution',
      cycleId: 'cycle',
      reportRevisionId: 'report',
      inputHash: digest,
    })
    validateQualityJourneyTriageReport(report, input)
    expect(report.coverage[0]?.outcome).toBe('FAILED')
    expect(report.findings[0]?.postmortem.causalAnalysis).toContain('Show order reference')
  })
  it('refuses a target failure when the matching report is missing or unreadable', () => {
    for (const artifacts of [[], [{ ...artifact, receiptId: 'different' }], [{ ...artifact, text: '{}' }]]) {
      const runs = reviewSealedRuns(input, artifacts)
      expect(() => composeOperatorReport(input, runs, [finding])).toThrow('matching sealed failed test')
      expect(composeOperatorReport(input, runs, [{ ...finding, kind: 'INCONCLUSIVE' }]).coverage[0]?.outcome).toBe(
        'UNRESOLVED',
      )
    }
  })
})
