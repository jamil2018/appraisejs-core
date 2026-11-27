import Link from 'next/link'

import { StatusBadge } from '@/components/ui/status-badge'
import type { getQualityJourneyExecution } from '@/services/coordinator/quality-journey-execution-service'
import { JourneyRerunProposalForm, JourneyRunObservationControls } from './journey-execution-controls'

type Execution = Awaited<ReturnType<typeof getQualityJourneyExecution>>
type Cycle = Execution['cycles'][number]

function label(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replaceAll('_', ' ')
}

export function ChatRunActivityCard({
  cycle,
  projectId,
  journeyId,
  journeyPaused = false,
  stateHash,
  canProposeRerun = false,
  historyOnly = false,
}: {
  cycle: Cycle
  projectId: string
  journeyId: string
  journeyPaused?: boolean
  stateHash?: string
  canProposeRerun?: boolean
  historyOnly?: boolean
}) {
  const unknown = cycle.testRuns.some(run => run.diagnostic?.duplicateLaunchPrevented)
  const launchUnobserved = !unknown && cycle.testRuns.some(run => run.bindingStatus === 'RESERVED')
  const destination = historyOnly || journeyPaused ? 'history' : 'execution'
  const journeyHref = `/quality-journeys/${encodeURIComponent(journeyId)}?project=${encodeURIComponent(projectId)}#${destination}`

  return (
    <article
      aria-label="Activity"
      data-journey-focus="activity"
      className="space-y-3 rounded-xl border border-border bg-card px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Activity</h2>
        <StatusBadge
          label={label(cycle.status)}
          tone={
            cycle.status === 'COMPLETED'
              ? 'success'
              : cycle.status === 'FAILED'
                ? 'danger'
                : cycle.status === 'CANCELLING' || unknown
                  ? 'warning'
                  : ['RESERVED', 'RUNNING'].includes(cycle.status)
                    ? 'info'
                    : 'neutral'
          }
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {cycle.browserEngine === 'CHROMIUM' ? 'Chromium' : label(cycle.browserEngine)} run in the selected environment.
      </p>
      {journeyPaused && (
        <p className="text-sm text-warning">The Journey is paused. The recorded run status remains available below.</p>
      )}
      {unknown && (
        <p role="alert" className="text-sm text-warning">
          Appraise cannot confirm whether the original run is still active. Check its status before taking another
          action.
        </p>
      )}
      {launchUnobserved && (
        <p role="status" className="text-sm text-muted-foreground">
          The run is reserved. Appraise has not observed a runner launch yet. Check this activity before taking another
          action.
        </p>
      )}
      <ul aria-label="Recorded test runs" className="space-y-2 text-sm">
        {cycle.testRuns.map((run, index) => (
          <li key={run.testRunId} className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href={`/test-runs/${encodeURIComponent(run.testRunId)}?project=${encodeURIComponent(projectId)}`}
              className="app-focus rounded-sm text-info underline underline-offset-4 hover:text-foreground"
            >
              View test run {cycle.testRuns.length > 1 ? index + 1 : ''}
            </Link>
            <span>{label(run.result && run.result !== 'PENDING' ? run.result : run.status)}</span>
          </li>
        ))}
      </ul>
      {stateHash && !historyOnly && (
        <JourneyRunObservationControls journeyId={journeyId} cycle={cycle} stateHash={stateHash} />
      )}
      {canProposeRerun && !journeyPaused && !historyOnly && !unknown && (
        <JourneyRerunProposalForm
          journeyId={journeyId}
          cycleId={cycle.id}
          evidenceIds={cycle.evidence.map(receipt => receipt.id)}
          scenarioRevisionIds={[
            ...new Set(cycle.testRuns.flatMap(run => (run.scenarioRevisionId ? [run.scenarioRevisionId] : []))),
          ].sort()}
        />
      )}
      <Link
        href={journeyHref}
        className="app-focus inline-block rounded-sm text-sm text-info underline underline-offset-4 hover:text-foreground"
      >
        View run activity
      </Link>
    </article>
  )
}
