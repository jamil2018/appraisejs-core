import { createTestSuiteAction } from '@/actions/test-suite/test-suite-actions'
import { TestSuiteForm } from '../test-suite-form'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { getAllTestCasesAction } from '@/actions/test-case/test-case-actions'
import { Module, TestCase, Tag } from '@prisma/client'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import { getAllTagsAction } from '@/actions/tags/tag-actions'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Appraise | Create Test Suite',
  description: 'Create a new test suite to run your tests against',
}

const CreateTestSuite = async () => {
  const { data: testCases, error: testCasesError } = await getAllTestCasesAction()

  const { data: moduleList, error: moduleListError } = await getAllModulesAction()

  const { data: tags, error: tagsError } = await getAllTagsAction()

  if (testCasesError || moduleListError || tagsError) {
    return <div>Error: {testCasesError || moduleListError || tagsError}</div>
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>Create Test Suite</PageHeader>
        <HeaderSubtitle>Create a new test suite to run your tests against</HeaderSubtitle>
      </div>
      <TestSuiteForm
        successTitle="Suite created"
        successMessage="Test suite created successfully"
        onSubmitAction={createTestSuiteAction}
        testCases={testCases as TestCase[]}
        moduleList={moduleList as Module[]}
        tags={tags as Tag[]}
      />
    </>
  )
}

export default CreateTestSuite
