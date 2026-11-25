import { ArrowLeft, ArrowUpRight, Paperclip } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'

import PageHeader from '@/components/typography/page-header'
import { requireActiveProject } from '@/lib/active-project'
import { workspaceRecordHref, workspaceRecordLabel, type WorkspaceRecord } from '@/lib/conversation/workspace-records'
import { parseWorkspaceRequest } from '@/lib/conversation/workspace-request'
import { withProjectScope } from '@/lib/project-scope'
import {
  readConversationProviderState,
  type ConversationReadAttempt,
} from '@/services/conversation/conversation-read-service'
import { configuredMacCodexReadExecutable } from '@/services/conversation/codex-read-launcher'
import {
  getLatestConversationJourney,
  getProjectConversation,
  type ConversationMessage,
} from '@/services/conversation/conversation-service'
import {
  chatGptConnection,
  isChatGptConnectionSupported,
} from '@/services/provider-connection/chatgpt-connection-service'
import { getClaudeCodeConnection } from '@/services/provider-connection/claude-code-connection-service'
import { ServiceError } from '@/services/shared/errors'

import { JourneyChatFocus } from '../../quality-journeys/[journeyId]/journey-chat-focus'
import { loadChatAttachment, type ContextParams } from '../chat-attachment'
import { ConversationComposer } from '../conversation-composer'
import {
  ConversationProviderControls,
  ConversationReadStatus,
  VerifyWithProvider,
} from '../conversation-provider-controls'

export const metadata: Metadata = { title: 'Chat' }

function MessageRecord({
  projectId,
  conversationPath,
  record,
}: {
  projectId: string
  conversationPath: string
  record: WorkspaceRecord
}) {
  const attached = new URLSearchParams({ kind: 'test-case', record: record.id })
  return (
    <div className="flex min-w-0 gap-1">
      <Link
        href={workspaceRecordHref(projectId, record)}
        className="app-focus flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm hover:bg-muted"
      >
        <span className="shrink-0 text-xs text-muted-foreground">{workspaceRecordLabel(record.kind)}</span>
        <span className="min-w-0 flex-1 truncate" title={record.title}>
          {record.title}
        </span>
        <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      </Link>
      {record.kind === 'TEST_CASE' && (
        <Link
          href={withProjectScope(`${conversationPath}?${attached}`, projectId)}
          title="Attach case"
          aria-label={`Attach ${record.title}`}
          className="app-focus inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Paperclip aria-hidden="true" className="size-3.5" />
          Attach
        </Link>
      )}
    </div>
  )
}

function Message({
  message,
  projectId,
  conversationPath,
  providerRead,
}: {
  message: ConversationMessage
  projectId: string
  conversationPath: string
  providerRead?: React.ReactNode
}) {
  const fromUser = message.role === 'USER'
  return (
    <li data-role={message.role} className="group flex min-w-0 flex-col gap-2 data-[role=USER]:items-end">
      <span className="text-xs font-medium text-muted-foreground">{fromUser ? 'You' : 'Appraise'}</span>
      <div className="min-w-0 max-w-full space-y-2 rounded-2xl group-data-[role=USER]:bg-muted group-data-[role=USER]:px-3 group-data-[role=USER]:py-2">
        <p className="whitespace-pre-wrap break-words text-base [overflow-wrap:anywhere]">{message.content}</p>
        {message.context && (
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Paperclip aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate" title={message.context.title}>
              {message.context.title}
            </span>
          </p>
        )}
        {message.records.length > 0 && (
          <ul aria-label="Matching project records" className="space-y-1">
            {message.records.map(record => (
              <li key={`${record.kind}:${record.id}`}>
                <MessageRecord record={record} projectId={projectId} conversationPath={conversationPath} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {providerRead}
    </li>
  )
}

const location = z.object({
  conversationId: z.string().uuid(),
  before: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .transform(Number)
    .refine(Number.isSafeInteger)
    .optional(),
})

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>
  searchParams: Promise<ContextParams & { before?: string }>
}) {
  const [{ conversationId }, query] = await Promise.all([params, searchParams])
  const { project, before } = query
  const parsed = location.safeParse({ conversationId, before })
  if (!parsed.success) notFound()
  const scope = await requireActiveProject(project)
  const { conversation, messages } = await getProjectConversation({
    targetProjectId: scope.id,
    conversationId,
    beforeOrdinal: parsed.data.before,
  }).catch(error => {
    if (error instanceof ServiceError && error.code === 'NOT_FOUND') notFound()
    throw error
  })
  const providerScope = { projectId: scope.id, conversationId }
  const serverScope = { targetProjectId: scope.id, conversationId }
  const [context, readState, savedJourney] = await Promise.all([
    loadChatAttachment(scope.id, query),
    readConversationProviderState(
      serverScope,
      messages.map(message => message.id),
    ),
    getLatestConversationJourney(serverScope),
  ])
  const journeyId = context?.kind === 'QUALITY_JOURNEY' ? context.id : savedJourney
  let nativeAvailable = false
  try {
    nativeAvailable = process.platform === 'darwin' && !!configuredMacCodexReadExecutable()
  } catch {
    // Invalid host configuration is presented as unavailable; the action also rejects it.
  }
  const profile =
    readState.readProvider === 'CHATGPT' && isChatGptConnectionSupported()
      ? await chatGptConnection.readLookupProfile()
      : undefined
  const claudeConnected = readState.readProvider === 'CLAUDE' && (await getClaudeCodeConnection()).state === 'connected'
  const selectedEngine = readState.readProvider === 'CLAUDE' ? 'CLAUDE_CODE' : readState.chatGptEngine
  const attempts = new Map(readState.attempts.map(attempt => [attempt.messageId, attempt]))
  const path = `/conversations/${conversation.id}`
  const first = messages[0]?.ordinal ?? 1
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-6rem)] max-w-3xl flex-col gap-5 lg:min-h-[calc(100dvh-2.5rem)]">
      <header className="space-y-2">
        <Link
          href={withProjectScope('/conversations', scope.id)}
          className="app-focus inline-flex items-center gap-2 rounded-lg text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Chats
        </Link>
        <PageHeader className="break-words">{conversation.title}</PageHeader>
        <ConversationProviderControls
          scope={providerScope}
          provider={readState.readProvider}
          engine={selectedEngine}
          nativeAvailable={nativeAvailable}
          profile={profile}
          claudeConnected={claudeConnected}
          blocked={readState.blocked}
        />
      </header>
      {journeyId && <JourneyChatFocus projectId={scope.id} journeyId={journeyId} />}
      <div className="flex flex-1 flex-wrap items-start gap-2 text-sm text-primary">
        {first > 1 && (
          <Link
            className="app-focus rounded-lg hover:underline"
            href={withProjectScope(`${path}?before=${first}`, scope.id)}
          >
            Older messages
          </Link>
        )}
        {before && (
          <Link className="app-focus rounded-lg hover:underline" href={withProjectScope(path, scope.id)}>
            Latest messages
          </Link>
        )}
        <ol className="flex w-full min-w-0 flex-col gap-5 text-foreground" aria-label="Messages">
          {messages.map(message => (
            <Message
              key={message.id}
              message={message}
              projectId={scope.id}
              conversationPath={path}
              providerRead={
                <MessageProviderRead
                  message={message}
                  scope={providerScope}
                  attempt={attempts.get(message.id)}
                  profile={profile}
                  engine={readState.readProvider === 'LOCAL' ? undefined : selectedEngine}
                  claudeConnected={claudeConnected}
                  nativeAvailable={nativeAvailable}
                  blocked={!!readState.blocked}
                />
              }
            />
          ))}
        </ol>
      </div>
      <div className="sticky bottom-0 bg-background pb-2">
        <ConversationComposer
          key={JSON.stringify([conversation.id, context])}
          conversationId={conversation.id}
          projectId={scope.id}
          initialContext={context}
        />
      </div>
    </div>
  )
}

type MessageLookupProps = {
  message: ConversationMessage
  scope: { projectId: string; conversationId: string }
  profile?: { key: string; account?: string }
  engine?: 'RESPONSES' | 'CODEX' | 'CLAUDE_CODE'
  claudeConnected: boolean
  nativeAvailable: boolean
  blocked: boolean
}

function MessageProviderRead({ attempt, ...request }: MessageLookupProps & { attempt?: ConversationReadAttempt }) {
  if (attempt) return <ConversationReadStatus scope={request.scope} attempt={attempt} selectedEngine={request.engine} />
  return <MessageLookupCandidate {...request} />
}

function MessageLookupCandidate({
  message,
  scope,
  profile,
  claudeConnected,
  blocked,
  engine,
  nativeAvailable,
}: MessageLookupProps) {
  if (!engine) return null
  const query = eligibleWorkspaceRequest(message, engine, nativeAvailable)
  if (!query) return null
  return (
    <VerifyWithProvider
      scope={scope}
      messageId={message.id}
      query={query}
      profile={profile}
      claudeConnected={claudeConnected}
      engine={engine}
      blocked={blocked}
    />
  )
}

function eligibleWorkspaceRequest(
  message: ConversationMessage,
  engine: 'RESPONSES' | 'CODEX' | 'CLAUDE_CODE',
  nativeAvailable: boolean,
) {
  if (message.role !== 'USER') return null
  if (engine === 'CODEX' && !nativeAvailable) return null
  return parseWorkspaceRequest(message.content)
}
