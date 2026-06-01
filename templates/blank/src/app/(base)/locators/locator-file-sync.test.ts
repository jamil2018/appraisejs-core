import { beforeEach, describe, expect, it, vi } from 'vitest'

import { syncLocatorsFromFilesAction } from '@/actions/locator/locator-actions'

import { runLocatorFileSync } from './locator-file-sync'
import { showLocatorSyncFailureToast, showLocatorSyncToast } from './locator-sync-toast'

vi.mock('@/actions/locator/locator-actions', () => ({
  syncLocatorsFromFilesAction: vi.fn(),
}))

vi.mock('./locator-sync-toast', () => ({
  showLocatorSyncToast: vi.fn(),
  showLocatorSyncFailureToast: vi.fn(),
}))

const syncLocatorsFromFilesActionMock = vi.mocked(syncLocatorsFromFilesAction)
const showLocatorSyncToastMock = vi.mocked(showLocatorSyncToast)
const showLocatorSyncFailureToastMock = vi.mocked(showLocatorSyncFailureToast)

describe('runLocatorFileSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows success toast when sync succeeds', async () => {
    const refresh = vi.fn()
    const payload = { locatorsCreated: 1, locatorsMergedToFile: 2, conflicts: 0, errors: [] }

    syncLocatorsFromFilesActionMock.mockResolvedValue({ status: 200, data: payload, error: null })

    await runLocatorFileSync(refresh)

    expect(showLocatorSyncToastMock).toHaveBeenCalledWith(payload, refresh)
    expect(showLocatorSyncFailureToastMock).not.toHaveBeenCalled()
  })

  it('shows failure toast when sync returns an error response', async () => {
    syncLocatorsFromFilesActionMock.mockResolvedValue({ status: 500, data: null, error: 'sync failed' })

    await runLocatorFileSync(vi.fn())

    expect(showLocatorSyncFailureToastMock).toHaveBeenCalledWith('sync failed')
  })
})
