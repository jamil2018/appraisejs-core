import Link from 'next/link'
import { ArrowRight, Clock, GitBranch, ListChecks, ShieldAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { planCanonicalRoute, getPlanDisplaySlug } from '@/lib/plans/plan-display'

import { getCardStyles, getLifecycleLabel, getPlanTaskProgress, type ListedPlan } from './plans-page-helpers'

export function PlanSummaryCard({ plan }: { plan: ListedPlan }) {
  const displaySlug = getPlanDisplaySlug(plan)
  const styles = getCardStyles(plan.lifecycle, plan.stale, plan.conflicted)
  const label = getLifecycleLabel(plan.lifecycle, plan.stale, plan.conflicted)
  const { completedCount, totalCount, completionPercentage } = getPlanTaskProgress(plan)
  const href = planCanonicalRoute(plan.planId)

  return (
    <Card
      className={cn(
        'group relative flex min-h-[258px] flex-col justify-between overflow-hidden border border-l-[3px] border-white/[0.08] bg-[rgba(18,37,64,0.42)] shadow-none transition-colors duration-200 hover:border-white/[0.12] hover:bg-[rgba(22,47,78,0.52)]',
        styles.border,
      )}
    >
      <Link
        href={href}
        aria-label={`Open plan ${plan.goal}`}
        className="absolute inset-0 z-10 rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      />

      <CardHeader className="px-4 pb-4 pt-4">
        <div className="flex items-start justify-between gap-4">
          <CardDescription className="min-w-0 font-mono text-[11px] font-semibold leading-5 text-primary transition-colors duration-200 group-hover:text-primary">
            <span className="truncate">{displaySlug}</span>
            {displaySlug === plan.planId ? null : (
              <span className="ml-2 font-normal text-zinc-500">ID {plan.planId}</span>
            )}
          </CardDescription>

          <Badge
            variant="outline"
            className={cn(
              'relative z-20 shrink-0 gap-1.5 rounded-md py-0.5 pl-2 pr-2.5 text-[11px] font-semibold capitalize shadow-none',
              styles.badge,
            )}
          >
            <span className={`size-1.5 rounded-full ${styles.dot}`} />
            {label}
          </Badge>
        </div>

        <CardTitle className="mt-3 line-clamp-2 text-lg font-semibold leading-6 text-zinc-100 transition-colors duration-200 group-hover:text-zinc-50">
          {plan.goal}
        </CardTitle>

        <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-500 transition-colors duration-200 group-hover:text-zinc-500">
          {plan.description}
        </p>
      </CardHeader>

      <CardContent className="space-y-4 px-4 pb-4 pt-0">
        {totalCount > 0 ? (
          <PlanTaskProgress
            completedCount={completedCount}
            totalCount={totalCount}
            completionPercentage={completionPercentage}
          />
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4 text-zinc-500">
          <PlanSummaryMeta plan={plan} />

          <span className="pointer-events-none flex size-9 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-zinc-500 transition-colors duration-200 group-hover:border-white/[0.12] group-hover:bg-[rgba(22,47,78,0.65)] group-hover:text-zinc-300">
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
      <span className="inline-flex h-6 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.035] px-2 text-[11px] font-medium text-zinc-400">
        <GitBranch className="text-primary/70 size-3" />
        Rev {plan.revision}
      </span>
      <span className="inline-flex h-6 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.035] px-2 text-[11px] font-medium text-zinc-400">
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
      <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
        <span className="flex items-center gap-1 font-medium">
          <ListChecks className="size-3.5" />
          Task progress
        </span>
        <span className="whitespace-nowrap font-mono font-semibold text-zinc-300">
          {completedCount}/{totalCount} ({completionPercentage}%)
        </span>
      </div>
      <Progress value={completionPercentage} className="h-1.5" />
    </div>
  )
}
