// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { JourneyActivity, JourneyStages } from './journey-activity'

const state = vi.hoisted(() => ({
  snapshot: {
    closed: false,
    lifecycle: {
      stage: 'SCENARIO_DESIGN',
      status: 'ACTIVE',
      activeRevisionIds: { analysis: 'approved' },
      analysisReviewHash: null,
    },
    attention: { unresolvedQuestionCount: 0, activeBlockers: [], awaitingExecutionConsent: false },
    runtimeStatus: 'RUNNING',
    activity: { running: true, role: 'TEST_SCENARIO_DESIGNER', criteriaSubmissionInterrupted: false },
  },
  isOutdated: false,
}))
vi.mock('./journey-status-observation', () => ({
  useJourneyStatusObservationContext: () => state,
  useJourneyStatusFreshness: () => ({
    newerVersionAvailable: true,
    loadingNewerVersion: false,
    loadNewerVersion: vi.fn(),
  }),
}))

it('shows current work while another tab advances a previously open criteria review', () => {
  render(
    <>
      <JourneyStages stage="ANALYSIS_REVIEW" />
      <JourneyActivity
        stage="ANALYSIS_REVIEW"
        status="ACTIVE"
        reviewing
        question
        readyToRun={false}
        revision={false}
        analyzingEnabled={false}
        legacy={false}
        blocked={false}
        consent={false}
      />
    </>,
  )
  expect(screen.getByText('Scenarios')).toHaveAttribute('aria-current', 'step')
  expect(screen.getByRole('status')).toHaveTextContent('Designing test scenarios')
  expect(screen.getByRole('button', { name: 'View update' })).toBeEnabled()
})

it('explains why criteria approval is unavailable after the agent returns from drafting', () => {
  const original = state.snapshot
  try {
    state.snapshot = {
      ...original,
      lifecycle: { ...original.lifecycle, stage: 'ANALYSIS' },
      runtimeStatus: 'RECOVERY',
      activity: { running: false, role: 'REQUIREMENT_ANALYZER', criteriaSubmissionInterrupted: true },
    }
    render(
      <JourneyActivity
        stage="ANALYSIS"
        status="ACTIVE"
        reviewing
        question={false}
        readyToRun={false}
        revision
        analyzingEnabled
        legacy={false}
        blocked={false}
        consent={false}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Agent stalled while submitting acceptance criteria')
    expect(screen.getByText(/Approval is unavailable until the submission is recovered/)).toBeVisible()
  } finally {
    state.snapshot = original
  }
})

it('identifies the operator decision after the real run completes', () => {
  const original = state.snapshot
  try {
    state.snapshot = { ...original, lifecycle: { ...original.lifecycle, stage: 'TRIAGE' }, runtimeStatus: 'WAITING' }
    render(
      <JourneyActivity
        stage="TRIAGE"
        status="ACTIVE"
        awaitingReportReview
        reviewing={false}
        readyToRun={false}
        question={false}
        revision={false}
        analyzingEnabled
        legacy={false}
        blocked={false}
        consent={false}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Test run complete. Review the results.')
  } finally {
    state.snapshot = original
  }
})
