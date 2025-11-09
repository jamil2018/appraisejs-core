import { getTestRunByIdAction } from '@/actions/test-run/test-run-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { TestRunDetails } from '@/components/test-run/test-run-details'
import { LogViewer } from '@/components/test-run/log-viewer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

interface TestRunDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function TestRunDetailPage({ params }: TestRunDetailPageProps) {
  const { id } = await params
  const { data: testRun, error } = await getTestRunByIdAction(id)

  if (error || !testRun) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Test Run Not Found</h2>
          <p className="text-muted-foreground mt-2">{error || 'The test run you are looking for does not exist.'}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>Test Run Details</PageHeader>
        <HeaderSubtitle>View test run execution details and live logs</HeaderSubtitle>
      </div>

      <div className="space-y-6">
        <TestRunDetails testRun={testRun} />

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle>Live Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <LogViewer testRunId={testRun.runId} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

