'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { AnalysisRevisionView } from './quality-journey-view-model'

export type CriteriaFeedback = Record<string, string>
export { formatAnalysisFeedback } from '@/lib/quality-journey/analysis-feedback'

function DocumentList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {items.map((item, index) => (
            <li key={`${index}:${item}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">None recorded.</p>
      )}
    </section>
  )
}

export function AnalysisCriteriaReview({
  analysis,
  previous,
  previousFeedback = {},
  feedback,
  onFeedbackChange,
  onSendChange,
  editable,
  isPending,
}: {
  analysis: AnalysisRevisionView
  previous?: AnalysisRevisionView
  previousFeedback?: CriteriaFeedback
  feedback: CriteriaFeedback
  onFeedbackChange: (key: string, value: string) => void
  onSendChange: (key: string) => void
  editable: boolean
  isPending: boolean
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const priorRequirements = new Map(previous?.requirements.map(row => [row.requirementId, row]))
  const priorObligations = new Map(previous?.obligations.map(row => [row.obligationId, row]))
  function criterion(kind: 'requirement' | 'obligation', id: string, statement: string, signals?: string[]) {
    const key = `${kind}:${id}`
    const prior = kind === 'requirement' ? priorRequirements.get(id) : priorObligations.get(id)
    const changed =
      prior &&
      (prior.statement !== statement ||
        ('acceptanceSignals' in prior && JSON.stringify(prior.acceptanceSignals) !== JSON.stringify(signals)))
    return (
      <li className="space-y-3 rounded-md border p-4" key={key}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm leading-6">{statement}</p>
          {previous && (!prior || changed) ? <Badge variant="outline">{!prior ? 'Added' : 'Changed'}</Badge> : null}
        </div>
        {signals ? <DocumentList title="Acceptance signals" items={signals} /> : null}
        {changed ? (
          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer">Previous wording</summary>
            <p className="mt-2">{prior.statement}</p>
            {'acceptanceSignals' in prior ? (
              <ul className="mt-2 list-disc pl-5">
                {prior.acceptanceSignals.map((signal, index) => (
                  <li key={index}>{signal}</li>
                ))}
              </ul>
            ) : null}
          </details>
        ) : null}
        {previousFeedback[key] ? (
          <p className="border-primary/30 border-l-2 pl-3 text-sm text-muted-foreground">
            Your previous feedback: {previousFeedback[key]}
          </p>
        ) : null}
        {feedback[key] && editing !== key ? (
          <p className="text-sm text-muted-foreground">Requested change: {feedback[key]}</p>
        ) : null}
        {editable ? (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-sm"
            aria-label={`Request change: ${statement}`}
            disabled={isPending}
            onClick={() => setEditing(key)}
          >
            Request change
          </Button>
        ) : null}
        {editable && editing === key ? (
          <div className="space-y-2">
            <Label htmlFor={`feedback-${key}`}>Your requested change</Label>
            <Textarea
              disabled={isPending}
              id={`feedback-${key}`}
              value={feedback[key] ?? ''}
              onChange={event => onFeedbackChange(key, event.target.value)}
              placeholder="Describe the change needed for this item."
            />
            <Button
              type="button"
              size="sm"
              disabled={isPending || !feedback[key]?.trim()}
              onClick={() => onSendChange(key)}
            >
              {isPending ? 'Sending…' : 'Send change'}
            </Button>
          </div>
        ) : null}
      </li>
    )
  }
  const removedRequirements =
    previous?.requirements.filter(
      row => !analysis.requirements.some(current => current.requirementId === row.requirementId),
    ) ?? []
  const removedObligations =
    previous?.obligations.filter(
      row => !analysis.obligations.some(current => current.obligationId === row.obligationId),
    ) ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          <h2>Acceptance criteria</h2>
        </CardTitle>
        <CardDescription>
          {previous
            ? `Version ${analysis.revision}. Changes compared with version ${previous.revision}.`
            : 'Review what will be tested and the observable results that count as success.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {analysis.obligations.length ? (
          <section aria-label="Acceptance criteria review">
            <ul className="space-y-3">
              {analysis.obligations.map(row =>
                criterion('obligation', row.obligationId, row.statement, row.acceptanceSignals),
              )}
            </ul>
          </section>
        ) : null}
        {removedRequirements.length || removedObligations.length ? (
          <DocumentList
            title="Removed from this version"
            items={[...removedRequirements, ...removedObligations].map(row => row.statement)}
          />
        ) : null}
        <details>
          <summary className="cursor-pointer text-sm font-medium">Scope and context</summary>
          <div className="mt-4 space-y-5">
            <DocumentList title="Objectives" items={analysis.objectives} />
            <div className="grid gap-4 md:grid-cols-2">
              <DocumentList title="In scope" items={analysis.scope.included} />
              <DocumentList title="Excluded" items={analysis.scope.excluded} />
            </div>
            {analysis.requirements.length ? (
              <section aria-label="Requirements review">
                <h3 className="mb-3 text-sm font-semibold">Requirements</h3>
                <ul className="space-y-3">
                  {analysis.requirements.map(row => criterion('requirement', row.requirementId, row.statement))}
                </ul>
              </section>
            ) : null}
            <DocumentList title="Constraints" items={analysis.constraints} />
            <DocumentList title="Assumptions" items={analysis.assumptions} />
            <DocumentList title="Risks" items={analysis.risks} />
            <DocumentList title="How we will know it works" items={analysis.acceptanceSignals} />
          </div>
        </details>
      </CardContent>
    </Card>
  )
}
