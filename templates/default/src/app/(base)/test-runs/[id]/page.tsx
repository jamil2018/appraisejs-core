import { getTestRunByIdAction } from '@/actions/test-run/test-run-actions'
import { TestRunDetails } from '@/components/test-run/test-run-details'
import { TestRunHeader } from '@/components/test-run/test-run-header'
import { LogViewer } from '@/components/test-run/log-viewer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { TestRun, TestRunTestCase, Tag, Environment, TestRunStatus, Report } from '@prisma/client'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Appraise | Test Run Details',
  description: 'View test run execution details and live logs',
}

interface TestRunDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function TestRunDetailPage({ params }: TestRunDetailPageProps) {
  const { id } = await params
  const response = await getTestRunByIdAction(id)

  if (response.error || !response.data) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Test Run Not Found</h2>
          <p className="mt-2 text-muted-foreground">
            {response.error || 'The test run you are looking for does not exist.'}
          </p>
        </div>
      </div>
    )
  }

  // TypeScript now knows response.data is defined
  const testRun = response.data as TestRun & {
    testCases: (TestRunTestCase & { testCase: { title: string; description: string } })[]
    tags: Tag[]
    environment: Environment
    reports: Report[]
  }

  return (
    <>
      <TestRunHeader initialTestRun={testRun} />

      <div className="space-y-6">
        <TestRunDetails testRun={testRun} />

        <Separator />

        <LogViewer testRunId={testRun.runId} status={testRun.status} />
      </div>
    </>
  )
}
