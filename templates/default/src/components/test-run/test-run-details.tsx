'use client'

import { useEffect, useState, useRef } from 'react'
import {
  TestRun,
  TestRunStatus,
  TestRunResult,
  Environment,
  Tag,
  TestRunTestCase,
  TestRunTestCaseStatus,
  TestRunTestCaseResult,
  Report,
} from '@prisma/client'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
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
  Binoculars,
  ExternalLink,
  Trash,
} from 'lucide-react'
import {
  getTestRunByIdAction,
  spawnTraceViewerAction,
  checkTraceViewerStatusAction,
  cancelTestRunAction,
} from '@/actions/test-run/test-run-actions'
import { Button } from '@/components/ui/button'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from '@/hooks/use-toast'

interface TestRunDetailsProps {
  testRun: TestRun & {
    testCases: (TestRunTestCase & { testCase: { title: string; description: string } })[]
    tags: Tag[]
    environment: Environment
    reports: Report[]
  }
}

export function TestRunDetails({ testRun: initialTestRun }: TestRunDetailsProps) {
  const [testRun, setTestRun] = useState(initialTestRun)
  const [loadingTraceViewer, setLoadingTraceViewer] = useState<string | null>(null)
  const [runningTraceViewers, setRunningTraceViewers] = useState<Set<string>>(new Set())
  const [isCancelling, setIsCancelling] = useState(false)
  const runningTraceViewersRef = useRef<Set<string>>(new Set())

  // Keep ref in sync with state
  useEffect(() => {
    runningTraceViewersRef.current = runningTraceViewers
  }, [runningTraceViewers])

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
          reports: Report[]
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

  // Calculate progress
  const totalTests = testRun.testCases.length
  const completedTests = testRun.testCases.filter(
    testCase =>
      testCase.status === TestRunTestCaseStatus.COMPLETED || testCase.status === TestRunTestCaseStatus.CANCELLED,
  ).length
  const progressPercentage = totalTests > 0 ? (completedTests / totalTests) * 100 : 0

  const handleViewTrace = async (testCaseId: string) => {
    setLoadingTraceViewer(testCaseId)
    try {
      const response = await spawnTraceViewerAction(testRun.runId, testCaseId)
      if (response.error) {
        console.error('Error spawning trace viewer:', response.error)
        // TODO: Show error toast/notification to user
        setLoadingTraceViewer(null)
      } else {
        // Trace viewer spawned successfully, mark it as running
        setRunningTraceViewers(prev => new Set(prev).add(testCaseId))
        setLoadingTraceViewer(null)
      }
    } catch (error) {
      console.error('Error spawning trace viewer:', error)
      // TODO: Show error toast/notification to user
      setLoadingTraceViewer(null)
    }
  }

  // Poll for trace viewer status for test cases that have trace viewers
  useEffect(() => {
    const failedTestCasesWithTraces = testRun.testCases.filter(
      tc => tc.result === TestRunTestCaseResult.FAILED && tc.tracePath,
    )

    if (failedTestCasesWithTraces.length === 0) {
      return
    }

    let isMounted = true

    const checkTraceViewers = async () => {
      // Get current running trace viewers from ref
      const currentRunning = runningTraceViewersRef.current

      if (!currentRunning || currentRunning.size === 0) {
        return
      }

      // Check each test case asynchronously
      const checkPromises = Array.from(currentRunning).map(async testCaseId => {
        const testCase = failedTestCasesWithTraces.find(tc => tc.id === testCaseId)
        if (!testCase) {
          return { testCaseId, isRunning: false }
        }

        try {
          const response = await checkTraceViewerStatusAction(testRun.runId, testCase.id)
          const isRunning = response.data && (response.data as { isRunning: boolean }).isRunning
          return { testCaseId, isRunning: isRunning ?? false }
        } catch (error) {
          console.error(`Error checking trace viewer status for test case ${testCase.id}:`, error)
          // If we can't check, assume it's still running if we thought it was
          return { testCaseId, isRunning: true }
        }
      })

      const results = await Promise.all(checkPromises)
      if (!isMounted) return

      const actuallyRunning = new Set<string>()
      results.forEach(({ testCaseId, isRunning }) => {
        if (isRunning) {
          actuallyRunning.add(testCaseId)
        }
      })

      setRunningTraceViewers(prev => {
        // Only update if there's a change
        if (actuallyRunning.size === prev.size && Array.from(actuallyRunning).every(id => prev.has(id))) {
          return prev
        }
        return actuallyRunning
      })
    }

    // Only start polling if we have running trace viewers
    if (runningTraceViewers.size === 0) {
      return
    }

    // Check immediately
    checkTraceViewers()

    // Then poll every 2 seconds
    const interval = setInterval(() => {
      if (isMounted) {
        checkTraceViewers()
      }
    }, 2000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [testRun.runId, runningTraceViewers.size])

  const handleCancelRun = async () => {
    setIsCancelling(true)
    try {
      const response = await cancelTestRunAction(testRun.runId)
      if (response.error) {
        throw new Error(response.error)
      } else {
        toast({
          title: 'Test run cancelled',
          description: response.message,
        })
        await new Promise(resolve => setTimeout(resolve, 2000))
        setIsCancelling(false)
      }
    } catch (error) {
      toast({
        title: 'Error canceling test run',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      })
      setIsCancelling(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            {testRun.status === TestRunStatus.RUNNING && (
              <div className="flex items-center gap-2">
                <LoaderCircle className="h-6 w-6 animate-spin text-blue-500" />
                <span>Executing</span>
              </div>
            )}
            {testRun.status === TestRunStatus.COMPLETED && (
              <div className="flex items-center gap-2 duration-300 animate-in fade-in-0">
                <CheckCircle className="h-6 w-6 text-green-500" />
                <span>Finished</span>
              </div>
            )}
            {testRun.status === TestRunStatus.CANCELLED && (
              <div className="flex items-center gap-2 duration-300 animate-in fade-in-0">
                <XCircle className="h-6 w-6 text-red-500 duration-300 animate-in fade-in-0" />
                <span>Interrupted</span>
              </div>
            )}
            {testRun.status === TestRunStatus.RUNNING && (
              <Button
                onClick={handleCancelRun}
                disabled={isCancelling}
                className="bg-red-500 font-bold text-white hover:bg-red-600"
                size="sm"
              >
                {isCancelling ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <Trash className="h-4 w-4" />
                    <span>Cancel Run</span>
                  </>
                )}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Progress value={progressPercentage} />
            </div>
            <div className="whitespace-nowrap text-sm font-medium">
              {completedTests} of {totalTests} tests finished
            </div>
          </div>
        </CardContent>
      </Card>

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
                  <div
                    key={testCase.id}
                    className="flex items-center justify-between rounded-md bg-muted p-2 shadow-md"
                  >
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
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-gray-700 text-xs text-white">
                        {getFormattedTestRunTestCaseStatus(testCase.status)}
                      </Badge>
                      <Badge variant="outline" className="bg-gray-700 text-xs text-white">
                        {getFormattedTestRunTestCaseResult(testCase.result)}
                      </Badge>
                      {testCase.result === TestRunTestCaseResult.FAILED && testCase.tracePath && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewTrace(testCase.id)}
                          disabled={loadingTraceViewer === testCase.id || runningTraceViewers.has(testCase.id)}
                          className="w-28 bg-transparent text-xs"
                        >
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                              key={
                                loadingTraceViewer === testCase.id
                                  ? 'opening'
                                  : runningTraceViewers.has(testCase.id)
                                    ? 'running'
                                    : 'idle'
                              }
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.15 }}
                              className="flex w-full items-center justify-center gap-1"
                            >
                              {loadingTraceViewer === testCase.id ? (
                                <>
                                  <ExternalLink className="h-3 w-3 animate-pulse text-gray-500" />
                                  Opening
                                </>
                              ) : runningTraceViewers.has(testCase.id) ? (
                                <>
                                  <LoaderCircle className="text-white-500 h-3 w-3 animate-spin" />
                                  Running
                                </>
                              ) : (
                                <>
                                  <Binoculars className="h-3 w-3 text-blue-500" />
                                  View Trace
                                </>
                              )}
                            </motion.div>
                          </AnimatePresence>
                        </Button>
                      )}
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
    </div>
  )
}
