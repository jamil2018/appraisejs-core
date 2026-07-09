import { AlertTriangle, CheckCircle2, Clock, Network } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type PlansStatsCardsProps = {
  totalActive: number
  totalApproved: number
  totalAwaitingReview: number
  totalInProgress: number
}

export function PlansStatsCards({
  totalActive,
  totalApproved,
  totalAwaitingReview,
  totalInProgress,
}: PlansStatsCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Active Plans"
        value={totalActive}
        caption="Excludes drafts and completed work"
        icon={Network}
      />
      <StatCard
        title="Approved Plans"
        value={totalApproved}
        caption="Ready for baseline or implementation"
        icon={CheckCircle2}
        accentClassName="border-l-emerald-300/70"
        valueClassName="text-emerald-300"
        iconClassName="text-emerald-300"
      />
      <StatCard
        title="Awaiting Review"
        value={totalAwaitingReview}
        caption="Requires review or feedback"
        icon={AlertTriangle}
        accentClassName="border-l-amber-300/70"
        valueClassName="text-amber-300"
        iconClassName="text-amber-300"
      />
      <StatCard
        title="In Progress"
        value={totalInProgress}
        caption="Active baseline or coding phase"
        icon={Clock}
        accentClassName="border-l-sky-300/70"
        valueClassName="text-sky-300"
        iconClassName="text-sky-300"
      />
    </div>
  )
}

function StatCard({
  title,
  value,
  caption,
  icon: Icon,
  accentClassName,
  valueClassName,
  iconClassName = 'text-primary',
}: {
  title: string
  value: number
  caption: string
  icon: typeof Network
  accentClassName?: string
  valueClassName?: string
  iconClassName?: string
}) {
  return (
    <Card
      className={cn(
        'min-h-[132px] border-white/[0.08] bg-[rgba(18,37,64,0.42)] shadow-none',
        accentClassName ?? 'border-l-primary/60',
        'border-l-[3px]',
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 px-4 pb-2 pt-4">
        <CardTitle className="pt-0.5 text-xs font-semibold uppercase leading-4 text-zinc-300">{title}</CardTitle>
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04]',
            iconClassName,
          )}
        >
          <Icon className="size-4 stroke-[2.2]" />
        </span>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className={cn('text-3xl font-bold leading-9 text-white', valueClassName)}>{value}</div>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{caption}</p>
      </CardContent>
    </Card>
  )
}
