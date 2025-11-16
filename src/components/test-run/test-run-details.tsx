'use client'

import { useEffect, useState } from 'react'
import {
  TestRun,
  TestRunStatus,
  TestRunResult,
  Environment,
  Tag,
  TestRunTestCase,
  TestRunTestCaseStatus,
  TestRunTestCaseResult,
} from '@prisma/client'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatDateTime } from '@/lib/utils'
import {
  CheckCircle,
  XCircle,
  LoaderCircle,
  Clock,
  ListEnd,
  ClipboardCheck,
  ClipboardX,
  TestTubeDiagonal,
  TestTubes,
  Tag as TagIcon,
  Tags,
  Info,
  Timer,
} from 'lucide-react'
import { getTestRunByIdAction } from '@/actions/test-run/test-run-actions'

interface TestRunDetailsProps {
  testRun: TestRun & {
    testCases: (TestRunTestCase & { testCase: { title: string; description: string } })[]
    tags: Tag[]
    environment: Environment
  }
}

export function TestRunDetails({ testRun: initialTestRun }: TestRunDetailsProps) {
  const [testRun, setTestRun] = useState(initialTestRun)

  // Poll for status updates while test run is running
  useEffect(() => {
    // Only poll if test run is not completed
    if (testRun.status === TestRunStatus.COMPLETED || testRun.status === TestRunStatus.CANCELLED) {
      return
    }

    const pollInterval = setInterval(async () => {
      try {
        const { data: updatedTestRun, error } = await getTestRunByIdAction(testRun.id)
        if (error || !updatedTestRun) {
          console.error('Error polling test run status:', error)
          return
        }
        // TypeScript now knows updatedTestRun is defined - cast to proper type
        const typedTestRun = updatedTestRun as TestRun & {
          testCases: (TestRunTestCase & { testCase: { title: string; description: string } })[]
          tags: Tag[]
          environment: Environment
        }
        setTestRun(typedTestRun)
        // Stop polling if test run is completed
        if (typedTestRun.status === TestRunStatus.COMPLETED || typedTestRun.status === TestRunStatus.CANCELLED) {
          clearInterval(pollInterval)
        }
      } catch (error) {
        console.error('Error polling test run status:', error)
      }
    }, 2000) // Poll every 2 seconds

    return () => clearInterval(pollInterval)
  }, [testRun.id, testRun.status])
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

  const getFormattedTestRunTestCaseStatus = (status: TestRunTestCaseStatus) => {
    switch (status) {
      case TestRunTestCaseStatus.PENDING:
        return (
          <div className="flex min-w-20 items-center gap-2 p-1.5">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            <span>Pending</span>
          </div>
        )
      case TestRunTestCaseStatus.RUNNING:
        return (
          <div className="flex min-w-20 items-center gap-2 p-1.5">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            <span>Running</span>
          </div>
        )
      case TestRunTestCaseStatus.COMPLETED:
        return (
          <div className="flex min-w-20 items-center gap-2 p-1.5">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span>Completed</span>
          </div>
        )
      case TestRunTestCaseStatus.CANCELLED:
        return (
          <div className="flex min-w-20 items-center gap-2 p-1.5">
            <XCircle className="h-4 w-4" />
            <span>Cancelled</span>
          </div>
        )
      default:
        return (
          <div className="flex min-w-20 items-center gap-2 p-1.5">
            <Clock className="h-4 w-4" />
            <span>Unknown</span>
          </div>
        )
    }
  }

  const getFormattedTestRunTestCaseResult = (result: TestRunTestCaseResult) => {
    switch (result) {
      case TestRunTestCaseResult.PASSED:
        return (
          <div className="flex min-w-20 items-center gap-2 p-1.5">
            <ClipboardCheck className="h-4 w-4 text-green-500" />
            <span>Passed</span>
          </div>
        )
      case TestRunTestCaseResult.FAILED:
        return (
          <div className="flex min-w-20 items-center gap-2 p-1.5">
            <ClipboardX className="h-4 w-4 text-red-500" />
            <span>Failed</span>
          </div>
        )
      case TestRunTestCaseResult.UNTESTED:
        return (
          <div className="flex min-w-20 items-center gap-2 p-1.5">
            <Clock className="h-4 w-4" />
            <span>Untested</span>
          </div>
        )
      default:
        return (
          <div className="flex min-w-20 items-center gap-2 p-1.5">
            <Clock className="h-4 w-4" />
            <span>Unknown</span>
          </div>
        )
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Info className="mr-2 h-6 w-6" />
            <h3 className="text-lg font-semibold">Test Run Information</h3>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Status</span>
            <Badge variant="outline" className={`${getStatusColor()} py-1`}>
              <span className="mr-1 text-white">{getStatusIcon()}</span>
              <span className="text-white">{getStatusText()}</span>
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
          <CardTitle className="flex items-center">
            <Timer className="mr-2 h-6 w-6" />
            <h3 className="text-lg font-semibold">Timing</h3>
          </CardTitle>
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
          <CardTitle className="flex items-center">
            <Tags className="mr-2 h-6 w-6" />
            <h3 className="text-lg font-semibold">Tags</h3>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {testRun.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {testRun.tags.map(tag => (
                <Badge key={tag.id} variant="outline" className="bg-gray-700 text-white">
                  <TagIcon className="mr-2 h-4 w-4 text-white" />
                  <span className="text-sm">{tag.name}</span>
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
          <CardTitle className="flex items-center">
            <TestTubes className="mr-2 h-6 w-6" />
            <h3 className="text-lg font-semibold">Test Cases ({testRun.testCases.length})</h3>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {testRun.testCases.length > 0 ? (
            <div className="space-y-2">
              {testRun.testCases.map(testCase => (
                <div key={testCase.id} className="flex items-center justify-between rounded-md bg-muted p-2 shadow-md">
                  <div className="flex items-center gap-2">
                    <TestTubeDiagonal
                      className={cn(
                        'mr-2 h-6 w-6 text-white',
                        testCase.result === TestRunTestCaseResult.PASSED
                          ? 'text-green-500'
                          : testCase.result === TestRunTestCaseResult.FAILED
                            ? 'text-red-500'
                            : testCase.result === TestRunTestCaseResult.UNTESTED
                              ? 'text-blue-500'
                              : 'text-gray-500',
                      )}
                    />
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-semibold">{testCase.testCase.title}</span>
                      <span className="text-xs text-muted-foreground">{testCase.testCase.description}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="bg-gray-700 text-xs text-white">
                      {getFormattedTestRunTestCaseStatus(testCase.status)}
                    </Badge>
                    <Badge variant="outline" className="bg-gray-700 text-xs text-white">
                      {getFormattedTestRunTestCaseResult(testCase.result)}
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
