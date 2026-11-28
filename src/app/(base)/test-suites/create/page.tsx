import { createTestSuiteAction } from '@/actions/test-suite/test-suite-actions'
import { TestSuiteForm } from '../test-suite-form'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { getAllTestCasesAction } from '@/actions/test-case/test-case-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import { getAllTagsAction } from '@/actions/tags/tag-actions'
import { Metadata } from 'next'
import AuthoringLoadError from '@/components/data-state/authoring-load-error'
import { requireActiveProjectForMutation } from '@/lib/active-project'
import { withProjectScope } from '@/lib/project-scope'

import { getModuleRows, getTagRows, getTestCasePickerRows } from '../test-suite-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Create Test Suite',
  description: 'Create a new test suite to run your tests against',
}

const CreateTestSuite = async () => {
  const project = await requireActiveProjectForMutation()
  const [testCasesResponse, moduleListResponse, tagsResponse] = await Promise.all([
    getAllTestCasesAction(),
    getAllModulesAction(),
    getAllTagsAction(),
  ])

  const loadError = testCasesResponse.error || moduleListResponse.error || tagsResponse.error
  if (loadError) {
    return (
      <AuthoringLoadError
        title="Create Test Suite"
        listHref="/test-suites"
        listLabel="Back to test suites"
        message={loadError}
      />
    )
  }

  const testCases = getTestCasePickerRows(testCasesResponse.data)
  const moduleList = getModuleRows(moduleListResponse.data)
  const tags = getTagRows(tagsResponse.data)

  return (
    <>
      <div className="mb-4">
        <PageHeader>Create Test Suite</PageHeader>
        <HeaderSubtitle>Create a new test suite to run your tests against</HeaderSubtitle>
      </div>
      <TestSuiteForm
        successTitle="Suite created"
        successMessage="Test suite created successfully"
        onSubmitAction={createTestSuiteAction}
        redirectPath={withProjectScope('/test-suites', project.id)}
        testCases={testCases}
        moduleList={moduleList}
        tags={tags}
      />
    </>
  )
}

export default CreateTestSuite
