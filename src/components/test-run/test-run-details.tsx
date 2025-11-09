import { TestRun, TestRunStatus, TestRunResult, Environment, Tag, TestRunTestCase } from '@prisma/client'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime } from '@/lib/utils'
import { CheckCircle, XCircle, LoaderCircle, Clock, ListEnd } from 'lucide-react'

interface TestRunDetailsProps {
  testRun: TestRun & {
    testCases: (TestRunTestCase & { testCase: { title: string } })[]
    tags: Tag[]
    environment: Environment
  }
}

export function TestRunDetails({ testRun }: TestRunDetailsProps) {
  const getStatusIcon = () => {
    switch (testRun.status) {
      case TestRunStatus.QUEUED:
        return <ListEnd className="h-4 w-4" />
      case TestRunStatus.RUNNING:
        return <LoaderCircle className="h-4 w-4 animate-spin" />
      case TestRunStatus.COMPLETED:
        return testRun.result === TestRunResult.PASSED ? (
          <CheckCircle className="h-4 w-4" />
        ) : (
          <XCircle className="h-4 w-4" />
        )
      case TestRunStatus.CANCELLED:
        return <XCircle className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const getStatusColor = () => {
    switch (testRun.status) {
      case TestRunStatus.QUEUED:
        return 'bg-gray-500'
      case TestRunStatus.RUNNING:
        return 'bg-blue-500'
      case TestRunStatus.COMPLETED:
        return testRun.result === TestRunResult.PASSED ? 'bg-green-700' : 'bg-red-500'
      case TestRunStatus.CANCELLED:
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusText = () => {
    switch (testRun.status) {
      case TestRunStatus.QUEUED:
        return 'Queued'
      case TestRunStatus.RUNNING:
        return 'Running'
      case TestRunStatus.COMPLETED:
        return 'Completed'
      case TestRunStatus.CANCELLED:
        return 'Cancelled'
      default:
        return 'Unknown'
    }
  }

  const getResultText = () => {
    switch (testRun.result) {
      case TestRunResult.PENDING:
        return 'Pending'
      case TestRunResult.PASSED:
        return 'Passed'
      case TestRunResult.FAILED:
        return 'Failed'
      case TestRunResult.CANCELLED:
        return 'Cancelled'
      default:
        return 'Unknown'
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Test Run Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Status</span>
            <Badge variant="outline" className={`${getStatusColor()} py-1`}>
              <span className="mr-1">{getStatusIcon()}</span>
              <span>{getStatusText()}</span>
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Result</span>
            <Badge variant="outline">{getResultText()}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Run ID</span>
            <span className="font-mono text-sm">{testRun.runId}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Environment</span>
            <span className="text-sm">{testRun.environment.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Browser</span>
            <span className="text-sm">{testRun.browserEngine}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Workers</span>
            <span className="text-sm">{testRun.testWorkersCount || 1}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Started At</span>
            <span className="text-sm">{formatDateTime(testRun.startedAt)}</span>
          </div>
          {testRun.completedAt && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Completed At</span>
              <span className="text-sm">{formatDateTime(testRun.completedAt)}</span>
            </div>
          )}
          {testRun.completedAt && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Duration</span>
              <span className="text-sm">
                {Math.round((testRun.completedAt.getTime() - testRun.startedAt.getTime()) / 1000)}s
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Tags</CardTitle>
        </CardHeader>
        <CardContent>
          {testRun.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {testRun.tags.map(tag => (
                <Badge key={tag.id} variant="outline">
                  {tag.name}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No tags</span>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Test Cases ({testRun.testCases.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {testRun.testCases.length > 0 ? (
            <div className="space-y-2">
              {testRun.testCases.map(testRunCase => (
                <div key={testRunCase.id} className="flex items-center justify-between rounded-md border p-2">
                  <span className="text-sm">{testRunCase.testCase.title}</span>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-xs">
                      {testRunCase.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {testRunCase.result}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No test cases</span>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

