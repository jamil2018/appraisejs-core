import type { Metadata } from 'next'
import { Network } from 'lucide-react'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { listPlans } from '@/services/plan-review/plan-review-service'

import { PlansBrowser, type PlansBrowserPlan } from './plans-browser'

export const metadata: Metadata = {
  title: 'Plans',
  description: 'Review agent-authored implementation plans',
}

export default async function PlansPage() {
  const plans = await listPlans()
  const browserPlans: PlansBrowserPlan[] = plans.map(plan => ({
    planId: plan.planId,
    goal: plan.goal,
    description: plan.description,
    lifecycle: plan.lifecycle,
    revision: plan.revision,
    stale: plan.stale,
    conflicted: plan.conflicted,
    taskCount: plan.tasks.length,
    issueCount: plan.issues.length,
    updatedAt: plan.updatedAt.toISOString(),
    updatedAtLabel: plan.updatedAt.toLocaleDateString(),
  }))

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

      <PlansBrowser plans={browserPlans} />
    </main>
  )
}
