import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/sync/sync-executor', () => ({
  runRequestedSync: vi.fn(),
}))

vi.mock('@/lib/sync/sync-pending-counts', () => ({
  getSyncPendingCounts: vi.fn(),
}))

import { revalidatePath } from 'next/cache'
import { runRequestedSync } from '@/lib/sync/sync-executor'
import { runSyncAction } from './sync-actions'

describe('runSyncAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects an invalid sync request id without executing anything', async () => {
    const result = await runSyncAction('not-a-sync-target')

    expect(result).toEqual({
      requestedScriptId: 'not-a-sync-target',
      executedScriptIds: [],
      success: false,
      exitCode: 400,
      durationMs: 0,
      cause: 'Invalid sync target requested.',
    })
    expect(runRequestedSync).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('revalidates settings after a successful sync request', async () => {
    vi.mocked(runRequestedSync).mockResolvedValue({
      requestedScriptId: 'sync-tags',
      executedScriptIds: ['sync-tags'],
      success: true,
      durationMs: 12,
    })

    const result = await runSyncAction('sync-tags')

    expect(result).toEqual({
      requestedScriptId: 'sync-tags',
      executedScriptIds: ['sync-tags'],
      success: true,
      durationMs: 12,
    })
    expect(runRequestedSync).toHaveBeenCalledWith('sync-tags')
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
  })
})
