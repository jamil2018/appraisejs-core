import type { Metadata } from 'next'
import { Route } from 'lucide-react'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { requireActiveProject } from '@/lib/active-project'
import { listQualityJourneys } from '@/services/coordinator/quality-journey-query-service'

import { QualityJourneyCreateForm } from './quality-journey-create-form'
import { QualityJourneysBrowser } from './quality-journeys-browser'

export const metadata: Metadata = {
  title: 'Quality Journeys',
  description: 'Track Appraise-owned requirement analysis and review workflow.',
}

export default async function QualityJourneysPage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string; predecessor?: string }>
}) {
  const parameters = await searchParams
  const project = await requireActiveProject(parameters?.project)
  const journeys = await listQualityJourneys({ targetProjectId: project.id })

  return (
    <main className="space-y-6 pb-10">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <PageHeader>
            <span className="flex items-center gap-3">
              <Route aria-hidden="true" className="size-7 text-primary sm:size-8" strokeWidth={2.2} />
              Quality Journeys
            </span>
          </PageHeader>
          <HeaderSubtitle>
            Requirement analysis, user decisions, and durable workflow state for {project.displayName}.
          </HeaderSubtitle>
        </div>
        <Badge
          className="mt-1 border-white/[0.1] bg-white/[0.035] px-3 py-1 text-xs font-semibold text-zinc-200"
          variant="outline"
        >
          {journeys.length} journeys
        </Badge>
      </header>
      <QualityJourneyCreateForm projectId={project.id} predecessorJourneyId={parameters?.predecessor} />
      <QualityJourneysBrowser items={journeys} projectId={project.id} />
    </main>
  )
}
