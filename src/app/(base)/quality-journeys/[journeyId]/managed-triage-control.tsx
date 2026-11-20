'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  startQualityJourneyManagedTriageAction,
  recoverQualityJourneyManagedTriageAction,
} from '../quality-journey-managed-triage-actions'

type ManagedTriageControlProps = {
  journeyId: string
  stateHash: string
  enabled: boolean
  recovery?: { attemptId: string; candidateHash: string } | null
}

export function ManagedTriageControl({ journeyId, stateHash, enabled, recovery }: ManagedTriageControlProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const consumed = useRef(false)
  const [submitted, setSubmitted] = useState(false)
  return (
    <div className="space-y-2">
      <Button
        disabled={(!enabled && !recovery) || pending || submitted}
        onClick={() => {
          if (consumed.current) return
          consumed.current = true
          setSubmitted(true)
          startTransition(async () => {
            try {
              const result = recovery
                ? await recoverQualityJourneyManagedTriageAction({
                    journeyId,
                    expectedStateHash: stateHash,
                    ...recovery,
                  })
                : await startQualityJourneyManagedTriageAction({ journeyId, expectedStateHash: stateHash })
              setMessage(
                result.success
                  ? 'Report received. Review the exact report below before deciding how to continue.'
                  : (result.error ?? 'Triage needs recovery. Reload to inspect its current state.'),
              )
            } catch {
              setMessage(
                'The triage response was interrupted. Reload to inspect its current state before taking further action.',
              )
            }
            router.refresh()
          })
        }}
      >
        {pending
          ? 'Reviewing sealed evidence…'
          : recovery
            ? 'Recover the saved report without another AI request'
            : 'Analyze sealed run evidence with local Codex'}
      </Button>
      {!enabled && !recovery ? (
        <p className="text-sm text-muted-foreground">The Appraise server owner must enable local Codex triage.</p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Codex proposes a report from sealed run evidence. Report review and Journey closure remain your decisions.
      </p>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </div>
  )
}
