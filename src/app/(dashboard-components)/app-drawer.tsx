'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { AlertCircle, AlertTriangle, Clock, XCircle, CheckCircle2, ArrowRight } from 'lucide-react'
import { DashboardMetrics } from '@prisma/client'
import { useRouter } from 'next/navigation'

type AppDrawerItemConfig = {
  title: string
  description: string
  healthyDescription: string
  icon: React.ReactNode
  tone: 'danger' | 'warning' | 'info'
  count: number
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

  return (
    <button
      onClick={item.onClick}
      disabled={isHealthy}
      data-state={isHealthy ? 'disabled' : 'actionable'}
      aria-label={`${item.title}: ${item.count}. ${emptyEvidence ? 'No completed-run evidence yet' : isHealthy ? item.healthyDescription : item.description}`}
      type="button"
      className="app-focus flex min-h-[116px] w-full flex-col justify-between gap-3 rounded-lg border bg-field p-3 text-left transition-colors enabled:hover:bg-accent disabled:cursor-not-allowed"
    >
      <div className="flex w-full items-center justify-between gap-2 text-muted-foreground">
        {isHealthy ? <CheckCircle2 className="size-5" aria-hidden /> : item.icon}
        <StatusBadge
          label={isHealthy ? (emptyEvidence ? 'No evidence' : 'Clear') : 'Action'}
          tone={isHealthy ? 'neutral' : item.tone}
        />
      </div>
      <div className="flex w-full items-end justify-between gap-2">
        <div className="min-w-0">
          <span className="block text-2xl font-semibold tabular-nums text-foreground">{item.count}</span>
          <span className="block truncate text-xs font-medium text-muted-foreground">{item.title}</span>
        </div>
        {!isHealthy && <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      </div>
    </button>
  )
}

export default function AppDrawer({
  metrics,
  title,
  description,
  hasExecutionEvidence,
}: {
  metrics: DashboardMetrics | null
  title: string
  description: string
  hasExecutionEvidence: boolean
}) {
  const { push } = useRouter()

  const items: AppDrawerItemConfig[] = [
    {
      title: 'Failed Runs',
      description: 'Recent failures',
      healthyDescription: 'No recent failures',
      icon: <XCircle className="size-5" />,
      tone: 'danger',
      count: metrics?.failedRecentRunsCount ?? 0,
      onClick: () => {
        push('/test-runs?filter=recentFailed')
      },
    },
    {
      title: 'Failing Tests',
      description: 'Repeated failures',
      healthyDescription: 'No failing tests',
      icon: <AlertCircle className="size-5" />,
      tone: 'danger',
      count: metrics?.repeatedlyFailingTestsCount ?? 0,
      onClick: () => {
        push('/reports/test-cases?filter=repeatedlyFailing')
      },
    },
    {
      title: 'Flaky Tests',
      description: 'Inconsistent outcomes',
      healthyDescription: 'No flaky tests',
      icon: <AlertTriangle className="size-5" />,
      tone: 'warning',
      count: metrics?.flakyTestsCount ?? 0,
      onClick: () => {
        push('/reports/test-cases?filter=flaky')
      },
    },
    {
      title: 'Unexecuted Suites',
      description: 'Needs execution',
      healthyDescription: 'All suites current',
      icon: <Clock className="size-5" />,
      tone: 'info',
      count: metrics?.suitesNotExecutedRecentlyCount ?? 0,
      onClick: () => {
        push('/reports/test-suites?filter=notExecutedRecently')
      },
    },
  ]

  return (
    <Card id="container">
      <CardHeader id="header" className="relative px-4 pb-3 pt-4">
        <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
        <CardDescription className="text-xs leading-5 text-muted-foreground">{description}</CardDescription>
      </CardHeader>
      <CardContent id="content" className="relative px-4 pb-4 pt-0">
        <div className="grid grid-cols-1 gap-3 sm:auto-rows-[116px] sm:grid-cols-2">
          {items.map(item => (
            <AppDrawerItem key={item.title} item={item} hasExecutionEvidence={hasExecutionEvidence} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
