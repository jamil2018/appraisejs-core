import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { BrowserEngine, Environment, Tag, TestRun, TestRunResult, TestRunStatus, TestRunTestCase } from '@prisma/client'
import { Calendar, CheckCircle, Clock, Compass, Flame, Info, XCircle } from 'lucide-react'
import { Metadata } from 'next'
import ReportMetricCard from '../report-metric-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChartConfig } from '@/components/ui/chart'
import OverviewChart from '../overview-chart'
import ScenarioChart from '../scenario-chart'

export const metadata: Metadata = {
  title: 'Appraise | View Report',
  description: 'View report details and live logs',
}

interface ReportDetails extends TestRun {
  testCases: (TestRunTestCase & { testCase: { title: string; description: string } })[]
  tags: Tag[]
  environment: Environment
}

const sampleReportDetails: ReportDetails = {
  id: '1',
  runId: '1',
  startedAt: new Date('2024-11-12T12:00:00Z'),
  completedAt: new Date('2024-11-12T13:00:00Z'),
  status: TestRunStatus.COMPLETED,
  result: TestRunResult.CANCELLED,
  testCases: [],
  tags: [],
  testWorkersCount: 1,
  browserEngine: BrowserEngine.CHROMIUM,
  environment: {
    id: '1',
    name: 'Test Environment',
    baseUrl: 'https://example.com',
    apiBaseUrl: 'https://api.example.com',
    username: 'testuser',
    password: 'testpassword',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  updatedAt: new Date(),
  environmentId: '1',
  name: '',
  logPath: null,
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

  return (
    <>
      <div className="flex justify-between">
        <div>
          <PageHeader className="mb-2 flex items-center gap-2">
            <span>Test Run Report</span>
            {testRunResultToBadge(sampleReportDetails.result)}
          </PageHeader>
          <div className="flex gap-2">
            {sampleReportDetails.completedAt && (
              <div className="flex items-center gap-1 text-sm text-gray-400">
                <Calendar className="h-4 w-4" />
                {formatDateTime(sampleReportDetails.completedAt)}
              </div>
            )}
            {sampleReportDetails.completedAt && sampleReportDetails.startedAt && (
              <div className="flex items-center gap-1 text-sm text-gray-400">
                <Clock className="h-4 w-4" />
                {formatDuration(sampleReportDetails.startedAt, sampleReportDetails.completedAt)}
              </div>
            )}
          </div>
        </div>
        <div className="flex w-1/2 justify-between gap-1">
          <ReportMetricCard title="Total Tests" value="100" />
          <ReportMetricCard title="Passed" value="90" />
          <ReportMetricCard title="Failed" value="10" />
        </div>
      </div>
      <Separator className="my-4 bg-muted" />
      <div className="flex gap-6">
        <Card className="flex h-[400px] min-w-0 flex-1 flex-col">
          <CardHeader className="flex-shrink-0">
            <div className="flex items-center gap-2">
              <Info className="h-6 w-6" />
              <CardTitle className="text-lg font-semibold">Configuration</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden text-gray-200">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>Environment Name</span>
              <span className="font-medium">{sampleReportDetails.environment.name}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>Environment Base URL</span>
              <span className="font-medium">{sampleReportDetails.environment.baseUrl}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>Environment API Base URL</span>
              <span className="font-medium">{sampleReportDetails.environment.apiBaseUrl}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>Test Workers Count</span>
              <span className="font-medium">{sampleReportDetails.testWorkersCount}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>Browser Engine</span>
              <span className="font-medium">{browserEngineToBadge(sampleReportDetails.browserEngine)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>Test Run Status</span>
              <span className="font-medium">{testRunStatusToBadge(sampleReportDetails.status)}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="flex h-[400px] min-w-0 flex-1 flex-col">
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
                <OverviewChart config={overViewPieChartConfig} data={sampleOverViewPieChartData} />
              </TabsContent>
              <TabsContent value="feature" className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
                <ScenarioChart config={sampleResultByFeatureBarChartConfig} data={sampleResultByFeatureBarChartData} />
              </TabsContent>
              <TabsContent value="duration" className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
                Change your password here.
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

export default ViewReport
