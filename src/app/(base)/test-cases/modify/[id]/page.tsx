import { getTestCaseByIdAction, updateTestCaseAction } from '@/actions/test-case/test-case-actions'
import React from 'react'
import TestCaseForm from '../../test-case-form'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { createTagAction } from '@/actions/tags/tag-actions'
import { createTestSuiteAction } from '@/actions/test-suite/test-suite-actions'
import { Metadata } from 'next'

import {
  buildNodeOrderFromTestCaseSteps,
  buildFlowBlocksFromTestCaseRows,
  getEditableTestCase,
} from '../../editable-test-case-helpers'
import {
  getTestCaseFormRouteResources,
  getTestCaseRouteLoadError,
  loadTestCaseFormResourceResponses,
} from '../../test-case-route-resource-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Modify Test Case',
  description: 'Modify a test case',
}

const ModifyTestCase = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const [testCaseResponse, resourceResponses] = await Promise.all([
    getTestCaseByIdAction(id),
    loadTestCaseFormResourceResponses(),
  ])
  const loadError = getTestCaseRouteLoadError([testCaseResponse, ...Object.values(resourceResponses)])

  if (loadError) {
    return <div>Error: {loadError}</div>
  }

  const testCase = getEditableTestCase(testCaseResponse.data)
  if (!testCase) {
    return <div>Error: Invalid test case</div>
  }

  const resources = getTestCaseFormRouteResources(resourceResponses)

  return (
    <>
      <div className="mb-8">
        <PageHeader>Modify Test Case</PageHeader>
        <HeaderSubtitle>Modify a test case</HeaderSubtitle>
      </div>
      <TestCaseForm
        onSubmitAction={updateTestCaseAction}
        id={id}
        defaultTitle={testCase.title}
        defaultDescription={testCase.description}
        defaultTestSuiteIds={testCase.testSuiteIds}
        defaultTagIds={testCase.tagIds || []}
        {...resources}
        defaultNodesOrder={buildNodeOrderFromTestCaseSteps(testCase.steps)}
        defaultFlowBlocks={buildFlowBlocksFromTestCaseRows(testCase.flowBlocks)}
        onCreateTestSuiteAction={createTestSuiteAction}
        onCreateTagAction={createTagAction}
      />
    </>
  )
}

export default ModifyTestCase
