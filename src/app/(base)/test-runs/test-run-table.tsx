'use client'

import { deleteTestRunAction, getTestRunByIdAction } from '@/actions/test-run/test-run-actions'
import { DataTable } from '@/components/ui/data-table'
import { Environment, Tag, TestRun, TestRunTestCase, TestRunStatus } from '@prisma/client'
import React, { useEffect, useState, useRef, useMemo } from 'react'
import { testRunTableCols } from './test-run-table-columns'

type TestRunData = TestRun & { testCases: TestRunTestCase[]; tags: Tag[]; environment: Environment }

interface TestRunTableProps {
  initialData: TestRunData[]
}

const TestRunTable = ({ initialData }: TestRunTableProps) => {
  const [testRuns, setTestRuns] = useState<TestRunData[]>(initialData)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Memoize running test run IDs to avoid unnecessary effect re-runs
  // Include RUNNING, QUEUED, and CANCELLING statuses for polling
  const runningTestRunIds = useMemo(() => {
    return testRuns
      .filter(
        tr =>
          tr.status === TestRunStatus.RUNNING ||
          tr.status === TestRunStatus.QUEUED ||
          tr.status === TestRunStatus.CANCELLING,
      )
      .map(tr => tr.id)
  }, [testRuns])

  // Create a stable dependency string for useEffect
  const runningTestRunIdsKey = useMemo(() => runningTestRunIds.join(','), [runningTestRunIds])

  // Poll for status updates while test runs are running
  useEffect(() => {
    // Clear any existing polling interval
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    // If no running test runs, don't poll
    if (runningTestRunIds.length === 0) {
      return
    }

    pollingRef.current = setInterval(async () => {
      try {
        // Poll only running test runs in parallel
        const updatePromises = runningTestRunIds.map(async id => {
          const { data, error } = await getTestRunByIdAction(id)
          if (error || !data) {
            return null
          }
          // getTestRunByIdAction returns testCases with nested testCase, but we need to flatten it
          const testRun = data as TestRun & {
            testCases: (TestRunTestCase & { testCase: { title: string } })[]
            tags: Tag[]
            environment: Environment
          }
          // Convert to the format expected by the table (flatten testCases)
          return {
            ...testRun,
            testCases: testRun.testCases.map(tc => ({
              id: tc.id,
              testRunId: tc.testRunId,
              testCaseId: tc.testCaseId,
              status: tc.status,
              result: tc.result,
            })) as TestRunTestCase[],
          } as TestRunData
        })

        const updates = await Promise.all(updatePromises)
        const validUpdates = updates.filter((u): u is TestRunData => u !== null)

        // Update only the changed test runs
        setTestRuns(prev =>
          prev.map(tr => {
            const update = validUpdates.find(u => u.id === tr.id)
            return update || tr
          }),
        )

        // Check if any are still running (including CANCELLING)
        const stillRunning = validUpdates.filter(
          u =>
            u.status === TestRunStatus.RUNNING ||
            u.status === TestRunStatus.QUEUED ||
            u.status === TestRunStatus.CANCELLING,
        )

        // If no test runs are running anymore, stop polling
        if (stillRunning.length === 0 && pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
      } catch (error) {
        console.error('Error polling test runs status:', error)
      }
    }, 2000) // Poll every 2 seconds

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [runningTestRunIdsKey, runningTestRunIds])

  return (
    <>
      <DataTable
        columns={testRunTableCols}
        data={testRuns}
        filterColumn="name"
        filterPlaceholder="Filter by name..."
        deleteAction={deleteTestRunAction}
        createLink="/test-runs/create"
      />
    </>
  )
}

export default TestRunTable
