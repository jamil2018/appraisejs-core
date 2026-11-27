import Link from 'next/link'

import { StatusBadge } from '@/components/ui/status-badge'
import { selectEvidenceStep } from '@/lib/conversation/journey-evidence'
import type { ConversationJourneyEvidenceRun } from '@/services/conversation/conversation-journey-evidence'

const outcomes = {
  PASSED: { label: 'Passed', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  SKIPPED: { label: 'Skipped', tone: 'neutral' },
  UNVERIFIED: { label: 'Unverified', tone: 'warning' },
} as const

const unverifiedReasons: Record<NonNullable<ConversationJourneyEvidenceRun['reason']>, string> = {
  RUN_CANCELLED: 'The run was cancelled before Appraise could verify the outcome.',
  RUN_IN_PROGRESS: 'The run is still in progress.',
  EVIDENCE_MISSING: 'Appraise has no sealed evidence for this run.',
  EVIDENCE_INVALID: 'Appraise could not verify the recorded evidence.',
  REPORT_MISSING: 'The recorded run has no report.',
  REPORT_AMBIGUOUS: 'Appraise could not identify one report for this run.',
  REPORT_INCOMPLETE: 'Step evidence is incomplete.',
  OUTCOME_UNCORROBORATED: 'The report does not confirm the recorded outcome.',
}

export function ChatJourneyResultCard({
  runs,
  journeyHref,
}: {
  runs: readonly ConversationJourneyEvidenceRun[]
  journeyHref: string
}) {
  const evidence = selectEvidenceStep(runs)

  return (
    <article aria-label="Result and evidence" className="space-y-3 rounded-xl border border-border bg-card px-4 py-3">
      <h2 className="text-sm font-semibold">Result and evidence</h2>
      <ul aria-label="Recorded results" className="divide-y divide-border text-sm">
        {runs.map(run => {
          const failure = run.outcome === 'FAILED' ? run.steps.find(step => step.status === 'FAILED') : undefined
          const skipped = run.outcome !== 'UNVERIFIED' ? run.steps.filter(step => step.status === 'SKIPPED').length : 0
          return (
            <li key={run.testRunId} className="space-y-1 py-2 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start gap-2">
                {run.title && <span className="min-w-0 flex-1 break-words font-medium">{run.title}</span>}
                <StatusBadge {...outcomes[run.outcome]} />
              </div>
              {failure && <p className="break-words">{failure.label}</p>}
              {skipped > 0 && (
                <p className="text-muted-foreground">
                  {skipped === 1 ? '1 step skipped.' : `${skipped} steps skipped.`}
                </p>
              )}
              {run.reason && <p className="text-muted-foreground">{unverifiedReasons[run.reason]}</p>}
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {evidence && (
          <Link
            href={evidence.step.reportHref}
            className="app-focus rounded-sm text-sm text-info underline underline-offset-4"
          >
            Show me where
          </Link>
        )}
        <Link
          href={journeyHref}
          className="app-focus rounded-sm text-sm text-muted-foreground underline underline-offset-4"
        >
          Open Journey results
        </Link>
      </div>
    </article>
  )
}
