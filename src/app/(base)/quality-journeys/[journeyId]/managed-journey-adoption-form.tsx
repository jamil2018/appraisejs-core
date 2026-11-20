'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'

export function ManagedJourneyAdoptionForm({
  adopt,
  previouslyOwned = false,
}: {
  adopt: () => Promise<string | null>
  previouslyOwned?: boolean
}) {
  const [error, submit, pending] = useActionState(adopt, null)
  return (
    <form action={submit} className="space-y-2">
      <p>
        Move this paused Journey to AppraiseJS management. Its brief and history stay together, and previous desktop
        tickets are retired.{' '}
        {previouslyOwned ? 'The reviewed coordinator is replaced only after its effects are reconciled.' : ''} Worker
        availability is checked separately.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? 'Migrating…' : 'Migrate to AppraiseJS management'}
      </Button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
