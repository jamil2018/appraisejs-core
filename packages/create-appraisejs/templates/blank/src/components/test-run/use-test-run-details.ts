'use client'

import { useEffect, useRef, useState } from 'react'

import {
  cancelTestRunAction,
  checkTraceViewerStatusAction,
  getTestRunByIdAction,
  spawnTraceViewerAction,
} from '@/actions/test-run/test-run-actions'
import { toast } from '@/hooks/use-toast'

import {
  getTestRunDetailsData,
  getTraceViewerStatusData,
  getTraceViewerEligibleTestCases,
  isTerminalTestRunStatus,
  type TestRunDetailsData,
} from './test-run-details-helpers'

type UseTestRunDetailsParams = {
  initialTestRun: TestRunDetailsData
}

export function useTestRunDetails({ initialTestRun }: UseTestRunDetailsParams) {
  const [testRun, setTestRun] = useState(initialTestRun)
  const [loadingTraceViewer, setLoadingTraceViewer] = useState<string | null>(null)
  const [runningTraceViewers, setRunningTraceViewers] = useState<Set<string>>(new Set())
  const [isCancelling, setIsCancelling] = useState(false)

  const runningTraceViewersRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    runningTraceViewersRef.current = runningTraceViewers
  }, [runningTraceViewers])

  useEffect(() => {
    if (isTerminalTestRunStatus(testRun.status)) {
      return
    }

    const interval = window.setInterval(async () => {
      try {
        const response = await getTestRunByIdAction(testRun.id)
        const nextTestRun = getTestRunDetailsData(response.data)
        if (!nextTestRun) {
          return
        }

        setTestRun(nextTestRun)

        if (isTerminalTestRunStatus(nextTestRun.status)) {
          window.clearInterval(interval)
        }
      } catch (error) {
        console.error('Error polling test run status:', error)
      }
    }, 2000)

    return () => window.clearInterval(interval)
  }, [testRun.id, testRun.status])

  useEffect(() => {
    const eligibleTestCases = getTraceViewerEligibleTestCases(testRun.testCases)

    if (eligibleTestCases.length === 0 || runningTraceViewers.size === 0) {
      return
    }

    let isMounted = true

    const checkTraceViewers = async () => {
      const currentRunning = runningTraceViewersRef.current
      if (currentRunning.size === 0) {
        return
      }

      const results = await Promise.all(
        Array.from(currentRunning).map(async testCaseId => {
          const testCase = eligibleTestCases.find(candidate => candidate.id === testCaseId)
          if (!testCase) {
            return { testCaseId, isRunning: false }
          }

          try {
            const response = await checkTraceViewerStatusAction(testRun.runId, testCase.id)
            const statusData = getTraceViewerStatusData(response.data)
            return { testCaseId, isRunning: statusData?.isRunning ?? false }
          } catch (error) {
            console.error(`Error checking trace viewer status for test case ${testCase.id}:`, error)
            return { testCaseId, isRunning: true }
          }
        }),
      )

      if (!isMounted) {
        return
      }

      const actuallyRunning = new Set(results.filter(result => result.isRunning).map(result => result.testCaseId))

      setRunningTraceViewers(currentRunningState => {
        if (
          actuallyRunning.size === currentRunningState.size &&
          Array.from(actuallyRunning).every(testCaseId => currentRunningState.has(testCaseId))
        ) {
          return currentRunningState
        }

        return actuallyRunning
      })
    }

    void checkTraceViewers()

    const interval = window.setInterval(() => {
      if (isMounted) {
        void checkTraceViewers()
      }
    }, 2000)

    return () => {
      isMounted = false
      window.clearInterval(interval)
    }
  }, [runningTraceViewers.size, testRun.runId, testRun.testCases])

  const handleViewTrace = async (testCaseId: string) => {
    setLoadingTraceViewer(testCaseId)

    try {
      const response = await spawnTraceViewerAction(testRun.runId, testCaseId)

      if (response.error) {
        throw new Error(response.error)
      }

      setRunningTraceViewers(currentRunning => new Set(currentRunning).add(testCaseId))
    } catch (error) {
      toast({
        title: 'Error opening trace viewer',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      })
    } finally {
      setLoadingTraceViewer(null)
    }
  }

  const handleCancelRun = async () => {
    setIsCancelling(true)

    try {
      const response = await cancelTestRunAction(testRun.runId)
      if (response.error) {
        throw new Error(response.error)
      }

      toast({
        title: 'Test run cancelled',
        description: response.message,
      })
      window.setTimeout(() => {
        setIsCancelling(false)
      }, 2000)
    } catch (error) {
      toast({
        title: 'Error canceling test run',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      })
      setIsCancelling(false)
    }
  }

  return {
    testRun,
    loadingTraceViewer,
    runningTraceViewers,
    isCancelling,
    handleViewTrace,
    handleCancelRun,
  }
}
