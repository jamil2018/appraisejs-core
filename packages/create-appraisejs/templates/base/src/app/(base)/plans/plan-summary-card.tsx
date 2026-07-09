import Link from 'next/link'
import { ArrowRight, Clock, GitBranch, ListChecks, ShieldAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { planCanonicalRoute, getPlanDisplaySlug } from '@/lib/plans/plan-display'

import { getCardStyles, getLifecycleLabel, getPlanTaskProgress, type ListedPlan } from './plans-page-helpers'

export function PlanSummaryCard({ plan }: { plan: ListedPlan }) {
  const displaySlug = getPlanDisplaySlug(plan)
  const styles = getCardStyles(plan.lifecycle, plan.stale, plan.conflicted)
  const label = getLifecycleLabel(plan.lifecycle, plan.stale, plan.conflicted)
  const { completedCount, totalCount, completionPercentage } = getPlanTaskProgress(plan)

  return (
    <Card
      className={`hover:border-primary/35 group relative flex flex-col justify-between overflow-hidden rounded-lg border border-l-[3px] border-white/[0.075] bg-[rgba(18,37,64,0.34)] transition-all duration-300 hover:scale-[1.005] hover:bg-[rgba(22,47,78,0.42)] ${styles.border}`}
    >
      <Link
        href={planCanonicalRoute(plan.planId)}
        className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      />

      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <CardDescription className="group-hover:text-primary-foreground/90 font-mono text-xs font-semibold text-primary transition-colors">
            {displaySlug}
            {displaySlug === plan.planId ? null : (
              <span className="ml-2 font-normal text-muted-foreground">ID {plan.planId}</span>
            )}
          </CardDescription>

          <Badge
            variant="outline"
            className={`gap-1.5 py-0.5 pl-2 pr-2.5 text-xs font-semibold capitalize ${styles.badge}`}
          >
            <span className={`size-1.5 rounded-full ${styles.dot}`} />
            {label}
          </Badge>
        </div>

        <CardTitle className="mt-3 line-clamp-2 text-lg font-bold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
          {plan.goal}
        </CardTitle>

        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
      </CardHeader>

      <CardContent className="space-y-4 pb-6 pt-0">
        {totalCount > 0 ? (
          <PlanTaskProgress
            completedCount={completedCount}
            totalCount={totalCount}
            completionPercentage={completionPercentage}
          />
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4 text-muted-foreground">
          <PlanSummaryMeta plan={plan} />

          <span className="group-hover:border-primary/45 group-hover:bg-primary/85 pointer-events-none flex size-9 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035] text-muted-foreground shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:text-primary-foreground">
            <ArrowRight className="size-4 stroke-[2.2]" />
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function PlanSummaryMeta({ plan }: { plan: ListedPlan }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="inline-flex h-6 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.035] px-2 text-[11px] font-medium">
        <GitBranch className="text-primary/70 size-3" />
        Rev {plan.revision}
      </span>
      <span className="inline-flex h-6 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.035] px-2 text-[11px] font-medium">
        <Clock className="text-primary/70 size-3" />
        {plan.updatedAt.toLocaleDateString()}
      </span>
      <PlanIssueBadge issueCount={plan.issues.length} />
    </div>
  )
}

function PlanIssueBadge({ issueCount }: { issueCount: number }) {
  if (issueCount === 0) return null

  const label = issueCount === 1 ? 'Issue' : 'Issues'
  return (
    <span className="border-destructive/20 bg-destructive/5 inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold text-destructive">
      <ShieldAlert className="size-3" />
      {issueCount} {label}
    </span>
  )
}

function PlanTaskProgress({
  completedCount,
  totalCount,
  completionPercentage,
}: {
  completedCount: number
  totalCount: number
  completionPercentage: number
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1 font-medium">
          <ListChecks className="size-3.5" />
          Tasks Progress
        </span>
        <span className="text-foreground/80 font-mono font-semibold">
          {completedCount}/{totalCount} ({completionPercentage}%)
        </span>
      </div>
      <Progress value={completionPercentage} className="h-1.5" />
    </div>
  )
}
