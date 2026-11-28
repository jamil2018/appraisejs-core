'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import type { ManagedJourneyProvider } from '@/services/coordinator/app-managed-provider-sender'
import { copyUnstartedManagedJourneyBriefWithAssistantAction } from './guided-copy-action'

export function CopyBriefWithAssistant({
  journeyId,
  projectId,
  provider,
}: {
  journeyId: string
  projectId: string
  provider: ManagedJourneyProvider
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const consumed = useRef(false)
  const name = provider === 'CLAUDE_CODE' ? 'Claude Code' : 'Codex'

  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending || submitted}
        onClick={() => {
          if (consumed.current) return
          consumed.current = true
          setSubmitted(true)
          startTransition(async () => {
            try {
              const response = await copyUnstartedManagedJourneyBriefWithAssistantAction({
                journeyId,
                idempotencyKey: `copy-brief:${crypto.randomUUID()}`,
                provider,
              })
              const draft =
                response.success && response.data && typeof response.data === 'object' && 'draft' in response.data
                  ? response.data.draft
                  : null
              if (draft && typeof draft === 'object' && 'id' in draft && typeof draft.id === 'string') {
                router.push(
                  `/quality-journeys/drafts/${encodeURIComponent(draft.id)}?project=${encodeURIComponent(projectId)}`,
                )
                return
              }
              setMessage(response.error ?? 'The brief could not be copied. Reload to check your saved drafts.')
            } catch {
              setMessage('The copy response was interrupted. Check saved drafts before trying again.')
            }
          })
        }}
      >
        {pending ? 'Copying brief…' : `Copy brief to a new draft with ${name}`}
      </Button>
      <p className="text-xs text-muted-foreground">The original Journey stays saved with its current assistant.</p>
      {message ? (
        <p role="status" className="text-xs text-warning">
          {message}
        </p>
      ) : null}
    </div>
  )
}
