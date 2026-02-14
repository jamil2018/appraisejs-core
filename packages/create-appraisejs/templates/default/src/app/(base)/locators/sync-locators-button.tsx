'use client'

import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { syncLocatorsFromFilesAction } from '@/actions/locator/locator-actions'
import { toast } from '@/hooks/use-toast'
import { useRouter } from 'next/navigation'

export function SyncLocatorsButton() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSync = async () => {
    setIsLoading(true)
    try {
      const result = await syncLocatorsFromFilesAction()

      if (result.status === 200 && result.data) {
        const { synced, conflicts, errors } = result.data as {
          synced: number
          conflicts: number
          errors: string[]
        }

        if (errors.length > 0) {
          toast({
            variant: 'destructive',
            title: 'Sync completed with errors',
            description: `Synced ${synced} locators, ${conflicts} conflicts detected. ${errors.length} error(s) occurred.`,
          })
        } else {
          toast({
            title: 'Sync completed successfully',
            description: `Synced ${synced} locators, ${conflicts} conflicts detected.`,
          })
        }

        // Refresh the page to show updated data
        router.refresh()
      } else {
        toast({
          variant: 'destructive',
          title: 'Sync failed',
          description: result.error || 'An error occurred during sync',
        })
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Sync failed',
        description: `An error occurred: ${error}`,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button onClick={handleSync} disabled={isLoading} variant="outline">
      <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
      {isLoading ? 'Syncing...' : 'Sync Locators'}
    </Button>
  )
}

