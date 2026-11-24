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
  RESPONSES: {
    label: 'ChatGPT',
    review: 'Review ChatGPT lookup',
    send: 'Send lookup to ChatGPT',
    disclosure: 'ChatGPT will receive the record type and search terms. Matching records stay in Appraise.',
  },
  CODEX: {
    label: 'Codex',
    review: 'Review Codex lookup',
    send: 'Send lookup to Codex',
    disclosure: 'Codex will receive the record type and search terms. Matching records stay in Appraise.',
  },
} as const

type Engine = keyof typeof lookupProviders
type ProviderMode = 'LOCAL' | Engine
type ProviderChoice = { label: string; provider: 'LOCAL' | 'CHATGPT'; engine: Engine }

const providerChoices: Record<ProviderMode, ProviderChoice[]> = {
  LOCAL: [
    { label: 'Use ChatGPT for lookups', provider: 'CHATGPT', engine: 'RESPONSES' },
    { label: 'Use native Codex for lookups', provider: 'CHATGPT', engine: 'CODEX' },
  ],
  RESPONSES: [
    { label: 'Use local lookups', provider: 'LOCAL', engine: 'RESPONSES' },
    { label: 'Use native Codex for lookups', provider: 'CHATGPT', engine: 'CODEX' },
  ],
  CODEX: [
    { label: 'Use local lookups', provider: 'LOCAL', engine: 'RESPONSES' },
    { label: 'Use ChatGPT for lookups', provider: 'CHATGPT', engine: 'RESPONSES' },
  ],
}

function ProviderChoices({
  scope,
  provider,
  engine,
  nativeAvailable,
  blocked,
}: {
  scope: Scope
  provider: 'LOCAL' | 'CHATGPT'
  engine: Engine
  nativeAvailable: boolean
  blocked: boolean
}) {
  const mode = provider === 'LOCAL' ? 'LOCAL' : engine
  const choices = providerChoices[mode].filter(choice => choice.engine !== 'CODEX' || nativeAvailable)
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Lookup provider · {mode === 'LOCAL' ? 'Local' : lookupProviders[mode].label}</span>
      {choices.map(choice => (
        <ReadAction
          key={choice.label}
          disabled={blocked}
          action={() => selectConversationReadProvider({ ...scope, provider: choice.provider, engine: choice.engine })}
        >
          {choice.label}
        </ReadAction>
      ))}
    </div>
  )
}

function ProviderAvailability({
  engine,
  nativeAvailable,
  profile,
}: {
  engine: Engine
  nativeAvailable: boolean
  profile?: Profile
}) {
  return (
    <>
      {!profile && (
        <Link href="/settings" className="app-focus inline-flex rounded-sm text-xs text-primary underline">
          Connect ChatGPT in Settings
        </Link>
      )}
      {engine === 'CODEX' && !nativeAvailable && (
        <p role="alert" className="text-xs text-destructive">
          Native Codex is unavailable in this app session.
        </p>
      )}
    </>
  )
}

export function ConversationProviderControls({
  scope,
  provider,
  engine,
  nativeAvailable,
  profile,
  blocked,
}: {
  scope: Scope
  provider: 'LOCAL' | 'CHATGPT'
  engine: Engine
  nativeAvailable: boolean
  profile?: Profile
  blocked?: ConversationReadAttempt
}) {
  return (
    <section aria-label="Lookup provider" className="space-y-2">
      <ProviderChoices
        scope={scope}
        provider={provider}
        engine={engine}
        nativeAvailable={nativeAvailable}
        blocked={!!blocked}
      />
      {provider === 'CHATGPT' && (
        <ProviderAvailability engine={engine} nativeAvailable={nativeAvailable} profile={profile} />
      )}
      {blocked && <OutstandingChatGptRead scope={scope} attempt={blocked} />}
    </section>
  )
}

function readStatus(attempt: ConversationReadAttempt) {
  return `${lookupProviders[attempt.engine].label} lookup ${
    {
      RUNNING: 'in progress',
      COMPLETED: 'complete',
      FAILED: 'failed',
      UNKNOWN: 'outcome unknown',
    }[attempt.state]
  }`
}

function OutstandingChatGptRead({ scope, attempt }: { scope: Scope; attempt: ConversationReadAttempt }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card px-3 py-2 text-xs">
      <p role="status">{readStatus(attempt)}</p>
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

export function ConversationReadStatus({
  scope,
  attempt,
  selectedEngine,
}: {
  scope: Scope
  attempt: ConversationReadAttempt
  selectedEngine?: Engine
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card px-3 py-2 text-xs">
      <p role="status">
        {readStatus(attempt)}
        {attempt.released && ' · Acknowledged'}
      </p>
      {attempt.state === 'COMPLETED' && <VerifiedResults projectId={scope.projectId} records={attempt.records} />}
      <EngineSwitchHint attempt={attempt} selectedEngine={selectedEngine} />
    </div>
  )
}

function EngineSwitchHint({ attempt, selectedEngine }: { attempt: ConversationReadAttempt; selectedEngine?: Engine }) {
  if (!selectedEngine || selectedEngine === attempt.engine) return null
  return (
    <p className="text-muted-foreground">
      Start a new message to look up with {lookupProviders[selectedEngine].label}.
    </p>
  )
}

export function VerifyWithProvider({
  scope,
  messageId,
  query,
  profile,
  blocked,
  engine,
}: {
  scope: Scope
  messageId: string
  query: WorkspaceRequest
  profile: Profile
  blocked: boolean
  engine: Engine
}) {
  const labels = lookupProviders[engine]
  return (
    <details className="max-w-sm space-y-2 self-start rounded-lg border border-border px-3 py-2 text-xs">
      <summary className="app-focus cursor-pointer rounded-sm font-medium">{labels.review}</summary>
      <p className="break-words">{labels.disclosure}</p>
      {profile.account && <p className="break-all text-muted-foreground">{profile.account}</p>}
      <p className="break-words text-muted-foreground">
        {workspaceRecordLabel(query.kind)} · {query.query || 'All names'}
      </p>
      <ReadAction
        disabled={blocked}
        variant="default"
        action={() => runConversationChatGptLookup({ ...scope, messageId, profileKey: profile.key, engine })}
      >
        {labels.send}
      </ReadAction>
    </details>
  )
}
