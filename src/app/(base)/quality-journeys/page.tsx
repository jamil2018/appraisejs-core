import type { Metadata } from 'next'
import Link from 'next/link'
import { Route } from 'lucide-react'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { requireActiveProject } from '@/lib/active-project'
import { listQualityJourneys } from '@/services/coordinator/quality-journey-query-service'
import { listQualityJourneyDrafts } from '@/services/coordinator/quality-journey-draft-service'

import { QualityJourneysBrowser } from './quality-journeys-browser'

export const metadata: Metadata = {
  title: 'Quality Journeys',
  description: 'Track Appraise-owned requirement analysis and review workflow.',
}

type DraftSummary = Awaited<ReturnType<typeof listQualityJourneyDrafts>>[number]

const draftView = {
  drafts: {
    status: 'ACTIVE' as const,
    title: 'Drafts',
    alternateLabel: 'View archived drafts',
    alternateView: 'archived',
  },
  archived: {
    status: 'ARCHIVED' as const,
    title: 'Archived drafts',
    alternateLabel: 'View active drafts',
    alternateView: 'drafts',
  },
}

function DraftCards({ drafts, projectId }: { drafts: DraftSummary[]; projectId: string }) {
  if (!drafts.length)
    return <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No drafts yet.</p>
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {drafts.map(draft => (
        <Link
          className="bg-card/40 hover:bg-muted/40 rounded-xl border p-4 transition-colors"
          href={`/quality-journeys/drafts/${draft.id}?project=${encodeURIComponent(projectId)}`}
          key={draft.id}
        >
          <p className="font-medium">{draft.requirement.objective ?? 'Untitled brief'}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {draft.status === 'ARCHIVED' ? 'Archived' : `Step ${draft.currentStep + 1} of 4`} · Saved{' '}
            {draft.updatedAt.toLocaleString()}
          </p>
        </Link>
      ))}
    </div>
  )
}

export default async function QualityJourneysPage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string; view?: 'drafts' | 'archived' }>
}) {
  const parameters = (await searchParams) ?? {}
  const project = await requireActiveProject(parameters.project)
  const view = draftView[parameters.view ?? 'drafts']
  const [journeys, drafts] = await Promise.all([
    listQualityJourneys({ targetProjectId: project.id }),
    listQualityJourneyDrafts({ targetProjectId: project.id, status: view.status }),
  ])

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
      <section className="bg-card/40 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-5">
        <div>
          <h2 className="font-semibold">Start with your brief</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Plan and run tests from a requirement. Drafts are saved to this workspace.
          </p>
        </div>
        <Button asChild>
          <Link href={`/quality-journeys/new?project=${encodeURIComponent(project.id)}`}>Start a Quality Journey</Link>
        </Button>
      </section>
      <section aria-labelledby="drafts-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold" id="drafts-heading">
            {view.title}
          </h2>
          <Link
            className="text-sm text-primary underline-offset-4 hover:underline"
            href={`/quality-journeys?project=${encodeURIComponent(project.id)}&view=${view.alternateView}`}
          >
            {view.alternateLabel}
          </Link>
        </div>
        <DraftCards drafts={drafts} projectId={project.id} />
      </section>
      <QualityJourneysBrowser items={journeys} projectId={project.id} />
    </main>
  )
}
