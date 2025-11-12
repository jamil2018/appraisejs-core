import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { ListChecks } from 'lucide-react'
import React, { Suspense } from 'react'
import TestRunTable from './test-run-table'
import { getAllTestRunsAction } from '@/actions/test-run/test-run-actions'
import EmptyState from '@/components/data-state/empty-state'
import { Environment, Tag, TestRun, TestRunTestCase } from '@prisma/client'

const TestRuns = async () => {
  const { data: testRuns, error: testRunsError } = await getAllTestRunsAction()

  if (testRunsError) {
    return <div>Error: {testRunsError}</div>
  }

  const testRunsData = testRuns as (TestRun & { testCases: TestRunTestCase[]; tags: Tag[]; environment: Environment })[]

  if (!testRunsData || testRunsData.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-20rem)] items-center justify-center">
        <EmptyState
          icon={<ListChecks className="h-8 w-8" />}
          title="No test runs found"
          description="Get started by creating a test run to execute your test cases"
          createRoute="/test-runs/create"
          createText="Create Test Run"
        />
      </div>
    )
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <ListChecks className="mr-2 h-8 w-8" />
            Test Runs
          </span>
        </PageHeader>
        <HeaderSubtitle>Test runs are the runs of the test cases.</HeaderSubtitle>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <TestRunTable initialData={testRunsData} />
      </Suspense>
    </>
  )
}

export default TestRuns
