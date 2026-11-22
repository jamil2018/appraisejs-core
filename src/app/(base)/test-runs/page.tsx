import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { ListChecks } from 'lucide-react'
import React, { Suspense } from 'react'
import TestRunTable from './test-run-table'
import { getAllTestRunsAction } from '@/actions/test-run/test-run-actions'
import EmptyState from '@/components/data-state/empty-state'
import { Environment, Tag, TestRun, TestRunTestCase } from '@prisma/client'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Appraise | Test Runs',
  description: 'Manage test runs and their execution results',
}

const TestRuns = async ({ searchParams }: { searchParams: Promise<{ filter?: string }> }) => {
  const resolvedSearchParams = await searchParams
  const filter = resolvedSearchParams?.filter
  const { data: testRuns, error: testRunsError } = await getAllTestRunsAction(filter)

  if (testRunsError) {
    return <div>Error: {testRunsError}</div>
  }

  const testRunsData = (
    testRuns as {
      items: (TestRun & { testCases: TestRunTestCase[]; tags: Tag[]; environment: Environment })[]
    }
  )?.items

  return (
    <>
      <div className="mb-4">
        <PageHeader>
          <span className="flex items-center">
            <ListChecks className="mr-2 size-8 shrink-0" />
            Test Runs
          </span>
        </PageHeader>
        <HeaderSubtitle>Orchestrate tests and track the execution progress with detailed results</HeaderSubtitle>
      </div>
      {!testRunsData || testRunsData.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="size-5" />}
          title="No test runs found"
          description="Get started by creating a test run to execute your test cases"
          createRoute="/test-runs/create"
          createText="Create Test Run"
        />
      ) : (
        <Suspense fallback={<DataTableSkeleton />}>
          <TestRunTable initialData={testRunsData} filter={filter as 'recentFailed' | 'all'} />
        </Suspense>
      )}
    </>
  )
}

export default TestRuns
