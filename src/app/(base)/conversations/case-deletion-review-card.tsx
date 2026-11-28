'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { decideConversationCaseDeletionAction } from '@/actions/conversation/case-deletion-review-actions'
import { Button } from '@/components/ui/button'
import type { CaseDeletionReview } from '@/lib/conversation/case-deletion-review'

type CaseDeletionReviewCardProps = {
  review: CaseDeletionReview
  projectId: string
  conversationId: string
  messageId: string
}

export function CaseDeletionReviewCard({ review, projectId, conversationId, messageId }: CaseDeletionReviewCardProps) {
  const router = useRouter()
  const inFlight = useRef(false)
  const [submitted, setSubmitted] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function decide(decision: 'DELETE' | 'KEEP') {
    if (inFlight.current || review.status !== 'PENDING') return
    inFlight.current = true
    setSubmitted(true)
    setError('')
    startTransition(async () => {
      try {
        const result = await decideConversationCaseDeletionAction({
          projectId,
          conversationId,
          messageId,
          reviewHash: review.hash,
          decision,
        })
        if (!result.success) setError(result.error ?? 'The decision could not be confirmed.')
      } catch {
        setError('The decision outcome is unknown. Reload this chat to check its current status.')
      } finally {
        router.refresh()
      }
    })
  }

  const decided = review.status !== 'PENDING'
  return (
    <section
      aria-label="Case deletion review"
      className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4 text-sm"
    >
      <div className="space-y-1">
        <h3 className="font-semibold text-foreground">Review case deletion</h3>
        <p className="text-muted-foreground">Deleting removes the cases listed below from this project.</p>
      </div>
      <ul aria-label="Cases in this deletion review" className="space-y-2">
        {review.cases.map(testCase => (
          <li key={testCase.id} className="min-w-0 rounded-lg border border-border bg-background px-3 py-2">
            <span className="block whitespace-pre-wrap break-words font-medium text-foreground">
              “{testCase.title}”
            </span>
          </li>
        ))}
      </ul>
      {decided ? (
        <p role="status" className="font-medium text-foreground">
          {review.status === 'DELETED' ? 'These cases were deleted.' : 'These cases were kept.'}
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={submitted || pending}
              onClick={() => decide('DELETE')}
            >
              Delete these cases
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={submitted || pending}
              onClick={() => decide('KEEP')}
            >
              Keep these cases
            </Button>
          </div>
          {submitted && !error && (
            <p role="status" className="text-xs text-muted-foreground">
              {pending ? 'Saving decision…' : 'Checking the saved decision…'}
            </p>
          )}
          {error && (
            <div className="space-y-2">
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => window.location.reload()}>
                Reload chat to check status
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
