'use client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, AlertTriangle, Clock, XCircle } from 'lucide-react'
import { DashboardMetrics } from '@prisma/client'
import { useRouter } from 'next/navigation'

type AppDrawerItem = {
  title: string
  icon: React.ReactNode
  color: keyof typeof AppDrawerItemColor
  count: number
  onClick?: () => void
}

export const AppDrawerItemColor = {
  red: {
    buttonColor: 'border-red-300/20 bg-red-400/[0.07] hover:bg-red-400/[0.11]',
    iconColor: 'text-red-300',
    badgeColor: 'bg-red-400 text-red-900',
  },
  green: {
    buttonColor: 'border-green-300/20 bg-green-400/[0.07] hover:bg-green-400/[0.11]',
    iconColor: 'text-green-300',
    badgeColor: 'bg-green-400 text-green-800',
  },
  yellow: {
    buttonColor: 'border-yellow-300/20 bg-yellow-400/[0.07] hover:bg-yellow-400/[0.11]',
    iconColor: 'text-yellow-300',
    badgeColor: 'bg-yellow-400 text-yellow-800',
  },
  blue: {
    buttonColor: 'border-sky-300/20 bg-sky-400/[0.07] hover:bg-sky-400/[0.11]',
    iconColor: 'text-sky-300',
    badgeColor: 'bg-blue-400 text-blue-800',
  },
  emerald: {
    buttonColor: 'border-emerald-300/20 bg-emerald-400/[0.07] hover:bg-emerald-400/[0.11]',
    iconColor: 'text-emerald-300',
    badgeColor: 'bg-emerald-400 text-emerald-800',
  },
  purple: {
    buttonColor: 'border-purple-300/20 bg-purple-400/[0.07] hover:bg-purple-400/[0.11]',
    iconColor: 'text-purple-300',
    badgeColor: 'bg-purple-400 text-purple-800',
  },
  pink: {
    buttonColor: 'border-pink-300/20 bg-pink-400/[0.07] hover:bg-pink-400/[0.11]',
    iconColor: 'text-pink-300',
    badgeColor: 'bg-pink-400 text-pink-800',
  },
  rose: {
    buttonColor: 'border-rose-300/20 bg-rose-400/[0.07] hover:bg-rose-400/[0.11]',
    iconColor: 'text-rose-300',
    badgeColor: 'bg-rose-400 text-rose-800',
  },
  fuchsia: {
    buttonColor: 'border-fuchsia-300/20 bg-fuchsia-400/[0.07] hover:bg-fuchsia-400/[0.11]',
    iconColor: 'text-fuchsia-300',
    badgeColor: 'bg-fuchsia-400 text-fuchsia-800',
  },
  violet: {
    buttonColor: 'border-violet-300/20 bg-violet-400/[0.07] hover:bg-violet-400/[0.11]',
    iconColor: 'text-violet-300',
    badgeColor: 'bg-violet-400 text-violet-800',
  },
  sky: {
    buttonColor: 'border-sky-300/20 bg-sky-400/[0.07] hover:bg-sky-400/[0.11]',
    iconColor: 'text-sky-300',
    badgeColor: 'bg-sky-400 text-sky-800',
  },
  orange: {
    buttonColor: 'border-orange-300/20 bg-orange-400/[0.07] hover:bg-orange-400/[0.11]',
    iconColor: 'text-orange-300',
    badgeColor: 'bg-orange-400 text-orange-800',
  },
  gray: {
    buttonColor: 'border-white/[0.055] bg-white/[0.025] hover:bg-white/[0.04]',
    iconColor: 'text-muted-foreground',
    badgeColor: 'bg-zinc-500/80 text-zinc-950',
  },
}

const AppDrawerItem = ({
  title,
  icon,
  colorKey,
  count,
  onClick,
  isActive,
}: {
  title: string
  icon: React.ReactNode
  colorKey: keyof typeof AppDrawerItemColor
  count: number
  isActive?: boolean
  onClick?: () => void
}) => {
  const color = !isActive ? AppDrawerItemColor.gray : AppDrawerItemColor[colorKey]
  return (
    <Button
      variant="outline"
      className={`relative flex min-h-16 w-full flex-col items-center justify-center rounded-md border px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:text-zinc-100 ${color.buttonColor}`}
      onClick={onClick}
      disabled={!isActive}
    >
      <div className={`${color.iconColor} [&_svg]:!h-6 [&_svg]:!w-6`}>{icon}</div>
      <div className="text-xs font-medium text-zinc-200">{title}</div>
      <div
        className={`absolute right-[-8px] top-[-8px] flex size-4 items-center justify-center rounded-full ${color.badgeColor} p-2.5 text-xs`}
      >
        {count}
      </div>
    </Button>
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
  const items: AppDrawerItem[] = [
    {
      title: 'Failed Runs',
      icon: <XCircle className="size-4" />,
      color: 'orange',
      count: metrics?.failedRecentRunsCount ?? 0,
      onClick: () => {
        push('/test-runs?filter=recentFailed')
      },
    },
    {
      title: 'Failing Tests',
      icon: <AlertCircle className="size-4" />,
      color: 'rose',
      count: metrics?.repeatedlyFailingTestsCount ?? 0,
      onClick: () => {
        push('/reports/test-cases?filter=repeatedlyFailing')
      },
    },
    {
      title: 'Flaky Tests',
      icon: <AlertTriangle className="size-4" />,
      color: 'yellow',
      count: metrics?.flakyTestsCount ?? 0,
      onClick: () => {
        push('/reports/test-cases?filter=flaky')
      },
    },
    {
      title: 'Unexecuted Suites',
      icon: <Clock className="size-4" />,
      color: 'blue',
      count: metrics?.suitesNotExecutedRecentlyCount ?? 0,
      onClick: () => {
        push('/reports/test-suites?filter=notExecutedRecently')
      },
    },
  ]

  return (
    <Card id="container" className="w-fit border-white/[0.07] bg-[rgba(18,37,64,0.34)]">
      <CardHeader id="header">
        <CardTitle className="text-primary">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent id="content">
        <div className="grid grid-cols-2 gap-4 gap-y-6">
          {items.map(item => (
            <AppDrawerItem
              key={item.title}
              title={item.title}
              icon={item.icon}
              colorKey={item.color}
              count={item.count}
              onClick={item.onClick}
              isActive={item.count > 0 ? true : false}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
