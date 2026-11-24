'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'

import {
  acknowledgeUnconfirmedRead,
  runConversationChatGptLookup,
  selectConversationReadProvider,
} from '@/actions/conversation/conversation-read-actions'
import { Button } from '@/components/ui/button'
import { workspaceRecordHref, workspaceRecordLabel, type WorkspaceRecord } from '@/lib/conversation/workspace-records'
import type { WorkspaceRequest } from '@/lib/conversation/workspace-request'
import type { ConversationReadAttempt } from '@/services/conversation/conversation-read-service'

type Scope = { projectId: string; conversationId: string }
type Profile = { key: string; account?: string }
type Action = () => Promise<{ success: true } | { success: false; error: string }>

function ReadAction({
  children,
  action,
  disabled,
  variant = 'outline',
}: {
  children: ReactNode
  action: Action
  disabled?: boolean
  variant?: 'outline' | 'default'
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function send() {
    setError('')
    startTransition(async () => {
      try {
        const response = await action()
        if (!response.success) setError(response.error)
      } catch {
        setError('Could not confirm the update. Refresh this chat for the latest status.')
      } finally {
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-1">
      <Button type="button" size="sm" variant={variant} disabled={disabled || pending} onClick={send}>
        {children}
      </Button>
      {pending && (
        <p role="status" className="text-xs text-muted-foreground">
          Updating…
        </p>
      )}
      {error && (
        <p role="alert" className="max-w-sm text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

const lookupProviders = {
  LOCAL: { label: 'Local', next: 'CHATGPT', action: 'Use ChatGPT for lookups' },
  CHATGPT: { label: 'ChatGPT', next: 'LOCAL', action: 'Use local lookups' },
} as const

export function ConversationProviderControls({
  scope,
  provider,
  profile,
  blocked,
}: {
  scope: Scope
  provider: 'LOCAL' | 'CHATGPT'
  profile?: Profile
  blocked?: ConversationReadAttempt
}) {
  const choice = lookupProviders[provider]
  return (
    <section aria-label="Lookup provider" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Lookup provider · {choice.label}</span>
        <ReadAction
          disabled={!!blocked}
          action={() => selectConversationReadProvider({ ...scope, provider: choice.next })}
        >
          {choice.action}
        </ReadAction>
      </div>
      {provider === 'CHATGPT' && !profile && (
        <Link href="/settings" className="app-focus inline-flex rounded-sm text-xs text-primary underline">
          Connect ChatGPT in Settings
        </Link>
      )}
      {blocked && <OutstandingChatGptRead scope={scope} attempt={blocked} />}
    </section>
  )
}

const readStatus = {
  RUNNING: 'ChatGPT lookup in progress',
  COMPLETED: 'ChatGPT lookup complete',
  FAILED: 'ChatGPT lookup failed',
  UNKNOWN: 'ChatGPT lookup outcome unknown',
} as const

function OutstandingChatGptRead({ scope, attempt }: { scope: Scope; attempt: ConversationReadAttempt }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card px-3 py-2 text-xs">
      <p role="status">{readStatus[attempt.state]}</p>
      {attempt.state === 'UNKNOWN' && (
        <>
          <p className="max-w-sm text-muted-foreground">
            The original read will stay unresolved. Acknowledge it to unlock provider selection.
          </p>
          <ReadAction action={() => acknowledgeUnconfirmedRead({ ...scope, attemptId: attempt.id })}>
            Acknowledge unresolved lookup
          </ReadAction>
        </>
      )}
    </div>
  )
}

function VerifiedResults({ projectId, records }: { projectId: string; records: WorkspaceRecord[] }) {
  if (!records.length) return <p className="text-muted-foreground">No matching records.</p>
  return (
    <ul aria-label="Records verified by Appraise" className="space-y-1">
      {records.map(record => (
        <li key={record.kind + ':' + record.id}>
          <Link
            href={workspaceRecordHref(projectId, record)}
            className="app-focus block break-words rounded-sm text-primary hover:underline"
          >
            {record.title}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function ConversationReadStatus({ scope, attempt }: { scope: Scope; attempt: ConversationReadAttempt }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card px-3 py-2 text-xs">
      <p role="status">
        {readStatus[attempt.state]}
        {attempt.released && ' · Acknowledged'}
      </p>
      {attempt.state === 'COMPLETED' && <VerifiedResults projectId={scope.projectId} records={attempt.records} />}
    </div>
  )
}

export function VerifyWithChatGpt({
  scope,
  messageId,
  query,
  profile,
  blocked,
}: {
  scope: Scope
  messageId: string
  query: WorkspaceRequest
  profile: Profile
  blocked: boolean
}) {
  return (
    <details className="max-w-sm space-y-2 self-start rounded-lg border border-border px-3 py-2 text-xs">
      <summary className="app-focus cursor-pointer rounded-sm font-medium">Review ChatGPT lookup</summary>
      <p className="break-words">
        ChatGPT will receive the record type and search terms. Matching records stay in Appraise.
      </p>
      {profile.account && <p className="break-all text-muted-foreground">{profile.account}</p>}
      <p className="break-words text-muted-foreground">
        {workspaceRecordLabel(query.kind)} · {query.query || 'All names'}
      </p>
      <ReadAction
        disabled={blocked}
        variant="default"
        action={() => runConversationChatGptLookup({ ...scope, messageId, profileKey: profile.key })}
      >
        Send lookup to ChatGPT
      </ReadAction>
    </details>
  )
}
