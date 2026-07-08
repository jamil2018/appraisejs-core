import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Network, Search } from 'lucide-react'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { listPlans } from '@/services/plan-review/plan-review-service'

import { PlanSummaryCard } from './plan-summary-card'
import { PlansFilterController } from './plans-filter-controller'
import { computePlanStats, filterPlans, parsePlansListSearchParams, sortPlans } from './plans-page-helpers'
import { PlansStatsCards } from './plans-stats-cards'

export const metadata: Metadata = {
  title: 'Plans',
  description: 'Review agent-authored implementation plans',
}

type PlansPageProps = {
  searchParams?: Promise<{ query?: string; tab?: string; sort?: string }>
}

export default async function PlansPage({ searchParams }: PlansPageProps) {
  const resolvedParams = parsePlansListSearchParams((await searchParams) ?? {})
  const { query, tab, sort } = resolvedParams

  const plans = await listPlans()
  const stats = computePlanStats(plans)
  const sortedPlans = sortPlans(filterPlans(plans, tab, query), sort)

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
    <div className="grid gap-6 md:grid-cols-2">
      {sortedPlans.map(plan => (
        <PlanSummaryCard key={plan.planId} plan={plan} />
      ))}
    </div>
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
    <Card className="rounded-xl border-dashed">
      <CardContent className="flex min-h-64 flex-col items-center justify-center p-6 text-center">
        <Icon className="mb-4 size-10 text-muted-foreground opacity-60" />
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}
