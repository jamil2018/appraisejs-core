'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'

import {
  acknowledgeUnconfirmedRead,
  runConversationChatGptLookup,
  runConversationClaudeCodeLookup,
  runConversationCursorLookup,
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
  CLAUDE_CODE: {
    label: 'Claude Code',
    review: 'Review Claude Code lookup',
    send: 'Send lookup to Claude Code',
    disclosure: 'Claude Code will receive the record type and search terms. Matching records stay in Appraise.',
  },
  CURSOR_CLI: {
    label: 'Cursor',
    review: 'Review Cursor lookup',
    send: 'Send lookup to Cursor',
    disclosure:
      'Cursor will receive a request to confirm the lookup. Search terms and matching records stay in Appraise.',
  },
} as const

type Engine = keyof typeof lookupProviders
type ProviderMode = 'LOCAL' | Engine
type ProviderChoice = { label: string; provider: 'LOCAL' | 'CHATGPT' | 'CLAUDE' | 'CURSOR'; engine: Engine }

const providerChoices: Record<ProviderMode, ProviderChoice[]> = {
  LOCAL: [
    { label: 'Use ChatGPT for lookups', provider: 'CHATGPT', engine: 'RESPONSES' },
    { label: 'Use native Codex for lookups', provider: 'CHATGPT', engine: 'CODEX' },
    { label: 'Use Claude Code for lookups', provider: 'CLAUDE', engine: 'CLAUDE_CODE' },
    { label: 'Use Cursor for lookups', provider: 'CURSOR', engine: 'CURSOR_CLI' },
  ],
  RESPONSES: [
    { label: 'Use local lookups', provider: 'LOCAL', engine: 'RESPONSES' },
    { label: 'Use native Codex for lookups', provider: 'CHATGPT', engine: 'CODEX' },
    { label: 'Use Claude Code for lookups', provider: 'CLAUDE', engine: 'CLAUDE_CODE' },
    { label: 'Use Cursor for lookups', provider: 'CURSOR', engine: 'CURSOR_CLI' },
  ],
  CODEX: [
    { label: 'Use local lookups', provider: 'LOCAL', engine: 'RESPONSES' },
    { label: 'Use ChatGPT for lookups', provider: 'CHATGPT', engine: 'RESPONSES' },
    { label: 'Use Claude Code for lookups', provider: 'CLAUDE', engine: 'CLAUDE_CODE' },
    { label: 'Use Cursor for lookups', provider: 'CURSOR', engine: 'CURSOR_CLI' },
  ],
  CLAUDE_CODE: [
    { label: 'Use local lookups', provider: 'LOCAL', engine: 'RESPONSES' },
    { label: 'Use ChatGPT for lookups', provider: 'CHATGPT', engine: 'RESPONSES' },
    { label: 'Use native Codex for lookups', provider: 'CHATGPT', engine: 'CODEX' },
    { label: 'Use Cursor for lookups', provider: 'CURSOR', engine: 'CURSOR_CLI' },
  ],
  CURSOR_CLI: [
    { label: 'Use local lookups', provider: 'LOCAL', engine: 'RESPONSES' },
    { label: 'Use ChatGPT for lookups', provider: 'CHATGPT', engine: 'RESPONSES' },
    { label: 'Use native Codex for lookups', provider: 'CHATGPT', engine: 'CODEX' },
    { label: 'Use Claude Code for lookups', provider: 'CLAUDE', engine: 'CLAUDE_CODE' },
  ],
}

function selectedMode(provider: 'LOCAL' | 'CHATGPT' | 'CLAUDE' | 'CURSOR', engine: Engine): Engine | 'LOCAL' {
  if (provider === 'LOCAL') return 'LOCAL'
  if (provider === 'CLAUDE') return 'CLAUDE_CODE'
  if (provider === 'CURSOR') return 'CURSOR_CLI'
  return engine
}

function providerConnected(
  engine: Engine,
  profile: Profile | undefined,
  claudeConnected: boolean,
  cursorConnected: boolean,
) {
  if (engine === 'CLAUDE_CODE') return claudeConnected
  if (engine === 'CURSOR_CLI') return cursorConnected
  return !!profile
}

const accountNames: Record<Engine, string> = {
  RESPONSES: 'ChatGPT',
  CODEX: 'ChatGPT',
  CLAUDE_CODE: 'Claude Code',
  CURSOR_CLI: 'Cursor',
}

function ProviderChoices({
  scope,
  provider,
  engine,
  nativeAvailable,
  blocked,
}: {
  scope: Scope
  provider: 'LOCAL' | 'CHATGPT' | 'CLAUDE' | 'CURSOR'
  engine: Engine
  nativeAvailable: boolean
  blocked: boolean
}) {
  const mode = selectedMode(provider, engine)
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
  claudeConnected,
  cursorConnected,
}: {
  engine: Engine
  nativeAvailable: boolean
  profile?: Profile
  claudeConnected: boolean
  cursorConnected: boolean
}) {
  const connectionNeeded = !providerConnected(engine, profile, claudeConnected, cursorConnected)
  const connectionName = accountNames[engine]
  return (
    <>
      {connectionNeeded && (
        <Link href="/settings" className="app-focus inline-flex rounded-sm text-xs text-primary underline">
          Connect {connectionName} in Settings
        </Link>
      )}
      <NativeCodexAvailability engine={engine} available={nativeAvailable} />
    </>
  )
}

function NativeCodexAvailability({ engine, available }: { engine: Engine; available: boolean }) {
  if (engine !== 'CODEX' || available) return null
  return (
    <p role="alert" className="text-xs text-destructive">
      Native Codex is unavailable in this app session.
    </p>
  )
}

export function ConversationProviderControls({
  scope,
  provider,
  engine,
  nativeAvailable,
  profile,
  claudeConnected,
  cursorConnected,
  blocked,
}: {
  scope: Scope
  provider: 'LOCAL' | 'CHATGPT' | 'CLAUDE' | 'CURSOR'
  engine: Engine
  nativeAvailable: boolean
  profile?: Profile
  claudeConnected: boolean
  cursorConnected: boolean
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
      {provider !== 'LOCAL' && (
        <ProviderAvailability
          engine={engine}
          nativeAvailable={nativeAvailable}
          profile={profile}
          claudeConnected={claudeConnected}
          cursorConnected={cursorConnected}
        />
      )}
      {blocked && <OutstandingProviderRead scope={scope} attempt={blocked} />}
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

function OutstandingProviderRead({ scope, attempt }: { scope: Scope; attempt: ConversationReadAttempt }) {
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
  claudeConnected,
  cursorConnected,
  blocked,
  engine,
}: {
  scope: Scope
  messageId: string
  query: WorkspaceRequest
  profile?: Profile
  claudeConnected: boolean
  cursorConnected: boolean
  blocked: boolean
  engine: Engine
}) {
  const labels = lookupProviders[engine]
  const canSend = providerConnected(engine, profile, claudeConnected, cursorConnected)
  return (
    <details className="max-w-sm space-y-2 self-start rounded-lg border border-border px-3 py-2 text-xs">
      <summary className="app-focus cursor-pointer rounded-sm font-medium">{labels.review}</summary>
      <p className="break-words">{labels.disclosure}</p>
      <LookupDetails query={query} account={profile?.account} />
      <ReadAction
        disabled={blocked || !canSend}
        variant="default"
        action={() => sendProviderLookup(scope, messageId, engine, profile?.key)}
      >
        {labels.send}
      </ReadAction>
    </details>
  )
}

function LookupDetails({ query, account }: { query: WorkspaceRequest; account?: string }) {
  return (
    <>
      {account && <p className="break-all text-muted-foreground">{account}</p>}
      <p className="break-words text-muted-foreground">
        {workspaceRecordLabel(query.kind)} · {query.query || 'All names'}
      </p>
    </>
  )
}

function sendProviderLookup(scope: Scope, messageId: string, engine: Engine, profileKey?: string) {
  if (engine === 'CLAUDE_CODE') return runConversationClaudeCodeLookup({ ...scope, messageId, engine })
  if (engine === 'CURSOR_CLI') return runConversationCursorLookup({ ...scope, messageId, engine })
  return runConversationChatGptLookup({ ...scope, messageId, profileKey, engine })
}
