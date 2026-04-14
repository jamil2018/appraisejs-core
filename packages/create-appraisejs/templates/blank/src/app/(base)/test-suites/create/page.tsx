import { createTestSuiteAction } from '@/actions/test-suite/test-suite-actions'
import { TestSuiteForm } from '../test-suite-form'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { getAllTestCasesAction } from '@/actions/test-case/test-case-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import { getAllTagsAction } from '@/actions/tags/tag-actions'
import { Metadata } from 'next'

import { getModuleRows, getTagRows, getTestCasePickerRows } from '../test-suite-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Create Test Suite',
  description: 'Create a new test suite to run your tests against',
}

const CreateTestSuite = async () => {
  const [testCasesResponse, moduleListResponse, tagsResponse] = await Promise.all([
    getAllTestCasesAction(),
    getAllModulesAction(),
    getAllTagsAction(),
  ])

  const loadError = testCasesResponse.error || moduleListResponse.error || tagsResponse.error
  if (loadError) {
    return <div>Error: {loadError}</div>
  }

  const testCases = getTestCasePickerRows(testCasesResponse.data)
  const moduleList = getModuleRows(moduleListResponse.data)
  const tags = getTagRows(tagsResponse.data)

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
        testCases={testCases}
        moduleList={moduleList}
        tags={tags}
      />
    </>
  )
}

export default CreateTestSuite
