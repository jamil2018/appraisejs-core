'use client'

import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { ViewReportButton } from '@/components/test-run/view-report-button'
import type { TestRunDetailsData } from './test-run-details-helpers'
import { useTestRunHeader } from './use-test-run-header'

type TestRunHeaderProps = {
  initialTestRun: TestRunDetailsData
}

export function TestRunHeader({ initialTestRun }: TestRunHeaderProps) {
  const { testRun } = useTestRunHeader({ initialTestRun })

  return (
    <div className="mb-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <PageHeader>Test Run Details</PageHeader>
          <HeaderSubtitle>View test run execution details and live logs</HeaderSubtitle>
        </div>
        <ViewReportButton testRunStatus={testRun.status} reports={testRun.reports} className="mt-2" />
      </div>
    </div>
  )
}
