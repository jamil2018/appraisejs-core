'use client'

import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileText,
  GitBranch,
  ListChecks,
  Network,
  Search,
  ShieldAlert,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { PlanLifecycleState } from '@/lib/plan-contract/lifecycle'
import { cn } from '@/lib/utils'

export type PlansBrowserPlan = {
  planId: string
  goal: string
  description: string
  lifecycle: string
  revision: number
  stale: boolean
  conflicted: boolean
  taskCount: number
  issueCount: number
  updatedAt: string
  updatedAtLabel: string
}

type PlanFilter = 'all' | 'review' | 'baseline' | 'approved' | 'attention'

const reviewStates = new Set(['awaiting_plan_review', 'changes_requested'])
const baselineStates = new Set(['baseline_running', 'baseline_review'])
const approvedStates = new Set(['plan_approved', 'validations_approved', 'completed'])

const lifecycleBadgeClasses: Record<PlanLifecycleState, string> = {
  draft: 'border-slate-500/30 bg-slate-500/15 text-slate-700 dark:text-slate-300',
  awaiting_plan_review: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  changes_requested: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300',
  plan_approved: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  preparing_validations: 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300',
  awaiting_validation_review: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  validation_changes_requested: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300',
  validations_approved: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  baseline_running: 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300',
  baseline_review: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  baseline_changes_requested: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300',
  baseline_accepted: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  in_progress: 'border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-300',
  paused: 'border-slate-500/30 bg-slate-500/15 text-slate-700 dark:text-slate-300',
  ready_for_validation: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  validating: 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300',
  failed_validation: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300',
  validation_passed: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  completed: 'border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-300',
  cancelled: 'border-slate-500/30 bg-slate-500/15 text-slate-600 dark:text-slate-400',
}

const filters: Array<{ id: PlanFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'review', label: 'Awaiting Review' },
  { id: 'baseline', label: 'Active Baselines' },
  { id: 'approved', label: 'Approved' },
  { id: 'attention', label: 'Stale/Conflicted' },
]

const filterPredicates: Record<PlanFilter, (plan: PlansBrowserPlan) => boolean> = {
  all: () => true,
  review: plan => reviewStates.has(plan.lifecycle),
  baseline: plan => baselineStates.has(plan.lifecycle),
  approved: plan => approvedStates.has(plan.lifecycle),
  attention: plan => plan.stale || plan.conflicted,
}

const lifecycleIconRules: Array<{ matches: (plan: PlansBrowserPlan) => boolean; icon: LucideIcon }> = [
  { matches: plan => plan.conflicted || plan.stale, icon: ShieldAlert },
  { matches: plan => reviewStates.has(plan.lifecycle), icon: AlertTriangle },
  { matches: plan => plan.lifecycle === 'draft', icon: FileText },
  { matches: plan => baselineStates.has(plan.lifecycle), icon: CircleDashed },
  { matches: plan => approvedStates.has(plan.lifecycle), icon: CheckCircle2 },
  { matches: plan => plan.lifecycle === 'in_progress' || plan.lifecycle === 'validating', icon: Clock3 },
]

function getLifecycleBadgeClass(lifecycle: string): string {
  if (lifecycle in lifecycleBadgeClasses) return lifecycleBadgeClasses[lifecycle as PlanLifecycleState]
  return lifecycleBadgeClasses.draft
}

function matchesFilter(plan: PlansBrowserPlan, filter: PlanFilter): boolean {
  return filterPredicates[filter](plan)
}

function matchesSearch(plan: PlansBrowserPlan, query: string): boolean {
  const normalizedQuery = query.toLocaleLowerCase()
  return [plan.planId, plan.goal, plan.description, plan.lifecycle.replaceAll('_', ' ')].some(value =>
    value.toLocaleLowerCase().includes(normalizedQuery),
  )
}

function StatCard({
  title,
  value,
  caption,
  icon: Icon,
  className,
}: {
  title: string
  value: number
  caption: string
  icon: LucideIcon
  className?: string
}) {
  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <span className="bg-background/80 flex size-9 items-center justify-center rounded-lg border shadow-sm">
          <Icon className={cn('size-5 stroke-[2.4] text-muted-foreground', className)} />
        </span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </CardContent>
    </Card>
  )
}

function LifecycleBadgeIcon({ plan }: { plan: PlansBrowserPlan }) {
  const Icon = lifecycleIconRules.find(rule => rule.matches(plan))?.icon ?? Network
  return <Icon className="mr-1.5 size-3.5 stroke-[2.6]" />
}

function getCardAccentClass(plan: PlansBrowserPlan): string {
  if (plan.conflicted || plan.stale) return 'border-l-destructive'
  return approvedStates.has(plan.lifecycle) ? 'border-l-emerald-500' : 'border-l-slate-400'
}

function getLifecycleLabel(plan: PlansBrowserPlan): string {
  if (plan.conflicted) return 'Conflict'
  if (plan.stale) return 'Stale'
  return plan.lifecycle.replaceAll('_', ' ')
}

function PlanBadge({ plan }: { plan: PlansBrowserPlan }) {
  const hasProjectionIssue = plan.conflicted || plan.stale

  return (
    <Badge
      variant={hasProjectionIssue ? 'destructive' : 'outline'}
      className={cn(
        'absolute right-6 top-6 z-20 shrink-0 whitespace-nowrap pl-2',
        !hasProjectionIssue && getLifecycleBadgeClass(plan.lifecycle),
      )}
    >
      <LifecycleBadgeIcon plan={plan} />
      {getLifecycleLabel(plan)}
    </Badge>
  )
}

function MetadataChip({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-xs">
      <Icon className="size-4 stroke-[2.5] text-primary" />
      {children}
    </span>
  )
}

function PlanMetadata({ plan }: { plan: PlansBrowserPlan }) {
  return (
    <div className="flex flex-wrap gap-2 text-muted-foreground">
      <MetadataChip icon={ListChecks}>{plan.taskCount} Tasks</MetadataChip>
      <MetadataChip icon={GitBranch}>Revision {plan.revision}</MetadataChip>
      <MetadataChip icon={CircleDashed}>{plan.updatedAtLabel}</MetadataChip>
      {plan.issueCount > 0 ? (
        <span className="border-destructive/30 bg-destructive/10 inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs text-destructive">
          <ShieldAlert className="size-4 stroke-[2.5]" />
          {plan.issueCount} Issues
        </span>
      ) : null}
    </div>
  )
}

function PlanCard({ plan }: { plan: PlansBrowserPlan }) {
  return (
    <Card
      className={cn(
        'hover:border-primary/50 group relative flex min-h-[238px] flex-col overflow-hidden rounded-lg border-l-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl',
        getCardAccentClass(plan),
      )}
    >
      <Link
        href={`/plans/${plan.planId}`}
        aria-label={`Read the plan ${plan.goal}`}
        className="absolute inset-0 z-10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />
      <CardHeader className="relative flex-1 pr-20">
        <div className="min-w-0 pr-0 sm:pr-40">
          <CardDescription className="mb-3 truncate font-mono text-xs text-primary">{plan.planId}</CardDescription>
          <CardTitle className="line-clamp-2 text-lg leading-6">{plan.goal}</CardTitle>
          <PlanBadge plan={plan} />
        </div>
        <p className="mt-3 line-clamp-3 pr-0 text-sm leading-6 text-muted-foreground sm:pr-24">{plan.description}</p>
      </CardHeader>
      <CardContent className="mt-auto pb-6 pr-20">
        <PlanMetadata plan={plan} />
      </CardContent>
      <span className="border-primary/30 shadow-primary/20 group-hover:shadow-primary/30 pointer-events-none absolute bottom-5 right-5 z-20 flex size-12 items-center justify-center rounded-full border bg-primary text-primary-foreground shadow-lg transition-all duration-200 group-hover:scale-105">
        <ArrowRight className="size-5 stroke-[2.6]" />
      </span>
    </Card>
  )
}

// fallow-ignore-next-line complexity
export function PlansBrowser({ plans }: { plans: PlansBrowserPlan[] }) {
  const [activeFilter, setActiveFilter] = useState<PlanFilter>('all')
  const [query, setQuery] = useState('')
  const counts = useMemo(
    () => ({
      needsReview: plans.filter(plan => reviewStates.has(plan.lifecycle)).length,
      activeBaselines: plans.filter(plan => baselineStates.has(plan.lifecycle)).length,
      approved: plans.filter(plan => approvedStates.has(plan.lifecycle)).length,
      attention: plans.filter(plan => plan.stale || plan.conflicted).length,
    }),
    [plans],
  )
  const visiblePlans = useMemo(() => {
    const trimmedQuery = query.trim()
    return plans.filter(
      plan => matchesFilter(plan, activeFilter) && (!trimmedQuery || matchesSearch(plan, trimmedQuery)),
    )
  }, [activeFilter, plans, query])

  return (
    <section className="space-y-6" aria-label="Plans browser">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Needs Review"
          value={counts.needsReview}
          caption="Awaiting review or changes requested"
          icon={AlertTriangle}
          className="text-amber-500"
        />
        <StatCard
          title="Active Baselines"
          value={counts.activeBaselines}
          caption="Baseline runs or evidence review"
          icon={CircleDashed}
          className="text-sky-500"
        />
        <StatCard
          title="Approved / Completed"
          value={counts.approved}
          caption="Approved plans and completed work"
          icon={CheckCircle2}
          className="text-emerald-500"
        />
        <StatCard
          title="Total Plans"
          value={plans.length}
          caption={`${counts.attention} stale or conflicted`}
          icon={Network}
          className="text-primary"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Plan status filters">
          {filters.map(filter => (
            <Button
              key={filter.id}
              type="button"
              variant={activeFilter === filter.id ? 'default' : 'outline'}
              size="sm"
              role="tab"
              aria-selected={activeFilter === filter.id}
              onClick={() => setActiveFilter(filter.id)}
            >
              {filter.id === 'attention' ? <ShieldAlert className="!size-4 stroke-[2.5]" /> : null}
              {filter.label}
            </Button>
          ))}
        </div>
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search title, ID, description, or status"
            aria-label="Search plans"
            className="pl-9"
          />
        </div>
      </div>

      {plans.length === 0 ? (
        <Card className="rounded-lg border-dashed">
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <Network className="mb-4 size-9 text-muted-foreground" />
            <h2 className="text-lg font-semibold">No plans projected</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Add a canonical plan under appraise/plans and run plan sync to make it available here.
            </p>
          </CardContent>
        </Card>
      ) : visiblePlans.length === 0 ? (
        <Card className="rounded-lg border-dashed">
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <Search className="mb-4 size-9 text-muted-foreground" />
            <h2 className="text-lg font-semibold">No matching plans</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              No plans match the current search and status filter.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visiblePlans.map(plan => (
            <PlanCard key={plan.planId} plan={plan} />
          ))}
        </div>
      )}
    </section>
  )
}
