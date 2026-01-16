import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, AlertTriangle, Clock, XCircle } from 'lucide-react'
import { DashboardMetrics } from '@prisma/client'

type AppDrawerItem = {
  title: string
  icon: React.ReactNode
  color: keyof typeof AppDrawerItemColor
  count: number
}

export const AppDrawerItemColor = {
  red: {
    buttonColor: 'bg-red-500/20 hover:bg-red-500/25',
    iconColor: 'text-red-500',
    badgeColor: 'bg-red-400 text-red-900',
  },
  green: {
    buttonColor: 'bg-green-500/20 hover:bg-green-500/25',
    iconColor: 'text-green-500',
    badgeColor: 'bg-green-400 text-green-800',
  },
  yellow: {
    buttonColor: 'bg-yellow-500/20 hover:bg-yellow-500/25',
    iconColor: 'text-yellow-500',
    badgeColor: 'bg-yellow-400 text-yellow-800',
  },
  blue: {
    buttonColor: 'bg-blue-500/20 hover:bg-blue-500/25',
    iconColor: 'text-blue-500',
    badgeColor: 'bg-blue-400 text-blue-800',
  },
  emerald: {
    buttonColor: 'bg-emerald-500/20 hover:bg-emerald-500/25',
    iconColor: 'text-emerald-500',
    badgeColor: 'bg-emerald-400 text-emerald-800',
  },
  indigo: {
    buttonColor: 'bg-indigo-500/20 hover:bg-indigo-500/25',
    iconColor: 'text-indigo-500',
    badgeColor: 'bg-indigo-400 text-indigo-800',
  },
  purple: {
    buttonColor: 'bg-purple-500/20 hover:bg-purple-500/25',
    iconColor: 'text-purple-500',
    badgeColor: 'bg-purple-400 text-purple-800',
  },
  pink: {
    buttonColor: 'bg-pink-500/20 hover:bg-pink-500/25',
    iconColor: 'text-pink-500',
    badgeColor: 'bg-pink-400 text-pink-800',
  },
  rose: {
    buttonColor: 'bg-rose-500/20 hover:bg-rose-500/25',
    iconColor: 'text-rose-500',
    badgeColor: 'bg-rose-400 text-rose-800',
  },
  fuchsia: {
    buttonColor: 'bg-fuchsia-500/20 hover:bg-fuchsia-500/25',
    iconColor: 'text-fuchsia-500',
    badgeColor: 'bg-fuchsia-400 text-fuchsia-800',
  },
  violet: {
    buttonColor: 'bg-violet-500/20 hover:bg-violet-500/25',
    iconColor: 'text-violet-500',
    badgeColor: 'bg-violet-400 text-violet-800',
  },
  sky: {
    buttonColor: 'bg-sky-500/20 hover:bg-sky-500/25',
    iconColor: 'text-sky-500',
    badgeColor: 'bg-sky-400 text-sky-800',
  },
}

export const AppDrawerItem = ({
  title,
  icon,
  colorKey,
  count,
}: {
  title: string
  icon: React.ReactNode
  colorKey: keyof typeof AppDrawerItemColor
  count: number
}) => {
  const color = AppDrawerItemColor[colorKey]
  return (
    <Button
      variant="outline"
      className={`relative flex h-fit w-full flex-col items-center justify-center border-none hover:text-gray-200 ${color.buttonColor}`}
    >
      <div className={color.iconColor}>{icon}</div>
      <div className="text-sm font-medium text-gray-200">{title}</div>
      <div
        className={`absolute right-[-8px] top-[-8px] flex h-4 w-4 items-center justify-center rounded-full ${color.badgeColor} p-2.5 text-xs`}
      >
        {count}
      </div>
    </Button>
  )
}

export default function AppDrawer({ metrics }: { metrics: DashboardMetrics | null }) {
  const items: AppDrawerItem[] = [
    {
      title: 'Failed Runs',
      icon: <XCircle className="h-8 w-8" />,
      color: 'purple',
      count: metrics?.failedRecentRunsCount ?? 0,
    },
    {
      title: 'Failing Tests',
      icon: <AlertCircle className="h-8 w-8" />,
      color: 'rose',
      count: metrics?.repeatedlyFailingTestsCount ?? 0,
    },
    {
      title: 'Flaky Tests',
      icon: <AlertTriangle className="h-8 w-8" />,
      color: 'yellow',
      count: metrics?.flakyTestsCount ?? 0,
    },
    {
      title: 'Suites Not Executed',
      icon: <Clock className="h-8 w-8" />,
      color: 'blue',
      count: metrics?.suitesNotExecutedRecentlyCount ?? 0,
    },
  ]

  return (
    <Card id="container" className="w-fit border-gray-600/10 bg-gray-600/10">
      <CardHeader id="header">
        <CardTitle className="text-primary">Dashboard Metrics</CardTitle>
        <CardDescription>Overview of your test execution metrics</CardDescription>
      </CardHeader>
      <CardContent id="content">
        <div className="grid grid-cols-2 gap-4">
          {items.map(item => (
            <AppDrawerItem
              key={item.title}
              title={item.title}
              icon={item.icon}
              colorKey={item.color}
              count={item.count}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
