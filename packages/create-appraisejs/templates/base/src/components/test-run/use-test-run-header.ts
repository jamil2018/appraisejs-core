'use client'

import { useCallback, useEffect, useState } from 'react'

import { getTestRunByIdAction } from '@/actions/test-run/test-run-actions'

import { getTestRunDetailsData, type TestRunDetailsData } from './test-run-details-helpers'
import {
  getTestRunHeaderPollMode,
  matchesTestRunExitEvent,
  type TestRunExitEventDetail,
} from './test-run-header-helpers'

type UseTestRunHeaderParams = {
  initialTestRun: TestRunDetailsData
}

export function useTestRunHeader({ initialTestRun }: UseTestRunHeaderParams) {
  const [testRun, setTestRun] = useState(initialTestRun)

  const refreshTestRun = useCallback(async () => {
    try {
      const response = await getTestRunByIdAction(testRun.id)
      const nextTestRun = getTestRunDetailsData(response.data)
      if (!nextTestRun) {
        return null
      }

      setTestRun(nextTestRun)
      return nextTestRun
    } catch (error) {
      console.error('Error refreshing test run header:', error)
      return null
    }
  }, [testRun.id])

  useEffect(() => {
    const pollMode = getTestRunHeaderPollMode(testRun)
    if (!pollMode) {
      return
    }

    const interval = window.setInterval(async () => {
      const nextTestRun = await refreshTestRun()
      if (!nextTestRun) {
        return
      }

      const nextMode = getTestRunHeaderPollMode(nextTestRun)
      if (nextMode !== pollMode) {
        window.clearInterval(interval)
      }
    }, 2000)

    if (pollMode !== 'report') {
      return () => window.clearInterval(interval)
    }

    const timeout = window.setTimeout(() => {
      window.clearInterval(interval)
    }, 30000)

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [refreshTestRun, testRun])

  useEffect(() => {
    const handleTestRunExit = (event: Event) => {
      const customEvent = event as CustomEvent<TestRunExitEventDetail>
      if (!matchesTestRunExitEvent(customEvent.detail, testRun.runId)) {
        return
      }

      void refreshTestRun()
    }

    window.addEventListener('testrun:exit', handleTestRunExit)
    return () => window.removeEventListener('testrun:exit', handleTestRunExit)
  }, [refreshTestRun, testRun.runId])

  return {
    testRun,
  }
}
