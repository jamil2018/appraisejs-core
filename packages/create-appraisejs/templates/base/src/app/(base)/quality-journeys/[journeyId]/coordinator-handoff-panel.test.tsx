// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), launch: vi.fn(), toast: vi.fn() }))

vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }))
vi.mock('../quality-journey-handoff-actions', () => ({
  launchQualityJourneyHandoffAction: mocks.launch,
  prepareQualityJourneyHandoffAction: mocks.prepare,
}))

import { CoordinatorHandoffPanel } from './coordinator-handoff-panel'

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
  mocks.prepare.mockResolvedValue({ success: true, data: { prompt: 'Prepared Codex prompt', handoffId: 'handoff-1' } })
  mocks.launch.mockResolvedValue({ success: true, data: { status: 'LAUNCHED' } })
})

describe('CoordinatorHandoffPanel', () => {
  it('keeps paste, send, copy, and manual recovery guidance visible after opening Codex', async () => {
    const user = userEvent.setup()
    render(<CoordinatorHandoffPanel handoff={null} hasObservedWorkerProgress={false} journeyId="journey-1" />)

    expect(screen.getByText('Ready to start')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Prepare and open Codex' }))

    await waitFor(() => expect(screen.getByText('Waiting for connection')).toBeInTheDocument())
    expect(screen.getByText('Paste and send the prepared prompt in Codex')).toBeInTheDocument()
    expect(screen.getByText(/open it manually, then paste and send the same prompt/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prompt copied' })).toBeInTheDocument()
  })

  it('distinguishes a connection from observed worker progress', () => {
    render(
      <CoordinatorHandoffPanel
        handoff={{
          id: 'handoff-1',
          providerId: 'codex',
          status: 'CONNECTED',
          expiresAt: new Date('2026-09-08T00:00:00.000Z'),
          launchedAt: new Date('2026-09-07T00:00:00.000Z'),
          connectedAt: new Date('2026-09-07T00:01:00.000Z'),
          failureCode: null,
        }}
        hasObservedWorkerProgress={false}
        journeyId="journey-1"
      />,
    )

    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText(/has not received submitted analysis work yet/i)).toBeInTheDocument()
  })
})
