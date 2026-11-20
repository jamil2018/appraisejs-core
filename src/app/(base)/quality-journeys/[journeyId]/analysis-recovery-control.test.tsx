// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ read: vi.fn(), resume: vi.fn(), refresh: vi.fn(), observation: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('./journey-status-observation', () => ({ useJourneyStatusObservationContext: mocks.observation }))
vi.mock('../quality-journey-analysis-recovery-actions', () => ({
  readJourneyAnalysisRecovery: mocks.read,
  resumeJourneyAnalysis: mocks.resume,
}))
import { AnalysisRecoveryControl } from './analysis-recovery-control'
const state = {
  lifecycle: { status: 'ACTIVE', stage: 'ANALYSIS', stateHash: 'hash' },
  activity: { id: 'failed', needsRecovery: true, role: 'REQUIREMENT_ANALYZER' },
}
it('offers the verified recovery for the currently displayed attempt', async () => {
  const choice = { kind: 'replacement', attemptId: 'failed', failureHash: 'proof' }
  mocks.observation.mockReturnValue({ snapshot: state })
  mocks.read.mockResolvedValueOnce(choice).mockResolvedValue(null)
  mocks.resume.mockResolvedValue({ success: true })
  render(<AnalysisRecoveryControl journeyId="journey" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Resume criteria revision' }))
  await waitFor(() =>
    expect(mocks.resume).toHaveBeenCalledWith({ journeyId: 'journey', expectedStateHash: 'hash', recovery: choice }),
  )
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled())
})
it('keeps recovery out of the way while the agent is working', () => {
  mocks.read.mockClear()
  mocks.observation.mockReturnValue({ snapshot: { ...state, activity: { ...state.activity, needsRecovery: false } } })
  render(<AnalysisRecoveryControl journeyId="journey" />)
  expect(mocks.read).not.toHaveBeenCalled()
  expect(screen.queryByRole('button')).toBeNull()
})

it('offers receipt recovery when canonical acceptance retired the assignment before publication', async () => {
  mocks.observation.mockReturnValue({ snapshot: { ...state, activity: null, runtimeStatus: 'RECOVERY' } })
  mocks.read.mockResolvedValue({ kind: 'saved', attemptId: 'accepted', candidateHash: 'proof' })
  render(<AnalysisRecoveryControl journeyId="journey" />)
  expect(await screen.findByRole('button', { name: 'Finish saving criteria' })).toBeTruthy()
})
