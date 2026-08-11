// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SettingsSyncPanel } from './settings-sync-panel'

const { refresh, toast, runSyncAction, getSyncPendingCountsAction } = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: vi.fn(),
  runSyncAction: vi.fn(),
  getSyncPendingCountsAction: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh,
  }),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast,
}))

vi.mock('@/actions/settings/sync-actions', () => ({
  runSyncAction,
  getSyncPendingCountsAction,
}))

describe('SettingsSyncPanel', () => {
  it('runs sync all, refreshes pending counts, and shows a success toast', async () => {
    const user = userEvent.setup()

    runSyncAction.mockResolvedValue({
      requestedScriptId: 'sync-all',
      executedScriptIds: ['sync-modules', 'sync-tags'],
      success: true,
      durationMs: 12,
    })
    getSyncPendingCountsAction.mockResolvedValue({
      'sync-all': 0,
      'sync-modules': 0,
      'sync-environments': 0,
      'sync-tags': 0,
      'sync-step-definitions': 0,
      'sync-locator-groups': 0,
      'sync-locators': 0,
      'sync-test-suites': 0,
      'sync-test-cases': 0,
    })

    render(
      <SettingsSyncPanel
        pendingCounts={{
          'sync-all': 2,
          'sync-modules': 1,
          'sync-environments': 0,
          'sync-tags': 1,
          'sync-step-definitions': 0,
          'sync-locator-groups': 0,
          'sync-locators': 0,
          'sync-test-suites': 0,
          'sync-test-cases': 0,
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Sync All' }))

    await waitFor(() => {
      expect(runSyncAction).toHaveBeenCalledWith('sync-all')
    })

    expect(getSyncPendingCountsAction).toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith({
      title: 'Sync completed',
      description: 'Completed 2 sync scripts successfully.',
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('shows a destructive toast when sync fails', async () => {
    const user = userEvent.setup()

    runSyncAction.mockResolvedValue({
      requestedScriptId: 'sync-tags',
      executedScriptIds: [],
      success: false,
      durationMs: 12,
      cause: 'Sync failed at runtime',
    })

    render(
      <SettingsSyncPanel
        pendingCounts={{
          'sync-all': 1,
          'sync-modules': 0,
          'sync-environments': 0,
          'sync-tags': 1,
          'sync-step-definitions': 0,
          'sync-locator-groups': 0,
          'sync-locators': 0,
          'sync-test-suites': 0,
          'sync-test-cases': 0,
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Sync Tags' }))

    await waitFor(() => {
      expect(runSyncAction).toHaveBeenCalledWith('sync-tags')
    })

    expect(getSyncPendingCountsAction).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith({
      variant: 'destructive',
      title: 'Sync failed',
      description: 'Sync failed at runtime',
    })
    expect(refresh).toHaveBeenCalled()
  })
})
