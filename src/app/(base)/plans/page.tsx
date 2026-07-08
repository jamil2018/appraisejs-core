import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import {
  Network,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  ListChecks,
  GitBranch,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { getPlanDisplaySlug, planCanonicalRoute } from '@/lib/plans/plan-display'
import { listPlans } from '@/services/plan-review/plan-review-service'

import { PlansFilterController } from './plans-filter-controller'

export const metadata: Metadata = {
  title: 'Plans',
  description: 'Review agent-authored implementation plans',
}

type PlansPageProps = {
  searchParams?: Promise<{ query?: string; tab?: string; sort?: string }>
}

const reviewStates = new Set([
  'awaiting_plan_review',
  'changes_requested',
  'awaiting_validation_review',
  'validation_changes_requested',
  'baseline_review',
  'baseline_changes_requested',
])

const approvedStates = new Set([
  'plan_approved',
  'validations_approved',
  'baseline_accepted',
  'completed',
  'validation_passed',
])

const inProgressStates = new Set(['in_progress', 'preparing_validations', 'baseline_running', 'validating'])

// fallow-ignore-next-line complexity
function getCardStyles(lifecycle: string, stale: boolean, conflicted: boolean) {
  if (stale || conflicted || lifecycle === 'failed_validation') {
    return {
      border: 'border-l-destructive',
      dot: 'bg-destructive animate-pulse',
      badge: 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20',
    }
  }
  if (approvedStates.has(lifecycle)) {
    return {
      border: 'border-l-emerald-500',
      dot: 'bg-emerald-500',
      badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20',
    }
  }
  if (inProgressStates.has(lifecycle)) {
    return {
      border: 'border-l-violet-500',
      dot: 'bg-violet-500 animate-pulse',
      badge: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20',
    }
  }
  if (reviewStates.has(lifecycle)) {
    return {
      border: 'border-l-amber-500',
      dot: 'bg-amber-500',
      badge: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20',
    }
  }
  return {
    border: 'border-l-muted-foreground/30',
    dot: 'bg-muted-foreground/50',
    badge: 'border-muted-foreground/30 bg-muted/10 text-muted-foreground hover:bg-muted/20',
  }
}

function getLifecycleLabel(lifecycle: string, stale: boolean, conflicted: boolean) {
  if (conflicted) return 'Conflicted'
  if (stale) return 'Stale'
  return lifecycle.replaceAll('_', ' ')
}

type ListedPlan = Awaited<ReturnType<typeof listPlans>>[number]

// fallow-ignore-next-line complexity
function matchesPlanTab(lifecycle: string, tab: string) {
  if (tab === 'all') return true
  if (tab === 'draft') return lifecycle === 'draft'
  if (tab === 'awaiting_review') return reviewStates.has(lifecycle)
  if (tab === 'approved') return approvedStates.has(lifecycle)
  if (tab === 'in_progress') return inProgressStates.has(lifecycle)
  if (tab === 'completed') return lifecycle === 'completed' || lifecycle === 'validation_passed'
  return true
}

// fallow-ignore-next-line complexity
function matchesPlanQuery(plan: ListedPlan, query: string) {
  if (!query) return true
  const normalizedQuery = query.toLowerCase()
  const slug = getPlanDisplaySlug(plan).toLowerCase()
  const goal = plan.goal.toLowerCase()
  const desc = plan.description.toLowerCase()
  const statusLabel = plan.lifecycle.replaceAll('_', ' ').toLowerCase()
  return (
    slug.includes(normalizedQuery) ||
    goal.includes(normalizedQuery) ||
    desc.includes(normalizedQuery) ||
    statusLabel.includes(normalizedQuery)
  )
}

function filterPlans(plans: ListedPlan[], tab: string, query: string) {
  return plans.filter(plan => matchesPlanTab(plan.lifecycle, tab) && matchesPlanQuery(plan, query))
}

// fallow-ignore-next-line complexity
function comparePlans(a: ListedPlan, b: ListedPlan, sort: string) {
  if (sort === 'revision') {
    if (b.revision !== a.revision) return b.revision - a.revision
    return b.updatedAt.getTime() - a.updatedAt.getTime()
  }
  if (sort === 'tasks') return b.tasks.length - a.tasks.length
  if (sort === 'goal') return a.goal.localeCompare(b.goal)
  return b.updatedAt.getTime() - a.updatedAt.getTime()
}

function sortPlans(plans: ListedPlan[], sort: string) {
  return [...plans].sort((a, b) => comparePlans(a, b, sort))
}

// fallow-ignore-next-line complexity
function getPlanTaskProgress(plan: ListedPlan) {
  let taskStates: Record<string, string> = {}
  if (plan.validationJson) {
    try {
      const parsedVal = JSON.parse(plan.validationJson)
      if (parsedVal?.implementation?.taskStates) {
        taskStates = parsedVal.implementation.taskStates
      }
    } catch {
      // Ignore invalid validation payloads on list cards.
    }
  }

  const completedCount = plan.tasks.filter(task => {
    const status = taskStates[task.taskId] ?? 'pending'
    return ['completed', 'implemented', 'verified'].includes(status)
  }).length
  const totalCount = plan.tasks.length
  const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return { completedCount, totalCount, completionPercentage }
}

// fallow-ignore-next-line complexity
function PlanSummaryCard({ plan }: { plan: ListedPlan }) {
  const displaySlug = getPlanDisplaySlug(plan)
  const styles = getCardStyles(plan.lifecycle, plan.stale, plan.conflicted)
  const label = getLifecycleLabel(plan.lifecycle, plan.stale, plan.conflicted)
  const { completedCount, totalCount, completionPercentage } = getPlanTaskProgress(plan)

  return (
    <Card
      className={`hover:border-primary/40 group relative flex flex-col justify-between overflow-hidden rounded-xl border border-l-4 border-border bg-card shadow-sm transition-all duration-300 hover:scale-[1.01] hover:shadow-md ${styles.border}`}
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
        {totalCount > 0 && (
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
        )}

        <div className="flex items-center justify-between gap-3 border-t pt-4 text-muted-foreground">
          <div className="flex flex-wrap gap-2">
            <span className="bg-muted/30 inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] font-medium">
              <GitBranch className="text-primary/70 size-3" />
              Rev {plan.revision}
            </span>
            <span className="bg-muted/30 inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] font-medium">
              <Clock className="text-primary/70 size-3" />
              {plan.updatedAt.toLocaleDateString()}
            </span>
            {plan.issues.length > 0 && (
              <span className="border-destructive/20 bg-destructive/5 inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold text-destructive">
                <ShieldAlert className="size-3" />
                {plan.issues.length} {plan.issues.length === 1 ? 'Issue' : 'Issues'}
              </span>
            )}
          </div>

          <span className="pointer-events-none flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
            <ArrowRight className="size-4 stroke-[2.2]" />
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// fallow-ignore-next-line complexity
export default async function PlansPage({ searchParams }: PlansPageProps) {
  const params = (await searchParams) ?? {}
  const query = params.query ?? ''
  const tab = params.tab ?? 'all'
  const sort = params.sort ?? 'recent'

  const plans = await listPlans()

  // Calculate Metrics for Stat Cards
  const totalActive = plans.filter(
    p => p.lifecycle !== 'completed' && p.lifecycle !== 'cancelled' && p.lifecycle !== 'draft',
  ).length
  const totalApproved = plans.filter(p => approvedStates.has(p.lifecycle)).length
  const totalAwaitingReview = plans.filter(p => reviewStates.has(p.lifecycle)).length
  const totalInProgress = plans.filter(p => inProgressStates.has(p.lifecycle)).length

  const filteredPlans = filterPlans(plans, tab, query)
  const sortedPlans = sortPlans(filteredPlans, sort)

  return (
    <main className="space-y-6 pb-10">
      <header className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <PageHeader>
            <span className="flex items-center">
              <Network className="mr-2 size-8" />
              Implementation Plans
            </span>
          </PageHeader>
          <HeaderSubtitle>
            Inspect canonical plan structure, leave remarks, and approve an exact revision.
          </HeaderSubtitle>
        </div>
        <Badge variant="outline" className="sm:mt-2">
          {plans.length} plans
        </Badge>
      </header>

      {/* Summary Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Active Plans</CardTitle>
            <span className="flex size-8 items-center justify-center rounded-lg border bg-background text-primary">
              <Network className="size-4 stroke-[2.2]" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalActive}</div>
            <p className="mt-1 text-xs text-muted-foreground">Excludes drafts and completed work</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-l-emerald-500 bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Approved Plans</CardTitle>
            <span className="flex size-8 items-center justify-center rounded-lg border bg-background text-emerald-500">
              <CheckCircle2 className="size-4 stroke-[2.2]" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{totalApproved}</div>
            <p className="mt-1 text-xs text-muted-foreground">Ready for baseline or implementation</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-l-amber-500 bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Awaiting Review</CardTitle>
            <span className="flex size-8 items-center justify-center rounded-lg border bg-background text-amber-500">
              <AlertTriangle className="size-4 stroke-[2.2]" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{totalAwaitingReview}</div>
            <p className="mt-1 text-xs text-muted-foreground">Requires review or feedback</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-l-violet-500 bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <span className="flex size-8 items-center justify-center rounded-lg border bg-background text-violet-500">
              <Clock className="size-4 stroke-[2.2]" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-violet-700 dark:text-violet-400">{totalInProgress}</div>
            <p className="mt-1 text-xs text-muted-foreground">Active baseline or coding phase</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Controller */}
      <Suspense fallback={<div className="h-10 w-full animate-pulse rounded-lg bg-muted" />}>
        <PlansFilterController />
      </Suspense>

      {/* Plans List Grid */}
      {plans.length === 0 ? (
        <Card className="rounded-xl border-dashed">
          <CardContent className="flex min-h-64 flex-col items-center justify-center p-6 text-center">
            <Network className="mb-4 size-10 text-muted-foreground opacity-60" />
            <h2 className="text-lg font-semibold">No plans projected</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Add a canonical plan under appraise/plans and run plan sync to make it available here.
            </p>
          </CardContent>
        </Card>
      ) : sortedPlans.length === 0 ? (
        <Card className="rounded-xl border-dashed">
          <CardContent className="flex min-h-64 flex-col items-center justify-center p-6 text-center">
            <Search className="mb-4 size-10 text-muted-foreground opacity-60" />
            <h2 className="text-lg font-semibold">No matching plans</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              No plans match your current status filter and search query.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {sortedPlans.map(plan => (
            <PlanSummaryCard key={plan.planId} plan={plan} />
          ))}
        </div>
      )}
    </main>
  )
}
