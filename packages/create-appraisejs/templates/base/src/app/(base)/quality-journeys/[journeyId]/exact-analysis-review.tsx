'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

import type { AnalysisRevisionView } from './quality-journey-view-model'

type ExactAnalysisReviewProps = {
  approvalBlockedReason?: string
  analysis: AnalysisRevisionView
  canReview: boolean
  error: string | null
  isPending: boolean
  onApprove: () => void
  unresolvedQuestionIds: string[]
}

function RecordedDecision({ decision }: { decision: AnalysisRevisionView['decision'] }) {
  if (!decision) return null

  return (
    <div className="rounded-lg border border-success-border bg-success-surface p-3 text-sm">
      <p className="font-medium">{decision.decision.toLocaleLowerCase()} decision recorded</p>
    </div>
  )
}

function ReviewActions({
  approvalBlockedReason,
  canReview,
  isPending,
  onApprove,
  unresolvedQuestionIds,
}: Omit<ExactAnalysisReviewProps, 'analysis' | 'error'>) {
  const hasUnresolvedQuestions = unresolvedQuestionIds.length > 0

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={isPending || !canReview || hasUnresolvedQuestions || Boolean(approvalBlockedReason)}
          onClick={onApprove}
          type="button"
        >
          {isPending ? 'Recording…' : 'Approve criteria'}
        </Button>
      </div>
      {approvalBlockedReason ? <p className="text-sm text-warning">{approvalBlockedReason}</p> : null}
      {hasUnresolvedQuestions ? (
        <p className="text-sm text-warning">
          Answer {unresolvedQuestionIds.length} required question{unresolvedQuestionIds.length === 1 ? '' : 's'} before
          approval.
        </p>
      ) : null}
    </>
  )
}

export function ExactAnalysisReview({
  approvalBlockedReason,
  analysis,
  canReview,
  error,
  isPending,
  onApprove,
  unresolvedQuestionIds,
}: ExactAnalysisReviewProps) {
  return (
    <Card className="border-primary/25 bg-primary/[0.04]">
      <CardContent className="space-y-4 pt-6">
        {analysis.decision ? <RecordedDecision decision={analysis.decision} /> : null}
        {analysis.decision ? null : (
          <ReviewActions
            approvalBlockedReason={approvalBlockedReason}
            canReview={canReview}
            isPending={isPending}
            onApprove={onApprove}
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
