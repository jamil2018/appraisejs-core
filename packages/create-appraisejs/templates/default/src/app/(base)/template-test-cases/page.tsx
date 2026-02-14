import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Blocks } from 'lucide-react'
import React, { Suspense } from 'react'
import TemplateTestCaseTable from './template-test-case-table'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import { getAllTemplateTestCasesAction } from '@/actions/template-test-case/template-test-case-actions'
import EmptyState from '@/components/data-state/empty-state'
import { TemplateTestCase, TemplateTestCaseStep } from '@prisma/client'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Appraise | Template Test Cases',
  description: 'Manage template test cases for quickly creating test cases',
}

const TemplateTestCasesPage = async () => {
  const { data: templateTestCases, error: templateTestCasesError } = await getAllTemplateTestCasesAction()

  if (templateTestCasesError) {
    return <div>Error: {templateTestCasesError}</div>
  }

  const templateTestCasesData = templateTestCases as (TemplateTestCase & { steps: TemplateTestCaseStep[] })[]

  if (!templateTestCasesData || templateTestCasesData.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-20rem)] items-center justify-center">
        <EmptyState
          icon={<Blocks className="h-8 w-8" />}
          title="No template test cases found"
          description="Get started by creating a template test case to quickly create test cases"
          createRoute="/template-test-cases/create"
          createText="Create Template Test Case"
        />
      </div>
    )
  }

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
