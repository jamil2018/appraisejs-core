import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { TestTubes } from 'lucide-react'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import { Metadata } from 'next'
import TestSuitesMetricTable from './test-suites-metric-table'

export const metadata: Metadata = {
  title: 'Appraise | Test Suites Metrics Report',
  description: 'Manage test suites report for identifying test suites that are not executed recently',
}

const TestSuitesMetricsReport = async ({searchParams}: {searchParams: Promise<{filter?: string}>}) => {
  const resolvedSearchParams = await searchParams
  const filter = resolvedSearchParams?.filter as 'notExecutedRecently' | undefined

  return (
    <>
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <PageHeader>
              <span className="flex items-center">
                <TestTubes className="mr-2 h-8 w-8" />
                Test Suites Report
              </span>
            </PageHeader>
            <HeaderSubtitle>
              Test suites are collections of tests that are used to test a specific feature or functionality
            </HeaderSubtitle>
          </div>
        </div>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <TestSuitesMetricTable filter={filter || 'notExecutedRecently'} />
      </Suspense>
    </>
  )
}

export default TestSuitesMetricsReport
