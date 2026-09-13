// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  launch: vi.fn(),
  inspect: vi.fn(),
  approve: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }))
vi.mock('../quality-journey-handoff-actions', () => ({
  approveQualityJourneyHandoffTakeoverAction: mocks.approve,
  launchQualityJourneyHandoffAction: mocks.launch,
  inspectQualityJourneyHandoffAction: mocks.inspect,
  prepareQualityJourneyHandoffAction: mocks.prepare,
}))

import { CoordinatorHandoffPanel } from './coordinator-handoff-panel'

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
  mocks.prepare.mockResolvedValue({
    success: true,
    data: {
      prompt: 'Prepared Codex prompt',
      handoffId: 'handoff-1',
      launchUrl: 'codex://new?path=%2Ftmp',
      takeoverApproval: `qjha_${'a'.repeat(32)}`,
      takeoverRequestId: `qjhr_${'b'.repeat(32)}`,
      generation: 1,
    },
  })
  mocks.launch.mockResolvedValue({ success: true, data: { status: 'LAUNCHED' } })
  mocks.inspect.mockResolvedValue({ success: true, data: { handoff: { status: 'LAUNCHED' } } })
  mocks.approve.mockResolvedValue({ success: true, data: { handoffId: 'handoff-1' } })
})

describe('CoordinatorHandoffPanel', () => {
  it('keeps paste, send, copy, and manual recovery guidance visible after opening Codex', async () => {
    const user = userEvent.setup()
    render(
      <CoordinatorHandoffPanel
        handoff={null}
        hasObservedWorkerProgress={false}
        journeyId="journey-1"
        projectId="project-1"
      />,
    )

    expect(screen.getByText('Ready to start')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Prepare and open Codex' }))

    await waitFor(() => expect(screen.getByText('Launch requested')).toBeInTheDocument())
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
        projectId="project-1"
      />,
    )

    expect(screen.getByText('Connection observed')).toBeInTheDocument()
    expect(screen.getByText(/current availability is unknown/i)).toBeInTheDocument()
  })

  it('replaces launch-requested status only after authoritative redemption is observed', async () => {
    mocks.inspect.mockResolvedValue({ success: true, data: { handoff: { status: 'CONNECTED' } } })
    render(
      <CoordinatorHandoffPanel
        handoff={{
          id: 'handoff-1',
          providerId: 'codex',
          status: 'LAUNCHED',
          expiresAt: new Date('2026-09-08T00:00:00.000Z'),
          launchedAt: new Date('2026-09-07T00:00:00.000Z'),
          connectedAt: null,
          failureCode: null,
        }}
        hasObservedWorkerProgress={false}
        journeyId="journey-1"
        projectId="project-1"
      />,
    )

    expect(screen.getByText('Launch requested')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Connection observed')).toBeInTheDocument())
    expect(mocks.inspect).toHaveBeenCalledWith({ journeyId: 'journey-1' })
  })

  it('replaces launch-requested status when authoritative inspection observes natural expiry', async () => {
    mocks.inspect.mockResolvedValue({ success: true, data: { handoff: { status: 'EXPIRED' } } })
    render(
      <CoordinatorHandoffPanel
        handoff={{
          id: 'handoff-1',
          providerId: 'codex',
          status: 'LAUNCHED',
          expiresAt: new Date('2026-09-08T00:00:00.000Z'),
          launchedAt: new Date('2026-09-07T00:00:00.000Z'),
          connectedAt: null,
          failureCode: null,
        }}
        hasObservedWorkerProgress={false}
        journeyId="journey-1"
        projectId="project-1"
      />,
    )

    expect(screen.getByText('Launch requested')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Needs recovery')).toBeInTheDocument())
    expect(screen.getByText(/handoff expired/i)).toBeInTheDocument()
  })

  it.each([
    { status: 'FAILED', expected: /handoff failed/i },
    { status: 'EXPIRED', expected: /handoff expired/i },
  ])('shows truthful recovery guidance for a $status handoff', ({ status, expected }) => {
    render(
      <CoordinatorHandoffPanel
        handoff={{
          id: 'handoff-1',
          providerId: 'codex',
          status,
          expiresAt: new Date('2026-09-08T00:00:00.000Z'),
          launchedAt: null,
          connectedAt: null,
          failureCode: status === 'FAILED' ? 'LAUNCH_FAILED' : null,
        }}
        hasObservedWorkerProgress={false}
        journeyId="journey-1"
        projectId="project-1"
      />,
    )

    expect(screen.getByText('Needs recovery')).toBeInTheDocument()
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('does not prepare the same handoff twice while the first request is pending', async () => {
    const user = userEvent.setup()
    let resolvePrepare: (value: {
      success: true
      data: {
        prompt: string
        handoffId: string
        launchUrl: string
        takeoverApproval: string
        takeoverRequestId: string
        generation: number
      }
    }) => void = () => {}
    mocks.prepare.mockReturnValue(new Promise(resolve => (resolvePrepare = resolve)))
    render(
      <CoordinatorHandoffPanel
        handoff={null}
        hasObservedWorkerProgress={false}
        journeyId="journey-1"
        projectId="project-1"
      />,
    )

    const button = screen.getByRole('button', { name: 'Prepare and open Codex' })
    await user.click(button)
    await user.click(button)
    expect(mocks.prepare).toHaveBeenCalledTimes(1)

    resolvePrepare({
      success: true,
      data: {
        prompt: 'Prepared Codex prompt',
        handoffId: 'handoff-1',
        launchUrl: 'codex://new?path=%2Ftmp',
        takeoverApproval: `qjha_${'a'.repeat(32)}`,
        takeoverRequestId: `qjhr_${'b'.repeat(32)}`,
        generation: 1,
      },
    })
    await waitFor(() => expect(mocks.launch).toHaveBeenCalledTimes(1))
  })

  it('keeps redemption separate from an explicit takeover approval', async () => {
    const user = userEvent.setup()
    mocks.inspect.mockResolvedValue({ success: true, data: { handoff: { status: 'CONNECTED' } } })
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
        projectId="project-1"
      />,
    )
    expect(mocks.approve).not.toHaveBeenCalled()
    expect(screen.getByText(/approval was not retained after reload/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open Codex again' }))
    await waitFor(() => expect(mocks.launch).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Approve coordinator takeover' })).toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: 'Approve coordinator takeover' }))
    await waitFor(() =>
      expect(mocks.approve).toHaveBeenCalledWith({
        journeyId: 'journey-1',
        handoffId: 'handoff-1',
        generation: 1,
        takeoverApproval: `qjha_${'a'.repeat(32)}`,
        takeoverRequestId: `qjhr_${'b'.repeat(32)}`,
      }),
    )
  })

  it('preserves project and journey context in agent setup', () => {
    render(
      <CoordinatorHandoffPanel
        handoff={null}
        hasObservedWorkerProgress={false}
        journeyId="journey-1"
        projectId="project-1"
      />,
    )

    expect(screen.getByRole('link', { name: 'Agent setup' })).toHaveAttribute(
      'href',
      '/projects?agentSetup=codex&project=project-1&returnTo=%2Fquality-journeys%2Fjourney-1%3Fproject%3Dproject-1%23analysis',
    )
  })

  it('keeps the prepared prompt available when clipboard access is denied', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    render(
      <CoordinatorHandoffPanel
        handoff={null}
        hasObservedWorkerProgress={false}
        journeyId="journey-1"
        projectId="project-1"
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Prepare and open Codex' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy coordinator prompt' })).toBeInTheDocument())
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Copy the prompt manually', variant: 'destructive' }),
    )
  })
})
