import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, FilePenLine } from 'lucide-react'

import PageHeader from '@/components/typography/page-header'
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
  },
  archived: {
    status: 'ARCHIVED' as const,
  },
}

const draftTabs = [
  { label: 'Active', value: 'drafts' as const },
  { label: 'Archived', value: 'archived' as const },
]

function DraftCards({ drafts, projectId }: { drafts: DraftSummary[]; projectId: string }) {
  if (!drafts.length)
    return (
      <p className="rounded-xl border border-dashed border-border bg-secondary p-4 text-sm text-muted-foreground">
        No drafts yet.
      </p>
    )
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {drafts.map(draft => (
        <Link
          className="app-surface group relative flex min-h-28 items-start gap-3 overflow-hidden rounded-xl p-4 pr-14 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          href={`/quality-journeys/drafts/${draft.id}?project=${encodeURIComponent(projectId)}`}
          key={draft.id}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-info-border bg-info-surface text-info">
            <FilePenLine aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
              {draft.requirement.objective ?? 'Untitled brief'}
            </span>
            <span className="mt-2 block text-xs leading-5 text-muted-foreground">
              {draft.status === 'ARCHIVED' ? 'Archived' : `Step ${draft.currentStep + 1} of 4`} · Saved{' '}
              {draft.updatedAt.toLocaleString()}
            </span>
          </span>
          <span className="pointer-events-none absolute right-4 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-[border-color,color,transform] group-hover:translate-x-0.5 group-hover:border-info-border group-hover:text-info">
            <ArrowRight aria-hidden="true" className="size-4" />
          </span>
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
  const activeDraftView = parameters.view ?? 'drafts'
  const view = draftView[activeDraftView]
  const [journeys, drafts] = await Promise.all([
    listQualityJourneys({ targetProjectId: project.id }),
    listQualityJourneyDrafts({ targetProjectId: project.id, status: view.status }),
  ])

  return (
    <div className="space-y-4">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row">
        <PageHeader>Quality Journeys</PageHeader>
        <Button
          nativeButton={false}
          render={<Link href={`/quality-journeys/new?project=${encodeURIComponent(project.id)}`} />}
        >
          New journey
        </Button>
      </header>
      <QualityJourneysBrowser items={journeys} projectId={project.id} />
      <details open={activeDraftView === 'archived' || undefined}>
        <summary className="cursor-pointer font-medium">Drafts</summary>
        <section aria-labelledby="drafts-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold tracking-wide text-foreground" id="drafts-heading">
                Drafts
              </h2>
              <span className="text-xs text-muted-foreground">{drafts.length}</span>
            </div>
            <nav
              aria-label="Draft status"
              className="flex h-10 items-center rounded-xl border border-border bg-secondary p-1"
            >
              {draftTabs.map(tab => {
                const isActive = activeDraftView === tab.value
                return (
                  <Link
                    aria-current={isActive ? 'page' : undefined}
                    className={`app-focus flex h-8 items-center rounded-lg px-3 text-xs font-medium transition-[color,background-color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                      isActive
                        ? 'border border-border bg-card text-foreground shadow-sm'
                        : 'border border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                    href={`/quality-journeys?project=${encodeURIComponent(project.id)}&view=${tab.value}`}
                    key={tab.value}
                  >
                    {tab.label}
                  </Link>
                )
              })}
            </nav>
          </div>
          <DraftCards drafts={drafts} projectId={project.id} />
        </section>
      </details>
    </div>
  )
}
