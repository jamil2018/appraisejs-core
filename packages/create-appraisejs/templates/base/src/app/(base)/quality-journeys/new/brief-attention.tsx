import { ArrowUpRight, CircleAlert, SquarePen } from 'lucide-react'
import Link from 'next/link'

import { withProjectScope } from '@/lib/project-scope'
import {
  listRecentJourneyNavigation,
  type JourneyNavigationItem,
} from '@/services/coordinator/quality-journey-query-service'

const attention = new Map([
  ['ANALYSIS_REVIEW', 'Review criteria'],
  ['SCENARIO_REVIEW', 'Review scenarios'],
  ['REPORT_REVIEW', 'Review results'],
  ['BLOCKED', 'Blocked'],
  ['PAUSED', 'Paused'],
])

function BriefAttentionRow({ item, projectId }: { item: JourneyNavigationItem; projectId: string }) {
  const id = encodeURIComponent(item.id)
  const draft = item.kind === 'draft'
  const path = draft ? `/quality-journeys/drafts/${id}` : `/quality-journeys/${id}`
  const Icon = draft ? SquarePen : CircleAlert

  return (
    <li>
      <Link
        className="app-focus app-nav-item flex min-h-10 items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
        href={withProjectScope(path, projectId)}
        prefetch={false}
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate" title={item.title}>
          {item.title}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{attention.get(item.status) ?? 'Saved brief'}</span>
        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  )
}

export async function BriefAttention({ projectId }: { projectId: string }) {
  const recent = (await listRecentJourneyNavigation([projectId]))[projectId] ?? []
  const needsAttention = recent.filter(item => attention.has(item.status)).slice(0, 3)
  const drafts = recent.filter(item => item.kind === 'draft').slice(0, 2)
  const items = [...needsAttention, ...drafts]
  if (items.length === 0) return null

  return (
    <section className="mx-auto mt-6 max-w-3xl border-t border-border pt-3" aria-labelledby="continue-your-work">
      <h2 className="mb-1 text-sm font-semibold" id="continue-your-work">
        Continue your work
      </h2>
      <ul>
        {items.map(item => (
          <BriefAttentionRow key={item.id} item={item} projectId={projectId} />
        ))}
      </ul>
    </section>
  )
}
