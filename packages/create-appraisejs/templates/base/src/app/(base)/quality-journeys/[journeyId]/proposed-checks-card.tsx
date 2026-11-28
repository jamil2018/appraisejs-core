'use client'

import type { ToolCall } from '@ag-ui/core'
import { CopilotKitContext, CopilotKitCoreReact, EMPTY_SET } from '@copilotkit/react-core/v2/context'
import { defineToolCallRenderer, useRenderToolCall } from '@copilotkit/react-core/v2/headless'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { chatApprovalText, chatComposerFormId } from '@/lib/conversation/workspace-request'
import { withProjectScope } from '@/lib/project-scope'

import { JourneyFocusCard } from './journey-focus-card'
import { selectJourneyFocus } from './journey-focus-projection'
import { useJourneyStatusFreshness } from './journey-status-observation'
import {
  analysisReviewContentSchema,
  analysisReviewToolName,
  readAnalysisReviewCall,
  type AnalysisReviewContent,
} from './proposed-checks-event'

function AnalysisReviewCard({ content }: { content: AnalysisReviewContent }) {
  const { newerVersionAvailable } = useJourneyStatusFreshness()
  const href =
    withProjectScope(`/quality-journeys/${encodeURIComponent(content.journeyId)}`, content.projectId) + '#analysis'
  const checks = content.kind === 'proposed-checks' ? content.checks : []
  const proposed = selectJourneyFocus({
    stage: 'ANALYSIS_REVIEW',
    openQuestion: content.kind === 'question' ? content.prompt : undefined,
    analysis: {
      revision: content.revision,
      scope: content.includedScope,
      acceptanceSignals: checks,
      reviewHash: content.reviewHash,
    },
    scenarioCount: 0,
  })
  if (content.kind === 'question') {
    return (
      <JourneyFocusCard focus={proposed} href={href}>
        <p className="break-words text-sm text-muted-foreground">{content.rationale}</p>
        {content.choices.length > 0 && (
          <ul aria-label="Suggested answers" className="list-disc space-y-1 ps-4 text-sm [overflow-wrap:anywhere]">
            {[...new Set(content.choices)].map(choice => (
              <li key={choice}>{choice}</li>
            ))}
          </ul>
        )}
        {!newerVersionAvailable && (
          <p className="text-sm">
            Start your reply with <strong>Answer:</strong> followed by your choice.
          </p>
        )}
      </JourneyFocusCard>
    )
  }
  const focus =
    content.kind === 'proposed-checks'
      ? proposed
      : {
          ...proposed,
          kind: content.kind,
          title: 'Review changes',
          summary: `Test approach revision ${content.revision}.`,
        }

  return (
    <JourneyFocusCard focus={focus} href={href}>
      {content.kind === 'proposed-checks' ? (
        <ul aria-label="Proposed checks" className="list-disc space-y-1 ps-4 text-sm [overflow-wrap:anywhere]">
          {checks.map((check, index) => (
            <li key={index}>{check}</li>
          ))}
        </ul>
      ) : content.changes.length ? (
        <ul aria-label="Changed criteria" className="space-y-2 text-sm [overflow-wrap:anywhere]">
          {content.changes.map(change => (
            <li key={change.id} className="rounded-md bg-muted px-3 py-2">
              <p className="font-medium">{change.statement}</p>
              <p className="text-xs capitalize text-muted-foreground">{change.kind}</p>
              {change.kind !== 'removed' && (
                <ul className="list-disc ps-4">
                  {change.signals.map((signal, index) => (
                    <li key={index}>{signal}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">The acceptance criteria are unchanged in this revision.</p>
      )}
      {content.approvable && !newerVersionAvailable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" form={chatComposerFormId} name="analysisIntent" value="approve" size="sm">
            {chatApprovalText}
          </Button>
          <span className="text-xs text-muted-foreground">You can also type “{chatApprovalText}”.</span>
        </div>
      )}
    </JourneyFocusCard>
  )
}

const renderer = defineToolCallRenderer({
  name: analysisReviewToolName,
  args: analysisReviewContentSchema,
  render: ({ args }) => {
    const review = analysisReviewContentSchema.safeParse(args)
    return review.success ? <AnalysisReviewCard content={review.data} /> : null
  },
})

function RenderChecks({ toolCall }: { toolCall: ToolCall }) {
  const renderToolCall = useRenderToolCall()
  return renderToolCall({ toolCall })
}

export function ChatAnalysisReviewCard({
  events,
  expected,
}: {
  events: readonly unknown[]
  expected: Parameters<typeof readAnalysisReviewCall>[1]
}) {
  const [context] = useState(() => ({
    copilotkit: new CopilotKitCoreReact({ renderToolCalls: [renderer] }),
    executingToolCallIds: EMPTY_SET,
  }))
  const toolCall = readAnalysisReviewCall(events, expected)
  if (!toolCall) return null
  return (
    <CopilotKitContext value={context}>
      <RenderChecks toolCall={toolCall} />
    </CopilotKitContext>
  )
}
