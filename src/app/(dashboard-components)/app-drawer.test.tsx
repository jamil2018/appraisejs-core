/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import AppDrawer from './app-drawer'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

describe('AppDrawer', () => {
  it('disables attention cards whose count is zero', () => {
    render(<AppDrawer metrics={null} title="Attention Needed" description="Issues requiring action" />)

    expect(screen.getByRole('button', { name: 'Failed Runs: 0. No recent failures' })).toHaveAttribute(
      'data-state',
      'disabled',
    )
    expect(screen.getByRole('button', { name: 'Failing Tests: 0. No failing tests' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Flaky Tests: 0. No flaky tests' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Unexecuted Suites: 0. All suites current' })).toBeDisabled()
  })

  it('keeps nonzero attention cards actionable', async () => {
    const user = userEvent.setup()
    render(
      <AppDrawer
        metrics={{
          id: 'metrics',
          failedRecentRunsCount: 2,
          repeatedlyFailingTestsCount: 0,
          flakyTestsCount: 0,
          suitesNotExecutedRecentlyCount: 0,
          lastUpdatedAt: new Date(),
          createdAt: new Date(),
          targetProjectId: 'project-1',
        }}
        title="Attention Needed"
        description="Issues requiring action"
      />,
    )

    const failedRuns = screen.getByRole('button', { name: 'Failed Runs: 2. Recent failures' })
    expect(failedRuns).toBeEnabled()

    await user.click(failedRuns)

    expect(pushMock).toHaveBeenCalledWith('/test-runs?filter=recentFailed')
  })
})
