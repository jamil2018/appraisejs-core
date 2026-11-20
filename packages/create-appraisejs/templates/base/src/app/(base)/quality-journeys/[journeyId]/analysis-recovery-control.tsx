'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  readJourneyAnalysisRecovery,
  resumeJourneyAnalysis,
  type AnalysisRecoveryChoice,
} from '../quality-journey-analysis-recovery-actions'
import { useJourneyStatusObservationContext } from './journey-status-observation'

export function AnalysisRecoveryControl({ journeyId }: { journeyId: string }) {
  const { snapshot } = useJourneyStatusObservationContext()
  const activity = snapshot?.activity
  const hash = snapshot?.lifecycle.stateHash
  const stalledAttempt = activity?.role === 'REQUIREMENT_ANALYZER' && activity.needsRecovery ? activity.id : null
  const checkRecovery =
    snapshot?.lifecycle.status === 'ACTIVE' &&
    ['ANALYSIS', 'ANALYSIS_REVIEW'].includes(snapshot.lifecycle.stage) &&
    (Boolean(stalledAttempt) || (!activity && snapshot.runtimeStatus === 'RECOVERY'))
  if (!checkRecovery || !hash) return null
  return (
    <RecoveryButton
      key={JSON.stringify([journeyId, hash, stalledAttempt])}
      journeyId={journeyId}
      hash={hash}
      stalledAttempt={stalledAttempt}
    />
  )
}

function RecoveryButton({
  journeyId,
  hash,
  stalledAttempt,
}: {
  journeyId: string
  hash: string
  stalledAttempt: string | null
}) {
  const [choice, setChoice] = useState<AnalysisRecoveryChoice | null>(null)
  const [message, setMessage] = useState('')
  const [request, setRequest] = useState(0)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  useEffect(() => {
    let active = true

    readJourneyAnalysisRecovery({ journeyId, expectedStateHash: hash })
      .then(option => {
        if (active && option && (!stalledAttempt || option.attemptId === stalledAttempt)) setChoice(option)
      })
      .catch(() => {
        if (active) setMessage('Couldn’t check recovery options. Refresh to try again.')
      })
    return () => {
      active = false
    }
  }, [stalledAttempt, hash, journeyId, request])
  const recover = () =>
    startTransition(async () => {
      if (!choice) return
      setMessage('')
      try {
        const result = await resumeJourneyAnalysis({ journeyId, expectedStateHash: hash, recovery: choice })
        if (!result.success)
          setMessage(('error' in result && result.error) || 'The journey changed. Check its current status.')
      } catch {
        setMessage('Connection interrupted. Check the journey status before retrying.')
      }
      setChoice(null)
      setRequest(n => n + 1)
      router.refresh()
    })
  return (
    <>
      {choice && (!stalledAttempt || choice.attemptId === stalledAttempt) && (
        <Button onClick={recover} disabled={pending}>
          {pending ? 'Resuming…' : choice.kind === 'saved' ? 'Finish saving criteria' : 'Resume criteria revision'}
        </Button>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </>
  )
}
