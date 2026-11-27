'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { approveChatJourneyExecutionPermission } from '@/actions/conversation/chat-journey-execution-actions'
import { Button } from '@/components/ui/button'
import { useJourneyStatusFreshness } from './journey-status-observation'

export function ChatRunApproval({
  conversationId,
  journeyId,
  executionConsentId,
  expectedScopeHash,
  resumeGrantedAttempt = false,
}: {
  conversationId: string
  journeyId: string
  executionConsentId: string
  expectedScopeHash: string
  resumeGrantedAttempt?: boolean
}) {
  const { refresh } = useRouter()
  const [pending, startTransition] = useTransition()
  const [unknown, setUnknown] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { newerVersionAvailable, loadNewerVersion } = useJourneyStatusFreshness()

  if (newerVersionAvailable)
    return (
      <Button size="sm" variant="outline" onClick={loadNewerVersion}>
        Load latest Journey
      </Button>
    )

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        disabled={pending || unknown}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            try {
              const result = await approveChatJourneyExecutionPermission({
                conversationId,
                journeyId,
                executionConsentId,
                expectedScopeHash,
              })
              if (!result.success) setError(result.error)
            } catch {
              setUnknown(true)
              setError(
                'Appraise could not confirm the original attempt. Check its saved activity before taking another action.',
              )
            } finally {
              refresh()
            }
          })
        }
      >
        {pending
          ? 'Checking original run…'
          : resumeGrantedAttempt
            ? 'Continue original run'
            : 'Allow and run these tests'}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
