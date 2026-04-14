import { getTestSuiteByIdAction, updateTestSuiteAction } from '@/actions/test-suite/test-suite-actions'
import { TestSuiteForm } from '../../test-suite-form'
import React from 'react'
import { getAllTestCasesAction } from '@/actions/test-case/test-case-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import { getAllTagsAction } from '@/actions/tags/tag-actions'
import { Metadata } from 'next'

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
  if (loadError) {
    return <div>Error: {loadError}</div>
  }

  const testSuiteData = getEditableTestSuite(testSuiteResponse.data)
  if (!testSuiteData) {
    return <div>Error: Invalid test suite</div>
  }

  const testCases = getTestCasePickerRows(testCasesResponse.data)
  const moduleList = getModuleRows(moduleListResponse.data)
  const tags = getTagRows(tagsResponse.data)

  return (
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
  )
}

export default ModifyTestSuite
