'use client'

import { ArrowUp, Paperclip, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'

import { submitConversationMessage } from '@/actions/conversation/conversation-actions'
import { CollaborationReviewCard } from '@/components/collaboration/collaboration-review-card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { ChatAnalysisQuestion, ChatAnalysisReview } from '@/lib/conversation/analysis-review'
import type { ChatContext } from '@/lib/conversation/chat-context'
import { isRunStopRequest, type RunStopReview } from '@/lib/conversation/run-stop-review'
import {
  parseConversationCollaborationRequest,
  type ConversationCollaborationReview,
} from '@/lib/conversation/collaboration-review'
import { isScenarioApprovalRequest, type ChatScenarioReview } from '@/lib/conversation/scenario-review'
import { workspaceRecordLabel } from '@/lib/conversation/workspace-records'
import {
  chatApprovalText,
  chatComposerFormId,
  isAnalysisApprovalRequest,
  isCheckoutOrderNumberRequest,
  isProjectSwitchRequest,
  isRunPermissionApprovalRequest,
  parseAnalysisAnswerReply,
  type RunPermissionReview,
} from '@/lib/conversation/workspace-request'
import { withProjectScope } from '@/lib/project-scope'

import { useJourneyStatusFreshness } from '../quality-journeys/[journeyId]/journey-status-observation'

type ReviewBinding = {
  analysisReview?: ChatAnalysisReview
  analysisQuestion?: ChatAnalysisQuestion
  scenarioReview?: ChatScenarioReview
  collaborationReview?: ConversationCollaborationReview
  runPermissionReview?: RunPermissionReview
  runStopReview?: RunStopReview
}

const collaborationDecisionText = {
  KEEP_LOCAL: 'Keep all local',
  USE_INCOMING: 'Use all incoming',
  ACCEPT: 'Accept proposal',
  REJECT: 'Reject proposal',
} as const

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
  analysisReview,
  analysisQuestion,
  scenarioReview,
  collaborationReview,
  runPermissionReview,
  runStopReview,
}: {
  projectId: string
  conversationId?: string
  initialContext?: ChatContext
} & ReviewBinding) {
  const { push, replace, refresh } = useRouter()
  const [content, setContent] = useState('')
  const [attachmentRemoved, setAttachmentRemoved] = useState(false)
  const context = attachmentRemoved ? undefined : initialContext
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const retry = useRef<
    | ({
        request: string
        key: string
      } & ReviewBinding)
    | null
  >(null)
  const draft = useRef<ReviewBinding | null>(null)
  const currentReview = {
    analysisReview,
    analysisQuestion,
    scenarioReview,
    collaborationReview,
    runPermissionReview,
    runStopReview,
  }
  const { newerVersionAvailable } = useJourneyStatusFreshness()
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const button = (event.nativeEvent as SubmitEvent).submitter
    const approvesFromCard =
      button?.getAttribute('name') === 'analysisIntent' && button.getAttribute('value') === 'approve'
    submit(approvesFromCard ? chatApprovalText : content.trim(), approvesFromCard ? 'analysis' : 'typed')
  }

  function submit(message: string, source: 'typed' | 'analysis' | 'collaboration') {
    if (inFlight.current || !message) return
    const switchOrigin = isProjectSwitchRequest(message) ? window.location.href : undefined
    const attachment = context && { kind: context.kind, id: context.id, shownTitle: context.title }
    const request = JSON.stringify({ message, attachment, source })
    const original = retry.current?.request === request ? retry.current : null
    const binding = source === 'typed' ? (draft.current ?? currentReview) : currentReview
    const review = isAnalysisApprovalRequest(message)
      ? binding.analysisReview
      : isCheckoutOrderNumberRequest(message)
        ? analysisReview
        : undefined
    const question = parseAnalysisAnswerReply(message) ? binding.analysisQuestion : undefined
    const scenarios = isScenarioApprovalRequest(message) ? binding.scenarioReview : undefined
    const collaboration =
      parseConversationCollaborationRequest(message)?.kind === 'DECIDE' ? binding.collaborationReview : undefined
    const permission = isRunPermissionApprovalRequest(message) ? binding.runPermissionReview : undefined
    const stop = isRunStopRequest(message) ? binding.runStopReview : undefined
    if ((source === 'analysis' && !review) || (source === 'collaboration' && !collaboration)) return
    if (!original && (review || question || scenarios || permission || stop) && newerVersionAvailable) {
      setError('The Journey changed. Load the latest question or review before sending this request.')
      return
    }
    const attempt = original ?? {
      request,
      key: crypto.randomUUID(),
      analysisReview: review,
      analysisQuestion: question,
      scenarioReview: scenarios,
      collaborationReview: collaboration,
      runPermissionReview: permission,
      runStopReview: stop,
    }
    retry.current = attempt
    inFlight.current = true
    setError('')

    startTransition(async () => {
      try {
        const response = await submitConversationMessage({
          projectId,
          conversationId,
          idempotencyKey: attempt.key,
          content: message,
          context: attachment,
          analysisReview: attempt.analysisReview,
          analysisQuestion: attempt.analysisQuestion,
          scenarioReview: attempt.scenarioReview,
          collaborationReview: attempt.collaborationReview,
          runPermissionReview: attempt.runPermissionReview,
          ...(attempt.runStopReview ? { runStopReview: attempt.runStopReview } : {}),
        })
        if (!response.success) {
          if (
            'status' in response &&
            response.status === 409 &&
            (attempt.analysisReview ||
              attempt.analysisQuestion ||
              attempt.scenarioReview ||
              attempt.collaborationReview ||
              attempt.runPermissionReview ||
              attempt.runStopReview)
          ) {
            retry.current = null
            refresh()
          }
          setError(response.error)
          return
        }
        retry.current = null
        if (source === 'typed') {
          if (switchOrigin && (!mounted.current || window.location.href !== switchOrigin)) return
          setContent('')
          draft.current = null
          setAttachmentRemoved(true)
          if (response.evidenceHref) {
            push(response.evidenceHref)
            return
          }
          if ('destinationHref' in response && typeof response.destinationHref === 'string') {
            push(response.destinationHref)
            return
          }
          if ('projectSwitchNotice' in response && typeof response.projectSwitchNotice === 'string')
            setError(response.projectSwitchNotice)
          replace(withProjectScope(`/conversations/${response.conversationId}`, projectId))
        }
        refresh()
      } catch {
        setError('The save could not be confirmed. Retry to recover the same message.')
      } finally {
        inFlight.current = false
      }
    })
  }

  return (
    <div className="space-y-2">
      {collaborationReview && (
        <CollaborationReviewCard
          review={collaborationReview}
          pending={pending}
          onDecision={decision => submit(collaborationDecisionText[decision], 'collaboration')}
        />
      )}
      <form
        id={chatComposerFormId}
        onSubmit={send}
        className="space-y-2 rounded-2xl border border-border bg-popover p-2 focus-within:border-input"
      >
        {context && <AttachedRecord context={context} onRemove={() => setAttachmentRemoved(true)} />}
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
          onChange={event => {
            const text = event.target.value
            draft.current = text.trim() ? (draft.current ?? currentReview) : null
            setContent(text)
          }}
          onKeyDown={event => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
            event.preventDefault()
            event.currentTarget.form?.requestSubmit()
          }}
          readOnly={pending}
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
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {pending ? 'Saving message…' : ''}
      </p>
    </div>
  )
}
