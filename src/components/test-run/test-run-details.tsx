'use client'

import { TestRunStatus, TestRunTestCaseResult } from '@prisma/client'
import {
  CheckCircle,
  Info,
  LoaderCircle,
  Tag as TagIcon,
  Tags,
  TestTubeDiagonal,
  TestTubes,
  Timer,
  Trash,
  XCircle,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn, formatDateTime } from '@/lib/utils'
import { TraceViewerIdleLabel, TraceViewerOpeningLabel, TraceViewerRunningLabel } from './trace-viewer-button-label'

import {
  getDurationSeconds,
  getProgressStats,
  getTestCaseResultMeta,
  getTestCaseStatusMeta,
  getTestRunResultText,
  getTestRunStatusMeta,
  type TestRunDetailsData,
} from './test-run-details-helpers'
import { useTestRunDetails } from './use-test-run-details'

type TestRunDetailsProps = {
  testRun: TestRunDetailsData
}

export function TestRunDetails({ testRun: initialTestRun }: TestRunDetailsProps) {
  const { testRun, loadingTraceViewer, runningTraceViewers, isCancelling, handleViewTrace, handleCancelRun } =
    useTestRunDetails({ initialTestRun })

  const statusMeta = getTestRunStatusMeta(testRun.status, testRun.result)
  const progress = getProgressStats(testRun.testCases)
  const durationSeconds = getDurationSeconds(testRun.startedAt, testRun.completedAt)
  const StatusIcon = statusMeta.icon

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            {testRun.status === TestRunStatus.RUNNING ? (
              <div className="flex items-center gap-2">
                <LoaderCircle className="size-6 animate-spin text-blue-500" />
                <span>Executing</span>
              </div>
            ) : testRun.status === TestRunStatus.COMPLETED ? (
              <div className="flex items-center gap-2 duration-300 animate-in fade-in-0">
                <CheckCircle className="size-6 text-green-500" />
                <span>Finished</span>
              </div>
            ) : testRun.status === TestRunStatus.CANCELLED ? (
              <div className="flex items-center gap-2 duration-300 animate-in fade-in-0">
                <XCircle className="size-6 text-red-500 duration-300 animate-in fade-in-0" />
                <span>Interrupted</span>
              </div>
            ) : null}
            {testRun.status === TestRunStatus.RUNNING ? (
              <Button
                onClick={handleCancelRun}
                disabled={isCancelling}
                className="bg-red-500 font-bold text-white hover:bg-red-600"
                size="sm"
              >
                {isCancelling ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <Trash className="size-4" />
                    <span>Cancel Run</span>
                  </>
                )}
              </Button>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Progress value={progress.percentage} />
            </div>
            <div className="whitespace-nowrap text-sm font-medium">
              {progress.completed} of {progress.total} tests finished
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Info className="mr-2 size-6" />
              <h3 className="text-lg font-semibold">Test Run Information</h3>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Name</span>
              <span className="text-sm">{testRun.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              <Badge variant="outline" className={cn(statusMeta.badgeClassName, 'py-1')}>
                <span className="mr-1 text-white">
                  <StatusIcon className={cn('size-4', testRun.status === TestRunStatus.RUNNING && 'animate-spin')} />
                </span>
                <span className="text-white">{statusMeta.label}</span>
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Result</span>
              <Badge variant="outline">{getTestRunResultText(testRun.result)}</Badge>
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
              <Timer className="mr-2 size-6" />
              <h3 className="text-lg font-semibold">Timing</h3>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Started At</span>
              <span className="text-sm">{formatDateTime(testRun.startedAt)}</span>
            </div>
            {testRun.completedAt ? (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Completed At</span>
                <span className="text-sm">{formatDateTime(testRun.completedAt)}</span>
              </div>
            ) : null}
            {durationSeconds !== null ? (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Duration</span>
                <span className="text-sm">{durationSeconds}s</span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Tags className="mr-2 size-6" />
              <h3 className="text-lg font-semibold">Tags</h3>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {testRun.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {testRun.tags.map(tag => (
                  <Badge key={tag.id} variant="outline" className="bg-zinc-700 text-white">
                    <TagIcon className="mr-2 size-4 text-white" />
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
              <TestTubes className="mr-2 size-6" />
              <h3 className="text-lg font-semibold">Test Cases ({testRun.testCases.length})</h3>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {testRun.testCases.length > 0 ? (
              <div className="space-y-2">
                {testRun.testCases.map(testCase => {
                  const testCaseStatusMeta = getTestCaseStatusMeta(testCase.status)
                  const testCaseResultMeta = getTestCaseResultMeta(testCase.result)
                  const TestCaseStatusIcon = testCaseStatusMeta.icon
                  const TestCaseResultIcon = testCaseResultMeta.icon

                  return (
                    <div
                      key={testCase.id}
                      className="flex items-center justify-between rounded-md bg-muted p-2 shadow-md"
                    >
                      <div className="flex items-center gap-2">
                        <TestTubeDiagonal
                          className={cn(
                            'mr-2 size-6 text-white',
                            testCase.result === TestRunTestCaseResult.PASSED
                              ? 'text-green-500'
                              : testCase.result === TestRunTestCaseResult.FAILED
                                ? 'text-red-500'
                                : testCase.result === TestRunTestCaseResult.UNTESTED
                                  ? 'text-blue-500'
                                  : 'text-zinc-500',
                          )}
                        />
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-semibold">{testCase.testCase.title}</span>
                          <span className="text-xs text-muted-foreground">{testCase.testCase.description}</span>
                          {testCase.testSuite ? (
                            <div className="pt-1">
                              <Badge variant="outline" className="w-fit text-[11px]">
                                Suite: {testCase.testSuite.name}
                              </Badge>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-zinc-700 text-xs text-white">
                          <div className="flex min-w-20 items-center gap-2 p-1.5">
                            <TestCaseStatusIcon
                              className={cn(
                                'size-4',
                                testCase.status === 'PENDING' || testCase.status === 'RUNNING'
                                  ? 'animate-spin'
                                  : testCaseStatusMeta.iconClassName,
                              )}
                            />
                            <span>{testCaseStatusMeta.label}</span>
                          </div>
                        </Badge>
                        <Badge variant="outline" className="bg-zinc-700 text-xs text-white">
                          <div className="flex min-w-20 items-center gap-2 p-1.5">
                            <TestCaseResultIcon className={cn('size-4', testCaseResultMeta.iconClassName)} />
                            <span>{testCaseResultMeta.label}</span>
                          </div>
                        </Badge>
                        {testCase.result === TestRunTestCaseResult.FAILED && testCase.tracePath ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewTrace(testCase.id)}
                            disabled={loadingTraceViewer === testCase.id || runningTraceViewers.has(testCase.id)}
                            className="w-28 bg-transparent text-xs"
                          >
                            {loadingTraceViewer === testCase.id ? (
                              <TraceViewerOpeningLabel />
                            ) : runningTraceViewers.has(testCase.id) ? (
                              <TraceViewerRunningLabel />
                            ) : (
                              <TraceViewerIdleLabel />
                            )}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">No test cases</span>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
