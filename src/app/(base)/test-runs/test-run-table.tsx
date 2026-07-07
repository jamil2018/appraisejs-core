'use client'

import { deleteTestRunAction, getTestRunByIdAction } from '@/actions/test-run/test-run-actions'
import { DataTable } from '@/components/ui/data-table'
import { Environment, Tag, TestRun, TestRunTestCase, TestRunStatus } from '@prisma/client'
import React, { useEffect, useState, useRef, useMemo } from 'react'
import { testRunTableCols } from './test-run-table-columns'

type TestRunData = TestRun & {
  testCases: TestRunTestCase[]
  tags: Tag[]
  environment: Environment
}

interface TestRunTableProps {
  initialData: TestRunData[]
  filter: 'recentFailed' | 'all'
}

const TestRunTable = ({ initialData, filter = 'all' }: TestRunTableProps) => {
  const [testRuns, setTestRuns] = useState<TestRunData[]>(initialData)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Memoize running test run IDs to avoid unnecessary effect re-runs
  // Include RUNNING, QUEUED, and CANCELLING statuses for polling
  const runningTestRunIds = useMemo(() => {
    return testRuns.reduce<string[]>((ids, tr) => {
      if (
        tr.status === TestRunStatus.RUNNING ||
        tr.status === TestRunStatus.QUEUED ||
        tr.status === TestRunStatus.CANCELLING
      ) {
        ids.push(tr.id)
      }

      return ids
    }, [])
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

    pollingRef.current = setInterval(() => {
      void (async () => {
        try {
          const responses = await Promise.all(runningTestRunIds.map(id => getTestRunByIdAction(id)))

          const updates = responses.flatMap(({ data, error }) => {
            if (error || !data) {
              return []
            }

            const testRun = data as TestRun & {
              testCases: (TestRunTestCase & { testCase: { title: string } })[]
              tags: Tag[]
              environment: Environment
            }

            return [
              {
                ...testRun,
                testCases: testRun.testCases.map(tc => ({
                  id: tc.id,
                  testRunId: tc.testRunId,
                  testCaseId: tc.testCaseId,
                  status: tc.status,
                  result: tc.result,
                })) as TestRunTestCase[],
              } as TestRunData,
            ]
          })

          setTestRuns(prev =>
            prev.map(tr => {
              const update = updates.find(u => u.id === tr.id)
              return update || tr
            }),
          )

          const stillRunning = updates.filter(
            u =>
              u.status === TestRunStatus.RUNNING ||
              u.status === TestRunStatus.QUEUED ||
              u.status === TestRunStatus.CANCELLING,
          )

          if (stillRunning.length === 0 && pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
        } catch (error) {
          console.error('Error polling test runs status:', error)
        }
      })()
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
        createLink={filter === 'all' ? '/test-runs/create' : undefined}
      />
    </>
  )
}

export default TestRunTable
