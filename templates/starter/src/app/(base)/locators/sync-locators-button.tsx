'use client'

import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { runLocatorFileSync } from './locator-file-sync'

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
