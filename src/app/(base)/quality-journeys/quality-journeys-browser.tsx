'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, ClipboardCheck, Search } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { displayStageForQualityJourney, nextActionForQualityJourney } from '@/lib/quality-journey/presentation'
import { copyQualityJourneyBriefToDraftAction } from './quality-journey-actions'

type QualityJourneyListItem = {
  id: string
  stage: string
  status: string
  activeCycleId: string
  activeRevisionIds: Record<string, string>
  unresolvedQuestionIds: string[]
  createdAt: Date
  updatedAt: Date
  requirement: { id: string; revision: number; contentHash: string; summary: string } | null
  analysisRevisionCount: number
  activeBlockerCount: number
  requestedExecutionConsentCount: number
}

export function QualityJourneysBrowser({ items, projectId }: { items: QualityJourneyListItem[]; projectId: string }) {
  const [query, setQuery] = useState('')
  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return items
    return items.filter(item =>
      [
        item.id,
        item.stage,
        item.status,
        item.requirement?.summary ?? 'Requirement snapshot unavailable',
        item.activeCycleId,
      ].some(value => value.toLocaleLowerCase().includes(normalized)),
    )
  }, [items, query])

  return (
    <section className="space-y-4" aria-label="Quality Journeys">
      <div className="relative max-w-md">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Search Quality Journeys"
          className="pl-9"
          onChange={event => setQuery(event.target.value)}
          placeholder="Search Quality Journeys..."
          type="search"
          value={query}
        />
      </div>
      {items.length === 0 ? (
        <Card className="border-dashed border-white/[0.1] bg-[rgba(18,37,64,0.42)] shadow-none">
          <CardContent className="flex min-h-52 flex-col items-center justify-center p-6 text-center">
            <ClipboardCheck aria-hidden="true" className="size-8 text-muted-foreground" />
            <h2 className="mt-4 text-base font-semibold">No Quality Journeys yet</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Start with a requirement to create an Appraise-owned analysis and review trail.
            </p>
          </CardContent>
        </Card>
      ) : visibleItems.length === 0 ? (
        <p
          className="rounded-lg border border-dashed border-white/[0.1] p-8 text-center text-sm text-muted-foreground"
          role="status"
        >
          No Quality Journeys match “{query}”.
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visibleItems.map(item => (
            <JourneyListCard item={item} key={item.id} projectId={projectId} />
          ))}
        </div>
      )}
    </section>
  )
}

function JourneyListCard({ item, projectId }: { item: QualityJourneyListItem; projectId: string }) {
  const { push } = useRouter()
  const [isPending, startTransition] = useTransition()
  const displayStage = displayStageForQualityJourney(item.stage)
  const nextAction = nextActionForQualityJourney({
    stage: item.stage,
    blockerCount: item.activeBlockerCount,
    unresolvedRequiredQuestionCount: item.unresolvedQuestionIds.length,
    pendingAnalysisDecision: item.stage === 'ANALYSIS_REVIEW',
    pendingScenarioDecision: item.stage === 'SCENARIO_REVIEW',
    pendingReportDecision: item.stage === 'REPORT_REVIEW',
    requestedExecutionConsentCount: item.requestedExecutionConsentCount,
    hasObservedWorkerProgress: item.analysisRevisionCount > 0,
  })

  return (
    <Card className="group relative overflow-hidden">
      <Link
        aria-label={`Open Quality Journey ${item.id}`}
        className="absolute inset-0 z-10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={`/quality-journeys/${item.id}?project=${encodeURIComponent(projectId)}`}
      />
      <CardHeader className="pr-16">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardDescription className="text-xs text-primary">{displayStage.label}</CardDescription>
            <CardTitle className="mt-2 line-clamp-2 text-lg">
              {item.requirement?.summary ?? 'Requirement snapshot unavailable'}
            </CardTitle>
          </div>
          <Badge className="shrink-0 capitalize" variant="outline">
            {item.status === 'CLOSED' ? 'Closed' : 'In progress'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pr-14 text-sm">
        <div>
          <p className="font-medium">Next: {nextAction.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{nextAction.description}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {item.unresolvedQuestionIds.length ? (
            <span className="bg-background/60 rounded-md border px-2 py-1">
              {item.unresolvedQuestionIds.length} required question{item.unresolvedQuestionIds.length === 1 ? '' : 's'}
            </span>
          ) : null}
          {item.activeBlockerCount ? (
            <span className="bg-background/60 rounded-md border px-2 py-1">
              {item.activeBlockerCount} needs attention
            </span>
          ) : null}
          <span>Last updated {item.updatedAt.toLocaleString()}</span>
        </div>
        <Button
          className="relative z-20"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const response = await copyQualityJourneyBriefToDraftAction({
                journeyId: item.id,
                idempotencyKey: `copy-brief:${crypto.randomUUID()}`,
              })
              const draft =
                response.success && response.data && typeof response.data === 'object' && 'draft' in response.data
                  ? response.data.draft
                  : null
              if (!draft || typeof draft !== 'object' || !('id' in draft) || typeof draft.id !== 'string') return
              push(`/quality-journeys/drafts/${draft.id}?project=${encodeURIComponent(projectId)}`)
            })
          }
          size="sm"
          type="button"
          variant="outline"
        >
          {isPending ? 'Copying brief…' : 'Copy brief'}
        </Button>
      </CardContent>
      <span className="border-primary/30 pointer-events-none absolute bottom-5 right-5 z-20 flex size-9 items-center justify-center rounded-md border bg-primary text-primary-foreground">
        <ArrowRight aria-hidden="true" className="size-4" />
      </span>
    </Card>
  )
}
