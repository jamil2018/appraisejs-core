'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type {
  ConversationCollaborationDecision,
  ConversationCollaborationReview,
} from '@/lib/conversation/collaboration-review'

/** One visible, exact review edge shared by manual controls and saved chat. */
export function CollaborationReviewCard({
  review,
  pending = false,
  onDecision,
}: {
  review: ConversationCollaborationReview
  pending?: boolean
  onDecision: (decision: ConversationCollaborationDecision) => void
}) {
  const [confirmedFingerprint, setConfirmedFingerprint] = useState<string>()
  const fingerprint = [
    review.targetProjectId,
    review.operationId,
    review.expectedVersion,
    review.preparedDigest,
    review.kind === 'DIVERGENT' ? review.reviewDigest : review.reviewItems.map(item => item.recordKey).join('|'),
  ].join(':')
  const confirmed = confirmedFingerprint === fingerprint
  const decisions =
    review.kind === 'DIVERGENT' ? (['ACCEPT', 'REJECT'] as const) : (['KEEP_LOCAL', 'USE_INCOMING'] as const)
  const label = {
    ACCEPT: 'Accept proposal',
    REJECT: 'Reject proposal',
    KEEP_LOCAL: 'Keep all local',
    USE_INCOMING: 'Use all incoming',
  }

  return (
    <section aria-label="Exact collaboration review" className="space-y-3 rounded-lg border bg-card p-4">
      <p className="text-sm font-semibold">Review {review.intent.toLowerCase()} operation</p>
      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Project</dt>
          <dd className="break-all font-mono">{review.targetProjectId}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Operation and version</dt>
          <dd className="break-all font-mono">
            {review.operationId} · {review.expectedVersion}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Prepared digest</dt>
          <dd className="break-all font-mono">{review.preparedDigest}</dd>
        </div>
        {review.kind === 'DIVERGENT' ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Proposal review digest</dt>
            <dd className="break-all font-mono">{review.reviewDigest}</dd>
          </div>
        ) : null}
      </dl>
      {review.kind === 'RECORDS' ? (
        <div>
          <p className="text-sm">{review.reviewItems.length} whole-record decisions</p>
          <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-xs">
            {review.reviewItems.map(item => (
              <li className="break-all" key={item.recordKey}>
                <span className="font-mono">{item.recordKey}</span> · {item.disposition}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={confirmed}
          disabled={pending}
          onCheckedChange={checked => setConfirmedFingerprint(checked === true ? fingerprint : undefined)}
        />
        <span>I reviewed this exact operation and scope.</span>
      </label>
      <div className="flex flex-wrap gap-2">
        {decisions.map(decision => (
          <Button
            disabled={!confirmed || pending}
            key={decision}
            onClick={() => onDecision(decision)}
            type="button"
            variant={decision === 'ACCEPT' || decision === 'USE_INCOMING' ? 'default' : 'outline'}
          >
            {label[decision]}
          </Button>
        ))}
      </div>
    </section>
  )
}
