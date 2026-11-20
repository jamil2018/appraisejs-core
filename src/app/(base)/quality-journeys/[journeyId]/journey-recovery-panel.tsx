'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { qualityJourneyRecoveryAction } from '../quality-journey-recovery-actions'

type Props = {
  journeyId: string
  status: string
  stateHash: string
  version: number
}
type Operation = 'pause' | 'resume'
type PendingRequest = { operation: Operation; key: string; reason: string; stateHash: string; version: number }

function cleanupSummary(data: unknown) {
  const cleanup = (data as { cleanup?: { browser: string; execution: string; managedTurn?: string } } | null)?.cleanup
  if (cleanup?.execution === 'UNKNOWN') return 'Appraise is checking whether the test run stopped.'
  if (cleanup?.managedTurn === 'UNKNOWN' || cleanup?.browser === 'UNKNOWN')
    return 'Appraise is checking whether the previous work stopped.'
  return null
}

function useRecoverySubmission(props: Props, operation: Operation, reason: string) {
  const [error, setError] = useState<string | null>(null)
  const [observation, setObservation] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const request = useRef<PendingRequest | null>(null)
  const router = useRouter()

  function submit() {
    if (pending) return
    const previous = request.current
    const stable: PendingRequest =
      previous?.operation === operation && previous.reason === reason
        ? previous
        : { operation, key: crypto.randomUUID(), reason, stateHash: props.stateHash, version: props.version }
    request.current = stable
    setError(null)
    startTransition(async () => {
      try {
        const result = await qualityJourneyRecoveryAction(operation, {
          journeyId: props.journeyId,
          expectedStateHash: stable.stateHash,
          expectedVersion: stable.version,
          idempotencyKey: stable.key,
          ...(operation === 'pause' ? { reason: stable.reason } : {}),
        })
        if (!result.success) {
          setError(result.error ?? 'Unable to change journey operational status.')
          return
        }
        setObservation(cleanupSummary(result.data))
        request.current = null
        router.refresh()
      } catch {
        setError('Connection interrupted. Try again to check the same request.')
      }
    })
  }
  return { error, observation, pending, submit }
}

export function JourneyRecoveryPanel(props: Props) {
  const reason = 'Paused by the user'
  const operation = props.status === 'PAUSED' ? 'resume' : 'pause'
  const { error, observation, pending, submit } = useRecoverySubmission(props, operation, reason)
  if (props.status === 'CLOSED') return null

  return (
    <div className="shrink-0 space-y-2">
      <Button disabled={pending} onClick={submit} type="button" variant="outline" size="sm">
        {pending ? (operation === 'pause' ? 'Pausing…' : 'Resuming…') : operation === 'pause' ? 'Pause' : 'Resume'}
      </Button>
      {observation && (
        <p className="max-w-52 text-sm text-muted-foreground" role="status">
          {observation}
        </p>
      )}
      {error && (
        <p className="max-w-52 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
