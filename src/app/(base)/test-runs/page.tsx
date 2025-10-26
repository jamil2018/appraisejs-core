import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { ListChecks } from 'lucide-react'
import React, { Suspense } from 'react'
import TestRunTable from './test-run-table'

const TestRuns = async () => {
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
        <TestRunTable />
      </Suspense>
    </>
  )
}

export default TestRuns
