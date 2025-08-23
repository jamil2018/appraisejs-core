import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import Loading from '@/components/ui/loading'
import React, { Suspense } from 'react'
import { TestTubeDiagonal } from 'lucide-react'
import TestCaseTable from './test-case-table'

const TestCases = async () => {
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
      <Suspense fallback={<Loading />}>
        <TestCaseTable />
      </Suspense>
    </>
  )
}

export default TestCases
