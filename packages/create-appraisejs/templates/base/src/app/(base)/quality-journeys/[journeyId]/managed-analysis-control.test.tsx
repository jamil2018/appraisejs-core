// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ start: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('../quality-journey-managed-analysis-actions', () => ({
  startQualityJourneyManagedAnalysisAction: mocks.start,
}))
import { ManagedAnalysisControl } from './managed-analysis-control'
beforeEach(() => {
  vi.clearAllMocks()
})
const props = { journeyId: 'journey-1', stateHash: `sha256:${'a'.repeat(64)}`, enabled: true }
describe('managed Analysis control', () => {
  it('starts the real action and prevents another launch after an uncertain response', async () => {
    mocks.start.mockResolvedValue({ success: false, error: 'Original dispatch is UNKNOWN.' })
    render(<ManagedAnalysisControl {...props} />)
    const button = screen.getByRole('button', { name: 'Analyze brief with local Codex' })
    await userEvent.click(button)
    expect(mocks.start).toHaveBeenCalledWith({ journeyId: props.journeyId, expectedStateHash: props.stateHash })
    expect(screen.getByRole('status')).toHaveTextContent('UNKNOWN')
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(mocks.start).toHaveBeenCalledTimes(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })
  it('does not offer native dispatch until the server owner enables it', () => {
    render(<ManagedAnalysisControl {...props} enabled={false} />)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByText(/unavailable for this step/)).toBeVisible()
  })
})
