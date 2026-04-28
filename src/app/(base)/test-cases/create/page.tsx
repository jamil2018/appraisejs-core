import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import React from 'react'
import TestCaseForm from '../test-case-form'
import {
  getAllTemplateStepParamsAction,
  getAllTemplateStepsAction,
} from '@/actions/template-step/template-step-actions'
import { getAllLocatorsAction } from '@/actions/locator/locator-actions'
import { createTestCaseAction, getAllTestCasesAction } from '@/actions/test-case/test-case-actions'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { createTagAction, getAllTagsAction } from '@/actions/tags/tag-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import { createTestSuiteAction, getAllTestSuitesAction } from '@/actions/test-suite/test-suite-actions'
import { Metadata } from 'next'

import {
  getLocatorGroupRows,
  getEnvironmentRows,
  getLocatorRows,
  getModuleRows,
  getTagRows,
  getTestCaseRows,
  getTemplateStepParamRows,
  getTemplateStepRows,
  getTestSuiteRows,
} from '../test-case-route-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Create Test Case',
  description: 'Create a new test from scratch to execute against your application',
}

const CreateTestCase = async () => {
  const [
    templateStepParamsResponse,
    templateStepsResponse,
    testSuitesResponse,
    locatorsResponse,
    locatorGroupsResponse,
    tagsResponse,
    testCasesResponse,
    moduleListResponse,
    environmentsResponse,
  ] = await Promise.all([
    getAllTemplateStepParamsAction(),
    getAllTemplateStepsAction(),
    getAllTestSuitesAction(),
    getAllLocatorsAction(),
    getAllLocatorGroupsAction(),
    getAllTagsAction(),
    getAllTestCasesAction(),
    getAllModulesAction(),
    getAllEnvironmentsAction(),
  ])

  const loadError =
    templateStepParamsResponse.error ||
    templateStepsResponse.error ||
    locatorsResponse.error ||
    testSuitesResponse.error ||
    locatorGroupsResponse.error ||
    tagsResponse.error ||
    testCasesResponse.error ||
    moduleListResponse.error ||
    environmentsResponse.error

  if (loadError) {
    return (
      <div>
        Error: {loadError}
      </div>
    )
  }

  const templateStepParams = getTemplateStepParamRows(templateStepParamsResponse.data)
  const templateSteps = getTemplateStepRows(templateStepsResponse.data)
  const testSuites = getTestSuiteRows(testSuitesResponse.data)
  const locators = getLocatorRows(locatorsResponse.data)
  const locatorGroups = getLocatorGroupRows(locatorGroupsResponse.data)
  const tags = getTagRows(tagsResponse.data)
  const testCases = getTestCaseRows(testCasesResponse.data)
  const moduleList = getModuleRows(moduleListResponse.data)
  const environments = getEnvironmentRows(environmentsResponse.data)

  return (
    <div>
      <div className="mb-8">
        <PageHeader>Create New Test Case</PageHeader>
        <HeaderSubtitle>Create a new test from scratch to execute against your application</HeaderSubtitle>
      </div>
      <TestCaseForm
        defaultNodesOrder={{}}
        templateStepParams={templateStepParams}
        templateSteps={templateSteps}
        locators={locators}
        locatorGroups={locatorGroups}
        environments={environments}
        testSuites={testSuites}
        testCases={testCases}
        moduleList={moduleList}
        tags={tags}
        onSubmitAction={createTestCaseAction}
        onCreateTestSuiteAction={createTestSuiteAction}
        onCreateTagAction={createTagAction}
      />
    </div>
  )
}

export default CreateTestCase
