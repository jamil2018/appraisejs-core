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
  getEvidenceHealthMeta,
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
  const evidenceHealthMeta = getEvidenceHealthMeta(testRun.evidenceHealth)
  const progress = getProgressStats(testRun.testCases)
  const durationSeconds = getDurationSeconds(testRun.startedAt, testRun.completedAt)
  const StatusIcon = statusMeta.icon
  const EvidenceIcon = evidenceHealthMeta.icon

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card className="min-w-0">
        <CardHeader className="p-4">
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            {testRun.status === TestRunStatus.RUNNING ? (
              <div className="flex items-center gap-2">
                <LoaderCircle className="size-6 animate-spin text-info" />
                <span>Executing</span>
              </div>
            ) : testRun.status === TestRunStatus.COMPLETED ? (
              <div className="flex items-center gap-2 duration-300 animate-in fade-in-0">
                <CheckCircle className="size-6 text-success" />
                <span>Finished</span>
              </div>
            ) : testRun.status === TestRunStatus.CANCELLED ? (
              <div className="flex items-center gap-2 duration-300 animate-in fade-in-0">
                <XCircle className="size-6 text-danger duration-300 animate-in fade-in-0" />
                <span>Interrupted</span>
              </div>
            ) : null}
            {testRun.status === TestRunStatus.RUNNING ? (
              <Button onClick={handleCancelRun} disabled={isCancelling} variant="destructive" size="sm">
                {isCancelling ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Cancelling…
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
        <CardContent className="p-4 pt-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="w-full min-w-0 flex-1">
              <Progress value={progress.percentage} />
            </div>
            <div className="whitespace-nowrap text-sm font-medium">
              {progress.completed} of {progress.total} tests finished
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="p-4">
            <CardTitle className="flex items-center">
              <Info className="mr-2 size-6 shrink-0" />
              <h3 className="text-lg font-semibold">Test Run Information</h3>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-4 pt-0">
            <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] items-start gap-3">
              <span className="text-sm font-medium">Name</span>
              <span className="min-w-0 break-words text-right text-sm">{testRun.name}</span>
            </div>
            <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] items-start gap-3">
              <span className="text-sm font-medium">Status</span>
              <Badge variant="outline" className={cn(statusMeta.badgeClassName, 'max-w-full justify-self-end py-1')}>
                <span className="mr-1">
                  <StatusIcon className={cn('size-4', testRun.status === TestRunStatus.RUNNING && 'animate-spin')} />
                </span>
                <span>{statusMeta.label}</span>
              </Badge>
            </div>
            <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] items-start gap-3">
              <span className="text-sm font-medium">Result</span>
              <Badge variant="outline" className="justify-self-end">
                {getTestRunResultText(testRun.result)}
              </Badge>
            </div>
            <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] items-start gap-3">
              <span className="text-sm font-medium">Evidence</span>
              <Badge
                variant="outline"
                className={cn(evidenceHealthMeta.badgeClassName, 'max-w-full justify-self-end py-1')}
              >
                <EvidenceIcon className="mr-1 size-4" />
                <span>{evidenceHealthMeta.label}</span>
              </Badge>
            </div>
            <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] items-start gap-3">
              <span className="text-sm font-medium">Run ID</span>
              <span className="min-w-0 break-all text-right font-mono text-sm">{testRun.runId}</span>
            </div>
            <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] items-start gap-3">
              <span className="text-sm font-medium">Environment</span>
              <span className="min-w-0 break-words text-right text-sm">{testRun.environment.name}</span>
            </div>
            <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] items-start gap-3">
              <span className="text-sm font-medium">Browser</span>
              <span className="min-w-0 break-words text-right text-sm">{testRun.browserEngine}</span>
            </div>
            <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] items-start gap-3">
              <span className="text-sm font-medium">Workers</span>
              <span className="min-w-0 break-words text-right text-sm">{testRun.testWorkersCount || 1}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="p-4">
            <CardTitle className="flex items-center">
              <Timer className="mr-2 size-6 shrink-0" />
              <h3 className="text-lg font-semibold">Timing</h3>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-4 pt-0">
            <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] items-start gap-3">
              <span className="text-sm font-medium">Started At</span>
              <span className="min-w-0 break-words text-right text-sm">{formatDateTime(testRun.startedAt)}</span>
            </div>
            {testRun.completedAt ? (
              <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] items-start gap-3">
                <span className="text-sm font-medium">Completed At</span>
                <span className="min-w-0 break-words text-right text-sm">{formatDateTime(testRun.completedAt)}</span>
              </div>
            ) : null}
            {durationSeconds !== null ? (
              <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] items-start gap-3">
                <span className="text-sm font-medium">Duration</span>
                <span className="min-w-0 break-words text-right text-sm">{durationSeconds}s</span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="min-w-0 md:col-span-2">
          <CardHeader className="p-4">
            <CardTitle className="flex items-center">
              <Tags className="mr-2 size-6 shrink-0" />
              <h3 className="text-lg font-semibold">Tags</h3>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {testRun.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {testRun.tags.map(tag => (
                  <Badge key={tag.id} variant="outline" className="max-w-full bg-secondary text-foreground">
                    <TagIcon className="mr-2 size-4 shrink-0 text-foreground" />
                    <span className="min-w-0 text-sm [overflow-wrap:anywhere]">{tag.name}</span>
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">No tags</span>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 md:col-span-2">
          <CardHeader className="p-4">
            <CardTitle className="flex items-center">
              <TestTubes className="mr-2 size-6 shrink-0" />
              <h3 className="text-lg font-semibold">Test Cases ({testRun.testCases.length})</h3>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {testRun.testCases.length > 0 ? (
              <div className="flex flex-col gap-2">
                {testRun.testCases.map(testCase => {
                  const testCaseStatusMeta = getTestCaseStatusMeta(testCase.status)
                  const testCaseResultMeta = getTestCaseResultMeta(testCase.result)
                  const TestCaseStatusIcon = testCaseStatusMeta.icon
                  const TestCaseResultIcon = testCaseResultMeta.icon

                  return (
                    <div
                      key={testCase.id}
                      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-secondary p-3 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <TestTubeDiagonal
                          className={cn(
                            'size-6 shrink-0 text-foreground',
                            testCase.result === TestRunTestCaseResult.PASSED
                              ? 'text-success'
                              : testCase.result === TestRunTestCaseResult.FAILED
                                ? 'text-danger'
                                : testCase.result === TestRunTestCaseResult.UNTESTED
                                  ? 'text-info'
                                  : 'text-muted-foreground',
                          )}
                        />
                        <div className="flex min-w-0 flex-col gap-1 break-words">
                          <span className="text-sm font-semibold">{testCase.testCase.title}</span>
                          <span className="text-xs text-muted-foreground">{testCase.testCase.description}</span>
                          {testCase.testSuite ? (
                            <div className="pt-1">
                              <Badge variant="outline" className="max-w-full text-wrap text-[11px]">
                                Suite: {testCase.testSuite.name}
                              </Badge>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
                        <Badge variant="outline" className="bg-secondary text-xs text-foreground">
                          <div className="flex items-center gap-1.5 py-1">
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
                        <Badge variant="outline" className="bg-secondary text-xs text-foreground">
                          <div className="flex items-center gap-1.5 py-1">
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
