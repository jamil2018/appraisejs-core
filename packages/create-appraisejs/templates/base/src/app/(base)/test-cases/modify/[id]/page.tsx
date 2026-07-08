import { getTestCaseByIdAction, updateTestCaseAction } from '@/actions/test-case/test-case-actions'
import React from 'react'
import TestCaseForm from '../../test-case-form'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import {
  getAllTemplateStepParamsAction,
  getAllTemplateStepsAction,
} from '@/actions/template-step/template-step-actions'
import { getAllLocatorsAction } from '@/actions/locator/locator-actions'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { createTagAction, getAllTagsAction } from '@/actions/tags/tag-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import { getAllStepBlocksAction } from '@/actions/step-block/step-block-actions'
import { getAllTestCasesAction } from '@/actions/test-case/test-case-actions'
import { createTestSuiteAction, getAllTestSuitesAction } from '@/actions/test-suite/test-suite-actions'
import { Metadata } from 'next'

import {
  buildNodeOrderFromTestCaseSteps,
  buildFlowBlocksFromTestCaseRows,
  getEditableTestCase,
} from '../../editable-test-case-helpers'
import {
  getEnvironmentRows,
  getLocatorGroupRows,
  getLocatorRows,
  getModuleRows,
  getFlowStepBlockRows,
  getTagRows,
  getTemplateStepParamRows,
  getTemplateStepRows,
  getTestSuiteRows,
} from '../../test-case-resource-rows'
import { getTestCaseRows } from '../../test-case-row-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Modify Test Case',
  description: 'Modify a test case',
}

const ModifyTestCase = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const [
    testCaseResponse,
    templateStepParamsResponse,
    templateStepsResponse,
    locatorsResponse,
    testSuitesResponse,
    locatorGroupsResponse,
    tagsResponse,
    testCasesResponse,
    moduleListResponse,
    environmentsResponse,
    stepBlocksResponse,
  ] = await Promise.all([
    getTestCaseByIdAction(id),
    getAllTemplateStepParamsAction(),
    getAllTemplateStepsAction(),
    getAllLocatorsAction(),
    getAllTestSuitesAction(),
    getAllLocatorGroupsAction(),
    getAllTagsAction(),
    getAllTestCasesAction(),
    getAllModulesAction(),
    getAllEnvironmentsAction(),
    getAllStepBlocksAction(),
  ])

  const loadError =
    testCaseResponse.error ||
    templateStepParamsResponse.error ||
    templateStepsResponse.error ||
    locatorsResponse.error ||
    testSuitesResponse.error ||
    locatorGroupsResponse.error ||
    tagsResponse.error ||
    testCasesResponse.error ||
    moduleListResponse.error ||
    environmentsResponse.error ||
    stepBlocksResponse.error

  if (loadError) {
    return <div>Error: {loadError}</div>
  }

  const testCase = getEditableTestCase(testCaseResponse.data)
  if (!testCase) {
    return <div>Error: Invalid test case</div>
  }

  const templateStepParams = getTemplateStepParamRows(templateStepParamsResponse.data)
  const templateSteps = getTemplateStepRows(templateStepsResponse.data)
  const locators = getLocatorRows(locatorsResponse.data)
  const testSuites = getTestSuiteRows(testSuitesResponse.data)
  const locatorGroups = getLocatorGroupRows(locatorGroupsResponse.data)
  const tags = getTagRows(tagsResponse.data)
  const testCases = getTestCaseRows(testCasesResponse.data)
  const moduleList = getModuleRows(moduleListResponse.data)
  const environments = getEnvironmentRows(environmentsResponse.data)
  const stepBlocks = getFlowStepBlockRows(stepBlocksResponse.data)

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
        templateStepParams={templateStepParams}
        templateSteps={templateSteps}
        locators={locators}
        locatorGroups={locatorGroups}
        environments={environments}
        testSuites={testSuites}
        testCases={testCases}
        moduleList={moduleList}
        stepBlocks={stepBlocks}
        tags={tags}
        defaultNodesOrder={buildNodeOrderFromTestCaseSteps(testCase.steps)}
        defaultFlowBlocks={buildFlowBlocksFromTestCaseRows(testCase.flowBlocks)}
        onCreateTestSuiteAction={createTestSuiteAction}
        onCreateTagAction={createTagAction}
      />
    </>
  )
}

export default ModifyTestCase
