'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ClipboardCheck, Search } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui/status-badge'
import { journeyStageName } from '@/lib/quality-journey/journey-stages'
import { copyQualityJourneyBriefToDraftAction } from './quality-journey-actions'

type QualityJourneyListItem = {
  id: string
  hostingMode: string
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
        <Card className="border-dashed border-border bg-card shadow-none">
          <CardContent className="flex min-h-52 flex-col items-center justify-center p-6 text-center">
            <ClipboardCheck aria-hidden="true" className="size-8 text-muted-foreground" />
            <h2 className="mt-4 text-base font-semibold">No Quality Journeys yet</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Choose New journey to start with a brief.
            </p>
          </CardContent>
        </Card>
      ) : visibleItems.length === 0 ? (
        <p
          className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
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
  const title = item.requirement?.summary || 'Untitled journey'
  const attention =
    item.status === 'PAUSED'
      ? 'Paused by the user'
      : item.stage === 'CLOSED'
        ? 'Complete'
        : item.hostingMode === 'EXTERNAL_LEGACY'
          ? 'Continue in Appraise'
          : item.activeBlockerCount
            ? 'Action needed'
            : item.unresolvedQuestionIds.length
              ? 'Waiting for your answer'
              : item.requestedExecutionConsentCount
                ? 'Permission needed'
                : item.stage.endsWith('_REVIEW')
                  ? 'Ready for review'
                  : null
  return (
    <article className="app-surface flex min-w-0 items-center justify-between gap-4 rounded-xl p-4 transition-colors hover:border-input hover:bg-accent">
      <div className="min-w-0">
        <Link
          className="line-clamp-2 break-words font-semibold hover:underline"
          href={`/quality-journeys/${item.id}?project=${encodeURIComponent(projectId)}`}
        >
          {title}
        </Link>
        <p className="mt-1 text-sm text-muted-foreground">
          {journeyStageName(item.stage)}
          {attention ? ` · ${attention}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <StatusBadge
          label={item.status === 'PAUSED' ? 'Paused' : item.stage === 'CLOSED' ? 'Complete' : 'Active'}
          tone={item.status === 'PAUSED' ? 'warning' : item.stage === 'CLOSED' ? 'success' : 'neutral'}
        />
        <CopyBriefButton journeyId={item.id} projectId={projectId} />
      </div>
    </article>
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
