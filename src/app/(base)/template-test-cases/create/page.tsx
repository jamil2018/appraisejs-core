import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Blocks } from 'lucide-react'
import React from 'react'
import TemplateTestCaseForm from '../template-test-case-form'
import { createTemplateTestCaseAction } from '@/actions/template-test-case/template-test-case-actions'
import { Metadata } from 'next'

import { loadCreateTemplateTestCasePageData } from '../create-template-test-case-page-data'

export const metadata: Metadata = {
  title: 'Appraise | Create Template Test Case',
  description: 'Create a new template test case to quickly create test cases',
}

const CreateTemplateTestCase = async () => {
  const pageData = await loadCreateTemplateTestCasePageData()

  if (pageData.status === 'error') {
    return <div>Error: {pageData.message}</div>
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Blocks className="mr-2 size-8" />
            Create Template Test Case
          </span>
        </PageHeader>
        <HeaderSubtitle>Create a new template test case to quickly create test cases</HeaderSubtitle>
      </div>
      <TemplateTestCaseForm
        defaultNodesOrder={{}}
        stepDefinitions={pageData.stepDefinitions}
        locators={pageData.locators}
        locatorGroups={pageData.locatorGroups}
        environments={pageData.environments}
        modules={pageData.modules}
        onSubmitAction={createTemplateTestCaseAction}
        defaultValueInput={true}
      />
    </>
  )
}

export default CreateTemplateTestCase
