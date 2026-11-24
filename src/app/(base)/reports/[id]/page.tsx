import { DiscussRecordLink } from '@/components/navigation/discuss-record-link'
import PageHeader from '@/components/typography/page-header'
import { BrowserEngine } from '@prisma/client'
import { Calendar, ChartLine, Clock } from 'lucide-react'
import { Metadata } from 'next'
import Link from 'next/link'
import ReportMetricCard from '../report-metric-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { TestRunResultBadge, TestRunStatusBadge } from '@/components/test-run/test-run-report-badges'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DurationChart, FeatureChart, OverviewChart } from '../report-charts'
import ReportViewTable from '../report-view-table'
import { getReportByIdAction } from '@/actions/reports/report-actions'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { journeyRecordBriefHref } from '@/lib/quality-journey/record-context'
import { cn } from '@/lib/utils'
import {
  browserIcons,
  durationByFeatureBarChartConfig,
  formatDateTime,
  formatDuration,
  getDurationData,
  getFeatureData,
  getOverviewData,
  getReportMetrics,
  getReportOutcome,
  isValidReportDetail,
  overViewPieChartConfig,
  resultByFeatureBarChartConfig,
  type ReportDetailWithRelations,
} from '../report-detail-helpers'

export const metadata: Metadata = {
  title: 'Appraise | View Report',
  description: 'View report details and live logs',
}

const browserEngineToBadge = (browserEngine: BrowserEngine) => {
  switch (browserEngine) {
    case BrowserEngine.CHROMIUM:
      return <StatusBadge label="Chromium" tone="neutral" icon={browserIcons[BrowserEngine.CHROMIUM]} />
    case BrowserEngine.FIREFOX:
      return <StatusBadge label="Firefox" tone="neutral" icon={browserIcons[BrowserEngine.FIREFOX]} />
    case BrowserEngine.WEBKIT:
      return <StatusBadge label="WebKit" tone="neutral" icon={browserIcons[BrowserEngine.WEBKIT]} />
    default:
      return <StatusBadge label="Unknown browser" tone="neutral" />
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
  const outcome = getReportOutcome(report)
  const failedCases = report.testCases.filter(item => item.testRunTestCase.result === 'FAILED')
  const overviewData = getOverviewData(report)
  const featureData = getFeatureData(report)
  const durationData = getDurationData(report)

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <PageHeader className="mb-2 break-words">
            <div>
              <span>Test Run Report: </span>
              <span>{report.testRun.name}</span>
            </div>
          </PageHeader>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {testRun.completedAt && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Calendar className="size-4" />
                {formatDateTime(testRun.completedAt)}
              </div>
            )}
            {testRun.completedAt && testRun.startedAt && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="size-4" />
                {formatDuration(testRun.startedAt, testRun.completedAt)}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DiscussRecordLink projectId={testRun.targetProjectId} reference={{ kind: 'report', id: report.id }} />
          <Button
            nativeButton={false}
            variant="secondary"
            size="sm"
            render={<Link href={journeyRecordBriefHref(testRun.targetProjectId, { kind: 'report', id: report.id })} />}
          >
            Use in a Journey
          </Button>
        </div>
      </div>
      <section
        aria-labelledby="report-outcome-heading"
        className={cn(
          'rounded-xl border border-border bg-card p-4',
          outcome.tone === 'danger' && 'border-danger-border',
          outcome.tone === 'warning' && 'border-warning-border',
          outcome.tone === 'success' && 'border-success-border',
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <TestRunResultBadge result={testRun.result} className="text-sm" />
          <h2 id="report-outcome-heading" className="text-lg font-semibold">
            {outcome.title}
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{outcome.description}</p>
        {failedCases.length > 0 ? (
          <div className="mt-3 border-t border-border pt-3">
            <h3 className="text-sm font-semibold">Failed checks</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {failedCases.map(item => {
                const failedStep = item.reportScenario?.steps.find(step => step.status === 'FAILED')
                const failedHook = item.reportScenario?.hooks.find(hook => hook.status === 'FAILED')
                return (
                  <li key={item.id} className="rounded-lg border border-danger-border bg-danger-surface/50 px-3 py-2">
                    <span className="font-medium">{item.testRunTestCase.testCase.title}</span>
                    {failedStep ? (
                      <span className="block text-muted-foreground">
                        Failed step: {failedStep.keyword} {failedStep.name}
                      </span>
                    ) : failedHook ? (
                      <span className="block text-muted-foreground">Failed hook: {failedHook.keyword}</span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </section>
      <section aria-labelledby="report-checks-heading" className="min-w-0">
        <h2 id="report-checks-heading" className="mb-2 text-base font-semibold">
          Check outcomes and evidence
        </h2>
        <ReportViewTable report={report} />
      </section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportMetricCard title="Total Tests" value={totalTests.toString()} />
        <ReportMetricCard title="Passed" value={passedTests.toString()} />
        <ReportMetricCard title="Failed" value={failedTests.toString()} />
        <ReportMetricCard title="Untested" value={untestedTests.toString()} />
      </div>
      <div className="grid gap-4">
        <Card className="flex min-w-0 flex-col border-border bg-card shadow-none">
          <CardHeader className="shrink-0 p-4">
            <div className="flex items-center gap-2">
              <ChartLine className="size-5" />
              <CardTitle className="text-base font-semibold">Visualizations</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-[20rem] flex-1 flex-col overflow-hidden p-4 pt-0">
            <Tabs defaultValue="overview" className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <TabsList className="grid w-full grid-cols-3 bg-secondary p-1">
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
      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Run configuration</summary>
        <div className="border-t border-border p-4">
          <dl className="flex flex-col gap-3 text-sm text-muted-foreground">
            {[
              ['Environment Name', testRun.environment.name],
              ['Environment Base URL', testRun.environment.baseUrl],
              ['Environment API Base URL', testRun.environment.apiBaseUrl || '-'],
              ['Test Workers Count', testRun.testWorkersCount || 1],
            ].map(([label, value]) => (
              <div
                key={label}
                className="grid gap-1 border-b border-border pb-3 sm:grid-cols-[minmax(9rem,0.8fr)_minmax(0,1.2fr)] sm:gap-3"
              >
                <dt>{label}</dt>
                <dd className="min-w-0 break-words font-medium text-foreground">{value}</dd>
              </div>
            ))}
            <div className="grid gap-1 border-b border-border pb-3 sm:grid-cols-[minmax(9rem,0.8fr)_minmax(0,1.2fr)] sm:gap-3">
              <dt>Browser Engine</dt>
              <dd>{browserEngineToBadge(testRun.browserEngine)}</dd>
            </div>
            <div className="grid gap-1 sm:grid-cols-[minmax(9rem,0.8fr)_minmax(0,1.2fr)] sm:gap-3">
              <dt>Test Run Status</dt>
              <dd>
                <TestRunStatusBadge status={testRun.status} />
              </dd>
            </div>
          </dl>
        </div>
      </details>
    </div>
  )
}

export default ViewReport
