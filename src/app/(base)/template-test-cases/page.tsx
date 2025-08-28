import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Blocks } from 'lucide-react'
import React, { Suspense } from 'react'
import TemplateTestCaseTable from './template-test-case-table'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'

const TemplateTestCasesPage = () => {
  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Blocks className="mr-2 h-8 w-8" />
            Template Test Cases
          </span>
        </PageHeader>
        <HeaderSubtitle>A collection of templates to quickly create test cases</HeaderSubtitle>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <TemplateTestCaseTable />
      </Suspense>
    </>
  )
}

export default TemplateTestCasesPage
