// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ continue: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('../quality-journey-managed-progression-actions', () => ({
  continueQualityJourneyManagedAction: mocks.continue,
}))
import { ManagedJourneyProgression } from './managed-journey-progression'
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})
it('refreshes once for a changed browser status even with the same lifecycle hash', async () => {
  vi.useFakeTimers()
  mocks.continue.mockResolvedValue({ success: true, data: { scheduled: false, discoveryCaptureStatus: 'READY' } })
  render(<ManagedJourneyProgression journeyId="journey" stateHash="same-lifecycle" discoveryCaptureStatus="READY" />)
  await act(async () => {
    await Promise.resolve()
  })
  expect(mocks.refresh).not.toHaveBeenCalled()
  mocks.continue.mockResolvedValue({
    success: true,
    data: { scheduled: false, discoveryCaptureStatus: 'MANUAL_REQUIRED' },
  })
  await act(async () => {
    vi.advanceTimersByTime(10_000)
    await Promise.resolve()
  })
  expect(mocks.refresh).toHaveBeenCalledTimes(1)
  await act(async () => {
    vi.advanceTimersByTime(10_000)
    await Promise.resolve()
  })
  expect(mocks.refresh).toHaveBeenCalledTimes(1)
})
