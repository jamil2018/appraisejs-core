'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'

export function JourneyProgressNotice({
  eventCount,
  stateHash,
  stage,
}: {
  eventCount: number
  stateHash: string
  stage: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const requestRefresh = () => startTransition(() => router.refresh())

  return (
    <section
      aria-label="Observed journey progress"
      className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border p-3"
    >
      <p aria-live="polite" className="min-w-0 flex-1 text-sm text-muted-foreground" role="status">
        {isPending
          ? 'Refreshing observed lifecycle state.'
          : `Observed ${stage.replaceAll('_', ' ').toLocaleLowerCase()} state with ${eventCount} durable lifecycle event${eventCount === 1 ? '' : 's'}. Refreshes are manual; no polling occurs while you edit a gate form.`}
      </p>
      <Button
        className="shrink-0"
        disabled={isPending}
        onClick={requestRefresh}
        size="sm"
        type="button"
        variant="outline"
      >
        {isPending ? 'Refreshing…' : 'Refresh observed state'}
      </Button>
      <span className="sr-only">Current state hash: {stateHash}</span>
    </section>
  )
}
