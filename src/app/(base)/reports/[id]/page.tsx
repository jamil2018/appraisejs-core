import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Badge } from '@/components/ui/badge'
import { BrowserEngine, Environment, Tag, TestRun, TestRunResult, TestRunStatus, TestRunTestCase } from '@prisma/client'
import { Calendar, CheckCircle, Clock, XCircle } from 'lucide-react'
import { Metadata } from 'next'

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
  startedAt: new Date(),
  completedAt: new Date('2024-11-12T12:00:00Z'),
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
}

const testRunResultToBadge = (result: TestRunResult) => {
  switch (result) {
    case TestRunResult.PASSED:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-green-700 bg-green-700/10 py-0 text-base text-green-500"
        >
          <CheckCircle className="h-4 w-4" />
          Passed
        </Badge>
      )
    case TestRunResult.FAILED:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-red-700 bg-red-700/10 py-0 text-base text-red-500"
        >
          <XCircle className="h-4 w-4" />
          Failed
        </Badge>
      )
    case TestRunResult.CANCELLED:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-gray-700 bg-gray-700/35 py-0 text-base text-gray-300"
        >
          <XCircle className="h-4 w-4" />
          Cancelled
        </Badge>
      )
    default:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-gray-700 bg-gray-700/10 py-0 text-base text-gray-500"
        >
          <Clock className="h-4 w-4" />
          Unknown
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

const ViewReport = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params

  return (
    <>
      <div className="mb-8">
        <PageHeader className="mb-4 flex items-center gap-2">
          <span>Test Run Report</span>
          {testRunResultToBadge(sampleReportDetails.result)}
        </PageHeader>
        {sampleReportDetails.completedAt && (
          <div className="flex items-center gap-1 text-sm">
            <Calendar className="h-4 w-4" />
            {formatDateTime(sampleReportDetails.completedAt)}
          </div>
        )}
      </div>
      <div className="space-y-6">
        <h1>Report {id}</h1>
      </div>
    </>
  )
}

export default ViewReport
