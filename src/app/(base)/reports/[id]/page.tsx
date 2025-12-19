import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { BrowserEngine, Environment, Tag, TestRun, TestRunResult, TestRunStatus, TestRunTestCase } from '@prisma/client'
import { Calendar, CheckCircle, Clock, XCircle } from 'lucide-react'
import { Metadata } from 'next'
import ReportMetricCard from '../report-metric-card'

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

const ViewReport = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params

  return (
    <>
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
      <Separator className="my-4 bg-muted" />
      <div className="grid gap-4 md:grid-cols-3">
        <ReportMetricCard title="Total Tests" value="100" />
        <ReportMetricCard title="Passed" value="90" />
        <ReportMetricCard title="Failed" value="10" />
      </div>
    </>
  )
}

export default ViewReport
