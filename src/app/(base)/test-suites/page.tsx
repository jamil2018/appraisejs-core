import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { TestTubes } from 'lucide-react'
import TestSuiteTable from './test-suite-table'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import { getAllTestSuitesAction } from '@/actions/test-suite/test-suite-actions'
import { TestCase, TestSuite } from '@prisma/client'
import InfoGrid from '@/components/data-visualization/info-grid'

const TestSuites = async () => {
  const { data: testSuites, error: testSuitesError } = await getAllTestSuitesAction()

  if (testSuitesError) {
    return <div>Error: {testSuitesError}</div>
  }

  const testSuitesData = testSuites as (TestSuite & { testCases: TestCase[] })[]
  const emptyTestSuites = testSuitesData.filter(testSuite => testSuite.testCases.length === 0)
  const latestCreatedTestSuite = testSuitesData.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]

  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <TestTubes className="mr-2 h-8 w-8" />
            Test Suites
          </span>
        </PageHeader>
        <HeaderSubtitle>
          Test suites are collections of tests that are used to test a specific feature or functionality
        </HeaderSubtitle>
        <InfoGrid
          infoCards={[
            {
              showHighlightGroup: testSuitesData.length > 0,
              highlight: emptyTestSuites.length.toString(),
              legend: 'Empty test suite(s)',
              defaultText: 'Empty test suites count. Will update when test suites are created.',
            },
            {
              showHighlightGroup: testSuitesData.length > 0,
              highlight: latestCreatedTestSuite ? latestCreatedTestSuite.name : 'N/A',
              legend: 'Latest created test suite',
              defaultText: 'Latest created test suite. Will update when test suites are created.',
            },
          ]}
        />
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <TestSuiteTable />
      </Suspense>
    </>
  )
}

export default TestSuites
