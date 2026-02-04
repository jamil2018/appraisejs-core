import { getAllTemplateTestCasesAction } from '@/actions/template-test-case/template-test-case-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { LayoutPanelTop } from 'lucide-react'
import React from 'react'
import TemplateSelectionForm from './template-selection-form'
import { TemplateTestCase } from '@prisma/client'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Appraise | Create Test Case From Template',
  description: 'Select a template test case to create a new test case from',
}

const CreateTestCaseFromTemplate = async () => {
  const { data: templateTestCases, status } = await getAllTemplateTestCasesAction()

  if (status !== 200) {
    return <div className="text-red-500">Error</div>
  }

  return (
    <div>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <LayoutPanelTop className="mr-2 h-8 w-8" />
            Create Test Case From Template
          </span>
        </PageHeader>
        <HeaderSubtitle>Select a template test case to create a new test case from</HeaderSubtitle>
      </div>
      <TemplateSelectionForm templateTestCases={templateTestCases as TemplateTestCase[]} />
    </div>
  )
}

export default CreateTestCaseFromTemplate
