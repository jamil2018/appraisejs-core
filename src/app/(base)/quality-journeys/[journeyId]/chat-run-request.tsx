'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'

import { requestChatJourneyExecutionPermission } from '@/actions/conversation/chat-journey-execution-actions'
import { Button } from '@/components/ui/button'
import { useJourneyStatusFreshness } from './journey-status-observation'

type RunRequestProps = {
  conversationId: string
  journeyId: string
  expectedStateHash: string
  environments: Array<{ id: string; name: string }>
}

export function ChatRunRequest(props: RunRequestProps) {
  return (
    <article
      aria-label="Run permission"
      data-journey-focus="run-permission"
      className="space-y-3 rounded-xl border border-border bg-card px-4 py-3"
    >
      <h2 className="text-sm font-semibold">Run permission</h2>
      <ChatRunRequestForm {...props} />
    </article>
  )
}

export function ChatRunRequestForm({ conversationId, journeyId, expectedStateHash, environments }: RunRequestProps) {
  const controlId = useId()
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? '')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { refresh } = useRouter()
  const { newerVersionAvailable, loadNewerVersion } = useJourneyStatusFreshness()

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Choose where the approved tests will run. Appraise will show the exact scope for permission before starting
        them.
      </p>
      <label htmlFor={controlId} className="block text-sm font-medium">
        Environment
      </label>
      <select
        id={controlId}
        className="flex h-9 w-full max-w-sm rounded-lg border border-input bg-background px-3 text-sm"
        value={environmentId}
        onChange={event => setEnvironmentId(event.target.value)}
        disabled={pending}
      >
        {environments.map(environment => (
          <option key={environment.id} value={environment.id}>
            {environment.name}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {newerVersionAvailable ? (
        <Button size="sm" variant="outline" onClick={loadNewerVersion}>
          Load latest Journey
        </Button>
      ) : (
        <Button
          size="sm"
          disabled={!environmentId || pending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              try {
                const result = await requestChatJourneyExecutionPermission({
                  conversationId,
                  journeyId,
                  environmentId,
                  browserEngine: 'CHROMIUM',
                  expectedStateHash,
                })
                if (!result.success) setError(result.error)
                refresh()
              } catch {
                setError(
                  'Appraise could not confirm the request. Refresh to check the saved permission before trying again.',
                )
              }
            })
          }
        >
          {pending ? 'Checking scope…' : 'Review run permission'}
        </Button>
      )}
    </div>
  )
}
