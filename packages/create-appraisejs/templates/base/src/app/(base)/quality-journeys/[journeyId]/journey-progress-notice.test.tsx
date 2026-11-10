// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ status: vi.fn(), refresh: vi.fn() }))
vi.mock('../quality-journey-status-actions', () => ({ readQualityJourneyStatusAction: mocks.status }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import { JourneyRuntimeStatus } from './journey-runtime-status'
import { JourneyProgressNotice } from './journey-progress-notice'
import { JourneyStatusObservationProvider } from './journey-status-observation'

describe('JourneyProgressNotice', () => {
  const snapshot = (overrides: Record<string, unknown> = {}) => ({
    journeyId: 'journey-1',
    targetProjectId: 'project-1',
    runtimeStatus: 'QUEUED',
    observedAt: '2026-09-07T12:00:00.000Z',
    closed: false,
    lifecycle: {
      stage: 'SCENARIO_REVIEW',
      status: 'ACTIVE',
      version: 2,
      stateHash: 'sha256:state',
      activeCycleId: 'cycle-1',
      activeRevisionIds: {},
      analysisReviewHash: null,
    },
    attention: { unresolvedQuestionCount: 0, activeBlockers: [], activeWork: [] },
    ...overrides,
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.status.mockResolvedValue({ success: true, data: snapshot() })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  })

  function view(projectId = 'project-1', version = 2) {
    return (
      <JourneyStatusObservationProvider
        journeyId="journey-1"
        projectId={projectId}
        stage="SCENARIO_REVIEW"
        stateHash="sha256:state"
        version={version}
      >
        <JourneyRuntimeStatus />
        <JourneyProgressNotice eventCount={2} stateHash="sha256:state" stage="SCENARIO_REVIEW" />
        <textarea aria-label="Pending feedback" />
      </JourneyStatusObservationProvider>
    )
  }

  function renderNotice() {
    return render(view())
  }

  it('checks on visible load, polls every ten seconds, and offers an accessible manual check', async () => {
    renderNotice()

    await act(async () => {})
    expect(mocks.status).toHaveBeenCalledTimes(1)
    expect(mocks.status).toHaveBeenLastCalledWith({ journeyId: 'journey-1', projectId: 'project-1' })
    expect(screen.getByRole('status')).toHaveTextContent('Last checked:')

    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(mocks.status).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))
    await act(async () => {})
    expect(mocks.status).toHaveBeenCalledTimes(3)
  })

  it('does not fetch while hidden and backs off while retaining the last known state after a failure', async () => {
    let visibility = 'hidden'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
    mocks.status.mockResolvedValueOnce({ success: true, data: snapshot() }).mockResolvedValueOnce({ success: false })
    renderNotice()

    await act(async () => vi.advanceTimersByTimeAsync(20_000))
    expect(mocks.status).not.toHaveBeenCalled()

    visibility = 'visible'
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    await act(async () => {})
    expect(mocks.status).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    await act(async () => {})
    expect(mocks.status).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('status')).toHaveTextContent('may be outdated; the last known state is still shown')

    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(mocks.status).toHaveBeenCalledTimes(2)
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(mocks.status).toHaveBeenCalledTimes(3)
    expect(screen.getByText(/Queued ·/)).not.toHaveTextContent('may be outdated')
  })

  it('stops automatic polling once the observed journey is closed', async () => {
    mocks.status.mockResolvedValue({ success: true, data: snapshot({ closed: true }) })
    renderNotice()

    await act(async () => {})
    expect(mocks.status).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTimeAsync(60_000))
    expect(mocks.status).toHaveBeenCalledTimes(1)
  })

  it('does not overlap an automatic request with another automatic or manual check', async () => {
    let complete: ((value: unknown) => void) | undefined
    mocks.status.mockImplementation(
      () =>
        new Promise(resolve => {
          complete = resolve
        }),
    )
    renderNotice()

    await act(async () => {})
    expect(mocks.status).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTimeAsync(30_000))
    fireEvent.click(screen.getByRole('button', { name: 'Checking…' }))
    expect(mocks.status).toHaveBeenCalledTimes(1)

    await act(async () => complete?.({ success: true, data: snapshot() }))
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled()
  })

  it('makes an observed newer version explicit and reloads only after the user requests it', async () => {
    mocks.status.mockResolvedValue({
      success: true,
      data: snapshot({ lifecycle: { ...snapshot().lifecycle, stateHash: 'sha256:newer-state' } }),
    })
    renderNotice()

    await act(async () => {})
    expect(screen.getByText(/A newer version is available/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load newer version' }))
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it('refreshes runtime independently while preserving pending feedback and pinned content', async () => {
    renderNotice()
    await act(async () => {})
    fireEvent.change(screen.getByRole('textbox', { name: 'Pending feedback' }), {
      target: { value: 'Keep this draft' },
    })
    mocks.status.mockResolvedValueOnce({ success: true, data: snapshot({ runtimeStatus: 'RUNNING' }) })
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(screen.getByText(/Running ·/)).toBeInTheDocument()
    expect(screen.queryByText(/A newer version is available/)).not.toBeInTheDocument()

    mocks.status.mockResolvedValueOnce({
      success: true,
      data: snapshot({
        runtimeStatus: 'WAITING',
        lifecycle: { ...snapshot().lifecycle, version: 3, stateHash: 'sha256:new' },
      }),
    })
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(screen.getByText(/Waiting ·/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Pending feedback' })).toHaveValue('Keep this draft')
    expect(screen.getByRole('button', { name: 'Load newer version' })).toBeEnabled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('drops old project status immediately and ignores an in-flight response after switching', async () => {
    const { rerender } = renderNotice()
    await act(async () => {})
    expect(screen.getByText(/Queued ·/)).toBeInTheDocument()
    const late = Promise.withResolvers<unknown>()
    mocks.status.mockReturnValueOnce(late.promise)
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    mocks.status.mockResolvedValueOnce({
      success: true,
      data: snapshot({ targetProjectId: 'project-2', runtimeStatus: 'BLOCKED' }),
    })
    rerender(view('project-2'))
    expect(screen.queryByText(/Queued ·/)).not.toBeInTheDocument()
    await act(async () => {})
    expect(screen.getByText(/Blocked ·/)).toBeInTheDocument()

    await act(async () => late.resolve({ success: true, data: snapshot({ runtimeStatus: 'RUNNING' }) }))
    expect(screen.queryByText(/Running ·/)).not.toBeInTheDocument()
    mocks.status.mockResolvedValueOnce({ success: true, data: snapshot({ runtimeStatus: 'RECOVERY' }) })
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(screen.getByText(/Blocked ·/)).toHaveTextContent('may be outdated')
    expect(screen.queryByText(/Recovery required/)).not.toBeInTheDocument()
  })

  it('discards a stale closed response after the route refreshes and keeps polling', async () => {
    const late = Promise.withResolvers<unknown>()
    mocks.status.mockReturnValueOnce(late.promise)
    const { rerender } = renderNotice()
    rerender(view('project-1', 3))
    await act(async () => late.resolve({ success: true, data: snapshot({ closed: true }) }))
    expect(screen.queryByText(/Queued ·/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled()

    mocks.status.mockResolvedValueOnce({
      success: true,
      data: snapshot({ lifecycle: { ...snapshot().lifecycle, version: 3 }, runtimeStatus: 'RECOVERY' }),
    })
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(screen.getByText(/Recovery required ·/)).toBeInTheDocument()

    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(screen.getByText(/Recovery required ·/)).toHaveTextContent('may be outdated')
  })
})
