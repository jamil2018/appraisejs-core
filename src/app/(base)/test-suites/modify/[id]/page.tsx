import { getTestSuiteByIdAction, updateTestSuiteAction } from '@/actions/test-suite/test-suite-actions'
import { TestSuiteForm } from '../../test-suite-form'
import React from 'react'
import { getAllTestCasesAction } from '@/actions/test-case/test-case-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import { getAllTagsAction } from '@/actions/tags/tag-actions'
import { Metadata } from 'next'
import AuthoringLoadError from '@/components/data-state/authoring-load-error'
import PageHeader from '@/components/typography/page-header'

import { getEditableTestSuite, getModuleRows, getTagRows, getTestCasePickerRows } from '../../test-suite-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Modify Test Suite',
  description: 'Update test suite configuration',
}

const ModifyTestSuite = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const [testSuiteResponse, testCasesResponse, moduleListResponse, tagsResponse] = await Promise.all([
    getTestSuiteByIdAction(id),
    getAllTestCasesAction(),
    getAllModulesAction(),
    getAllTagsAction(),
  ])

  const loadError = testSuiteResponse.error || moduleListResponse.error || tagsResponse.error
  const testSuiteData = getEditableTestSuite(testSuiteResponse.data)
  if (loadError || !testSuiteData) {
    return (
      <AuthoringLoadError
        title="Modify Test Suite"
        listHref="/test-suites"
        listLabel="Back to test suites"
        message={loadError ?? 'The selected test suite could not be found.'}
      />
    )
  }

  const testCases = getTestCasePickerRows(testCasesResponse.data)
  const moduleList = getModuleRows(moduleListResponse.data)
  const tags = getTagRows(tagsResponse.data)

  return (
    <div className="space-y-4">
      <PageHeader>Modify Test Suite</PageHeader>
      <TestSuiteForm
        defaultValues={{
          name: testSuiteData.name ?? '',
          description: testSuiteData.description ?? '',
          testCases: testSuiteData.testCases.map(testCase => testCase.id),
          moduleId: testSuiteData.moduleId ?? '',
          tagIds: testSuiteData.tags?.map(tag => tag.id) || [],
        }}
        successTitle="Suite updated"
        successMessage="Test suite updated successfully"
        onSubmitAction={updateTestSuiteAction}
        id={id}
        testCases={testCases}
        moduleList={moduleList}
        tags={tags}
      />
    </div>
  )
}

export default ModifyTestSuite
