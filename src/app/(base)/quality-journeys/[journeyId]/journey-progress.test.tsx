// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { JourneyProgress } from './journey-progress'

describe('JourneyProgress', () => {
  it('projects deterministic Runner states, role attempts, and human gates without claiming connectivity', () => {
    render(
      <JourneyProgress
        attempts={[
          {
            id: 'attempt-1',
            workItemId: 'work-1',
            attempt: 1,
            status: 'IN_PROGRESS',
            startedAt: new Date('2026-09-06T00:00:00.000Z'),
            completedAt: null,
          },
        ]}
        closure={{ receipt: null }}
        execution={{ consents: [{ status: 'REQUESTED' }], cycles: [{ status: 'RUNNING' }] }}
        journey={{
          journey: { stage: 'REPORT_REVIEW', stateHash: 'sha256:state' },
          runner: [
            { role: 'REQUIREMENT_ANALYZER', stage: 'ANALYSIS', state: 'COMPLETED', workItemId: 'work-1' },
            { role: 'TRIAGER', stage: 'TRIAGE', state: 'WAITING', workItemId: null },
          ],
          workItems: [{ id: 'work-1', role: 'REQUIREMENT_ANALYZER', status: 'IN_PROGRESS', currentAttempt: 1 }],
        }}
        triage={{ reports: [{ id: 'report-1' }], activeReportRevisionId: 'report-1' }}
      />,
    )

    expect(
      screen.getByText(
        'Coordinator reports durable lifecycle state. It does not infer worker connectivity or availability.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Deterministic Runner nodes')).toHaveTextContent('completed')
    expect(screen.getByLabelText('Role work items and attempts')).toHaveTextContent('Attempt 1')
    expect(screen.getByLabelText('Human lifecycle gates')).toHaveTextContent(
      '1 exact consent request is awaiting a human decision.',
    )
    expect(screen.getByLabelText('Human lifecycle gates')).toHaveTextContent(
      'The active report is at the human report-review gate.',
    )
  })
})
