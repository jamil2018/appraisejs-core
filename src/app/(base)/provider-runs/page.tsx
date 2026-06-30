import type { Metadata } from 'next'
import { Bot, Route } from 'lucide-react'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { listProviderAdapters, listProviderWorkflowRuns } from '@/services/coordinator/coordinator-provider-run-service'
import { listPlans } from '@/services/plan-review/plan-review-service'
import { listTargetProjects } from '@/services/target-project/target-project-service'

import { ProviderRunWorkspace } from './provider-run-workspace'

export const metadata: Metadata = {
  title: 'Provider Runs',
  description: 'Launch and inspect Appraise-owned provider workflow runs',
}

export default async function ProviderRunsPage() {
  const [runs, adapters, targetProjects, plans] = await Promise.all([
    listProviderWorkflowRuns(),
    listProviderAdapters(),
    listTargetProjects(),
    listPlans(),
  ])

  return (
    <main className="space-y-6 pb-10">
      <header className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <PageHeader>
            <span className="flex items-center">
              <Bot className="mr-2 size-8" />
              Provider Runs
            </span>
          </PageHeader>
          <HeaderSubtitle>
            Start planning-only provider runs from Appraise and inspect their durable event trail.
          </HeaderSubtitle>
        </div>
        <div className="flex gap-2 sm:mt-2">
          <Badge variant="outline" className="gap-1">
            <Route className="size-3" />
            {targetProjects.length} targets
          </Badge>
          <Badge variant="outline">{runs.length} runs</Badge>
        </div>
      </header>

      <ProviderRunWorkspace runs={runs} adapters={adapters} targetProjects={targetProjects} plans={plans} />
    </main>
  )
}
