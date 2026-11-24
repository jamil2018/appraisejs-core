import { getTestRunByIdAction } from '@/actions/test-run/test-run-actions'
import { TestRunDetails } from '@/components/test-run/test-run-details'
import { TestRunHeader } from '@/components/test-run/test-run-header'
import { getTestRunDetailsData } from '@/components/test-run/test-run-details-helpers'
import { LogViewer } from '@/components/test-run/log-viewer'
import { Metadata } from 'next'
import { TestRunStatus } from '@prisma/client'

export const metadata: Metadata = {
  title: 'Appraise | Test Run Details',
  description: 'View test run execution details and live logs',
}

interface TestRunDetailPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ project?: string }>
}

export default async function TestRunDetailPage({ params, searchParams }: TestRunDetailPageProps) {
  const { id } = await params
  const { project } = await searchParams
  const response = await getTestRunByIdAction(id, project)

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

  const testRun = getTestRunDetailsData(response.data)
  if (!testRun) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Test Run Not Found</h2>
          <p className="mt-2 text-muted-foreground">The test run data could not be parsed.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <TestRunHeader initialTestRun={testRun} />

      <div className="flex min-w-0 flex-col gap-4">
        <TestRunDetails testRun={testRun} />

        <details
          className="rounded-xl border border-border bg-card"
          open={testRun.status === TestRunStatus.RUNNING || testRun.status === TestRunStatus.CANCELLING}
        >
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Technical logs</summary>
          <div className="border-t border-border p-3">
            <LogViewer testRunId={testRun.runId} targetProjectId={project} status={testRun.status} />
          </div>
        </details>
      </div>
    </>
  )
}
