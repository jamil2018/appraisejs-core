import { AlertTriangle, CheckCircle2, Clock, Network } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
        accentClassName="border-l-emerald-500"
        valueClassName="text-emerald-700 dark:text-emerald-400"
        iconClassName="text-emerald-500"
      />
      <StatCard
        title="Awaiting Review"
        value={totalAwaitingReview}
        caption="Requires review or feedback"
        icon={AlertTriangle}
        accentClassName="border-l-amber-500"
        valueClassName="text-amber-700 dark:text-amber-400"
        iconClassName="text-amber-500"
      />
      <StatCard
        title="In Progress"
        value={totalInProgress}
        caption="Active baseline or coding phase"
        icon={Clock}
        accentClassName="border-l-violet-500"
        valueClassName="text-violet-700 dark:text-violet-400"
        iconClassName="text-violet-500"
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
    <Card className={`rounded-xl border bg-card shadow-sm ${accentClassName ?? ''}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <span className={`flex size-8 items-center justify-center rounded-lg border bg-background ${iconClassName}`}>
          <Icon className="size-4 stroke-[2.2]" />
        </span>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueClassName ?? ''}`}>{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
      </CardContent>
    </Card>
  )
}
