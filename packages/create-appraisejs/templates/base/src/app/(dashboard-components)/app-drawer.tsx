'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, AlertTriangle, Clock, XCircle, CheckCircle2, ArrowRight } from 'lucide-react'
import { DashboardMetrics } from '@prisma/client'
import { useRouter } from 'next/navigation'

type AppDrawerItemConfig = {
  title: string
  description: string
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
      className={`group relative flex w-full flex-col justify-between rounded-xl border p-[18px] text-left transition-all duration-300 outline-none focus-visible:ring-1 focus-visible:ring-primary ${
        isHealthy
          ? 'border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.04] to-emerald-500/[0.01] hover:border-emerald-500/30 hover:bg-emerald-500/[0.08] hover:shadow-[0_0_15px_rgba(16,185,129,0.06)]'
          : `${item.color.border} ${item.color.bg} ${item.color.hoverBorder} ${item.color.hoverBg} hover:shadow-[0_0_20px_rgba(244,63,94,0.05)]`
      }`}
    >
      {/* Top row: Icon & Status Indicator */}
      <div className="flex w-full items-center justify-between">
        <div
          className={`flex size-10 items-center justify-center rounded-lg border transition-colors duration-300 ${
            isHealthy
              ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400 group-hover:border-emerald-500/30 group-hover:bg-emerald-500/[0.1]'
              : `border-white/[0.08] bg-white/[0.04] ${item.color.iconColor}`
          }`}
        >
          {isHealthy ? <CheckCircle2 className="size-5" /> : item.icon}
        </div>

        {/* Pulse / Status light */}
        <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-sm bg-black/20">
          {isHealthy ? (
            <>
              <span className="size-1.5 rounded-full bg-emerald-400" />
              <span className="text-emerald-400">Healthy</span>
            </>
          ) : (
            <>
              <span className="relative flex size-1.5">
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${item.color.pulse}`} />
                <span className={`relative inline-flex size-1.5 rounded-full ${item.color.pulse}`} />
              </span>
              <span className={`${item.color.text}`}>Action</span>
            </>
          )}
        </div>
      </div>

      {/* Middle row: Large Count */}
      <div className="my-[18px] flex w-full items-baseline justify-between">
        <span
          className={`text-3xl font-extrabold tracking-tight transition-all duration-300 ${
            isHealthy ? 'text-emerald-400/90 group-hover:text-emerald-400' : `${item.color.text}`
          }`}
        >
          {item.count}
        </span>
        <div className="text-zinc-500 transition-all duration-300 group-hover:translate-x-1 group-hover:text-zinc-300">
          <ArrowRight className="size-4.5" />
        </div>
      </div>

      {/* Bottom row: Info */}
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-zinc-100 group-hover:text-white transition-colors duration-300">
          {item.title}
        </h4>
        <p className="text-xs leading-relaxed text-zinc-400/90 line-clamp-2">
          {isHealthy ? `All tests and suites are currently in a healthy state.` : item.description}
        </p>
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
      description: 'Recent test execution runs that completed with failures.',
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
      description: 'Individual test cases consistently failing across multiple runs.',
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
      description: 'Tests that exhibit inconsistent pass/fail behavior across runs.',
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
      description: 'Authoritative test suites that have not been executed recently.',
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
    <Card
      id="container"
      className="relative overflow-hidden border-white/[0.08] bg-gradient-to-b from-[rgba(24,45,75,0.35)] to-[rgba(12,20,35,0.45)] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] backdrop-blur-md"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent pointer-events-none" />
      <CardHeader id="header" className="relative pb-5">
        <CardTitle className="text-lg font-bold text-white tracking-tight">{title}</CardTitle>
        <CardDescription className="text-zinc-400 text-xs leading-relaxed">{description}</CardDescription>
      </CardHeader>
      <CardContent id="content" className="relative pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map(item => (
            <AppDrawerItem key={item.title} item={item} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
