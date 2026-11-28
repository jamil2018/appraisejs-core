// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ConversationJourneyEvidenceRun } from '@/services/conversation/conversation-journey-evidence'

import { ChatJourneyResultCard } from './chat-journey-result-card'

const run: ConversationJourneyEvidenceRun = {
  executionCycleId: 'cycle-a',
  testRunId: 'run-a',
  runId: 'process-a',
  status: 'COMPLETED',
  result: 'FAILED',
  title: 'Guest checkout',
  outcome: 'FAILED',
  reason: null,
  evidenceReceiptId: 'receipt-a',
  receiptHash: 'receipt-hash',
  reportId: 'report-a',
  reportHref: '/reports/report-a?project=project-a',
  steps: [
    {
      id: 'open-checkout',
      label: 'Given checkout opens',
      status: 'PASSED',
      errorMessage: null,
      reportHref: '/reports/report-a?project=project-a&step=open-checkout#step-evidence',
    },
    {
      id: 'order-number',
      label: 'Then confirmation includes an order number',
      status: 'FAILED',
      errorMessage: 'The order number was not visible.',
      reportHref: '/reports/report-a?project=project-a&step=order-number#step-evidence',
    },
    {
      id: 'follow-up',
      label: 'Then the confirmation can be printed',
      status: 'SKIPPED',
      errorMessage: null,
      reportHref: '/reports/report-a?project=project-a&step=follow-up#step-evidence',
    },
  ],
}

describe('saved Journey result card', () => {
  it('distinguishes a failure, a skipped check, and unverified work', () => {
    render(
      <ChatJourneyResultCard
        journeyHref="/quality-journeys/journey-a?project=project-a#triage"
        runs={[
          run,
          { ...run, testRunId: 'run-b', title: 'Email confirmation', outcome: 'UNVERIFIED', reason: 'REPORT_MISSING' },
        ]}
      />,
    )
    const result = within(screen.getByRole('article', { name: 'Result and evidence' }))
    expect(result.getByText('Failed')).toBeVisible()
    expect(result.getByText('1 step skipped.')).toBeVisible()
    expect(result.getByText('Unverified')).toBeVisible()
    expect(result.getByText('Then confirmation includes an order number')).toBeVisible()
    expect(result.getByRole('link', { name: 'Show me where' })).toHaveAttribute('href', run.steps[1].reportHref)
  })

  it('offers Journey results when no step has verified evidence', () => {
    render(
      <ChatJourneyResultCard
        journeyHref="/quality-journeys/journey-a?project=project-a#triage"
        runs={[{ ...run, outcome: 'UNVERIFIED', reason: 'EVIDENCE_INVALID' }]}
      />,
    )
    expect(screen.queryByRole('link', { name: 'Show me where' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Open Journey results' })).toBeVisible()
  })
})
