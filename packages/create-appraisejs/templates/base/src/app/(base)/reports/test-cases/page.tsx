import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Code } from 'lucide-react'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import { Metadata } from 'next'
import TestCasesMetricTable from './test-cases-metric-table'
import { requireActiveProject } from '@/lib/active-project'

export const metadata: Metadata = {
  title: 'Appraise | Failing Test Cases Report',
  description: 'Manage failing test cases report for identifying elements on pages',
}

const TestCasesMetricsReport = async ({ searchParams }: { searchParams: Promise<{ filter?: string; project?: string }> }) => {
  const resolvedSearchParams = await searchParams
  const filter = resolvedSearchParams?.filter as 'repeatedlyFailing' | 'flaky' | undefined
  const project = await requireActiveProject(resolvedSearchParams.project)

  return (
    <>
      <div className="mb-4">
        <PageHeader>
          <span className="flex items-center">
            <Code className="mr-2 size-8 shrink-0" />
            Failing Test Cases Report
          </span>
        </PageHeader>
        <HeaderSubtitle>Report of test cases that have been failing repeatedly or are flaky</HeaderSubtitle>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <TestCasesMetricTable filter={filter || 'repeatedlyFailing'} projectId={project.id} />
      </Suspense>
    </>
  )
}

export default TestCasesMetricsReport
