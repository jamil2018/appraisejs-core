'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { startQualityJourneyManagedAnalysisAction } from '../quality-journey-managed-analysis-actions'

export function ManagedAnalysisControl({
  journeyId,
  stateHash,
  enabled,
  provider = 'CODEX',
}: {
  journeyId: string
  stateHash: string
  enabled: boolean
  provider?: 'CODEX' | 'CLAUDE_CODE'
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const consumed = useRef(false)
  const [submitted, setSubmitted] = useState(false)
  return (
    <div className="space-y-2">
      <Button
        disabled={!enabled || pending || submitted}
        onClick={() => {
          if (consumed.current) return
          consumed.current = true
          setSubmitted(true)
          startTransition(async () => {
            try {
              const result = await startQualityJourneyManagedAnalysisAction({ journeyId, expectedStateHash: stateHash })
              setMessage(
                result.success
                  ? 'Analysis received. Review the proposed test approach and any questions below.'
                  : (result.error ?? 'Analysis needs recovery. Reload to inspect its current state.'),
              )
            } catch {
              setMessage(
                'The Analysis response was interrupted. Reload to inspect its current state before taking further action.',
              )
            }
            router.refresh()
          })
        }}
      >
        {pending
          ? 'Analyzing your brief…'
          : `Analyze brief with local ${provider === 'CLAUDE_CODE' ? 'Claude Code' : 'Codex'}`}
      </Button>
      {!enabled ? (
        <p className="text-sm text-muted-foreground">
          {provider === 'CLAUDE_CODE' ? 'Claude Code' : 'Codex'} is unavailable for this step. Check assistant setup on
          the Journey page.
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {provider === 'CLAUDE_CODE' ? 'Claude Code' : 'Codex'} proposes a test approach for you to review and approve.
      </p>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </div>
  )
}
