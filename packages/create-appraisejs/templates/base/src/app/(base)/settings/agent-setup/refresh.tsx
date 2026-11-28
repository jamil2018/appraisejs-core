'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function AgentSetupRefresh() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
      {pending ? 'Checking…' : 'Check again'}
    </Button>
  )
}
