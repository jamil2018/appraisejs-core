import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Network, Search } from 'lucide-react'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { listPlans } from '@/services/plan-review/plan-review-service'
import { requireActiveProject } from '@/lib/active-project'

import { PlanSummaryCard } from './plan-summary-card'
import { PlansFilterController } from './plans-filter-controller'
import { computePlanStats, filterPlans, parsePlansListSearchParams, sortPlans } from './plans-page-helpers'
import { PlansStatsCards } from './plans-stats-cards'

export const metadata: Metadata = {
  title: 'Plans',
  description: 'Review agent-authored implementation plans',
}

type PlansPageProps = {
  searchParams?: Promise<{ query?: string; tab?: string; sort?: string; project?: string }>
}

export default async function PlansPage({ searchParams }: PlansPageProps) {
  const rawParams = (await searchParams) ?? {}
  const resolvedParams = parsePlansListSearchParams(rawParams)
  const { query, tab, sort } = resolvedParams

  const project = await requireActiveProject(rawParams.project)
  const plans = await listPlans({ targetProjectId: project.id })
  const stats = computePlanStats(plans)
  const sortedPlans = sortPlans(filterPlans(plans, tab, query), sort)

  return (
    <main className="space-y-5 pb-10">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <PageHeader>
            <span className="flex items-center gap-3">
              <Network className="size-7 text-primary sm:size-8" strokeWidth={2.2} />
              Implementation Plans
            </span>
          </PageHeader>
          <HeaderSubtitle>
            Inspect canonical plan structure, leave remarks, and approve an exact revision.
          </HeaderSubtitle>
        </div>
        <Badge
          variant="outline"
          className="mt-1 border-white/[0.1] bg-white/[0.035] px-3 py-1 text-xs font-semibold text-zinc-200 shadow-none"
        >
          {plans.length} plans
        </Badge>
      </header>

      <PlansStatsCards {...stats} />

      <PlansFilterSection />

      <PlansResults plans={plans} sortedPlans={sortedPlans} />
    </main>
  )
}

function PlansFilterSection() {
  return (
    <Suspense fallback={<div className="h-10 w-full animate-pulse rounded-lg bg-muted" />}>
      <PlansFilterController />
    </Suspense>
  )
}

function PlansResults({
  plans,
  sortedPlans,
}: {
  plans: Awaited<ReturnType<typeof listPlans>>
  sortedPlans: Awaited<ReturnType<typeof listPlans>>
}) {
  if (plans.length === 0) {
    return (
      <EmptyPlansState
        icon={Network}
        title="No plans projected"
        description="Add a canonical plan under appraise/plans and run plan sync to make it available here."
      />
    )
  }

  if (sortedPlans.length === 0) {
    return (
      <EmptyPlansState
        icon={Search}
        title="No matching plans"
        description="No plans match your current status filter and search query."
      />
    )
  }

  return (
    <section className="grid gap-4 xl:grid-cols-2" aria-label="Plans">
      {sortedPlans.map(plan => (
        <PlanSummaryCard key={plan.planId} plan={plan} />
      ))}
    </section>
  )
}

function EmptyPlansState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Network
  title: string
  description: string
}) {
  return (
    <Card className="border-dashed border-white/[0.08] bg-[rgba(18,37,64,0.42)] shadow-none">
      <CardContent className="flex min-h-64 flex-col items-center justify-center p-6 text-center">
        <span className="mb-4 flex size-12 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-500">
          <Icon className="size-6" />
        </span>
        <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">{description}</p>
      </CardContent>
    </Card>
  )
}
