'use client'

import { ArrowUp, Paperclip, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition, type FormEvent } from 'react'

import { submitConversationMessage } from '@/actions/conversation/conversation-actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { ChatContext } from '@/lib/conversation/chat-context'
import { workspaceRecordLabel } from '@/lib/conversation/workspace-records'
import { withProjectScope } from '@/lib/project-scope'

function AttachedRecord({ context, onRemove }: { context: ChatContext; onRemove: () => void }) {
  return (
    <div className="mx-1 flex w-fit max-w-full items-center gap-1.5 rounded-lg bg-muted py-1 pl-2 pr-1 text-sm">
      <Paperclip aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-muted-foreground">
        {context.kind === 'QUALITY_JOURNEY' ? 'Quality Journey' : workspaceRecordLabel(context.kind)}
      </span>
      <span className="min-w-0 truncate" title={context.title}>
        {context.title}
      </span>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-6 shrink-0"
        aria-label="Remove attachment"
        onClick={onRemove}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  )
}

export function ConversationComposer({
  projectId,
  conversationId,
  initialContext,
}: {
  projectId: string
  conversationId?: string
  initialContext?: ChatContext
}) {
  const router = useRouter()
  const [content, setContent] = useState('')
  const [context, setContext] = useState(initialContext)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const inFlight = useRef(false)
  const retry = useRef<{ request: string; key: string } | null>(null)

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = content.trim()
    if (inFlight.current || !message) return
    const attachment = context && { kind: context.kind, id: context.id, shownTitle: context.title }
    const request = JSON.stringify({ message, attachment })
    const key = retry.current?.request === request ? retry.current.key : crypto.randomUUID()
    retry.current = { request, key }
    inFlight.current = true
    setError('')

    startTransition(async () => {
      try {
        const response = await submitConversationMessage({
          projectId,
          conversationId,
          idempotencyKey: key,
          content: message,
          context: attachment,
        })
        if (!response.success) {
          setError(response.error)
          return
        }
        retry.current = null
        setContent('')
        setContext(undefined)
        router.replace(withProjectScope(`/conversations/${response.conversationId}`, projectId))
        router.refresh()
      } catch {
        setError('The save could not be confirmed. Retry to recover the same message.')
      } finally {
        inFlight.current = false
      }
    })
  }

  return (
    <form
      onSubmit={send}
      className="space-y-2 rounded-2xl border border-border bg-popover p-2 focus-within:border-input"
    >
      {context && <AttachedRecord context={context} onRemove={() => setContext(undefined)} />}
      <label className="sr-only" htmlFor="conversation-message">
        Message
      </label>
      <Textarea
        id="conversation-message"
        rows={3}
        maxLength={8000}
        placeholder={
          context?.kind === 'TEST_CASE' ? 'Rename this case to …' : 'Ask Appraise to find test cases for checkout…'
        }
        className="min-h-20 resize-y border-transparent bg-transparent px-2 text-base shadow-none"
        value={content}
        onChange={event => setContent(event.target.value)}
        onKeyDown={event => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
          event.preventDefault()
          event.currentTarget.form?.requestSubmit()
        }}
        disabled={pending}
      />
      {error && (
        <p role="alert" className="px-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
        <span className="px-1 text-xs text-muted-foreground">Project chat</span>
        <Button size="sm" type="submit" className="ml-auto rounded-full" disabled={pending || !content.trim()}>
          {pending ? 'Saving…' : 'Send message'}
          <ArrowUp aria-hidden="true" />
        </Button>
      </div>
    </form>
  )
}
