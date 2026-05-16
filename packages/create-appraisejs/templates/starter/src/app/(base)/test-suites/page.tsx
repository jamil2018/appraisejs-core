import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { TestTubes } from 'lucide-react'
import TestSuiteTable from './test-suite-table'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import { getAllTestSuitesAction } from '@/actions/test-suite/test-suite-actions'
import InfoGrid from '@/components/data-visualization/info-grid'
import EmptyState from '@/components/data-state/empty-state'
import { Metadata } from 'next'
import { TubePlus } from '@/assets/icons/tube-plus'
import EmptyTube from '@/assets/icons/empty-tube'
import { Tag as TagIcon } from 'lucide-react'

import { buildTestSuiteInfoCards, getTestSuiteTableRows } from './test-suite-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Test Suites',
  description: 'Manage test suites and their configurations',
}

const TestSuites = async () => {
  const { data: testSuites, error: testSuitesError } = await getAllTestSuitesAction()

  if (testSuitesError) {
    return <div>Error: {testSuitesError}</div>
  }

  const testSuitesData = getTestSuiteTableRows(testSuites)
  const infoCards = buildTestSuiteInfoCards(testSuitesData).map(card => ({
    ...card,
    icon:
      card.legend === 'Empty test suite(s)' ? (
        <EmptyTube className="size-12 rounded-sm bg-muted p-2" />
      ) : card.legend === 'Latest test suite' ? (
        <TubePlus className="size-12 rounded-sm bg-muted p-2" />
      ) : (
        <TagIcon className="size-12 rounded-sm bg-muted p-2" />
      ),
  }))

  if (testSuitesData.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-20rem)] items-center justify-center">
        <EmptyState
          icon={<TestTubes className="size-8" />}
          title="No test suites found"
          description="Get started by creating a test suite and grouping tests together"
          createRoute="/test-suites/create"
          createText="Create Test Suite"
        />
      </div>
    )
  }
  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <TestTubes className="mr-2 size-8" />
            Test Suites
          </span>
        </PageHeader>
        <HeaderSubtitle>
          Test suites are collections of tests that are used to test a specific feature or functionality
        </HeaderSubtitle>
        <InfoGrid infoCards={infoCards} />
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <TestSuiteTable />
      </Suspense>
    </>
  )
}

export default TestSuites
