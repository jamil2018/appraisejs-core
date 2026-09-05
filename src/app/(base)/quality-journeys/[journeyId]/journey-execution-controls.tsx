'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { qualityJourneyExecutionAction } from '../quality-journey-execution-actions'

type Action = Parameters<typeof qualityJourneyExecutionAction>[0]

export function JourneyExecutionCommand({
  action,
  input,
  children,
}: {
  action: Action
  input: Record<string, unknown>
  children: React.ReactNode
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [requestKey] = useState(() => crypto.randomUUID())
  return (
    <div>
      <Button
        disabled={pending}
        size="sm"
        variant="outline"
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await qualityJourneyExecutionAction(action, {
              ...input,
              ...(['consent', 'approve'].includes(action) ? {} : { idempotencyKey: requestKey }),
            })
            if (!result.success) setError(result.error ?? 'The request could not complete. Refresh and retry.')
            router.refresh()
          })
        }
      >
        {pending ? 'Working…' : children}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function JourneyExecutionStartForm({
  journeyId,
  stateHash,
  capsuleIds,
  environments,
  proposalId,
}: {
  journeyId: string
  stateHash: string
  capsuleIds: string[]
  proposalId?: string
  environments: Array<{ id: string; name: string }>
}) {
  const environmentControlId = useId()
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? '')
  if (!capsuleIds.length && !proposalId)
    return (
      <p className="text-sm text-muted-foreground">
        Execution becomes available when all approved scenarios are materialized.
      </p>
    )
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor={environmentControlId}>Execution environment</Label>
        <select
          id={environmentControlId}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={environmentId}
          onChange={event => setEnvironmentId(event.target.value)}
        >
          {environments.map(environment => (
            <option key={environment.id} value={environment.id}>
              {environment.name}
            </option>
          ))}
        </select>
      </div>
      {environmentId ? (
        <JourneyExecutionCommand
          key={`${environmentId}:${stateHash}`}
          action={proposalId ? 'rerun' : 'start'}
          input={{
            journeyId,
            expectedStateHash: stateHash,
            ...(proposalId ? { proposalId } : { preparedRuntimeCapsuleIds: [...capsuleIds].sort() }),
            environmentId,
            browserEngine: 'CHROMIUM',
          }}
        >
          {proposalId ? 'Start approved rerun' : 'Start managed execution'}
        </JourneyExecutionCommand>
      ) : (
        <p className="text-sm">Add a target environment before execution.</p>
      )}
    </div>
  )
}

export function JourneyRerunProposalForm({
  journeyId,
  cycleId,
  evidenceIds,
  scenarioRevisionIds,
}: {
  journeyId: string
  cycleId: string
  evidenceIds: string[]
  scenarioRevisionIds: string[]
}) {
  const [selected, setSelected] = useState<string[]>(scenarioRevisionIds)
  const [reason, setReason] = useState('')
  if (!evidenceIds.length) return null
  return (
    <div className="space-y-3 border-t pt-3">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Select scenarios for a rerun proposal</legend>
        {scenarioRevisionIds.map(id => (
          <label key={id} className="flex items-center gap-2 break-all text-xs">
            <input
              type="checkbox"
              checked={selected.includes(id)}
              onChange={event =>
                setSelected(current =>
                  event.target.checked ? [...current, id] : current.filter(value => value !== id),
                )
              }
            />
            {id}
          </label>
        ))}
      </fieldset>
      <Label htmlFor={`rerun-reason-${cycleId}`}>Reason for rerun</Label>
      <Input
        id={`rerun-reason-${cycleId}`}
        value={reason}
        maxLength={8000}
        onChange={event => setReason(event.target.value)}
      />
      {selected.length && reason.trim() ? (
        <JourneyExecutionCommand
          key={`${selected.join(':')}:${reason}`}
          action="propose"
          input={{
            journeyId,
            sourceCycleId: cycleId,
            sourceEvidenceReceiptIds: [...evidenceIds].sort(),
            selectedScenarioRevisionIds: [...selected].sort(),
            reason,
          }}
        >
          Propose selected rerun
        </JourneyExecutionCommand>
      ) : null}
    </div>
  )
}

export function JourneyLiveRunRefresh() {
  const router = useRouter()
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(timer)
  }, [router])
  return (
    <p role="status" className="text-xs text-muted-foreground">
      Run status refreshes every five seconds.
    </p>
  )
}
