import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { TestTubes } from 'lucide-react'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import { Metadata } from 'next'
import TestSuitesMetricTable from './test-suites-metric-table'
import { requireActiveProject } from '@/lib/active-project'

export const metadata: Metadata = {
  title: 'Appraise | Test Suites Metrics Report',
  description: 'Manage test suites report for identifying test suites that are not executed recently',
}

const TestSuitesMetricsReport = async ({ searchParams }: { searchParams: Promise<{ filter?: string; project?: string }> }) => {
  const resolvedSearchParams = await searchParams
  const filter = resolvedSearchParams?.filter as 'notExecutedRecently' | undefined
  const project = await requireActiveProject(resolvedSearchParams.project)

  return (
    <>
      <div className="mb-4">
        <PageHeader>
          <span className="flex items-center">
            <TestTubes className="mr-2 size-8 shrink-0" />
            Test Suites Report
          </span>
        </PageHeader>
        <HeaderSubtitle>
          Test suites are collections of tests that are used to test a specific feature or functionality
        </HeaderSubtitle>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <TestSuitesMetricTable filter={filter || 'notExecutedRecently'} projectId={project.id} />
      </Suspense>
    </>
  )
}

export default TestSuitesMetricsReport
