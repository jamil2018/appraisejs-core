import { getTestRunByIdAction } from '@/actions/test-run/test-run-actions'
import { TestRunDetails } from '@/components/test-run/test-run-details'
import { TestRunHeader } from '@/components/test-run/test-run-header'
import { getTestRunDetailsData } from '@/components/test-run/test-run-details-helpers'
import { LogViewer } from '@/components/test-run/log-viewer'
import { Separator } from '@/components/ui/separator'
import { Metadata } from 'next'

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

      <div className="space-y-6">
        <TestRunDetails testRun={testRun} />

        <Separator />

        <LogViewer testRunId={testRun.runId} targetProjectId={project} status={testRun.status} />
      </div>
    </>
  )
}
