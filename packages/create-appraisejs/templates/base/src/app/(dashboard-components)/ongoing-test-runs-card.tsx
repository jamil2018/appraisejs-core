'use client'

import { CardTitle } from '@/components/ui/card'
import { ArrowRight, Activity, RotateCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useRunningTestRunsCount } from './use-running-test-runs-count'

interface OngoingTestRunsCardProps {
  initialCount: number
  link: string
}

// fallow-ignore-next-line complexity
function RunningJobsHeader({ hasActiveRuns }: { hasActiveRuns: boolean }) {
  return (
    <div className="flex w-full items-center justify-between gap-2">
      <div className="space-y-0.5">
        <CardTitle
          className={cn(
            'text-xs font-semibold uppercase tracking-wide',
            hasActiveRuns ? 'text-zinc-200 group-hover:text-white' : 'text-zinc-500'
          )}
        >
          Running Jobs
        </CardTitle>
        <div className="flex items-center gap-1.5">
          <span className={cn('size-1.5 rounded-full', hasActiveRuns ? 'animate-pulse bg-emerald-400' : 'bg-zinc-600')} />
          <span
            className={cn(
              'text-[10px] font-semibold uppercase tracking-wide',
              hasActiveRuns ? 'text-emerald-400' : 'text-zinc-500'
            )}
          >
            {hasActiveRuns ? 'Active' : 'Idle'}
          </span>
        </div>
      </div>

      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors duration-300',
          hasActiveRuns
            ? 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-400'
            : 'border-white/[0.05] bg-white/[0.02] text-zinc-600'
        )}
      >
        {hasActiveRuns ? (
          <RotateCw className="size-5 animate-spin [animation-duration:3s]" />
        ) : (
          <Activity className="size-5" />
        )}
      </div>
    </div>
  )
}

function RunningJobsValue({ count, hasActiveRuns }: { count: number; hasActiveRuns: boolean }) {
  return (
    <div className="mt-5 flex w-full items-baseline justify-between">
      <span
        className={cn(
          'text-3xl font-extrabold tracking-tight transition-all duration-300',
          hasActiveRuns ? 'origin-left text-emerald-400 group-hover:scale-[1.02]' : 'text-zinc-600'
        )}
      >
        {count}
      </span>
      {hasActiveRuns && (
        <div className="text-emerald-500/60 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-emerald-400">
          <ArrowRight className="size-4" />
        </div>
      )}
    </div>
  )
}

export default function OngoingTestRunsCard({ initialCount, link }: OngoingTestRunsCardProps) {
  const { push } = useRouter()
  const count = useRunningTestRunsCount(initialCount)
  const hasActiveRuns = count > 0

  return (
    <button
      onClick={() => hasActiveRuns && push(link)}
      disabled={!hasActiveRuns}
      className={cn(
        'group relative flex w-full flex-col justify-between overflow-hidden rounded-xl border p-[18px] text-left transition-all duration-300 outline-none focus-visible:ring-1 focus-visible:ring-primary',
        !hasActiveRuns
          ? 'cursor-not-allowed border-white/[0.05] bg-white/[0.015] opacity-50'
          : 'cursor-pointer border-emerald-500/25 bg-emerald-500/[0.03] hover:border-emerald-500/45 hover:bg-emerald-500/[0.08] hover:shadow-[0_4px_20px_rgba(16,185,129,0.08)]'
      )}
    >
      {hasActiveRuns && (
        <div className="pointer-events-none absolute -right-10 -top-10 size-24 rounded-full bg-emerald-500/15 blur-xl" />
      )}
      <RunningJobsHeader hasActiveRuns={hasActiveRuns} />
      <RunningJobsValue count={count} hasActiveRuns={hasActiveRuns} />
    </button>
  )
}
