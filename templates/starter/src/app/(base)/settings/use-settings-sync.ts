'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { getSyncPendingCountsAction, runSyncAction } from '@/actions/settings/sync-actions'
import { toast } from '@/hooks/use-toast'
import type { SyncPendingCounts } from '@/lib/sync/sync-pending-counts'
import type { SyncRequestId } from '@/lib/sync/sync-registry'

import { formatExecutionSummary, formatFailureSummary, type SyncRunResult } from './settings-sync-panel-helpers'

type UseSettingsSyncOptions = {
  initialPendingCounts: SyncPendingCounts
}

export function useSettingsSync({ initialPendingCounts }: UseSettingsSyncOptions) {
  const router = useRouter()
  const [activeRequestId, setActiveRequestId] = useState<SyncRequestId | null>(null)
  const [pendingCounts, setPendingCounts] = useState<SyncPendingCounts>(initialPendingCounts)

  const runSync = async (requestId: SyncRequestId) => {
    if (activeRequestId) {
      return
    }

    setActiveRequestId(requestId)

    try {
      const result = (await runSyncAction(requestId)) as SyncRunResult

      if (result.success) {
        const refreshedCounts = await getSyncPendingCountsAction()
        setPendingCounts(refreshedCounts)
        toast({
          title: 'Sync completed',
          description: formatExecutionSummary(result),
        })
      } else {
        toast({
          variant: 'destructive',
          title: 'Sync failed',
          description: formatFailureSummary(result),
        })
      }

      router.refresh()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Sync failed',
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setActiveRequestId(null)
    }
  }

  return {
    activeRequestId,
    isRunning: activeRequestId !== null,
    pendingCounts,
    runSync,
  }
}
