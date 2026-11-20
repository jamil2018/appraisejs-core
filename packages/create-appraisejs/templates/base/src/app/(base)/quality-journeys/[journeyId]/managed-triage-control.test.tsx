// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ start: vi.fn(), refresh: vi.fn(), recover: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('../quality-journey-managed-triage-actions', () => ({
  startQualityJourneyManagedTriageAction: mocks.start,
  recoverQualityJourneyManagedTriageAction: mocks.recover,
}))
import { ManagedTriageControl } from './managed-triage-control'
beforeEach(() => {
  vi.clearAllMocks()
})
const props = { journeyId: 'journey-1', stateHash: `sha256:${'a'.repeat(64)}`, enabled: true }
describe('managed Triager control', () => {
  it('recovers only the saved proposal identity without another native request', async () => {
    const recovery = { attemptId: 'retained-attempt', candidateHash: `sha256:${'b'.repeat(64)}` }
    mocks.recover.mockResolvedValue({ success: true })
    render(<ManagedTriageControl {...props} enabled={false} recovery={recovery} />)
    await userEvent.click(screen.getByRole('button', { name: 'Recover the saved report without another AI request' }))
    expect(mocks.recover).toHaveBeenCalledWith({
      journeyId: props.journeyId,
      expectedStateHash: props.stateHash,
      ...recovery,
    })
    expect(mocks.start).not.toHaveBeenCalled()
  })
  it('sends only the current Journey identity and prevents another launch after uncertainty', async () => {
    mocks.start.mockResolvedValue({ success: false, error: 'Original dispatch is UNKNOWN.' })
    render(<ManagedTriageControl {...props} />)
    const button = screen.getByRole('button', { name: 'Analyze sealed run evidence with local Codex' })
    await userEvent.click(button)
    expect(mocks.start).toHaveBeenCalledWith({ journeyId: props.journeyId, expectedStateHash: props.stateHash })
    expect(screen.getByRole('status')).toHaveTextContent('UNKNOWN')
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(mocks.start).toHaveBeenCalledTimes(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })
  it('requires explicit server enablement', () => {
    render(<ManagedTriageControl {...props} enabled={false} />)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByText(/server owner must enable/)).toBeVisible()
  })
})
