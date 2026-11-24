'use client'

import { Activity, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { StatusBadge } from '@/components/ui/status-badge'
import { useRunningTestRunsCount } from './use-running-test-runs-count'

interface OngoingTestRunsCardProps {
  initialCount: number
  link: string
  projectId: string
}

export default function OngoingTestRunsCard({ initialCount, link, projectId }: OngoingTestRunsCardProps) {
  const { push } = useRouter()
  const count = useRunningTestRunsCount(initialCount, projectId)
  const hasActiveRuns = count > 0

  return (
    <button
      type="button"
      onClick={() => push(link)}
      disabled={!hasActiveRuns}
      className="app-focus flex min-h-20 w-full min-w-0 flex-col justify-between gap-2 rounded-lg border bg-field p-2.5 text-left transition-colors enabled:hover:bg-accent disabled:cursor-not-allowed"
    >
      <span className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        Running Jobs
        <Activity className="size-4 shrink-0" aria-hidden />
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-2xl font-semibold tabular-nums text-foreground">{count}</span>
        <StatusBadge label={hasActiveRuns ? 'Active' : 'Idle'} tone={hasActiveRuns ? 'info' : 'neutral'} />
        {hasActiveRuns && <ArrowRight className="size-4 text-muted-foreground" aria-hidden />}
      </div>
    </button>
  )
}
