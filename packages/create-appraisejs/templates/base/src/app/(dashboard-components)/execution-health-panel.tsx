import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartConfig } from '@/components/ui/chart'
import FeatureChart from '../(base)/reports/feature-chart'
import type { TestSuiteExecutionData } from '@/services/dashboard/dashboard-service'
import { CheckCircle2, AlertCircle, PlayCircle } from 'lucide-react'

const colorMap = {
  passed: 'oklch(59.6% 0.145 163.225)',
  failed: 'oklch(59.2% 0.249 0.584)',
  cancelled: 'oklch(55.4% 0.046 257.417)',
  unknown: 'oklch(79.5% 0.184 86.047)',
}

const resultByTestSuiteBarChartConfig = {
  feature: {
    label: 'Test Suite',
  },
  passed: {
    label: 'Passed',
    color: colorMap.passed,
  },
  failed: {
    label: 'Failed',
    color: colorMap.failed,
  },
  cancelled: {
    label: 'Cancelled',
    color: colorMap.cancelled,
  },
  unknown: {
    label: 'Unknown',
    color: colorMap.unknown,
  },
} satisfies ChartConfig

interface ExecutionHealthPanelProps {
  featureData: TestSuiteExecutionData
}

export const ExecutionHealthPanel = ({ featureData }: ExecutionHealthPanelProps) => {
  // Aggregate stats across all test suites
  const totals = featureData.reduce(
    (acc, suite) => {
      acc.passed += suite.passed
      acc.failed += suite.failed
      acc.cancelled += suite.cancelled
      acc.unknown += suite.unknown
      acc.total += suite.total
      return acc
    },
    { passed: 0, failed: 0, cancelled: 0, unknown: 0, total: 0 },
  )

  const successRate = totals.total > 0 ? Math.round((totals.passed / totals.total) * 100) : 0
  const hasData = featureData.length > 0

  return (
    <Card className="relative flex size-full min-h-[320px] flex-col overflow-hidden border-white/[0.08] bg-[rgba(18,37,64,0.42)] shadow-none 2xl:min-h-[calc(100vh-8.75rem)]">
      <CardHeader className="relative px-4 pb-3 pt-4">
        <CardTitle className="text-base font-semibold text-white">Execution Health</CardTitle>
        <CardDescription className="text-xs leading-5 text-zinc-400">
          Pass/fail counts by test suite across last 10 completed runs
        </CardDescription>
      </CardHeader>
      <CardContent className="relative flex flex-1 flex-col px-4 pb-4 pt-0">
        {hasData ? (
          <div className="flex flex-1 flex-col justify-between space-y-5">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Average Success Rate
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold text-white">{successRate}%</span>
                    <span className="text-xs font-medium text-emerald-400/90">overall</span>
                  </div>
                </div>

                <div className="relative flex items-center justify-center">
                  <svg className="size-14 -rotate-90">
                    <circle cx="28" cy="28" r="22" className="stroke-white/[0.04]" strokeWidth="4" fill="transparent" />
                    <circle
                      cx="28"
                      cy="28"
                      r="22"
                      className="stroke-emerald-400"
                      strokeWidth="4"
                      fill="transparent"
                      strokeDasharray="138"
                      strokeDashoffset={138 - (138 * successRate) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-[10px] font-bold text-white">{successRate}%</span>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
                  <div
                    className="animate-pulse bg-emerald-400 [animation-duration:3s]"
                    style={{ width: `${(totals.passed / totals.total) * 100}%` }}
                  />
                  <div className="bg-rose-500" style={{ width: `${(totals.failed / totals.total) * 100}%` }} />
                  <div
                    className="bg-zinc-500"
                    style={{ width: `${((totals.cancelled + totals.unknown) / totals.total) * 100}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-1 text-[11px] text-zinc-400">
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="size-3 text-emerald-400" />
                    <span>{totals.passed} Passed</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <AlertCircle className="size-3 text-rose-500" />
                    <span>{totals.failed} Failed</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <PlayCircle className="size-3 text-zinc-500" />
                    <span>{totals.cancelled + totals.unknown} Other</span>
                  </div>
                  <span className="ml-auto text-[10px] text-zinc-500">{totals.total} scenarios total</span>
                </div>
              </div>
            </div>

            <div className="flex flex-1 flex-col justify-center">
              <FeatureChart config={resultByTestSuiteBarChartConfig} data={featureData} />
            </div>
          </div>
        ) : (
          <div className="flex min-h-[250px] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.08] bg-white/[0.01] p-6 text-center">
            <PlayCircle className="mb-3 size-10 text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-300">No execution data available</p>
            <p className="mt-1 max-w-[240px] text-xs leading-5 text-zinc-500">
              Execute test suites in the dashboard to populate performance metrics.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
