'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Search,
  ShieldAlert,
  UserRound,
} from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { displayStageForQualityJourney, qualityJourneyStatusProjection } from '@/lib/quality-journey/presentation'
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
  blockerResponsibleActor: string | null
  requestedExecutionConsentCount: number
  handoff: { status: string; launchedAt: Date | null; connectedAt: Date | null; expiresAt: Date } | null
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
        <div className="grid gap-3 xl:grid-cols-2">
          {visibleItems.map(item => (
            <JourneyListCard item={item} key={item.id} projectId={projectId} />
          ))}
        </div>
      )}
    </section>
  )
}

function JourneyListCard({ item, projectId }: { item: QualityJourneyListItem; projectId: string }) {
  const displayStage = displayStageForQualityJourney(item.stage)
  const status = qualityJourneyStatusProjection({
    stage: item.stage,
    blockerCount: item.activeBlockerCount,
    blockerResponsibleActor: item.blockerResponsibleActor ?? undefined,
    unresolvedRequiredQuestionCount: item.unresolvedQuestionIds.length,
    pendingAnalysisDecision: item.stage === 'ANALYSIS_REVIEW' && item.analysisRevisionCount > 0,
    pendingScenarioDecision: item.stage === 'SCENARIO_REVIEW',
    pendingReportDecision: item.stage === 'REPORT_REVIEW',
    requestedExecutionConsentCount: item.requestedExecutionConsentCount,
    hasObservedWorkerProgress: item.analysisRevisionCount > 0,
    handoffStatus: item.handoff?.status,
    handoffLaunchedAt: item.handoff?.launchedAt,
    handoffConnectedAt: item.handoff?.connectedAt,
    observedAt: item.updatedAt,
  })

  return (
    <Card className="group relative overflow-hidden transition-[border-color,background-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-white/[0.15] hover:bg-white/[0.035] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.09),inset_0_-18px_36px_rgba(0,0,0,0.12),0_24px_60px_-38px_rgba(0,0,0,0.9)]">
      <Link
        aria-label={`Open Quality Journey ${item.id}`}
        className="absolute inset-0 z-10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={`/quality-journeys/${item.id}?project=${encodeURIComponent(projectId)}`}
      />
      <CardHeader className="gap-3 pb-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <JourneyState
            state={{
              closed: item.status === 'CLOSED',
              blocked: item.activeBlockerCount > 0,
              nextActor: status.nextActor,
            }}
          />
          <Badge
            className="shrink-0 rounded-full border-white/[0.1] bg-white/[0.025] px-2.5 py-1 text-[10px] font-medium capitalize text-muted-foreground"
            variant="outline"
          >
            {item.status === 'CLOSED' ? 'Closed' : 'In progress'}
          </Badge>
        </div>
        <div className="min-w-0">
          <CardDescription className="text-primary/90 text-[11px] font-medium uppercase tracking-[0.08em]">
            {displayStage.label}
          </CardDescription>
          <CardTitle className="mt-1.5 line-clamp-2 text-base font-semibold leading-6 text-foreground">
            {item.requirement?.summary ?? 'Requirement snapshot unavailable'}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pr-16 text-sm">
        <div>
          <p className="text-foreground/90 text-xs font-medium">Next actor · {status.nextActor}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{status.summary}</p>
        </div>
        <JourneyAttention item={item} />
        <CopyBriefButton journeyId={item.id} projectId={projectId} />
      </CardContent>
      <span className="text-foreground/75 group-hover:border-primary/40 pointer-events-none absolute bottom-5 right-5 z-20 flex size-9 items-center justify-center rounded-full border border-white/[0.14] bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.022)),linear-gradient(135deg,hsl(var(--primary)/0.12),transparent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_24px_-18px_hsl(var(--primary)/0.6)] backdrop-blur-xl transition-[border-color,color,transform,box-shadow] group-hover:translate-x-0.5 group-hover:text-primary group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_28px_-14px_hsl(var(--primary)/0.7)]">
        <ArrowRight aria-hidden="true" className="size-4" />
      </span>
    </Card>
  )
}

function JourneyState({ state }: { state: { closed: boolean; blocked: boolean; nextActor: string } }) {
  const normalizedActor = state.nextActor.toLocaleLowerCase()
  const presentation = state.closed
    ? { label: 'Journey complete', Icon: CheckCircle2, iconClassName: 'text-emerald-300' }
    : state.blocked
      ? { label: 'Journey needs attention', Icon: ShieldAlert, iconClassName: 'animate-pulse text-amber-300' }
      : normalizedActor.includes('you')
        ? {
            label: 'Waiting for you',
            Icon: UserRound,
            iconClassName: 'animate-[pulse_2.4s_ease-in-out_infinite] text-sky-300',
          }
        : normalizedActor.includes('appraise')
          ? {
              label: 'Appraise is working',
              Icon: Bot,
              iconClassName: 'animate-[pulse_2.8s_ease-in-out_infinite] text-primary',
            }
          : { label: 'Journey in progress', Icon: CircleDashed, iconClassName: 'animate-spin text-primary' }
  const { Icon } = presentation

  return (
    <div className="flex min-w-0 items-center gap-2.5" role="status">
      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
        <span className="bg-primary/[0.07] absolute inset-1 rounded-full blur-sm" />
        <Icon
          aria-hidden="true"
          className={`relative size-4 motion-reduce:animate-none ${presentation.iconClassName}`}
        />
      </span>
      <span className="text-foreground/80 truncate text-xs font-medium">{presentation.label}</span>
    </div>
  )
}

function JourneyAttention({ item }: { item: QualityJourneyListItem }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
      {item.unresolvedQuestionIds.length ? (
        <span className="bg-background/60 rounded-md border px-2 py-1">
          {item.unresolvedQuestionIds.length} required question{item.unresolvedQuestionIds.length === 1 ? '' : 's'}
        </span>
      ) : null}
      {item.activeBlockerCount ? (
        <span className="bg-background/60 rounded-md border px-2 py-1">{item.activeBlockerCount} needs attention</span>
      ) : null}
      <span className="self-center text-[11px]">Updated {item.updatedAt.toLocaleString()}</span>
    </div>
  )
}

function CopyBriefButton({ journeyId, projectId }: { journeyId: string; projectId: string }) {
  const { push } = useRouter()
  const [isPending, startTransition] = useTransition()
  return (
    <Button
      className="relative z-20"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const response = await copyQualityJourneyBriefToDraftAction({
            journeyId,
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
      {isPending ? (
        'Copying brief…'
      ) : (
        <>
          <Check aria-hidden="true" className="size-3.5" /> Copy brief
        </>
      )}
    </Button>
  )
}
