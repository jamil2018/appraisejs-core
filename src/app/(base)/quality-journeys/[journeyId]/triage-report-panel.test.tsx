// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ action: vi.fn().mockResolvedValue({ success: true }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('./triage-report-actions', () => ({ qualityJourneyTriageReviewAction: mocks.action }))

import { TriageReportPanel } from './triage-report-panel'

const digest = (character: string) => `sha256:${character.repeat(64)}`
const triage = {
  activeReportRevisionId: 'report-1',
  assignments: [
    {
      id: 'assignment-1',
      workItemId: 'work-1',
      executionCycleId: 'execution-1',
      inputHash: digest('a'),
      input: {
        executionCycleId: 'execution-1',
        cycleId: 'cycle-1',
        scenarios: [{ artifactId: 'scenario-1', revisionId: 'scenario-r1', contentHash: digest('b') }],
        runs: [
          {
            testRunId: 'test-run-1',
            runId: 'run-1',
            evidenceReceiptId: 'receipt-1',
            receiptHash: digest('c'),
            scenarioRevisionId: 'scenario-r1',
            evidence: { result: 'FAILED', evidenceHealth: 'SEALED' },
          },
        ],
      },
    },
  ],
  reports: [
    {
      id: 'row-1',
      contentHash: digest('d'),
      review: null,
      report: {
        schemaVersion: 'appraise.quality-journey/v1' as const,
        reportRevisionId: 'report-1',
        executionCycleId: 'execution-1',
        cycleId: 'cycle-1',
        inputHash: digest('a'),
        summary: 'A complete attributed report.',
        findings: [
          {
            findingId: 'finding-1',
            testRunId: 'test-run-1',
            evidenceReceiptId: 'receipt-1',
            scenarioRevisionId: 'scenario-r1',
            requirementIds: ['requirement-1'],
            kind: 'TARGET_DEFECT' as const,
            targetOutcome: 'FAILED' as const,
            confidence: 'HIGH' as const,
            rationale: 'The target rejected the payment.',
            competingHypotheses: ['Environment may have delayed confirmation.'],
            unresolved: true,
            postmortem: {
              observation: 'Rejected.',
              expectedBehavior: 'Accepted.',
              causalAnalysis: 'Validation.',
              nextAction: 'Correct the automation.',
            },
          },
        ],
        coverage: [
          {
            requirementId: 'requirement-1',
            scenarioRevisionIds: ['scenario-r1'],
            testRunIds: ['test-run-1'],
            outcome: 'FAILED' as const,
            rationale: 'Evidence sealed.',
          },
        ],
        residualRisks: ['A residual risk.'],
        recommendations: ['A recommendation.'],
        remediation: {
          kind: 'AUTOMATION_CORRECTION' as const,
          findingIds: ['finding-1'],
          scenarioRevisionIds: ['scenario-r1'],
          scope: 'Correct payment automation.',
        },
      },
    },
  ],
}

describe('TriageReportPanel', () => {
  it('shows exact sealed input lineage and supports only full-report local decisions', async () => {
    render(<TriageReportPanel journeyId="journey-1" stage="REPORT_REVIEW" stateHash={digest('e')} triage={triage} />)

    expect(screen.getByText(/sealed receipt/)).toBeInTheDocument()
    expect(screen.getByText('A complete attributed report.')).toBeInTheDocument()
    expect(screen.getByText('TARGET_DEFECT')).toBeInTheDocument()
    expect(screen.getByText('Unresolved')).toBeInTheDocument()
    expect(screen.getByText(/Competing hypotheses: Environment may have delayed confirmation/)).toBeInTheDocument()
    expect(screen.getByText(/Causal analysis: Validation/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Proposed remediation scope' })).toHaveTextContent(
      'Correct payment automation.',
    )
    expect(screen.getByText('Findings: finding-1')).toBeInTheDocument()
    expect(screen.getByText('Scenario revisions: scenario-r1')).toBeInTheDocument()
    expect(screen.getByText('A residual risk.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Full report feedback'), {
      target: { value: 'Revise the full attribution.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Request full-report revision' }))
    await waitFor(() =>
      expect(mocks.action).toHaveBeenCalledWith(
        'revision',
        expect.objectContaining({
          journeyId: 'journey-1',
          reportRevisionId: 'report-1',
          expectedReportHash: digest('d'),
        }),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Approve exact remediation' }))
    await waitFor(() =>
      expect(mocks.action).toHaveBeenCalledWith('approve', expect.objectContaining({ journeyId: 'journey-1' })),
    )
  })

  it('keeps the bounded remediation scope visible before its approval control', () => {
    render(<TriageReportPanel journeyId="journey-1" stage="REPORT_REVIEW" stateHash={digest('e')} triage={triage} />)

    const scope = screen.getByRole('region', { name: 'Proposed remediation scope' })
    const approve = screen.getByRole('button', { name: 'Approve exact remediation' })

    expect(scope.compareDocumentPosition(approve) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
