'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, AlertTriangle, Clock, XCircle, CheckCircle2, ArrowRight } from 'lucide-react'
import { DashboardMetrics } from '@prisma/client'
import { useRouter } from 'next/navigation'

type AppDrawerItemConfig = {
  title: string
  description: string
  healthyDescription: string
  icon: React.ReactNode
  color: {
    border: string
    hoverBorder: string
    bg: string
    hoverBg: string
    text: string
    iconColor: string
    pulse: string
  }
  count: number
  onClick: () => void
}

const AppDrawerItem = ({ item }: { item: AppDrawerItemConfig }) => {
  const isHealthy = item.count === 0

  return (
    <button
      onClick={item.onClick}
      aria-label={`${item.title}: ${item.count}. ${isHealthy ? item.healthyDescription : item.description}`}
      className={`group relative flex min-h-[116px] w-full flex-col justify-between overflow-hidden rounded-lg border p-3 text-left outline-none transition-colors duration-200 focus-visible:ring-1 focus-visible:ring-primary ${
        isHealthy
          ? 'border-emerald-500/15 bg-emerald-500/[0.035] hover:border-emerald-500/30 hover:bg-emerald-500/[0.07]'
          : `${item.color.border} ${item.color.bg} ${item.color.hoverBorder} ${item.color.hoverBg}`
      }`}
    >
      <div className="flex w-full items-center justify-between">
        <div
          className={`flex size-8 items-center justify-center rounded-md border transition-colors duration-200 ${
            isHealthy
              ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400 group-hover:border-emerald-500/30 group-hover:bg-emerald-500/[0.1]'
              : `border-white/[0.08] bg-white/[0.04] ${item.color.iconColor}`
          }`}
        >
          {isHealthy ? <CheckCircle2 className="size-5" /> : item.icon}
        </div>

        <div className="flex items-center gap-1.5 rounded-full bg-black/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">
          {isHealthy ? (
            <>
              <span className="size-1.5 rounded-full bg-emerald-400" />
              <span className="text-emerald-400">Healthy</span>
            </>
          ) : (
            <>
              <span className="relative flex size-1.5">
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${item.color.pulse}`}
                />
                <span className={`relative inline-flex size-1.5 rounded-full ${item.color.pulse}`} />
              </span>
              <span className={`${item.color.text}`}>Action</span>
            </>
          )}
        </div>
      </div>

      <div className="flex w-full items-end justify-between gap-3">
        <div className="min-w-0">
          <span
            className={`block text-2xl font-bold leading-7 transition-colors duration-200 ${
              isHealthy ? 'text-emerald-400/90 group-hover:text-emerald-400' : `${item.color.text}`
            }`}
          >
            {item.count}
          </span>
          <h4 className="mt-1.5 truncate text-xs font-semibold leading-4 text-zinc-100 transition-colors duration-200 group-hover:text-white">
            {item.title}
          </h4>
        </div>
        <div className="mb-0.5 shrink-0 text-zinc-500 transition-colors duration-200 group-hover:text-zinc-300">
          <ArrowRight className="size-4" />
        </div>
      </div>
    </button>
  )
}

export default function AppDrawer({
  metrics,
  title,
  description,
}: {
  metrics: DashboardMetrics | null
  title: string
  description: string
}) {
  const { push } = useRouter()

  const items: AppDrawerItemConfig[] = [
    {
      title: 'Failed Runs',
      description: 'Recent failures',
      healthyDescription: 'No recent failures',
      icon: <XCircle className="size-5" />,
      color: {
        border: 'border-rose-500/25',
        hoverBorder: 'hover:border-rose-500/45',
        bg: 'bg-gradient-to-br from-rose-500/[0.06] to-rose-500/[0.02]',
        hoverBg: 'hover:from-rose-500/[0.12] hover:to-rose-500/[0.04]',
        text: 'text-rose-400',
        iconColor: 'text-rose-400',
        pulse: 'bg-rose-500',
      },
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
      color: {
        border: 'border-red-500/25',
        hoverBorder: 'hover:border-red-500/45',
        bg: 'bg-gradient-to-br from-red-500/[0.06] to-red-500/[0.02]',
        hoverBg: 'hover:from-red-500/[0.12] hover:to-red-500/[0.04]',
        text: 'text-red-400',
        iconColor: 'text-red-400',
        pulse: 'bg-red-500',
      },
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
      color: {
        border: 'border-amber-500/25',
        hoverBorder: 'hover:border-amber-500/45',
        bg: 'bg-gradient-to-br from-amber-500/[0.06] to-amber-500/[0.02]',
        hoverBg: 'hover:from-amber-500/[0.12] hover:to-amber-500/[0.04]',
        text: 'text-amber-400',
        iconColor: 'text-amber-400',
        pulse: 'bg-amber-400',
      },
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
      color: {
        border: 'border-sky-500/25',
        hoverBorder: 'hover:border-sky-500/45',
        bg: 'bg-gradient-to-br from-sky-500/[0.06] to-sky-500/[0.02]',
        hoverBg: 'hover:from-sky-500/[0.12] hover:to-sky-500/[0.04]',
        text: 'text-sky-400',
        iconColor: 'text-sky-400',
        pulse: 'bg-sky-400',
      },
      count: metrics?.suitesNotExecutedRecentlyCount ?? 0,
      onClick: () => {
        push('/reports/test-suites?filter=notExecutedRecently')
      },
    },
  ]

  return (
    <Card id="container" className="relative overflow-hidden border-white/[0.08] bg-[rgba(18,37,64,0.42)] shadow-none">
      <CardHeader id="header" className="relative px-4 pb-3 pt-4">
        <CardTitle className="text-base font-semibold text-white">{title}</CardTitle>
        <CardDescription className="text-xs leading-5 text-zinc-400">{description}</CardDescription>
      </CardHeader>
      <CardContent id="content" className="relative px-4 pb-4 pt-0">
        <div className="grid grid-cols-1 gap-3 sm:auto-rows-[116px] sm:grid-cols-2">
          {items.map(item => (
            <AppDrawerItem key={item.title} item={item} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
