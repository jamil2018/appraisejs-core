// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('../quality-journey-execution-actions', () => ({ qualityJourneyExecutionAction: mocks.action }))
import { JourneyExecutionStartForm } from './journey-execution-controls'
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.action.mockResolvedValue({ success: true })
})
it('starts an approved rerun with the explicitly selected environment', async () => {
  render(
    <JourneyExecutionStartForm
      journeyId="journey"
      stateHash="hash"
      capsuleIds={[]}
      proposalId="proposal"
      environments={[
        { id: 'env1', name: 'First' },
        { id: 'env2', name: 'Second' },
      ]}
    />,
  )
  fireEvent.change(screen.getByLabelText('Execution environment'), { target: { value: 'env2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Start approved rerun' }))
  await waitFor(() =>
    expect(mocks.action).toHaveBeenCalledWith(
      'rerun',
      expect.objectContaining({ environmentId: 'env2', proposalId: 'proposal', expectedStateHash: 'hash' }),
    ),
  )
  expect(mocks.action.mock.calls[0][1]).not.toHaveProperty('preparedRuntimeCapsuleIds')
})
it('shows execution errors instead of claiming a run started', async () => {
  mocks.action.mockResolvedValue({ success: false, error: 'Approved materialization changed.' })
  render(
    <JourneyExecutionStartForm
      journeyId="journey"
      stateHash="hash"
      capsuleIds={['b', 'a']}
      environments={[{ id: 'env', name: 'Test' }]}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Start managed execution' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Approved materialization changed.'))
  expect(mocks.action).toHaveBeenCalledWith('start', expect.objectContaining({ preparedRuntimeCapsuleIds: ['a', 'b'] }))
})
