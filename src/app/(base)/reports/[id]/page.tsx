import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  BrowserEngine,
  Environment,
  Tag,
  TestRun,
  TestRunResult,
  TestRunStatus,
  TestRunTestCase,
  StepStatus,
  Prisma,
} from '@prisma/client'
import { Calendar, CheckCircle, Clock, Compass, Flame, Info, XCircle } from 'lucide-react'
import { Metadata } from 'next'
import ReportMetricCard from '../report-metric-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChartConfig } from '@/components/ui/chart'
import OverviewChart from '../overview-chart'
import FeatureChart from '../feature-chart'
import DurationChart from '../duration-chart'
import ReportTable from '../report-table'
import { getReportByIdAction } from '@/actions/reports/report-actions'
import { notFound } from 'next/navigation'

/**
 * Type for report detail with all relations from getReportByIdAction
 */
type ReportDetailWithRelations = Prisma.ReportGetPayload<{
  include: {
    testRun: {
      include: {
        environment: true
        tags: true
      }
    }
    features: {
      include: {
        tags: true
        scenarios: {
          include: {
            tags: true
            steps: true
            hooks: true
          }
        }
      }
    }
    testCases: {
      include: {
        testRunTestCase: {
          include: {
            testCase: {
              include: {
                tags: true
              }
            }
          }
        }
        reportScenario: {
          include: {
            reportFeature: true
          }
        }
      }
    }
  }
}>

export const metadata: Metadata = {
  title: 'Appraise | View Report',
  description: 'View report details and live logs',
}

const colorMap = {
  passed: 'oklch(59.6% 0.145 163.225)',
  failed: 'oklch(59.2% 0.249 0.584)',
  cancelled: 'oklch(55.4% 0.046 257.417)',
  unknown: 'oklch(79.5% 0.184 86.047)',
  default: 'oklch(54.6% 0.245 262.881)',
}

const overViewPieChartConfig = {
  value: {
    label: 'Value',
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

const sampleOverViewPieChartData = [
  { result: 'passed', value: 40, fill: colorMap.passed },
  { result: 'failed', value: 30, fill: colorMap.failed },
  { result: 'cancelled', value: 20, fill: colorMap.cancelled },
  { result: 'unknown', value: 10, fill: colorMap.unknown },
]

const sampleResultByFeatureBarChartConfig = {
  feature: {
    label: 'Feature',
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

const sampleResultByFeatureBarChartData = [
  { feature: 'Feature 1', passed: 10, failed: 3, cancelled: 2, unknown: 1, total: 16 },
  { feature: 'Feature 2', passed: 5, failed: 2, cancelled: 1, unknown: 0, total: 8 },
  { feature: 'Feature 3', passed: 3, failed: 1, cancelled: 0, unknown: 1, total: 5 },
  { feature: 'Feature 4', passed: 2, failed: 0, cancelled: 1, unknown: 0, total: 3 },
  { feature: 'Feature 5', passed: 10, failed: 2, cancelled: 3, unknown: 2, total: 17 },
  { feature: 'Feature 6', passed: 5, failed: 1, cancelled: 0, unknown: 1, total: 7 },
  { feature: 'Feature 7', passed: 3, failed: 2, cancelled: 1, unknown: 0, total: 6 },
  { feature: 'Feature 8', passed: 2, failed: 1, cancelled: 0, unknown: 1, total: 4 },
  { feature: 'Feature 9', passed: 10, failed: 4, cancelled: 1, unknown: 2, total: 17 },
  { feature: 'Feature 10', passed: 5, failed: 3, cancelled: 2, unknown: 0, total: 10 },
  { feature: 'Feature 11', passed: 3, failed: 0, cancelled: 1, unknown: 1, total: 5 },
  { feature: 'Feature 12', passed: 2, failed: 2, cancelled: 0, unknown: 0, total: 4 },
]

const durationByFeatureBarChartConfig = {
  feature: {
    label: 'Feature',
  },
  duration: {
    label: 'Duration',
  },
} satisfies ChartConfig

const sampleDurationByFeatureBarChartData = [
  { feature: 'Feature 1', duration: 400 },
  { feature: 'Feature 2', duration: 300 },
  { feature: 'Feature 3', duration: 300 },
  { feature: 'Feature 4', duration: 200 },
  { feature: 'Feature 5', duration: 100 },
  { feature: 'Feature 6', duration: 500 },
  { feature: 'Feature 7', duration: 1000 },
]

const testRunResultToBadge = (result: TestRunResult) => {
  switch (result) {
    case TestRunResult.PASSED:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-green-700 bg-green-700/10 py-1 text-sm text-green-500"
        >
          <CheckCircle className="h-4 w-4" />
          PASSED
        </Badge>
      )
    case TestRunResult.FAILED:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-red-700 bg-red-700/10 py-1 text-sm text-red-500"
        >
          <XCircle className="h-4 w-4" />
          FAILED
        </Badge>
      )
    case TestRunResult.CANCELLED:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-gray-700 bg-gray-700/35 py-1 text-sm text-gray-300"
        >
          <XCircle className="h-4 w-4" />
          CANCELLED
        </Badge>
      )
    default:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-gray-700 bg-gray-700/10 py-1 text-sm text-gray-500"
        >
          <Clock className="h-4 w-4" />
          UNKNOWN
        </Badge>
      )
  }
}

const formatDateTime = (date: Date) => {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatDuration = (startDate: Date, endDate: Date) => {
  const diffInMs = endDate.getTime() - startDate.getTime()
  const totalSeconds = Math.floor(diffInMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
}

const browserIcons = {
  [BrowserEngine.CHROMIUM]: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M10.88 21.94 15.46 14" />
      <path d="M21.17 8H12" />
      <path d="M3.95 6.06 8.54 14" />
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  ),
  [BrowserEngine.FIREFOX]: <Flame className="h-4 w-4" />,
  [BrowserEngine.WEBKIT]: <Compass className="h-4 w-4" />,
}

const browserEngineToBadge = (browserEngine: BrowserEngine) => {
  switch (browserEngine) {
    case BrowserEngine.CHROMIUM:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-blue-700 bg-blue-700/10 py-1 text-sm text-blue-500"
        >
          {browserIcons[BrowserEngine.CHROMIUM]}
          Chromium
        </Badge>
      )
    case BrowserEngine.FIREFOX:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-red-700 bg-red-700/10 py-1 text-sm text-red-500"
        >
          {browserIcons[BrowserEngine.FIREFOX]}
          Firefox
        </Badge>
      )
    case BrowserEngine.WEBKIT:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-purple-700 bg-purple-700/10 py-1 text-sm text-purple-500"
        >
          {browserIcons[BrowserEngine.WEBKIT]}
          WebKit
        </Badge>
      )
    default:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-gray-700 bg-gray-700/10 py-1 text-sm text-gray-500"
        >
          Unknown
        </Badge>
      )
  }
}

const testRunStatusToBadge = (status: TestRunStatus) => {
  switch (status) {
    case TestRunStatus.COMPLETED:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-green-700 bg-green-700/10 py-1 text-sm text-green-500"
        >
          <CheckCircle className="h-4 w-4" />
          Completed
        </Badge>
      )
    case TestRunStatus.CANCELLED:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-gray-700 bg-gray-700/10 py-1 text-sm text-gray-500"
        >
          <XCircle className="h-4 w-4" />
          Cancelled
        </Badge>
      )
    default:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-gray-700 bg-gray-700/10 py-1 text-sm text-gray-500"
        >
          <Clock className="h-4 w-4" />
          Unknown
        </Badge>
      )
  }
}

const ViewReport = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params

  // Fetch report data
  const reportResponse = await getReportByIdAction(id)
  if (reportResponse.status !== 200 || !reportResponse.data) {
    notFound()
  }

  // Type guard to validate the data structure
  const isValidReportDetail = (data: unknown): data is ReportDetailWithRelations => {
    if (!data || typeof data !== 'object') return false
    const report = data as Record<string, unknown>
    return (
      'id' in report &&
      'testRun' in report &&
      'testCases' in report &&
      'features' in report &&
      Array.isArray(report.testCases) &&
      Array.isArray(report.features) &&
      report.testRun !== null &&
      typeof report.testRun === 'object'
    )
  }

  if (!isValidReportDetail(reportResponse.data)) {
    notFound()
  }

  const report: ReportDetailWithRelations = reportResponse.data
  const testRun = report.testRun

  // Calculate metrics from report data
  const totalTests = report.testCases.length
  const passedTests = report.testCases.filter(rtc => rtc.testRunTestCase.result === 'PASSED').length
  const failedTests = report.testCases.filter(rtc => rtc.testRunTestCase.result === 'FAILED').length

  // Calculate overview chart data
  const overviewData = [
    {
      result: 'passed',
      value: passedTests,
      fill: colorMap.passed,
    },
    {
      result: 'failed',
      value: failedTests,
      fill: colorMap.failed,
    },
    {
      result: 'cancelled',
      value: report.testCases.filter(rtc => rtc.testRunTestCase.result === 'UNTESTED').length,
      fill: colorMap.cancelled,
    },
    {
      result: 'unknown',
      value: 0,
      fill: colorMap.unknown,
    },
  ]

  // Calculate feature chart data
  const featureData = report.features.map(feature => {
    const scenarios = feature.scenarios
    const passed = scenarios.filter(
      s =>
        s.steps.every(step => step.status === StepStatus.PASSED) &&
        s.hooks.every(hook => hook.status === StepStatus.PASSED),
    ).length
    const failed = scenarios.filter(
      s =>
        s.steps.some(step => step.status === StepStatus.FAILED) ||
        s.hooks.some(hook => hook.status === StepStatus.FAILED),
    ).length
    const cancelled = scenarios.filter(
      s =>
        s.steps.some(step => step.status === StepStatus.SKIPPED) ||
        s.hooks.some(hook => hook.status === StepStatus.SKIPPED),
    ).length
    const unknown = scenarios.length - passed - failed - cancelled

    return {
      feature: feature.name,
      passed,
      failed,
      cancelled,
      unknown,
      total: scenarios.length,
    }
  })

  // Calculate duration chart data
  const durationData = report.features.map(feature => {
    const totalDuration = feature.scenarios.reduce((total, scenario) => {
      const scenarioDuration =
        scenario.steps.reduce((stepTotal, step) => stepTotal + Number(step.duration), 0) +
        scenario.hooks.reduce((hookTotal, hook) => hookTotal + Number(hook.duration), 0)
      return total + scenarioDuration
    }, 0)
    return {
      feature: feature.name,
      duration: Math.round(totalDuration / 1000000), // Convert nanoseconds to milliseconds
    }
  })

  return (
    <>
      <div className="flex justify-between">
        <div>
          <PageHeader className="mb-2 flex items-center gap-2">
            <span>Test Run Report</span>
            {testRunResultToBadge(testRun.result)}
          </PageHeader>
          <div className="flex gap-2">
            {testRun.completedAt && (
              <div className="flex items-center gap-1 text-sm text-gray-400">
                <Calendar className="h-4 w-4" />
                {formatDateTime(testRun.completedAt)}
              </div>
            )}
            {testRun.completedAt && testRun.startedAt && (
              <div className="flex items-center gap-1 text-sm text-gray-400">
                <Clock className="h-4 w-4" />
                {formatDuration(testRun.startedAt, testRun.completedAt)}
              </div>
            )}
          </div>
        </div>
        <div className="flex w-1/2 justify-between gap-1">
          <ReportMetricCard title="Total Tests" value={totalTests.toString()} />
          <ReportMetricCard title="Passed" value={passedTests.toString()} />
          <ReportMetricCard title="Failed" value={failedTests.toString()} />
        </div>
      </div>
      <Separator className="my-4 bg-muted" />
      <div className="flex gap-6">
        <Card className="flex h-[420px] min-w-0 flex-1 flex-col">
          <CardHeader className="flex-shrink-0">
            <div className="flex items-center gap-2">
              <Info className="h-6 w-6" />
              <CardTitle className="text-lg font-semibold">Configuration</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden text-gray-200">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>Environment Name</span>
              <span className="font-medium">{testRun.environment.name}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>Environment Base URL</span>
              <span className="font-medium">{testRun.environment.baseUrl}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>Environment API Base URL</span>
              <span className="font-medium">{testRun.environment.apiBaseUrl || '-'}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>Test Workers Count</span>
              <span className="font-medium">{testRun.testWorkersCount || 1}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>Browser Engine</span>
              <span className="font-medium">{browserEngineToBadge(testRun.browserEngine)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>Test Run Status</span>
              <span className="font-medium">{testRunStatusToBadge(testRun.status)}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="flex h-[420px] min-w-0 flex-1 flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle>Visualizations</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col overflow-hidden">
            <Tabs defaultValue="overview" className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <TabsList className="flex-shrink-0">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="feature">Feature</TabsTrigger>
                <TabsTrigger value="duration">Duration</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
                <OverviewChart config={overViewPieChartConfig} data={overviewData} />
              </TabsContent>
              <TabsContent value="feature" className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
                <FeatureChart config={sampleResultByFeatureBarChartConfig} data={featureData} />
              </TabsContent>
              <TabsContent value="duration" className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
                <DurationChart config={durationByFeatureBarChartConfig} data={durationData} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      <Separator className="my-4 bg-muted" />
      <ReportTable />
    </>
  )
}

export default ViewReport
