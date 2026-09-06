'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import type { QualityJourneyTriageReport } from '@/lib/quality-journey'

import { qualityJourneyTriageReviewAction } from './triage-report-actions'

type TriageInput = {
  executionCycleId: string
  cycleId: string
  scenarios: Array<{ artifactId: string; revisionId: string; contentHash: string }>
  runs: Array<{
    testRunId: string
    runId: string
    evidenceReceiptId: string
    receiptHash: string
    scenarioRevisionId: string
    evidence: { result?: string; status?: string; evidenceHealth?: string }
  }>
}
type Triage = {
  assignments: Array<{
    id: string
    workItemId: string
    executionCycleId: string
    inputHash: string
    input: TriageInput
  }>
  reports: Array<{
    id: string
    contentHash: string
    report: QualityJourneyTriageReport
    review: null | { kind: string; feedback: string; successorCycleId: string | null }
  }>
  activeReportRevisionId: string | null
}

const actionId = (prefix: string) => `${prefix}:${crypto.randomUUID()}`

function AssignmentEvidence({ assignments }: { assignments: Triage['assignments'] }) {
  if (!assignments.length) return null
  return (
    <details className="space-y-3" aria-label="Exact triage evidence inputs">
      <summary className="cursor-pointer text-sm font-semibold">Technical details and sealed evidence</summary>
      <div className="mt-3 space-y-3">
        {assignments.map(assignment => (
          <article className="rounded-md border p-3 text-sm" key={assignment.id}>
            <p className="font-mono text-xs text-muted-foreground">
              Assignment {assignment.workItemId} · cycle {assignment.executionCycleId}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Input hash: {assignment.inputHash}</p>
            <ul className="mt-2 space-y-1 text-xs">
              {assignment.input.runs.map(run => (
                <li key={run.testRunId}>
                  Run {run.runId} · TestRun {run.testRunId} · scenario {run.scenarioRevisionId} · sealed receipt{' '}
                  {run.evidenceReceiptId} ({run.receiptHash}) · outcome{' '}
                  {run.evidence.result ?? run.evidence.status ?? 'unknown'}
                  {run.evidence.evidenceHealth ? ` · evidence ${run.evidence.evidenceHealth}` : ''}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Approved scenarios:{' '}
              {assignment.input.scenarios
                .map(scenario => `${scenario.revisionId} (${scenario.contentHash})`)
                .join(', ')}
            </p>
          </article>
        ))}
      </div>
    </details>
  )
}

function FindingList({ report }: { report: QualityJourneyTriageReport }) {
  return (
    <section className="space-y-3" aria-label="Attributed findings">
      <h3 className="text-sm font-semibold">Attributed findings</h3>
      {report.findings.length ? (
        <ul className="space-y-3">
          {report.findings.map(finding => (
            <li className="rounded-md border p-3 text-sm" key={finding.findingId}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{finding.kind}</Badge>
                <Badge variant="secondary">{finding.confidence}</Badge>
                {finding.unresolved ? <Badge variant="destructive">Unresolved</Badge> : null}
                <span className="font-mono text-xs">{finding.testRunId}</span>
              </div>
              <p className="mt-2">{finding.rationale}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Evidence {finding.evidenceReceiptId} · scenario {finding.scenarioRevisionId} · requirements{' '}
                {finding.requirementIds.join(', ') || 'none'}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Observation: {finding.postmortem.observation} Expected: {finding.postmortem.expectedBehavior}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Causal analysis: {finding.postmortem.causalAnalysis} Next: {finding.postmortem.nextAction}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Competing hypotheses:{' '}
                {finding.competingHypotheses.length ? finding.competingHypotheses.join('; ') : 'None recorded.'}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No attributed findings were submitted for this report revision.</p>
      )}
    </section>
  )
}

function CoverageList({ report }: { report: QualityJourneyTriageReport }) {
  return (
    <section className="space-y-2" aria-label="Requirement coverage">
      <h3 className="text-sm font-semibold">Coverage</h3>
      <ul className="space-y-2 text-sm">
        {report.coverage.map(item => (
          <li className="rounded-md border p-3" key={item.requirementId}>
            <Badge variant="outline">{item.outcome}</Badge>{' '}
            <span className="font-mono text-xs">{item.requirementId}</span>
            <p className="mt-1 text-xs text-muted-foreground">{item.rationale}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Scenarios: {item.scenarioRevisionIds.join(', ')} · runs: {item.testRunIds.join(', ')}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function RemediationScope({ remediation }: { remediation: NonNullable<QualityJourneyTriageReport['remediation']> }) {
  return (
    <section className="space-y-2 rounded-md border p-3 text-sm" aria-label="Proposed remediation scope">
      <h3 className="font-semibold">Proposed remediation scope</h3>
      <p>{remediation.scope}</p>
      <p className="text-xs text-muted-foreground">Findings: {remediation.findingIds.join(', ')}</p>
      <p className="text-xs text-muted-foreground">Scenario revisions: {remediation.scenarioRevisionIds.join(', ')}</p>
    </section>
  )
}

type ReportRevisionProps = {
  item: Triage['reports'][number]
  active: boolean
  journeyId: string
  stage: string
  stateHash: string
}

function ReportReviewControls({
  item,
  journeyId,
  stateHash,
}: Pick<ReportRevisionProps, 'item' | 'journeyId' | 'stateHash'>) {
  const { refresh } = useRouter()
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const ids = useRef({ revision: actionId('report-revision'), approve: actionId('report-remediation') })
  function submit(kind: 'revision' | 'approve') {
    if (!feedback.trim()) return
    setError(null)
    startTransition(async () => {
      const response = await qualityJourneyTriageReviewAction(kind, {
        journeyId,
        reportRevisionId: item.report.reportRevisionId,
        expectedReportHash: item.contentHash,
        expectedStateHash: stateHash,
        idempotencyKey: kind === 'revision' ? ids.current.revision : ids.current.approve,
        feedback,
      })
      if (!response.success) {
        const message = response.error ?? 'Unable to record the report review.'
        setError(message)
        toast({ title: 'Report review failed', description: message, variant: 'destructive' })
        return
      }
      toast({
        title: kind === 'revision' ? 'Report revision requested' : 'Remediation approved',
        description:
          kind === 'revision'
            ? 'A fresh Triager assignment will receive the full-report feedback.'
            : 'Appraise recorded the exact remediation decision.',
      })
      refresh()
    })
  }

  return (
    <section className="space-y-3 rounded-md border p-3" aria-label="Full report review controls">
      <label className="text-sm font-medium" htmlFor={`report-feedback-${item.report.reportRevisionId}`}>
        Full report feedback
      </label>
      <Textarea
        id={`report-feedback-${item.report.reportRevisionId}`}
        onChange={event => setFeedback(event.target.value)}
        value={feedback}
      />
      <div className="flex flex-wrap gap-2">
        <Button disabled={isPending || !feedback.trim()} onClick={() => submit('revision')} size="sm" variant="outline">
          Request changes
        </Button>
        {item.report.remediation ? (
          <Button disabled={isPending || !feedback.trim()} onClick={() => submit('approve')} size="sm">
            Approve this version
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}

function ReportRevision({ item, active, journeyId, stage, stateHash }: ReportRevisionProps) {
  const canReview = active && stage === 'REPORT_REVIEW' && !item.review
  return (
    <article className="space-y-5 rounded-lg border p-4" data-testid={`triage-report-${item.report.reportRevisionId}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Results report</h3>
          <details className="mt-1 text-muted-foreground">
            <summary className="cursor-pointer text-[11px]">Technical details</summary>
            <p className="mt-1 break-all font-mono text-[11px]">
              {item.report.reportRevisionId} · {item.contentHash}
            </p>
          </details>
        </div>
        <Badge variant={active ? 'default' : 'outline'}>{active ? 'Active revision' : 'Historical revision'}</Badge>
      </div>
      <p className="text-sm">{item.report.summary}</p>
      <FindingList report={item.report} />
      <CoverageList report={item.report} />
      {item.report.remediation ? <RemediationScope remediation={item.report.remediation} /> : null}
      <section className="space-y-1 text-sm" aria-label="Residual risks and recommendations">
        <h3 className="font-semibold">Residual risks</h3>
        <ul className="list-disc pl-5 text-muted-foreground">
          {item.report.residualRisks.map(value => (
            <li key={value}>{value}</li>
          ))}
        </ul>
        <h3 className="pt-2 font-semibold">Recommendations</h3>
        <ul className="list-disc pl-5 text-muted-foreground">
          {item.report.recommendations.map(value => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      </section>
      {item.review ? (
        <p className="rounded-md bg-muted p-3 text-sm">
          {item.review.kind}: {item.review.feedback}
          {item.review.successorCycleId ? ` Successor cycle: ${item.review.successorCycleId}.` : ''}
        </p>
      ) : null}
      {canReview ? <ReportReviewControls item={item} journeyId={journeyId} stateHash={stateHash} /> : null}
    </article>
  )
}

export function TriageReportPanel({
  journeyId,
  stage,
  stateHash,
  triage,
}: {
  journeyId: string
  stage: string
  stateHash: string
  triage: Triage | null
}) {
  if (!triage || (!triage.assignments.length && !triage.reports.length)) return null
  return (
    <Card aria-label="Triage report history">
      <CardHeader>
        <CardTitle>Results</CardTitle>
        <CardDescription>
          Findings, evidence, coverage that could not be tested, and what to do next. Product failures remain distinct
          from tests that could not run.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <AssignmentEvidence assignments={triage.assignments} />
        {triage.reports.map(item => (
          <ReportRevision
            active={item.report.reportRevisionId === triage.activeReportRevisionId}
            item={item}
            journeyId={journeyId}
            key={item.id}
            stage={stage}
            stateHash={stateHash}
          />
        ))}
      </CardContent>
    </Card>
  )
}
