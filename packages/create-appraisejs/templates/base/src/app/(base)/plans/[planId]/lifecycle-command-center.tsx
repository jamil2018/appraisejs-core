import Link from 'next/link'
import { Activity, AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

import { latestBaselineAttempts } from './baseline-attempt-summary'
import { lifecycleProgress, nextLifecycleAction } from './plan-lifecycle-guidance'

export function lifecycleCommandCenterState(detail: PlanReviewDetail) {
  const activeStage = lifecycleProgress(detail.plan.lifecycle).find(stage => stage.state === 'active')
  const nextAction = nextLifecycleAction(detail.plan.lifecycle)
  const attempts = latestBaselineAttempts(detail.validation?.baselineAttempts ?? [], detail.validation)
  const activeAttempt = attempts.find(attempt => ['scheduled', 'running', 'interrupted'].includes(attempt.status))
  const blockers = [
    ...detail.issues.filter(issue => issue.blocking).map(issue => issue.message),
    ...(detail.validationReview?.readiness.blockers ?? []),
    ...(detail.completionReview?.readiness.blockers ?? []),
  ]
  if (detail.blockingThreadIds.length > 0)
    blockers.push(`${detail.blockingThreadIds.length} blocking review remark(s).`)
  if (detail.orphanedThreadIds.length > 0)
    blockers.push(`${detail.orphanedThreadIds.length} orphaned review remark(s).`)
  const project = detail.projection.targetProjectId
  const route = `/plans/${encodeURIComponent(detail.plan.planId)}`
  const scoped = (review?: string) =>
    `${route}?${new URLSearchParams({ ...(project ? { project } : {}), ...(review ? { review } : {}) })}`
  const review = detail.plan.lifecycle.includes('baseline')
    ? 'baseline'
    : ['validation_passed', 'completed'].includes(detail.plan.lifecycle)
      ? 'completion'
      : detail.plan.lifecycle.includes('validation') || detail.plan.lifecycle === 'preparing_validations'
        ? 'validation'
        : undefined
  return {
    gate: activeStage?.label ?? 'Plan review',
    owner: nextAction.actor,
    nextAction: nextAction.action,
    blockers: [...new Set(blockers)],
    activeAttempt: activeAttempt
      ? {
          id: activeAttempt.id,
          testRunId: activeAttempt.testRunId,
          status: activeAttempt.status,
          validationId: activeAttempt.validationId,
        }
      : undefined,
    reviewUrl: scoped(review),
    recoveryUrl: scoped(detail.plan.lifecycle.includes('baseline') ? 'baseline' : review),
  }
}

export function LifecycleCommandCenter({ detail }: { detail: PlanReviewDetail }) {
  const state = lifecycleCommandCenterState(detail)
  return (
    <Card aria-labelledby="lifecycle-command-center-title">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle id="lifecycle-command-center-title" className="flex items-center gap-2 text-base">
            <Activity className="size-4 text-primary" /> Lifecycle command center
          </CardTitle>
          <Badge variant="outline">{state.gate}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.55fr)]">
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{state.owner}</Badge>
            <ArrowRight className="size-3.5 text-muted-foreground" />
            <span>{state.nextAction}</span>
          </div>
          {state.activeAttempt ? (
            <p className="bg-muted/25 rounded-md border p-2 text-xs">
              Active attempt <span className="font-mono">{state.activeAttempt.id}</span> · validation{' '}
              <span className="font-mono">{state.activeAttempt.validationId}</span> · TestRun{' '}
              <span className="font-mono">{state.activeAttempt.testRunId}</span> · {state.activeAttempt.status}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" /> No active managed attempt.
            </p>
          )}
          {state.blockers.length > 0 ? (
            <div className="border-destructive/30 bg-destructive/5 rounded-md border p-2.5">
              <p className="flex items-center gap-2 text-xs font-semibold text-destructive">
                <AlertTriangle className="size-3.5" /> Blockers
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {state.blockers.map(blocker => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="grid content-start gap-2">
          <Button asChild size="sm">
            <Link href={state.reviewUrl}>Open exact review surface</Link>
          </Button>
          {state.blockers.length > 0 ? (
            <Button asChild size="sm" variant="outline">
              <Link href={state.recoveryUrl}>Open recovery controls</Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
