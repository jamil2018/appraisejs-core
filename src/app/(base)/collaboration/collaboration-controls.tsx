'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, useTransition } from 'react'

import {
  cancelCollaborationAction,
  connectCollaborationAction,
  createCollaborationHandoffAction,
  decideCollaborationAction,
  executeCollaborationAction,
  prepareCollaborationAction,
  recoverCollaborationFilesystemAction,
  updateCollaborationPolicyAction,
} from '@/actions/repository-collaboration/collaboration-actions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { getCollaborationStatus } from '@/services/repository-collaboration'
import type { ActionResponse } from '@/types/form/actionHandler'

type Status = NonNullable<Awaited<ReturnType<typeof getCollaborationStatus>>>
type ActiveOperation = Status['operations'][number]
type Mutation = ReturnType<typeof useCollaborationMutation>

function useCollaborationMutation() {
  const router = useRouter()
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  const run = (operation: () => Promise<ActionResponse>, onSuccess?: (data: ActionResponse['data']) => void) => {
    startTransition(async () => {
      const response = await operation()
      setMessage(response.success ? 'Saved.' : (response.error ?? 'The operation failed.'))
      if (response.success) {
        onSuccess?.(response.data)
        router.refresh()
      }
    })
  }
  return { message, pending, run }
}

function MutationMessage({ message }: { message?: string }) {
  return message ? (
    <p role="status" className="text-sm text-muted-foreground">
      {message}
    </p>
  ) : null
}

function ConnectForm({ projectId, mutation }: { projectId: string; mutation: Mutation }) {
  const [trackedBranch, setTrackedBranch] = useState('appraise-0.5')
  const [remoteName, setRemoteName] = useState('origin')
  return (
    <section className="bg-card/40 space-y-4 rounded-lg border p-5" aria-labelledby="connect-heading">
      <div>
        <h2 className="font-semibold" id="connect-heading">
          Connect collaboration agent
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bind this project root to one tracked branch. Observe and prepare permissions start enabled.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="trackedBranch">Tracked branch</Label>
          <Input
            id="trackedBranch"
            name="trackedBranch"
            onChange={event => setTrackedBranch(event.target.value)}
            required
            value={trackedBranch}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="remoteName">Remote</Label>
          <Input
            id="remoteName"
            name="remoteName"
            onChange={event => setRemoteName(event.target.value)}
            required
            value={remoteName}
          />
        </div>
      </div>
      <Button
        disabled={mutation.pending || !trackedBranch.trim() || !remoteName.trim()}
        onClick={() =>
          mutation.run(() => connectCollaborationAction({ targetProjectId: projectId, trackedBranch, remoteName }))
        }
        type="button"
      >
        {mutation.pending ? 'Connecting…' : 'Connect'}
      </Button>
      <MutationMessage message={mutation.message} />
    </section>
  )
}

function PermissionPanel({ projectId, status, mutation }: { projectId: string; status: Status; mutation: Mutation }) {
  return (
    <section className="bg-card/40 space-y-3 rounded-lg border p-5" aria-labelledby="permissions-heading">
      <div>
        <h2 className="font-semibold" id="permissions-heading">
          Standing permissions
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Mutation permissions remain off until you enable them here.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {status.grants.map(grant => (
          <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm" key={grant.permission}>
            <Checkbox
              checked={grant.enabled}
              disabled={mutation.pending}
              onCheckedChange={checked =>
                mutation.run(() =>
                  updateCollaborationPolicyAction({
                    targetProjectId: projectId,
                    changes: { [grant.permission]: checked === true },
                  }),
                )
              }
            />
            {grant.permission.toLowerCase().replaceAll('_', ' ')}
          </label>
        ))}
      </div>
    </section>
  )
}

function ConnectionPanel({ status }: { status: Status }) {
  const { connection } = status
  return (
    <section className="bg-card/40 space-y-3 rounded-lg border p-5" aria-labelledby="connection-mode-heading">
      <div>
        <h2 className="font-semibold" id="connection-mode-heading">
          Agent connection
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {connection.workerAvailable
            ? 'A registered worker is currently available for queued collaboration work.'
            : 'No worker is currently available. Continue with agent creates one prepared, single-use handoff token.'}
        </p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Mode</dt>
          <dd className="mt-1 font-medium">{connection.mode.replaceAll('_', ' ')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Native wake</dt>
          <dd className="mt-1">{connection.nativeWakeSupported ? 'Verified' : 'Not available'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Observed capabilities</dt>
          <dd className="mt-1">
            {connection.observedCapabilities.length ? connection.observedCapabilities.join(', ') : 'None'}
          </dd>
        </div>
      </dl>
    </section>
  )
}

function NotificationsPanel({ status }: { status: Status }) {
  const actionable = status.notifications.filter(notification => notification.actionable)
  if (!actionable.length) return null
  return (
    <section
      className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5"
      aria-label="Actionable collaboration notifications"
    >
      <h2 className="font-semibold">Needs attention</h2>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        {actionable.map(notification => (
          <li key={notification.id}>{notification.message}</li>
        ))}
      </ul>
    </section>
  )
}

function PreparationPanel({ projectId, mutation }: { projectId: string; mutation: Mutation }) {
  const [incoming, setIncoming] = useState('[]')
  const idPrefix = useId()
  const requestSequence = useRef(0)
  const nextIdempotencyKey = () => `${idPrefix}-${++requestSequence.current}`
  const preparePublication = () =>
    mutation.run(() =>
      prepareCollaborationAction({
        targetProjectId: projectId,
        intent: 'PUBLISH',
        idempotencyKey: nextIdempotencyKey(),
      }),
    )
  const prepareReceive = () => {
    try {
      const incomingRecords = JSON.parse(incoming) as unknown
      mutation.run(() =>
        prepareCollaborationAction({
          targetProjectId: projectId,
          intent: 'RECEIVE',
          idempotencyKey: nextIdempotencyKey(),
          incomingRecords,
        }),
      )
    } catch {
      mutation.run(async () => ({ status: 400, success: false, error: 'Incoming records must be valid JSON.' }))
    }
  }
  return (
    <section className="bg-card/40 space-y-4 rounded-lg border p-5" aria-labelledby="prepare-heading">
      <div>
        <h2 className="font-semibold" id="prepare-heading">
          Prepare synchronization
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Publishing prepares the current local snapshot. Receiving validates an exact JSON record array.
        </p>
      </div>
      <Textarea
        aria-label="Incoming collaboration records"
        className="min-h-28 font-mono text-xs"
        value={incoming}
        onChange={event => setIncoming(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button disabled={mutation.pending} onClick={preparePublication}>
          Prepare publication
        </Button>
        <Button disabled={mutation.pending} variant="outline" onClick={prepareReceive}>
          Prepare receive
        </Button>
      </div>
    </section>
  )
}

function DecisionButtons({
  projectId,
  operation,
  mutation,
}: {
  projectId: string
  operation: ActiveOperation
  mutation: Mutation
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm">{operation.reviewItems.length} records require one exact whole-record decision.</p>
      <div className="flex flex-wrap gap-2">
        {(['KEEP_LOCAL', 'USE_INCOMING'] as const).map(decision => (
          <Button
            key={decision}
            disabled={mutation.pending}
            variant="outline"
            onClick={() =>
              mutation.run(() =>
                decideCollaborationAction({
                  targetProjectId: projectId,
                  operationId: operation.id,
                  expectedVersion: operation.version,
                  preparedDigest: operation.preparedDigest,
                  decisions: operation.reviewItems.map(item => ({ recordKey: item.recordKey, decision })),
                }),
              )
            }
          >
            {decision === 'KEEP_LOCAL' ? 'Keep all local' : 'Use all incoming'}
          </Button>
        ))}
      </div>
    </div>
  )
}

function ExecutionButton({
  projectId,
  operation,
  mutation,
}: {
  projectId: string
  operation: ActiveOperation
  mutation: Mutation
}) {
  if (operation.state !== 'READY' || !operation.preparedDigest) return null
  return (
    <Button
      disabled={mutation.pending}
      onClick={() =>
        mutation.run(() =>
          executeCollaborationAction({
            targetProjectId: projectId,
            operationId: operation.id,
            expectedVersion: operation.version,
            preparedDigest: operation.preparedDigest,
            idempotencyKey: operation.idempotencyKey,
          }),
        )
      }
    >
      Execute accepted operation
    </Button>
  )
}

function RecoveryButton({
  projectId,
  operation,
  mutation,
}: {
  projectId: string
  operation: ActiveOperation
  mutation: Mutation
}) {
  if (operation.state !== 'BLOCKED') return null
  return (
    <Button
      disabled={mutation.pending}
      variant="outline"
      onClick={() =>
        mutation.run(() =>
          recoverCollaborationFilesystemAction({ targetProjectId: projectId, operationId: operation.id }),
        )
      }
    >
      Recover filesystem boundary
    </Button>
  )
}

function HandoffPanel({
  projectId,
  operation,
  mutation,
}: {
  projectId: string
  operation: ActiveOperation
  mutation: Mutation
}) {
  const [handoff, setHandoff] = useState<{ token: string; bootstrap: string; expiresAt: string }>()
  const copy = async () => {
    if (!handoff) return
    await navigator.clipboard.writeText(handoff.bootstrap)
  }
  return (
    <div className="space-y-2 border-t pt-3">
      {!handoff ? (
        <Button
          disabled={mutation.pending}
          onClick={() =>
            mutation.run(
              () => createCollaborationHandoffAction({ targetProjectId: projectId, operationId: operation.id }),
              data => {
                const value = data as Partial<{ token: string; bootstrap: string; expiresAt: string }> | undefined
                if (value?.token && value.bootstrap && value.expiresAt) {
                  setHandoff({ token: value.token, bootstrap: value.bootstrap, expiresAt: value.expiresAt })
                }
              },
            )
          }
          variant="outline"
        >
          Continue with agent
        </Button>
      ) : (
        <div className="bg-muted/40 space-y-2 rounded-md p-3 text-sm">
          <p>
            Single-use handoff token (expires <time dateTime={handoff.expiresAt}>{handoff.expiresAt}</time>):
          </p>
          <code className="block break-all rounded bg-background p-2 text-xs">{handoff.token}</code>
          <Button onClick={copy} size="sm" type="button" variant="outline">
            Copy prepared handoff
          </Button>
          <p className="text-muted-foreground">This prepares a handoff only; it does not wake or launch an agent.</p>
        </div>
      )}
    </div>
  )
}

function CancelButton({
  projectId,
  operation,
  mutation,
}: {
  projectId: string
  operation: ActiveOperation
  mutation: Mutation
}) {
  if (['COMPLETED', 'CANCELLED', 'SUPERSEDED'].includes(operation.state)) return null
  return (
    <Button
      disabled={mutation.pending}
      onClick={() =>
        mutation.run(() => cancelCollaborationAction({ targetProjectId: projectId, operationId: operation.id }))
      }
      type="button"
      variant="ghost"
    >
      Cancel operation
    </Button>
  )
}

function ActiveOperationPanel({
  projectId,
  operation,
  mutation,
}: {
  projectId: string
  operation: ActiveOperation
  mutation: Mutation
}) {
  return (
    <section className="bg-card/40 space-y-3 rounded-lg border p-5" aria-labelledby="active-operation-heading">
      <div>
        <h2 className="font-semibold" id="active-operation-heading">
          Active operation
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {operation.intent} · {operation.state} · {operation.changeCount} reviewed records
        </p>
      </div>
      {operation.reviewItems.length ? (
        <DecisionButtons projectId={projectId} operation={operation} mutation={mutation} />
      ) : null}
      <ExecutionButton projectId={projectId} operation={operation} mutation={mutation} />
      <RecoveryButton projectId={projectId} operation={operation} mutation={mutation} />
      <HandoffPanel projectId={projectId} operation={operation} mutation={mutation} />
      <CancelButton projectId={projectId} operation={operation} mutation={mutation} />
    </section>
  )
}

function activeOperation(status: Status) {
  return status.operations.find(operation =>
    ['WAITING_FOR_AGENT', 'WAITING_FOR_DECISION', 'READY', 'APPLYING', 'BLOCKED'].includes(operation.state),
  )
}

export function CollaborationControls({ projectId, status }: { projectId: string; status: Status | null }) {
  const mutation = useCollaborationMutation()
  const { refresh } = useRouter()
  useEffect(() => {
    if (!status?.operations.some(operation => ['WAITING_FOR_AGENT', 'APPLYING'].includes(operation.state))) return
    const interval = window.setInterval(refresh, 10_000)
    return () => window.clearInterval(interval)
  }, [refresh, status])
  if (!status) return <ConnectForm projectId={projectId} mutation={mutation} />
  const operation = activeOperation(status)
  return (
    <div className="space-y-5">
      <PermissionPanel projectId={projectId} status={status} mutation={mutation} />
      <ConnectionPanel status={status} />
      <NotificationsPanel status={status} />
      <PreparationPanel projectId={projectId} mutation={mutation} />
      {operation ? <ActiveOperationPanel projectId={projectId} operation={operation} mutation={mutation} /> : null}
      <MutationMessage message={mutation.message} />
    </div>
  )
}
