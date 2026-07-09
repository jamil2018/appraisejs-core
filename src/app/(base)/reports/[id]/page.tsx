import PageHeader from '@/components/typography/page-header'
import { Separator } from '@/components/ui/separator'
import { BrowserEngine, TestRunResult, TestRunStatus } from '@prisma/client'
import { Calendar, ChartLine, CheckCircle, Clock, Info, XCircle } from 'lucide-react'
import { Metadata } from 'next'
import ReportMetricCard from '../report-metric-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
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
      return <StatusBadge label="Passed" tone="success" icon={<CheckCircle />} className="text-sm" />
    case TestRunResult.FAILED:
      return <StatusBadge label="Failed" tone="danger" icon={<XCircle />} className="text-sm" />
    case TestRunResult.CANCELLED:
      return <StatusBadge label="Cancelled" tone="neutral" icon={<XCircle />} className="text-sm" />
    default:
      return <StatusBadge label="Unknown" tone="neutral" icon={<Clock />} className="text-sm" />
  }
}

const browserEngineToBadge = (browserEngine: BrowserEngine) => {
  switch (browserEngine) {
    case BrowserEngine.CHROMIUM:
      return <StatusBadge label="Chromium" tone="info" icon={browserIcons[BrowserEngine.CHROMIUM]} />
    case BrowserEngine.FIREFOX:
      return <StatusBadge label="Firefox" tone="danger" icon={browserIcons[BrowserEngine.FIREFOX]} />
    case BrowserEngine.WEBKIT:
      return <StatusBadge label="WebKit" tone="info" icon={browserIcons[BrowserEngine.WEBKIT]} />
    default:
      return <StatusBadge label="Unknown browser" tone="neutral" />
  }
}

const testRunStatusToBadge = (status: TestRunStatus) => {
  switch (status) {
    case TestRunStatus.COMPLETED:
      return <StatusBadge label="Completed" tone="success" icon={<CheckCircle />} />
    case TestRunStatus.CANCELLED:
      return <StatusBadge label="Cancelled" tone="neutral" icon={<XCircle />} />
    default:
      return <StatusBadge label="Unknown" tone="neutral" icon={<Clock />} />
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
        <div className="flex flex-wrap gap-x-3 gap-y-1">
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
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="min-w-0 border-white/[0.1] bg-[rgba(18,37,64,0.28)] shadow-none">
          <CardHeader className="flex-shrink-0">
            <div className="flex items-center gap-2">
              <Info className="size-6" />
              <CardTitle className="text-lg font-semibold">Configuration</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm text-muted-foreground">
              {[
                ['Environment Name', testRun.environment.name],
                ['Environment Base URL', testRun.environment.baseUrl],
                ['Environment API Base URL', testRun.environment.apiBaseUrl || '-'],
                ['Test Workers Count', testRun.testWorkersCount || 1],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="grid gap-1 border-b border-white/[0.06] pb-3 sm:grid-cols-[minmax(9rem,0.8fr)_minmax(0,1.2fr)] sm:gap-3"
                >
                  <dt>{label}</dt>
                  <dd className="min-w-0 break-words font-medium text-foreground">{value}</dd>
                </div>
              ))}
              <div className="grid gap-1 border-b border-white/[0.06] pb-3 sm:grid-cols-[minmax(9rem,0.8fr)_minmax(0,1.2fr)] sm:gap-3">
                <dt>Browser Engine</dt>
                <dd>{browserEngineToBadge(testRun.browserEngine)}</dd>
              </div>
              <div className="grid gap-1 sm:grid-cols-[minmax(9rem,0.8fr)_minmax(0,1.2fr)] sm:gap-3">
                <dt>Test Run Status</dt>
                <dd>{testRunStatusToBadge(testRun.status)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card className="flex min-w-0 flex-col border-white/[0.1] bg-[rgba(18,37,64,0.28)] shadow-none">
          <CardHeader className="flex-shrink-0">
            <div className="flex items-center gap-2">
              <ChartLine className="size-6" />
              <CardTitle className="text-lg font-semibold">Visualizations</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-[20rem] flex-1 flex-col overflow-hidden">
            <Tabs defaultValue="overview" className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <TabsList className="grid w-full grid-cols-3 bg-white/[0.055] p-1">
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
