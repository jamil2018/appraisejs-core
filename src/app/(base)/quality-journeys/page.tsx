import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, FilePenLine, Route, Sparkles } from 'lucide-react'

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
      <p className="rounded-xl border border-dashed border-white/[0.1] bg-white/[0.018] p-4 text-sm text-muted-foreground">
        No drafts yet.
      </p>
    )
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {drafts.map(draft => (
        <Link
          className="focus-visible:ring-primary/60 group relative flex min-h-28 items-start gap-3 overflow-hidden rounded-xl border border-white/[0.09] bg-[linear-gradient(145deg,rgba(255,255,255,0.05),rgba(255,255,255,0.014))] p-4 pr-14 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-16px_32px_rgba(0,0,0,0.1),0_18px_50px_-38px_rgba(0,0,0,0.8)] backdrop-blur-xl transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2"
          href={`/quality-journeys/drafts/${draft.id}?project=${encodeURIComponent(projectId)}`}
          key={draft.id}
        >
          <span className="border-primary/20 bg-primary/[0.07] flex size-9 shrink-0 items-center justify-center rounded-full border text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
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
          <span className="text-foreground/70 group-hover:border-primary/35 pointer-events-none absolute right-4 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/[0.12] bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-xl transition-[border-color,color,transform] group-hover:translate-x-0.5 group-hover:text-primary">
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
      <section className="relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-xl border border-white/[0.09] bg-[linear-gradient(145deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.026)_46%,rgba(255,255,255,0.014)_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-18px_36px_rgba(0,0,0,0.12),0_18px_50px_-38px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="border-primary/25 bg-primary/[0.08] mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]">
            <Sparkles aria-hidden="true" className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Start with your brief</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Plan and run tests from a requirement. Drafts are saved to this workspace.
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href={`/quality-journeys/new?project=${encodeURIComponent(project.id)}`}>Start a Quality Journey</Link>
        </Button>
      </section>
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
            className="flex h-9 items-center rounded-full border border-white/[0.09] bg-white/[0.025] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] backdrop-blur-xl"
          >
            {draftTabs.map(tab => {
              const isActive = activeDraftView === tab.value
              return (
                <Link
                  aria-current={isActive ? 'page' : undefined}
                  className={`focus-visible:ring-primary/50 flex h-7 items-center rounded-full px-3 text-xs font-medium transition-[color,background-color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 ${
                    isActive
                      ? 'border border-white/[0.12] bg-white/[0.075] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_20px_-14px_rgba(0,0,0,0.9)]'
                      : 'border border-transparent text-muted-foreground hover:bg-white/[0.035] hover:text-foreground'
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
      <QualityJourneysBrowser items={journeys} projectId={project.id} />
    </main>
  )
}
