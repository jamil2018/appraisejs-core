import Link from 'next/link'
import type { ReactNode } from 'react'

import type { readConversationExecution } from '@/services/conversation/conversation-execution-service'

type Permission = NonNullable<Awaited<ReturnType<typeof readConversationExecution>>['permission']>

function label(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replaceAll('_', ' ')
}

export function ChatRunPermissionCard({
  permission,
  projectId,
  journeyId,
  action,
}: {
  permission: Permission
  projectId: string
  journeyId: string
  action?: ReactNode
}) {
  const checkpoint = /^START_EXECUTION:(.+):(CHROMIUM|FIREFOX|WEBKIT)$/.exec(permission.scope.checkpoint)
  const journeyHref = `/quality-journeys/${encodeURIComponent(journeyId)}?project=${encodeURIComponent(projectId)}#execution`

  return (
    <article
      aria-label="Run permission"
      data-journey-focus="run-permission"
      className="space-y-3 rounded-xl border border-border bg-card px-4 py-3"
    >
      <h2 className="text-sm font-semibold">Run permission</h2>
      <p className="text-sm">{permission.reason}</p>
      {permission.status === 'GRANTED' && (
        <p role="status" className="text-sm text-info">
          Permission is recorded for the original attempt. Appraise is checking its run state.
        </p>
      )}
      {(permission.stale || permission.expired) && (
        <p role="alert" className="text-sm text-warning">
          {permission.expired ? 'This permission expired.' : 'The reviewed run scope changed.'} Refresh the Journey
          before requesting permission again.
        </p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Target</dt>
        <dd className="break-words">{permission.target ?? 'Selected project'}</dd>
        <dt className="text-muted-foreground">Environment</dt>
        <dd className="break-all">{permission.environment?.name ?? checkpoint?.[1] ?? permission.scope.checkpoint}</dd>
        {permission.environment?.baseUrl && (
          <>
            <dt className="text-muted-foreground">Site</dt>
            <dd className="break-all">{permission.environment.baseUrl}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Browser</dt>
        <dd>{label(permission.environment?.browserEngine ?? checkpoint?.[2] ?? '')}</dd>
        <dt className="text-muted-foreground">Prepared tests</dt>
        <dd>{permission.scope.preparedRuntimeCapsuleIds.length}</dd>
        <dt className="text-muted-foreground">Effects</dt>
        <dd>{permission.scope.actions.map(label).join(', ')}</dd>
      </dl>
      <ul aria-label="Approved tests" className="list-disc space-y-1 ps-5 text-sm [overflow-wrap:anywhere]">
        {permission.scenarios.map(scenario => (
          <li key={scenario.preparedRuntimeCapsuleId}>
            {scenario.title ?? scenario.scenarioRevisionId ?? scenario.preparedRuntimeCapsuleId}
          </li>
        ))}
      </ul>
      <details className="text-xs text-muted-foreground">
        <summary className="app-focus w-fit cursor-pointer rounded-md">Exact reviewed scope</summary>
        <dl className="mt-2 space-y-1">
          <dt>Prepared test IDs</dt>
          <dd className="break-all">{permission.scope.preparedRuntimeCapsuleIds.join(', ')}</dd>
          <dt>Scope hash</dt>
          <dd className="break-all font-mono">{permission.scopeHash}</dd>
          <dt>Execution inputs hash</dt>
          <dd className="break-all font-mono">{permission.scope.executionInputsHash}</dd>
        </dl>
      </details>
      <div className="flex flex-wrap items-center gap-3">
        {action}
        <Link
          href={journeyHref}
          className="app-focus rounded-sm text-sm text-info underline underline-offset-4 hover:text-foreground"
        >
          Review run details
        </Link>
      </div>
    </article>
  )
}
