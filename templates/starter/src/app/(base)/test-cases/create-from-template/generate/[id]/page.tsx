import { getTemplateTestCaseByIdAction } from '@/actions/template-test-case/template-test-case-actions'
import React from 'react'
import TestCaseForm from '../../../test-case-form'
import { createTestCaseAction } from '@/actions/test-case/test-case-actions'
import {
  getAllTemplateStepParamsAction,
  getAllTemplateStepsAction,
} from '@/actions/template-step/template-step-actions'
import { getAllLocatorsAction } from '@/actions/locator/locator-actions'
import { getAllTestSuitesAction } from '@/actions/test-suite/test-suite-actions'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import { getAllTagsAction } from '@/actions/tags/tag-actions'
import { Metadata } from 'next'

import {
  getConvertedTemplateTestCaseData,
  getLocatorGroupRows,
  getLocatorRows,
  getTagRows,
  getTemplateStepParamRows,
  getTemplateStepRows,
  getTemplateTestCaseWithSteps,
  getTestSuiteRows,
} from '../../create-from-template-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Create Test Case From Template',
  description: 'Create a new test from a template to execute against your application',
}

const GenerateTestCaseFromTemplate = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const [
    templateTestCaseResponse,
    templateStepParamsResponse,
    templateStepsResponse,
    locatorsResponse,
    testSuitesResponse,
    locatorGroupsResponse,
    tagsResponse,
  ] = await Promise.all([
    getTemplateTestCaseByIdAction(id),
    getAllTemplateStepParamsAction(),
    getAllTemplateStepsAction(),
    getAllLocatorsAction(),
    getAllTestSuitesAction(),
    getAllLocatorGroupsAction(),
    getAllTagsAction(),
  ])

  const loadError =
    templateTestCaseResponse.error ||
    templateStepParamsResponse.error ||
    templateStepsResponse.error ||
    locatorsResponse.error ||
    testSuitesResponse.error ||
    locatorGroupsResponse.error ||
    tagsResponse.error

  if (loadError) {
    return <div>Error: {loadError}</div>
  }

  const templateTestCaseData = getTemplateTestCaseWithSteps(templateTestCaseResponse.data)
  if (!templateTestCaseData) {
    return <div>Error: Invalid template test case</div>
  }

  const { convertedData, error } = getConvertedTemplateTestCaseData(templateTestCaseData)
  if (!convertedData || error) {
    return <div>{error || 'Invalid test case'}</div>
  }

  const templateStepParams = getTemplateStepParamRows(templateStepParamsResponse.data)
  const templateSteps = getTemplateStepRows(templateStepsResponse.data)
  const locators = getLocatorRows(locatorsResponse.data)
  const testSuites = getTestSuiteRows(testSuitesResponse.data)
  const locatorGroups = getLocatorGroupRows(locatorGroupsResponse.data)
  const tags = getTagRows(tagsResponse.data)

  return (
    <div>
      <PageHeader>Create New Test Case</PageHeader>
      <HeaderSubtitle>Create a new test from a template to execute against your application</HeaderSubtitle>

      <TestCaseForm
        onSubmitAction={createTestCaseAction}
        defaultNodesOrder={convertedData.nodesOrder}
        templateStepParams={templateStepParams}
        templateSteps={templateSteps}
        locators={locators}
        testSuites={testSuites}
        tags={tags}
        defaultTitle={templateTestCaseData.name || ''}
        defaultDescription={templateTestCaseData.description || ''}
        defaultTestSuiteIds={convertedData.testSuiteIds}
        locatorGroups={locatorGroups}
      />
    </div>
  )
}

export default GenerateTestCaseFromTemplate
