import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { BrowserEngine, TestRunResult, TestRunStatus } from '@prisma/client'
import { Calendar, ChartLine, CheckCircle, Clock, Info, XCircle } from 'lucide-react'
import { Metadata } from 'next'
import ReportMetricCard from '../report-metric-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DurationChart, FeatureChart, OverviewChart } from '../report-charts'
import ReportViewTable from '../report-view-table'
import { getReportByIdAction } from '@/actions/reports/report-actions'
import { notFound } from 'next/navigation'
import {
  browserIcons,
  durationByFeatureBarChartConfig,
  formatDateTime,
  formatDuration,
  getDurationData,
  getFeatureData,
  getOverviewData,
  getReportMetrics,
  isValidReportDetail,
  overViewPieChartConfig,
  resultByFeatureBarChartConfig,
  type ReportDetailWithRelations,
} from '../report-detail-helpers'

export const metadata: Metadata = {
  title: 'Appraise | View Report',
  description: 'View report details and live logs',
}

const testRunResultToBadge = (result: TestRunResult) => {
  switch (result) {
    case TestRunResult.PASSED:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-green-700 bg-green-700/10 py-1 text-sm text-green-500"
        >
          <CheckCircle className="size-4" />
          PASSED
        </Badge>
      )
    case TestRunResult.FAILED:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-red-700 bg-red-700/10 py-1 text-sm text-red-500"
        >
          <XCircle className="size-4" />
          FAILED
        </Badge>
      )
    case TestRunResult.CANCELLED:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-zinc-700 bg-zinc-700/35 py-1 text-sm text-zinc-300"
        >
          <XCircle className="size-4" />
          CANCELLED
        </Badge>
      )
    default:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-zinc-700 bg-zinc-700/10 py-1 text-sm text-zinc-500"
        >
          <Clock className="size-4" />
          UNKNOWN
        </Badge>
      )
  }
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
          className="flex items-center gap-2 rounded-xl border-zinc-700 bg-zinc-700/10 py-1 text-sm text-zinc-500"
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
          <CheckCircle className="size-4" />
          Completed
        </Badge>
      )
    case TestRunStatus.CANCELLED:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-zinc-700 bg-zinc-700/10 py-1 text-sm text-zinc-500"
        >
          <XCircle className="size-4" />
          Cancelled
        </Badge>
      )
    default:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-zinc-700 bg-zinc-700/10 py-1 text-sm text-zinc-500"
        >
          <Clock className="size-4" />
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

  if (!isValidReportDetail(reportResponse.data)) {
    notFound()
  }

  const report: ReportDetailWithRelations = reportResponse.data
  const testRun = report.testRun

  const { totalTests, passedTests, failedTests, untestedTests } = getReportMetrics(report)
  const overviewData = getOverviewData(report)
  const featureData = getFeatureData(report)
  const durationData = getDurationData(report)

  return (
    <>
      <div>
        <div className="mb-2 w-fit">{testRunResultToBadge(testRun.result)}</div>
        <PageHeader className="mb-2 text-4xl">
          <div>
            <span>Test Run Report: </span>
            <span>{report.testRun.name}</span>
          </div>
        </PageHeader>
        <div className="flex gap-2">
          {testRun.completedAt && (
            <div className="flex items-center gap-1 text-sm text-zinc-400">
              <Calendar className="size-4" />
              {formatDateTime(testRun.completedAt)}
            </div>
          )}
          {testRun.completedAt && testRun.startedAt && (
            <div className="flex items-center gap-1 text-sm text-zinc-400">
              <Clock className="size-4" />
              {formatDuration(testRun.startedAt, testRun.completedAt)}
            </div>
          )}
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportMetricCard title="Total Tests" value={totalTests.toString()} />
        <ReportMetricCard title="Passed" value={passedTests.toString()} />
        <ReportMetricCard title="Failed" value={failedTests.toString()} />
        <ReportMetricCard title="Untested" value={untestedTests.toString()} />
      </div>
      <Separator className="my-4 bg-muted" />
      <div className="flex gap-6">
        <Card className="flex h-[420px] min-w-0 flex-1 flex-col border-none bg-zinc-500/10 shadow-none">
          <CardHeader className="flex-shrink-0">
            <div className="flex items-center gap-2">
              <Info className="size-6" />
              <CardTitle className="text-lg font-semibold">Configuration</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden text-zinc-200">
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
        <Card className="flex h-[420px] min-w-0 flex-1 flex-col border-none bg-zinc-500/10 shadow-none">
          <CardHeader className="flex-shrink-0">
            <div className="flex items-center gap-2">
              <ChartLine className="size-6" />
              <CardTitle className="text-lg font-semibold">Visualizations</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col overflow-hidden">
            <Tabs defaultValue="overview" className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <TabsList className="mx-auto w-fit flex-shrink-0 bg-zinc-500/15 p-2">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="feature">Feature</TabsTrigger>
                <TabsTrigger value="duration">Duration</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
                <OverviewChart config={overViewPieChartConfig} data={overviewData} />
              </TabsContent>
              <TabsContent value="feature" className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
                <FeatureChart config={resultByFeatureBarChartConfig} data={featureData} />
              </TabsContent>
              <TabsContent value="duration" className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
                <DurationChart config={durationByFeatureBarChartConfig} data={durationData} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      <Separator className="my-4 bg-muted" />
      <ReportViewTable report={report} />
    </>
  )
}

export default ViewReport
