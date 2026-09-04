// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xyflow/react', () => ({
  Background: () => null,
  Controls: () => null,
  ReactFlow: ({ children }: { children: ReactNode }) => <div data-testid="flow">{children}</div>,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
const actions = vi.hoisted(() => ({
  comment: vi.fn(() => ({ success: true })),
  decide: vi.fn(() => ({ success: true })),
  dispose: vi.fn(() => ({ success: true })),
  revision: vi.fn(() => ({ success: true })),
}))
vi.mock('../quality-journey-actions', () => ({
  commentQualityJourneyScenarioPortfolioAction: actions.comment,
  decideQualityJourneyScenariosAction: actions.decide,
  disposeQualityJourneyScenarioCommentAction: actions.dispose,
  requestQualityJourneyScenarioRevisionAction: actions.revision,
}))
import { ScenarioPortfolioReview } from './scenario-portfolio-review'

describe('ScenarioPortfolioReview', () => {
  it('round-trips canonical scenario details and explicit graph semantics into a read-only React Flow', () => {
    render(
      <ScenarioPortfolioReview
        journeyId="journey-1"
        stage="SCENARIO_REVIEW"
        stateHash="sha256:state"
        portfolio={{
          artifactId: 'portfolio-1',
          artifactRevisionId: 'portfolio-r1',
          contentHash: 'sha256:aaa',
          behavioralIntentHash: 'sha256:bbb',
          enrichmentHash: 'sha256:ccc',
          layoutHash: 'sha256:ddd',
          coverageRationale: 'Checkout coverage includes the ordinary and alternate payment paths.',
          graphJson: JSON.stringify({
            edges: [],
            sharedSetup: [
              { setupId: 'setup-1', label: 'Signed-in shopper', scenarioRevisionIds: ['scenario-r1', 'scenario-r2'] },
            ],
          }),
          reviewHash: 'sha256:eee',
          comments: [],
          scenarios: [
            {
              stableScenarioId: 'scenario-1',
              scenarioRevisionId: 'scenario-r1',
              behavioralIntentJson: JSON.stringify({ title: 'Checkout', requirementIds: ['REQ-1'] }),
              enrichmentJson: JSON.stringify({ observationIds: ['obs-1'] }),
              layoutJson: JSON.stringify({ x: 10, y: 20 }),
              decisions: [],
            },
          ],
        }}
      />,
    )
    expect(screen.getByTestId('scenario-readonly-flow')).toBeInTheDocument()
    expect(screen.getByTestId('flow')).toBeInTheDocument()
    expect(screen.getByText('Checkout')).toBeInTheDocument()
    expect(screen.getByText('Requirements: REQ-1')).toBeInTheDocument()
    expect(screen.getByText(/Coverage rationale:/)).toBeInTheDocument()
    expect(screen.getByText('Signed-in shopper')).toBeInTheDocument()
  })
  it('uses exact server actions for review decisions and focused comments', async () => {
    render(
      <ScenarioPortfolioReview
        journeyId="journey-1"
        stage="SCENARIO_REVIEW"
        stateHash="sha256:state"
        portfolio={{
          artifactId: 'portfolio-1',
          artifactRevisionId: 'portfolio-r1',
          contentHash: 'sha256:aaa',
          behavioralIntentHash: 'sha256:bbb',
          enrichmentHash: 'sha256:ccc',
          layoutHash: 'sha256:ddd',
          coverageRationale: 'Coverage.',
          graphJson: JSON.stringify({ edges: [], sharedSetup: [] }),
          reviewHash: 'sha256:eee',
          comments: [
            { id: 'comment-1', scenarioRevisionId: null, comment: 'Existing', blocking: true, disposition: 'OPEN' },
          ],
          scenarios: [
            {
              stableScenarioId: 'scenario-1',
              scenarioRevisionId: 'scenario-r1',
              behavioralIntentJson: JSON.stringify({
                title: 'Checkout',
                narrative: 'Narrative',
                requirementIds: ['REQ-1'],
                expectedSignals: ['Signal'],
                steps: [{ action: 'Act' }],
              }),
              enrichmentJson: JSON.stringify({
                observationIds: ['obs-1'],
                resourceAssumptionIds: ['resource-1'],
                feasibilityNotes: ['Feasible'],
              }),
              layoutJson: JSON.stringify({ x: 10, y: 20, sequence: 0 }),
              decisions: [],
            },
          ],
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Approve exact scenario' }))
    await waitFor(() => expect(actions.decide).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText('Review feedback'), { target: { value: 'Needs revision.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject with feedback' }))
    await waitFor(() => expect(actions.decide).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Approve pending scenarios' }))
    await waitFor(() => expect(actions.decide).toHaveBeenCalledTimes(3))
    expect(actions.decide).toHaveBeenLastCalledWith(
      expect.objectContaining({ approvedScenarioRevisionIds: ['scenario-r1'], rejectedScenarioRevisionIds: [] }),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Request revision' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Request revision' }))
    await waitFor(() =>
      expect(actions.revision).toHaveBeenCalledWith(expect.objectContaining({ feedback: 'Needs revision.' })),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dispose' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Dispose' }))
    await waitFor(() =>
      expect(actions.dispose).toHaveBeenCalledWith(expect.objectContaining({ commentId: 'comment-1' })),
    )
    fireEvent.change(screen.getByLabelText('Comment'), { target: { value: 'A focused review comment.' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add comment' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    await waitFor(() => expect(actions.comment).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      expect(actions.decide).toHaveBeenCalledTimes(3)
      expect(actions.comment).toHaveBeenCalledTimes(1)
    })
  })

  it('targets only pending scenarios in a mixed carried-and-pending review', async () => {
    render(
      <ScenarioPortfolioReview
        journeyId="journey-1"
        stage="SCENARIO_REVIEW"
        stateHash="sha256:state"
        portfolio={{
          artifactId: 'portfolio-1',
          artifactRevisionId: 'portfolio-r1',
          contentHash: 'sha256:aaa',
          behavioralIntentHash: 'sha256:bbb',
          enrichmentHash: 'sha256:ccc',
          layoutHash: 'sha256:ddd',
          coverageRationale: 'Coverage.',
          graphJson: JSON.stringify({ edges: [], sharedSetup: [] }),
          reviewHash: 'sha256:eee',
          comments: [],
          scenarios: [
            {
              stableScenarioId: 'scenario-1',
              scenarioRevisionId: 'scenario-r1',
              behavioralIntentJson: JSON.stringify({ title: 'Carried scenario' }),
              enrichmentJson: '{}',
              layoutJson: JSON.stringify({ sequence: 0 }),
              decisions: [{ decision: 'APPROVED' }],
            },
            {
              stableScenarioId: 'scenario-2',
              scenarioRevisionId: 'scenario-r2',
              behavioralIntentJson: JSON.stringify({ title: 'Pending scenario' }),
              enrichmentJson: '{}',
              layoutJson: JSON.stringify({ sequence: 1 }),
              decisions: [],
            },
          ],
        }}
      />,
    )

    expect(screen.getByText('1 scenario is pending. Existing durable decisions are preserved.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Approve exact scenario' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Approve pending scenarios' }))
    await waitFor(() =>
      expect(actions.decide).toHaveBeenLastCalledWith(
        expect.objectContaining({ approvedScenarioRevisionIds: ['scenario-r2'], rejectedScenarioRevisionIds: [] }),
      ),
    )
  })
})
