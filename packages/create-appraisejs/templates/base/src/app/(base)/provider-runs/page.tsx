import type { Metadata } from 'next'
import Link from 'next/link'
import { Bot, Network, Route, TerminalSquare } from 'lucide-react'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { isProviderNativeRunsEnabled } from '@/lib/feature-flags'
import { listProviderAdapters, listProviderWorkflowRuns } from '@/services/coordinator/coordinator-provider-run-service'
import { listPlans } from '@/services/plan-review/plan-review-service'
import { listTargetProjects } from '@/services/target-project/target-project-service'

import { ProviderRunWorkspace } from './provider-run-workspace'

export const metadata: Metadata = {
  title: 'Provider Runs',
  description: 'Launch and inspect Appraise-owned provider workflow runs',
}

function ProviderRunsDisabledPage() {
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
          <HeaderSubtitle>Provider-native orchestration is experimental and disabled by default.</HeaderSubtitle>
        </div>
        <Badge variant="outline" className="gap-1 sm:mt-2">
          <Route className="size-3" />
          Experimental off
        </Badge>
      </header>

      <Card className="border-zinc-800 bg-zinc-950/50 shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Network className="size-5" />
            MCP-first workflow
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-sm text-muted-foreground">
          <p>
            Start planning from your coding agent through Appraise MCP. The app remains the review and validation
            surface: plans, requested changes, validation artifacts, and approval gates are reflected back here.
          </p>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-300">
            <div>npm run dev</div>
            <div>npm run setup:agent</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/plans">
                <Network className="size-4" />
                Open Plans
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/settings">
                <TerminalSquare className="size-4" />
                App Settings
              </Link>
            </Button>
          </div>
          <p className="text-xs">
            To test provider-native runs, set APPRAISE_EXPERIMENTAL_PROVIDER_RUNS=true before starting AppraiseJS.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}

export default async function ProviderRunsPage() {
  if (!isProviderNativeRunsEnabled()) {
    return <ProviderRunsDisabledPage />
  }

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
