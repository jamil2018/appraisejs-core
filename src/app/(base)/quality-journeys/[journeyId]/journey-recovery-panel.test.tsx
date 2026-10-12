// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }))
vi.mock('../quality-journey-recovery-actions', () => ({ qualityJourneyRecoveryAction: mocks.action }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import { JourneyRecoveryPanel } from './journey-recovery-panel'

const props = { journeyId: 'journey-1', status: 'ACTIVE', stateHash: `sha256:${'a'.repeat(64)}`, version: 3 }

beforeEach(() => {
  vi.clearAllMocks()
})

it('keeps one request key after a lost pause reply and states the external stop limit', async () => {
  const user = userEvent.setup()
  mocks.action.mockResolvedValueOnce({ success: false, error: 'Response lost.' }).mockResolvedValueOnce({
    success: true,
    data: { cleanup: { browser: 'NONE_REGISTERED', execution: 'UNKNOWN', externalCodex: 'UNKNOWN' } },
  })
  const { rerender } = render(<JourneyRecoveryPanel {...props} />)
  expect(screen.getByText(/external Codex task cannot be stopped here/i)).toBeInTheDocument()
  const button = screen.getByRole('button', { name: 'Pause journey' })
  expect(button).toBeDisabled()
  await user.type(screen.getByLabelText('Pause reason'), 'Operator is offline')
  await user.click(button)
  expect(await screen.findByRole('alert')).toHaveTextContent('Response lost.')
  rerender(<JourneyRecoveryPanel {...props} version={4} />)
  await user.click(button)
  await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(2))
  const first = mocks.action.mock.calls[0][1]
  const second = mocks.action.mock.calls[1][1]
  expect(first).toMatchObject({ journeyId: 'journey-1', expectedVersion: 3, reason: 'Operator is offline' })
  expect(first.idempotencyKey).toBe(second.idempotencyKey)
  expect(second).toEqual(first)
  expect(await screen.findByRole('status')).toHaveTextContent('External Codex task status is unknown.')
  expect(mocks.refresh).toHaveBeenCalled()
})

it('provides an explicit resume control for paused journeys', async () => {
  mocks.action.mockResolvedValue({ success: true, data: { cleanup: { browser: 'OBSERVED', execution: 'OBSERVED' } } })
  render(<JourneyRecoveryPanel {...props} status="PAUSED" />)
  await userEvent.click(screen.getByRole('button', { name: 'Resume journey' }))
  expect(mocks.action).toHaveBeenCalledWith('resume', expect.objectContaining({ expectedVersion: 3 }))
})
