'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
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
  const cleanup = (data as { cleanup?: { browser: string; execution: string } } | null)?.cleanup
  return cleanup
    ? `Owned browser cleanup: ${cleanup.browser.toLowerCase()}; execution cleanup: ${cleanup.execution.toLowerCase()}. External Codex task status is unknown.`
    : 'Operational status updated.'
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
    })
  }
  return { error, observation, pending, submit }
}

export function JourneyRecoveryPanel(props: Props) {
  const [reason, setReason] = useState('')
  const operation = props.status === 'PAUSED' ? 'resume' : 'pause'
  const { error, observation, pending, submit } = useRecoverySubmission(props, operation, reason)
  if (props.status === 'CLOSED') return null

  return (
    <Card aria-label="Journey operational recovery">
      <CardHeader>
        <CardTitle>{props.status === 'PAUSED' ? 'Journey paused' : 'Operational control'}</CardTitle>
        <CardDescription>
          {props.status === 'PAUSED'
            ? 'Resume after owned browser and execution cleanup has been reconciled. Accepted decisions and artifacts remain available.'
            : 'Pause new journey work and request cleanup of Appraise-owned browser and execution processes. An external Codex task cannot be stopped here.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {operation === 'pause' ? (
          <Textarea
            aria-label="Pause reason"
            disabled={pending}
            maxLength={1000}
            onChange={event => setReason(event.target.value)}
            placeholder="Why are you pausing this journey?"
            value={reason}
          />
        ) : null}
        <Button
          disabled={pending || (operation === 'pause' && !reason.trim())}
          onClick={submit}
          type="button"
          variant="outline"
        >
          {pending ? 'Working…' : operation === 'pause' ? 'Pause journey' : 'Resume journey'}
        </Button>
        {observation ? (
          <p className="text-sm text-muted-foreground" role="status">
            {observation}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
