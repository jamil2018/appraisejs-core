'use client'

import { useEffect, useState } from 'react'
import { getTestRunByIdAction } from '@/actions/test-run/test-run-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { ViewReportButton } from '@/components/test-run/view-report-button'
import { TestRun, TestRunTestCase, Tag, Environment, TestRunStatus, Report } from '@prisma/client'

interface TestRunHeaderProps {
  initialTestRun: TestRun & {
    testCases: (TestRunTestCase & { testCase: { title: string; description: string } })[]
    tags: Tag[]
    environment: Environment
    reports: Report[]
  }
}

export function TestRunHeader({ initialTestRun }: TestRunHeaderProps) {
  const [testRun, setTestRun] = useState(initialTestRun)

  // Poll for report updates after test run completes
  useEffect(() => {
    // Only poll if test run is completed/cancelled but no report exists yet
    const shouldPoll =
      (testRun.status === TestRunStatus.COMPLETED || testRun.status === TestRunStatus.CANCELLED) &&
      testRun.reports.length === 0

    if (!shouldPoll) {
      return
    }

    // Poll for reports (they might be created asynchronously after test run completes)
    const pollInterval = setInterval(async () => {
      try {
        const { data: updatedTestRun, error } = await getTestRunByIdAction(testRun.id)
        if (error || !updatedTestRun) {
          console.error('Error polling for report:', error)
          return
        }

        const typedTestRun = updatedTestRun as TestRun & {
          testCases: (TestRunTestCase & { testCase: { title: string; description: string } })[]
          tags: Tag[]
          environment: Environment
          reports: Report[]
        }

        // Update if reports are now available
        if (typedTestRun.reports.length > 0) {
          setTestRun(typedTestRun)
          clearInterval(pollInterval)
        }
      } catch (error) {
        console.error('Error polling for report:', error)
      }
    }, 2000) // Poll every 2 seconds

    // Stop polling after 30 seconds to avoid infinite polling
    const timeout = setTimeout(() => {
      clearInterval(pollInterval)
    }, 30000)

    return () => {
      clearInterval(pollInterval)
      clearTimeout(timeout)
    }
  }, [testRun.id, testRun.status, testRun.reports.length])

  return (
    <div className="mb-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <PageHeader>Test Run Details</PageHeader>
          <HeaderSubtitle>View test run execution details and live logs</HeaderSubtitle>
        </div>
        <ViewReportButton
          testRunStatus={testRun.status}
          reports={testRun.reports}
          className="mt-2"
        />
      </div>
    </div>
  )
}

