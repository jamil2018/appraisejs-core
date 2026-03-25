import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { TestTubes } from 'lucide-react'
import TestSuiteTable from './test-suite-table'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import { getAllTestSuitesAction } from '@/actions/test-suite/test-suite-actions'
import { Tag, TestCase, TestSuite } from '@prisma/client'
import InfoGrid from '@/components/data-visualization/info-grid'
import EmptyState from '@/components/data-state/empty-state'
import { Metadata } from 'next'
import { TubePlus } from '@/assets/icons/tube-plus'
import EmptyTube from '@/assets/icons/empty-tube'
import { Tag as TagIcon } from 'lucide-react'
import { getFilterTags } from '@/lib/tag-utils'

export const metadata: Metadata = {
  title: 'Appraise | Test Suites',
  description: 'Manage test suites and their configurations',
}

const TestSuites = async () => {
  const { data: testSuites, error: testSuitesError } = await getAllTestSuitesAction()

  if (testSuitesError) {
    return <div>Error: {testSuitesError}</div>
  }

  const testSuitesData = testSuites as (TestSuite & { testCases: TestCase[]; tags: Tag[] })[]
  const emptyTestSuites = testSuitesData.filter(testSuite => testSuite.testCases.length === 0)
  const latestCreatedTestSuite = [...testSuitesData].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
  const tagSuiteCountMap = new Map<string, { name: string; suiteCount: number }>()

  for (const testSuite of testSuitesData) {
    for (const tag of getFilterTags(testSuite.tags)) {
      const currentTag = tagSuiteCountMap.get(tag.id)

      if (currentTag) {
        currentTag.suiteCount += 1
      } else {
        tagSuiteCountMap.set(tag.id, {
          name: tag.name,
          suiteCount: 1,
        })
      }
    }
  }

  const mostCommonTagWithSuites = [...tagSuiteCountMap.values()].sort((a, b) => {
    if (b.suiteCount !== a.suiteCount) {
      return b.suiteCount - a.suiteCount
    }

    return a.name.localeCompare(b.name)
  })[0]
  const infoCards = [
    {
      showHighlightGroup: testSuitesData.length > 0,
      highlight: emptyTestSuites.length.toString(),
      legend: 'Empty test suite(s)',
      defaultText: 'Empty test suites count. Will update when test suites are created.',
      icon: <EmptyTube className="h-12 w-12 rounded-sm bg-muted p-2" />,
    },
    {
      showHighlightGroup: testSuitesData.length > 0,
      highlight: latestCreatedTestSuite ? latestCreatedTestSuite.name : 'N/A',
      legend: 'Latest test suite',
      defaultText: 'Latest created test suite. Will update when test suites are created.',
      icon: <TubePlus className="h-12 w-12 rounded-sm bg-muted p-2" />,
    },
    ...(mostCommonTagWithSuites
      ? [
        {
          showHighlightGroup: true,
          highlight: mostCommonTagWithSuites.name,
          legend: 'Most common tag',
          defaultText: 'Most common suite tag will appear here when test suites have tags.',
          icon: <TagIcon className="h-12 w-12 rounded-sm bg-muted p-2" />,
        },
      ]
      : []),
  ]

  if (testSuitesData.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-20rem)] items-center justify-center">
        <EmptyState
          icon={<TestTubes className="h-8 w-8" />}
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
            <TestTubes className="mr-2 h-8 w-8" />
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
