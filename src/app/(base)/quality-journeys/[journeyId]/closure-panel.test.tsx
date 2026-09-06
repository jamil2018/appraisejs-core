// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ close: vi.fn(), refresh: vi.fn() }))
vi.mock('./closure-actions', () => ({ closeQualityJourneyAction: mocks.close }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
import { ClosurePanel } from './closure-panel'
const digest = `sha256:${'a'.repeat(64)}`
const base = {
  receipt: null,
  contentHash: null,
  reportRevisionId: 'report-1',
  reportHash: digest,
  unresolvedItems: [],
  blockers: [],
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.close.mockResolvedValue({ success: true })
})

it('requires explicit acceptance and rationale for every known limitation', async () => {
  const user = userEvent.setup()
  render(
    <ClosurePanel
      journeyId="journey-1"
      stateHash={digest}
      closure={{ ...base, unresolvedItems: [{ itemId: 'risk:1', summary: 'Checkout unverified', artifactRefs: [] }] }}
    />,
  )
  const button = screen.getByRole('button', { name: 'Accept risks and close journey' })
  expect(button).toBeDisabled()
  await user.type(screen.getByLabelText('Risk acceptance rationale'), 'Accepted for this release')
  expect(button).toBeDisabled()
  await user.click(screen.getByRole('checkbox'))
  await user.click(button)
  expect(mocks.close).toHaveBeenCalledWith(
    expect.objectContaining({
      journeyId: 'journey-1',
      reportRevisionId: 'report-1',
      expectedReportHash: digest,
      expectedStateHash: digest,
      decision: 'RISK_ACCEPTED',
      rationale: 'Accepted for this release',
      acceptedItemIds: ['risk:1'],
    }),
  )
  expect(mocks.refresh).toHaveBeenCalled()
})

it('submits normal closure and displays a stale-state error', async () => {
  mocks.close.mockResolvedValue({ success: false, error: 'The report changed.' })
  render(<ClosurePanel journeyId="journey-1" stateHash={digest} closure={base} />)
  await userEvent.click(screen.getByRole('button', { name: 'Approve report and close journey' }))
  expect(mocks.close).toHaveBeenCalledWith(expect.objectContaining({ decision: 'CLOSED' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('The report changed.')
  expect(mocks.refresh).not.toHaveBeenCalled()
})

it('shows terminal receipts without mutation controls', () => {
  render(
    <ClosurePanel
      journeyId="journey-1"
      stateHash={digest}
      closure={{
        ...base,
        contentHash: digest,
        receipt: {
          schemaVersion: 'appraise.quality-journey/v1',
          closureId: 'closure-1',
          journeyId: 'journey-1',
          cycleId: 'cycle-1',
          reportRevision: {
            kind: 'TEST_REPORT_ANALYSIS_REVISION',
            artifactId: 'report-1',
            revisionId: 'report-1',
            contentHash: digest,
          },
          actorId: 'USER',
          decision: 'CLOSED',
          closedAt: '2026-09-05T00:00:00.000Z',
          unresolvedItems: [],
        },
      }}
    />,
  )
  expect(screen.getByText('Journey closed')).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

it('blocks closure while required gates remain', () => {
  render(
    <ClosurePanel
      journeyId="journey-1"
      stateHash={digest}
      closure={{ ...base, blockers: ['Resolve required questions.'] }}
    />,
  )
  expect(screen.getByRole('button')).toBeDisabled()
})
