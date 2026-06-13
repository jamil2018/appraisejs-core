import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, GitBranch, ListChecks, Network, Search } from 'lucide-react'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { PlanLifecycleState } from '@/lib/plan-contract/lifecycle'
import { listPlans } from '@/services/plan-review/plan-review-service'

export const metadata: Metadata = {
  title: 'Plans',
  description: 'Review agent-authored implementation plans',
}

type PlanListItem = Awaited<ReturnType<typeof listPlans>>[number]
type PlansPageProps = {
  searchParams: Promise<{ page?: string; query?: string }>
}

const PLANS_PER_PAGE = 6

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

function getLifecycleBadgeClass(lifecycle: string): string {
  if (lifecycle in lifecycleBadgeClasses) {
    return lifecycleBadgeClasses[lifecycle as PlanLifecycleState]
  }

  return lifecycleBadgeClasses.draft
}

function getPageNumber(value: string | undefined): number {
  const page = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

function getPlansPageHref(page: number, query: string): string {
  const params = new URLSearchParams()

  if (query) {
    params.set('query', query)
  }
  if (page > 1) {
    params.set('page', String(page))
  }

  const search = params.toString()
  return search ? `/plans?${search}` : '/plans'
}

function matchesPlanSearch(plan: PlanListItem, query: string): boolean {
  const normalizedQuery = query.toLocaleLowerCase()
  return [plan.planId, plan.goal, plan.description, plan.lifecycle.replaceAll('_', ' ')].some(value =>
    value.toLocaleLowerCase().includes(normalizedQuery),
  )
}

// fallow-ignore-next-line complexity
function PlanCard({ plan }: { plan: PlanListItem }) {
  const hasProjectionIssue = plan.conflicted || plan.stale

  return (
    <Card className="hover:border-primary/50 group flex h-64 flex-col transition-colors">
      <CardHeader className="flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardDescription className="mb-3 truncate font-mono text-xs text-primary">{plan.planId}</CardDescription>
            <CardTitle className="line-clamp-2 text-lg">{plan.goal}</CardTitle>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{plan.description}</p>
            <Button asChild variant="link" size="sm" className="mt-1 h-auto px-0 py-0">
              <Link href={`/plans/${plan.planId}`}>
                Read the plan
                <ArrowRight />
              </Link>
            </Button>
          </div>
          <Badge
            variant={hasProjectionIssue ? 'destructive' : 'outline'}
            className={`shrink-0 whitespace-nowrap ${hasProjectionIssue ? '' : getLifecycleBadgeClass(plan.lifecycle)}`}
          >
            {plan.conflicted ? 'Conflict' : plan.stale ? 'Stale' : plan.lifecycle.replaceAll('_', ' ')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="mt-auto flex items-center justify-between text-muted-foreground">
        <span className="inline-flex h-4 items-center gap-1.5 text-sm leading-none">
          <ListChecks className="size-4 shrink-0 text-primary" />
          {plan.tasks.length} Tasks
        </span>
        <span className="inline-flex h-4 items-center gap-1.5 text-sm leading-none">
          <GitBranch className="size-4 shrink-0 text-primary" />
          Revision {plan.revision}
        </span>
      </CardContent>
    </Card>
  )
}

// fallow-ignore-next-line complexity
export default async function PlansPage({ searchParams }: PlansPageProps) {
  const plans = await listPlans()
  const resolvedSearchParams = await searchParams
  const query = resolvedSearchParams.query?.trim() ?? ''
  const filteredPlans = query ? plans.filter(plan => matchesPlanSearch(plan, query)) : plans
  const pageCount = Math.max(1, Math.ceil(filteredPlans.length / PLANS_PER_PAGE))
  const currentPage = Math.min(getPageNumber(resolvedSearchParams.page), pageCount)
  const pageStart = (currentPage - 1) * PLANS_PER_PAGE
  const visiblePlans = filteredPlans.slice(pageStart, pageStart + PLANS_PER_PAGE)

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
          {query ? `${filteredPlans.length} of ${plans.length} plans` : `${plans.length} plans`}
        </Badge>
      </header>

      <form action="/plans" method="get" className="flex max-w-xl items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="query"
            defaultValue={query}
            placeholder="Search plans by title, ID, description, or status"
            aria-label="Search plans"
            className="pl-9"
          />
        </div>
        <Button type="submit">Search</Button>
        {query ? (
          <Button asChild variant="outline">
            <Link href="/plans">Clear</Link>
          </Button>
        ) : null}
      </form>

      {plans.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <Network className="mb-4 size-9 text-muted-foreground" />
            <h2 className="text-lg font-semibold">No plans projected</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Add a canonical plan under appraise/plans and run plan sync to make it available here.
            </p>
          </CardContent>
        </Card>
      ) : filteredPlans.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <Search className="mb-4 size-9 text-muted-foreground" />
            <h2 className="text-lg font-semibold">No matching plans</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              No plans match &quot;{query}&quot;. Try a different title, ID, description, or status.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/plans">Clear search</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {visiblePlans.map(plan => (
              <PlanCard key={plan.planId} plan={plan} />
            ))}
          </div>

          {pageCount > 1 ? (
            <nav className="flex items-center justify-between gap-4" aria-label="Plans pagination">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {pageCount}
              </p>
              <div className="flex items-center gap-2">
                {currentPage === 1 ? (
                  <Button variant="outline" size="sm" disabled>
                    <ArrowLeft />
                    Previous
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link href={getPlansPageHref(currentPage - 1, query)}>
                      <ArrowLeft />
                      Previous
                    </Link>
                  </Button>
                )}
                {currentPage === pageCount ? (
                  <Button variant="outline" size="sm" disabled>
                    Next
                    <ArrowRight />
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link href={getPlansPageHref(currentPage + 1, query)}>
                      Next
                      <ArrowRight />
                    </Link>
                  </Button>
                )}
              </div>
            </nav>
          ) : null}
        </>
      )}
    </main>
  )
}
