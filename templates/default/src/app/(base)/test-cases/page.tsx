import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import React, { Suspense } from 'react'
import { TestTubeDiagonal } from 'lucide-react'
import TestCaseTable from './test-case-table'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import { getAllTestCasesAction } from '@/actions/test-case/test-case-actions'
import EmptyState from '@/components/data-state/empty-state'
import { TestCase, TestCaseStep } from '@prisma/client'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Appraise | Test Cases',
  description: 'Manage test cases and their configurations',
}

const TestCases = async () => {
  const { data: testCases, error: testCasesError } = await getAllTestCasesAction()

  if (testCasesError) {
    return <div>Error: {testCasesError}</div>
  }

  const testCasesData = testCases as (TestCase & { steps: TestCaseStep[] })[]

  if (!testCasesData || testCasesData.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-20rem)] items-center justify-center">
        <EmptyState
          icon={<TestTubeDiagonal className="h-8 w-8" />}
          title="No test cases found"
          description="Get started by creating a test case to test your application functionality"
          createRoute="/test-cases/create"
          createText="Create Test Case"
        />
      </div>
    )
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <TestTubeDiagonal className="mr-2 h-8 w-8" />
            Test Cases
          </span>
        </PageHeader>
        <HeaderSubtitle>
          Test cases are individual tests that are used to test a specific feature or functionality
        </HeaderSubtitle>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <TestCaseTable />
      </Suspense>
    </>
  )
}

export default TestCases
