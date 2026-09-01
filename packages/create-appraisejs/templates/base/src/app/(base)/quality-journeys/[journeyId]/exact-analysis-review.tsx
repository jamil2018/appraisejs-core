'use client'

import { CheckCircle2, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import type { AnalysisRevisionView } from './quality-journey-view-model'

type ExactAnalysisReviewProps = {
  analysis: AnalysisRevisionView
  canReview: boolean
  error: string | null
  feedback: string
  isPending: boolean
  onApprove: () => void
  onFeedbackChange: (feedback: string) => void
  onRequestRevision: () => void
  unresolvedQuestionIds: string[]
}

function ReviewIdentity({ analysis }: Pick<ExactAnalysisReviewProps, 'analysis'>) {
  return (
    <>
      <p className="break-all font-mono text-[11px] text-muted-foreground">Charter hash: {analysis.contentHash}</p>
      {analysis.publication ? (
        <p className="break-all font-mono text-[11px] text-muted-foreground">
          Published review hash: {analysis.publication.reviewHash}
        </p>
      ) : (
        <p className="text-sm text-amber-200">
          Awaiting Runner publication. Publication is read-only from this screen.
        </p>
      )}
    </>
  )
}

function RecordedDecision({ decision }: { decision: AnalysisRevisionView['decision'] }) {
  if (!decision) return null

  return (
    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
      <p className="font-medium">{decision.decision.toLocaleLowerCase()} decision recorded</p>
      <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{decision.reviewHash}</p>
    </div>
  )
}

function ReviewActions({
  canReview,
  feedback,
  isPending,
  onApprove,
  onFeedbackChange,
  onRequestRevision,
  unresolvedQuestionIds,
}: Omit<ExactAnalysisReviewProps, 'analysis' | 'error'>) {
  const hasUnresolvedQuestions = unresolvedQuestionIds.length > 0

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="analysis-revision-feedback">Request revision feedback</Label>
        <Textarea
          id="analysis-revision-feedback"
          onChange={event => onFeedbackChange(event.target.value)}
          placeholder="Describe what needs to change in the next immutable analysis revision."
          value={feedback}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={isPending || !canReview || hasUnresolvedQuestions} onClick={onApprove} type="button">
          {isPending ? 'Recording…' : 'Approve exact revision'}
        </Button>
        <Button
          disabled={isPending || !canReview || !feedback.trim()}
          onClick={onRequestRevision}
          type="button"
          variant="outline"
        >
          <RotateCcw aria-hidden="true" className="mr-2 size-4" />
          Request revision
        </Button>
      </div>
      {hasUnresolvedQuestions ? (
        <p className="text-sm text-amber-200">
          Resolve {unresolvedQuestionIds.length} required question{unresolvedQuestionIds.length === 1 ? '' : 's'} before
          approval.
        </p>
      ) : null}
    </>
  )
}

export function ExactAnalysisReview({
  analysis,
  canReview,
  error,
  feedback,
  isPending,
  onApprove,
  onFeedbackChange,
  onRequestRevision,
  unresolvedQuestionIds,
}: ExactAnalysisReviewProps) {
  return (
    <Card className="border-primary/25 bg-primary/[0.04]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 aria-hidden="true" className="size-4 text-primary" />
          Exact revision review
        </CardTitle>
        <CardDescription>
          Decisions apply only to this published charter and its current Q&A review identity.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ReviewIdentity analysis={analysis} />
        {analysis.decision ? <RecordedDecision decision={analysis.decision} /> : null}
        {analysis.decision ? null : (
          <ReviewActions
            canReview={canReview}
            feedback={feedback}
            isPending={isPending}
            onApprove={onApprove}
            onFeedbackChange={onFeedbackChange}
            onRequestRevision={onRequestRevision}
            unresolvedQuestionIds={unresolvedQuestionIds}
          />
        )}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
