'use client'

import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useTransition } from 'react'
import { syncLocatorsFromFilesAction } from '@/actions/locator/locator-actions'
import { toast } from '@/hooks/use-toast'
import { useRouter } from 'next/navigation'

type LocatorSyncPayload = {
  locatorsCreated: number
  locatorsMergedToFile: number
  conflicts: number
  errors: string[]
}

// fallow-ignore-next-line complexity
async function runLocatorFileSync(refresh: () => void) {
  try {
    const result = await syncLocatorsFromFilesAction()

    if (result.status === 200 && result.data) {
      const { locatorsCreated, locatorsMergedToFile, conflicts, errors } = result.data as LocatorSyncPayload

      if (errors.length > 0) {
        toast({
          variant: 'destructive',
          title: 'Sync completed with errors',
          description: `Created ${locatorsCreated} locators, merged ${locatorsMergedToFile} into files, ${conflicts} conflicts detected. ${errors.length} error(s) occurred.`,
        })
      } else {
        toast({
          title: 'Sync completed successfully',
          description: `Created ${locatorsCreated} locators, merged ${locatorsMergedToFile} into files, ${conflicts} conflicts detected.`,
        })
      }

      refresh()
      return
    }

    toast({
      variant: 'destructive',
      title: 'Sync failed',
      description: result.error || 'An error occurred during sync',
    })
  } catch (error) {
    toast({
      variant: 'destructive',
      title: 'Sync failed',
      description: `An error occurred: ${error}`,
    })
  }
}

export function SyncLocatorsButton() {
  const [isPending, startTransition] = useTransition()
  const { refresh } = useRouter()

  const handleSync = () => {
    startTransition(() => {
      void runLocatorFileSync(refresh)
    })
  }

  return (
    <Button onClick={handleSync} disabled={isPending} variant="outline">
      <RefreshCw className={`size-4 ${isPending ? 'animate-spin' : ''}`} />
      {isPending ? 'Syncing...' : 'Sync Locators'}
    </Button>
  )
}
