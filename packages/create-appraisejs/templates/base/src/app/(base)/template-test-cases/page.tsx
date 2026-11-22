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
import { presentationVocabulary } from '@/lib/presentation-vocabulary'

export const metadata: Metadata = {
  title: `Appraise | ${presentationVocabulary.caseTemplate.plural}`,
  description: 'Manage reusable Case Templates for quickly creating test cases',
}

const TemplateTestCasesPage = async () => {
  const { data: templateTestCases, error: templateTestCasesError } = await getAllTemplateTestCasesAction()

  if (templateTestCasesError) {
    return <div>Error: {templateTestCasesError}</div>
  }

  const templateTestCasesData = templateTestCases as (TemplateTestCase & { steps: TemplateTestCaseStep[] })[]

  return (
    <>
      <div className="mb-4">
        <PageHeader>
          <span className="flex items-center">
            <Blocks className="mr-2 size-8" />
            {presentationVocabulary.caseTemplate.plural}
          </span>
        </PageHeader>
        <HeaderSubtitle>A collection of templates to quickly create test cases</HeaderSubtitle>
      </div>
      {!templateTestCasesData || templateTestCasesData.length === 0 ? (
        <EmptyState
          icon={<Blocks className="size-5" />}
          title="No Case Templates found"
          description="Create a reusable Case Template to prepare test cases faster"
          createRoute="/template-test-cases/create"
          createText={presentationVocabulary.caseTemplate.create}
        />
      ) : (
        <Suspense fallback={<DataTableSkeleton />}>
          <TemplateTestCaseTable />
        </Suspense>
      )}
    </>
  )
}

export default TemplateTestCasesPage
