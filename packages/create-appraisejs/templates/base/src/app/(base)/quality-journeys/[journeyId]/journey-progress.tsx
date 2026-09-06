import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { qualityJourneyLabel } from './quality-journey-view-model'

type RunnerNode = { role: string; stage: string; state: string; workItemId: string | null }
type WorkItem = { id: string; role: string; status: string; currentAttempt: number }
type Attempt = {
  id: string
  workItemId: string
  attempt: number
  status: string
  startedAt: Date
  completedAt: Date | null
}

export function JourneyProgress({
  attempts,
  closure,
  execution,
  journey,
  triage,
}: {
  attempts: Attempt[]
  closure: { receipt: unknown }
  execution: { consents: Array<{ status: string }>; cycles: Array<{ status: string }> }
  journey: { journey: { stage: string; stateHash: string }; runner: RunnerNode[]; workItems: WorkItem[] }
  triage: { reports: Array<{ id: string }>; activeReportRevisionId: string | null }
}) {
  const attemptsByWorkItem = attempts.reduce<Map<string, Attempt[]>>((grouped, attempt) => {
    const existing = grouped.get(attempt.workItemId) ?? []
    existing.push(attempt)
    grouped.set(attempt.workItemId, existing)
    return grouped
  }, new Map())
  const requestedConsents = execution.consents.filter(consent => consent.status === 'REQUESTED').length
  const activeRuns = execution.cycles.filter(cycle =>
    ['RESERVED', 'RUNNING', 'CANCELLING'].includes(cycle.status),
  ).length
  const reportRecorded = Boolean(triage.activeReportRevisionId || triage.reports.length)
  const reportGateActive = journey.journey.stage === 'REPORT_REVIEW'

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">Journey progress</CardTitle>
        <CardDescription>
          Coordinator reports durable lifecycle state. It does not infer worker connectivity or availability.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid gap-3 text-sm">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Current stage</dt>
            <dd className="mt-1 font-medium capitalize">{qualityJourneyLabel(journey.journey.stage)}</dd>
          </div>
        </dl>

        <details>
          <summary className="cursor-pointer text-sm font-semibold">Technical details</summary>
          <div className="mt-5 space-y-6">
            <p className="break-all font-mono text-[11px] text-muted-foreground">
              State identity: {journey.journey.stateHash}
            </p>
            <section aria-label="Deterministic Runner nodes">
              <h2 className="text-sm font-semibold">Runner nodes</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Each state is reconstructed from the canonical stage, work-item status, and active blockers.
              </p>
              <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {journey.runner.map(node => (
                  <li className="min-w-0 rounded-md border p-3" key={node.role}>
                    <p className="text-sm font-medium capitalize">{qualityJourneyLabel(node.role)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Stage: {qualityJourneyLabel(node.stage)}</p>
                    <Badge className="mt-2" variant="outline">
                      {qualityJourneyLabel(node.state)}
                    </Badge>
                    <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                      Work item: {node.workItemId ?? 'Not issued'}
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            <section aria-label="Role work items and attempts">
              <h2 className="text-sm font-semibold">Role work items and attempts</h2>
              {journey.workItems.length ? (
                <ul className="mt-3 space-y-3">
                  {journey.workItems.map(item => {
                    const itemAttempts = attemptsByWorkItem.get(item.id) ?? []
                    return (
                      <li className="min-w-0 rounded-md border p-3" key={item.id}>
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                          <p className="min-w-0 text-sm font-medium capitalize">{qualityJourneyLabel(item.role)}</p>
                          <Badge variant="outline">{qualityJourneyLabel(item.status)}</Badge>
                        </div>
                        <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                          Work item: {item.id}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">Current attempt: {item.currentAttempt}</p>
                        {itemAttempts.length ? (
                          <ol className="mt-2 space-y-1 text-xs" aria-label={`Attempts for ${item.id}`}>
                            {itemAttempts.map(attempt => (
                              <li className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1" key={attempt.id}>
                                <span>Attempt {attempt.attempt}</span>
                                <Badge variant="secondary">{qualityJourneyLabel(attempt.status)}</Badge>
                                <span className="min-w-0 break-words text-muted-foreground">
                                  Started {attempt.startedAt.toLocaleString()}
                                  {attempt.completedAt ? ` · completed ${attempt.completedAt.toLocaleString()}` : ''}
                                </span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">No attempt receipt has been recorded.</p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No role work items have been issued.</p>
              )}
            </section>
          </div>
        </details>

        <section aria-label="Human lifecycle gates">
          <h2 className="text-sm font-semibold">Human lifecycle gates</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="rounded-md border p-3">
              Execution consent:{' '}
              {requestedConsents
                ? `${requestedConsents} exact consent request${requestedConsents === 1 ? ' is' : 's are'} awaiting a human decision.`
                : 'No requested execution consent is recorded.'}
            </li>
            <li className="rounded-md border p-3">
              Report review:{' '}
              {reportGateActive
                ? 'The active report is at the human report-review gate.'
                : reportRecorded
                  ? 'A report revision is recorded; see Report for its current review record.'
                  : 'No report revision is recorded.'}
            </li>
            <li className="rounded-md border p-3">
              Closure: {closure.receipt ? 'A durable closure receipt is recorded.' : 'No closure receipt is recorded.'}
            </li>
            <li className="rounded-md border p-3">
              Managed execution:{' '}
              {activeRuns
                ? `${activeRuns} execution cycle${activeRuns === 1 ? ' is' : 's are'} in an active operational status.`
                : 'No execution cycle is in an active operational status.'}
            </li>
          </ul>
        </section>
      </CardContent>
    </Card>
  )
}
