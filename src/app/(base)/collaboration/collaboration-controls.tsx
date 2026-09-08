'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, useTransition } from 'react'

import {
  cancelCollaborationAction,
  connectCollaborationAction,
  createCollaborationHandoffAction,
  decideCollaborationAction,
  decideDivergentCollaborationProposalAction,
  issueCollaborationAuthorityReceiptAction,
  executeCollaborationAction,
  prepareCollaborationAction,
  recoverCollaborationFilesystemAction,
  retryCollaborationRemoteCheckAction,
  updateCollaborationPolicyAction,
} from '@/actions/repository-collaboration/collaboration-actions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

function ConnectionPanel({ projectId, status, mutation }: { projectId: string; status: Status; mutation: Mutation }) {
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
      {status.remoteAuthRepairRequired ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <p>
            {status.remoteCheckError ?? 'Repository authentication needs repair before automatic checks can resume.'}
          </p>
          <Button
            className="mt-2"
            disabled={mutation.pending}
            onClick={() => mutation.run(() => retryCollaborationRemoteCheckAction({ targetProjectId: projectId }))}
            type="button"
            variant="outline"
          >
            Retry remote check after repairing credentials
          </Button>
        </div>
      ) : null}
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
  const prepareReceive = () =>
    mutation.run(() =>
      prepareCollaborationAction({
        targetProjectId: projectId,
        intent: 'RECEIVE',
        idempotencyKey: nextIdempotencyKey(),
      }),
    )
  return (
    <section className="bg-card/40 space-y-4 rounded-lg border p-5" aria-labelledby="prepare-heading">
      <div>
        <h2 className="font-semibold" id="prepare-heading">
          Prepare synchronization
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Publishing stages the current local snapshot. Receiving fetches and pins the configured tracked branch before
          preparing a review.
        </p>
      </div>
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
  const [receipt, setReceipt] = useState<{ token: string; request: unknown; expiresAt: string }>()
  const issue = (decision: 'KEEP_LOCAL' | 'USE_INCOMING') =>
    mutation.run(
      () =>
        issueCollaborationAuthorityReceiptAction({
          action: 'DECIDE',
          targetProjectId: projectId,
          operationId: operation.id,
          expectedVersion: operation.version,
          preparedDigest: operation.preparedDigest,
          decisions: operation.reviewItems.map(item => ({ recordKey: item.recordKey, decision })),
        }),
      data => setReceipt(data as { token: string; request: unknown; expiresAt: string }),
    )
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
      <div className="flex flex-wrap gap-2">
        {(['KEEP_LOCAL', 'USE_INCOMING'] as const).map(decision => (
          <Button
            key={`receipt-${decision}`}
            disabled={mutation.pending}
            variant="secondary"
            onClick={() => issue(decision)}
          >
            Create CLI receipt: {decision === 'KEEP_LOCAL' ? 'keep local' : 'use incoming'}
          </Button>
        ))}
      </div>
      {receipt ? (
        <div className="rounded-md border p-3 text-sm" aria-live="polite">
          <p>
            One-action receipt; copy it directly to the CLI header before{' '}
            <time dateTime={receipt.expiresAt}>{receipt.expiresAt}</time>.
          </p>
          <code className="mt-2 block break-all" data-testid="authority-receipt-token">
            {receipt.token}
          </code>
          <Button
            className="mt-2"
            size="sm"
            type="button"
            variant="outline"
            onClick={() => void navigator.clipboard.writeText(receipt.token)}
          >
            Copy receipt
          </Button>
          <pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(receipt.request, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  )
}

function DivergentProposalDecisionButtons({
  projectId,
  operation,
  mutation,
}: {
  projectId: string
  operation: ActiveOperation
  mutation: Mutation
}) {
  if (
    operation.intent !== 'RECONCILE' ||
    operation.state !== 'WAITING_FOR_DECISION' ||
    !operation.divergentReviewDigest
  )
    return null
  const decide = (decision: 'ACCEPT' | 'REJECT') =>
    mutation.run(() =>
      decideDivergentCollaborationProposalAction({
        targetProjectId: projectId,
        operationId: operation.id,
        expectedVersion: operation.version,
        preparedDigest: operation.preparedDigest,
        reviewDigest: operation.divergentReviewDigest,
        decision,
      }),
    )
  return (
    <div className="space-y-2" aria-label="Divergent proposal decision">
      <p className="text-sm text-muted-foreground">
        A worker proposal is waiting for review. Nothing can execute until you accept its exact review digest.
      </p>
      <code className="block break-all text-xs">{operation.divergentReviewDigest}</code>
      <div className="flex flex-wrap gap-2">
        <Button disabled={mutation.pending} onClick={() => decide('ACCEPT')}>
          Accept proposal
        </Button>
        <Button disabled={mutation.pending} onClick={() => decide('REJECT')} variant="outline">
          Reject proposal
        </Button>
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
  if (operation.state !== 'READY' || !operation.preparedDigest || !operation.acceptedDigest) return null
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
      <DivergentProposalDecisionButtons projectId={projectId} operation={operation} mutation={mutation} />
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
      <ConnectionPanel projectId={projectId} status={status} mutation={mutation} />
      <NotificationsPanel status={status} />
      <PreparationPanel projectId={projectId} mutation={mutation} />
      {operation ? <ActiveOperationPanel projectId={projectId} operation={operation} mutation={mutation} /> : null}
      <MutationMessage message={mutation.message} />
    </div>
  )
}
