import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Code } from 'lucide-react'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import { Metadata } from 'next'
import TestCasesMetricTable from './test-cases-metric-table'

export const metadata: Metadata = {
  title: 'Appraise | Test Cases Metrics Report',
  description: 'Manage test cases report for identifying elements on pages',
}

const TestCasesMetricsReport = async ({searchParams}: {searchParams: Promise<{filter?: string}>}) => {
  const resolvedSearchParams = await searchParams
  const filter = resolvedSearchParams?.filter as 'repeatedlyFailing' | 'flaky' | undefined

  return (
    <>
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <PageHeader>
              <span className="flex items-center">
                <Code className="mr-2 h-8 w-8" />
                Test Cases Report
              </span>
            </PageHeader>
            <HeaderSubtitle>
              Test cases are the individual tests that are used to test a specific feature or functionality
            </HeaderSubtitle>
          </div>
        </div>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <TestCasesMetricTable filter={filter || 'repeatedlyFailing'} />
      </Suspense>
    </>
  )
}

export default TestCasesMetricsReport
