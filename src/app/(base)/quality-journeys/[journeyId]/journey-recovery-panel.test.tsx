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

it('keeps one request key after a lost pause reply and explains how to check cleanup', async () => {
  const user = userEvent.setup()
  mocks.action.mockResolvedValueOnce({ success: false, error: 'Response lost.' }).mockResolvedValueOnce({
    success: true,
    data: {
      cleanup: { browser: 'NONE_REGISTERED', execution: 'UNKNOWN', managedTurn: 'UNKNOWN', externalCodex: 'UNKNOWN' },
    },
  })
  const { rerender } = render(<JourneyRecoveryPanel {...props} />)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  const button = screen.getByRole('button', { name: 'Pause' })
  await user.click(button)
  expect(await screen.findByRole('alert')).toHaveTextContent('Response lost.')
  rerender(<JourneyRecoveryPanel {...props} version={4} />)
  await user.click(button)
  await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(2))
  const first = mocks.action.mock.calls[0][1]
  const second = mocks.action.mock.calls[1][1]
  expect(first).toMatchObject({ journeyId: 'journey-1', expectedVersion: 3, reason: 'Paused by the user' })
  expect(first.idempotencyKey).toBe(second.idempotencyKey)
  expect(second).toEqual(first)
  expect(await screen.findByRole('status')).toHaveTextContent('checking whether the test run stopped')
  expect(mocks.refresh).toHaveBeenCalled()
})

it('provides an explicit resume control for paused journeys', async () => {
  mocks.action.mockResolvedValue({ success: true, data: { cleanup: { browser: 'OBSERVED', execution: 'OBSERVED' } } })
  render(<JourneyRecoveryPanel {...props} status="PAUSED" />)
  await userEvent.click(screen.getByRole('button', { name: 'Resume' }))
  expect(mocks.action).toHaveBeenCalledWith('resume', expect.objectContaining({ expectedVersion: 3 }))
})
