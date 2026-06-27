import { toast } from '@/hooks/use-toast'

export type LocatorSyncPayload = {
  locatorsCreated: number
  locatorsMergedToFile: number
  conflicts: number
  errors: string[]
}

export function showLocatorSyncToast(payload: LocatorSyncPayload, refresh: () => void) {
  if (payload.errors.length > 0) {
    toast({
      variant: 'destructive',
      title: 'Sync completed with errors',
      description: `Created ${payload.locatorsCreated} locators, merged ${payload.locatorsMergedToFile} into files, ${payload.conflicts} conflicts detected. ${payload.errors.length} error(s) occurred.`,
    })
    refresh()
    return
  }

  toast({
    title: 'Sync completed successfully',
    description: `Created ${payload.locatorsCreated} locators, merged ${payload.locatorsMergedToFile} into files, ${payload.conflicts} conflicts detected.`,
  })
  refresh()
}

export function showLocatorSyncFailureToast(description: string) {
  toast({
    variant: 'destructive',
    title: 'Sync failed',
    description,
  })
}
