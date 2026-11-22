'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { AlertCircle, AlertTriangle, Clock, XCircle, CheckCircle2, ArrowRight } from 'lucide-react'
import { DashboardMetrics } from '@prisma/client'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

type AppDrawerItemConfig = {
  title: string
  description: string
  healthyDescription: string
  icon: React.ReactNode
  count: number
  tone: 'danger' | 'warning'
  onClick: () => void
}

const AppDrawerItem = ({
  item,
  hasExecutionEvidence,
}: {
  item: AppDrawerItemConfig
  hasExecutionEvidence: boolean
}) => {
  const isHealthy = item.count === 0
  const emptyEvidence = isHealthy && !hasExecutionEvidence
  const attentionClass = item.tone === 'danger' ? 'text-danger' : 'text-warning'

  return (
    <button
      onClick={item.onClick}
      disabled={isHealthy}
      data-state={isHealthy ? 'disabled' : 'actionable'}
      aria-label={`${item.title}: ${item.count}. ${emptyEvidence ? 'No completed-run evidence yet' : isHealthy ? item.healthyDescription : item.description}`}
      type="button"
      className="app-focus flex min-h-20 w-full min-w-0 flex-col justify-between gap-2 rounded-lg border bg-field p-2.5 text-left transition-colors enabled:hover:bg-accent disabled:cursor-not-allowed"
    >
      <span className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        {item.title}
        {isHealthy && !emptyEvidence ? (
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
        ) : (
          <span className={cn('flex shrink-0', !isHealthy && attentionClass)}>{item.icon}</span>
        )}
      </span>
      <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className={cn('text-2xl font-semibold tabular-nums', isHealthy ? 'text-foreground' : attentionClass)}>
          {item.count}
        </span>
        {isHealthy ? (
          <StatusBadge label={emptyEvidence ? 'No evidence' : 'Clear'} tone="neutral" />
        ) : (
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </span>
    </button>
  )
}

export default function AppDrawer({
  metrics,
  title,
  hasExecutionEvidence,
}: {
  metrics: DashboardMetrics | null
  title: string
  hasExecutionEvidence: boolean
}) {
  const { push } = useRouter()

  const items: AppDrawerItemConfig[] = [
    {
      title: 'Failed Runs',
      description: 'Recent failures',
      healthyDescription: 'No recent failures',
      icon: <XCircle aria-hidden className="size-4 shrink-0" />,
      count: metrics?.failedRecentRunsCount ?? 0,
      tone: 'danger',
      onClick: () => {
        push('/test-runs?filter=recentFailed')
      },
    },
    {
      title: 'Failing Tests',
      description: 'Repeated failures',
      healthyDescription: 'No failing tests',
      icon: <AlertCircle aria-hidden className="size-4 shrink-0" />,
      count: metrics?.repeatedlyFailingTestsCount ?? 0,
      tone: 'danger',
      onClick: () => {
        push('/reports/test-cases?filter=repeatedlyFailing')
      },
    },
    {
      title: 'Flaky Tests',
      description: 'Inconsistent outcomes',
      healthyDescription: 'No flaky tests',
      icon: <AlertTriangle aria-hidden className="size-4 shrink-0" />,
      count: metrics?.flakyTestsCount ?? 0,
      tone: 'warning',
      onClick: () => {
        push('/reports/test-cases?filter=flaky')
      },
    },
    {
      title: 'Unexecuted Suites',
      description: 'Needs execution',
      healthyDescription: 'All suites current',
      icon: <Clock aria-hidden className="size-4 shrink-0" />,
      count: metrics?.suitesNotExecutedRecentlyCount ?? 0,
      tone: 'warning',
      onClick: () => {
        push('/reports/test-suites?filter=notExecutedRecently')
      },
    },
  ]

  return (
    <Card>
      <CardHeader className="px-4 pb-3 pt-4">
        <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="grid grid-cols-2 items-stretch gap-2">
          {items.map(item => (
            <AppDrawerItem key={item.title} item={item} hasExecutionEvidence={hasExecutionEvidence} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
