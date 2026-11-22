import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartConfig } from '@/components/ui/chart'
import FeatureChart from '../(base)/reports/feature-chart'
import type { TestSuiteExecutionData } from '@/services/dashboard/dashboard-service'
import { CheckCircle2, AlertCircle, PlayCircle } from 'lucide-react'

const colorMap = {
  passed: 'rgb(var(--success-rgb))',
  failed: 'rgb(var(--danger-rgb))',
  cancelled: 'rgb(var(--muted-foreground-rgb))',
  unknown: 'rgb(var(--warning-rgb))',
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
  const hasData = totals.total > 0

  return (
    <Card className="relative min-w-0">
      <CardHeader className="relative px-4 pb-3 pt-4">
        <CardTitle className="text-base font-semibold text-foreground">Execution Health</CardTitle>
        <CardDescription className="text-xs leading-5 text-muted-foreground">
          Pass/fail counts by test suite across last 10 completed runs
        </CardDescription>
      </CardHeader>
      <CardContent className="relative px-4 pb-4 pt-0">
        {hasData ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted p-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Average Success Rate</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold text-foreground">{successRate}%</span>
                    <span className="text-xs font-medium text-muted-foreground">overall</span>
                  </div>
                </div>

                <div className="relative flex items-center justify-center">
                  <svg aria-hidden="true" className="size-14 -rotate-90">
                    <circle cx="28" cy="28" r="22" className="stroke-border" strokeWidth="4" fill="transparent" />
                    <circle
                      cx="28"
                      cy="28"
                      r="22"
                      className="stroke-success"
                      strokeWidth="4"
                      fill="transparent"
                      strokeDasharray="138"
                      strokeDashoffset={138 - (138 * successRate) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div aria-hidden="true" className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="bg-success" style={{ width: `${(totals.passed / totals.total) * 100}%` }} />
                  <div className="bg-danger" style={{ width: `${(totals.failed / totals.total) * 100}%` }} />
                  <div
                    className="bg-muted-foreground"
                    style={{ width: `${(totals.cancelled / totals.total) * 100}%` }}
                  />
                  <div className="bg-warning" style={{ width: `${(totals.unknown / totals.total) * 100}%` }} />
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-xs text-foreground">
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="size-3 text-success" />
                    <span>{totals.passed} Passed</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <AlertCircle className="size-3 text-danger" />
                    <span>{totals.failed} Failed</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <PlayCircle className="size-3 text-muted-foreground" />
                    <span>{totals.cancelled} Cancelled</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <AlertCircle className="size-3 text-warning" />
                    <span>{totals.unknown} Unknown</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{totals.total} scenarios total</span>
                </div>
              </div>
            </div>

            <FeatureChart config={resultByTestSuiteBarChartConfig} data={featureData} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-5 text-center">
            <PlayCircle aria-hidden="true" className="mb-2 size-6 text-muted-foreground" />
            <p className="text-sm font-semibold text-muted-foreground">No execution data available</p>
            <p className="mt-1 max-w-[240px] text-xs leading-5 text-muted-foreground">
              Execute test suites in the dashboard to populate performance metrics.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
