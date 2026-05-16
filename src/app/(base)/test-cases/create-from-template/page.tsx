import { getAllTemplateTestCasesAction } from '@/actions/template-test-case/template-test-case-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { LayoutPanelTop } from 'lucide-react'
import React from 'react'
import { Metadata } from 'next'
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
import {
  getLocatorGroupRows,
  getEnvironmentRows,
  getLocatorRows,
  getModuleRows,
  getTagRows,
  getTemplateStepParamRows,
  getTemplateStepRows,
  getTestSuiteRows,
} from '../test-case-resource-rows'
import { getTestCaseRows } from '../test-case-row-helpers'

import { getConvertedTemplateTestCaseData, getTemplateTestCasesWithSteps } from './create-from-template-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Create Test Case From Template',
  description: 'Select a template test case to create a new test case from',
}

const CreateTestCaseFromTemplate = async ({
  searchParams,
}: {
  searchParams?: Promise<{ templateTestCaseId?: string }>
}) => {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const selectedTemplateTestCaseId = resolvedSearchParams.templateTestCaseId ?? ''

  const [
    templateTestCasesResponse,
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
    getAllTemplateTestCasesAction(),
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
    templateTestCasesResponse.error ||
    templateStepParamsResponse.error ||
    templateStepsResponse.error ||
    testSuitesResponse.error ||
    locatorsResponse.error ||
    locatorGroupsResponse.error ||
    tagsResponse.error ||
    testCasesResponse.error ||
    moduleListResponse.error ||
    environmentsResponse.error

  if (loadError) {
    return <div>Error: {loadError}</div>
  }

  const templateTestCases = getTemplateTestCasesWithSteps(templateTestCasesResponse.data)
  const selectedTemplateTestCase =
    templateTestCases.find(templateTestCase => templateTestCase.id === selectedTemplateTestCaseId) ?? null

  const convertedTemplateData = selectedTemplateTestCase
    ? getConvertedTemplateTestCaseData(selectedTemplateTestCase)
    : { convertedData: null, error: null }

  if (selectedTemplateTestCase && (!convertedTemplateData.convertedData || convertedTemplateData.error)) {
    return <div>{convertedTemplateData.error || 'Invalid template test case'}</div>
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
        <PageHeader>
          <span className="flex items-center">
            <LayoutPanelTop className="mr-2 size-8" />
            Create Test Case From Template
          </span>
        </PageHeader>
        <HeaderSubtitle>Select a template, add the test details, then refine the generated flow</HeaderSubtitle>
      </div>
      <TestCaseForm
        defaultNodesOrder={convertedTemplateData.convertedData?.nodesOrder ?? {}}
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
        templateTestCases={templateTestCases}
        defaultTemplateTestCaseId={selectedTemplateTestCase?.id}
        defaultTitle={selectedTemplateTestCase?.name || ''}
        defaultDescription={selectedTemplateTestCase?.description || ''}
        defaultTestSuiteIds={convertedTemplateData.convertedData?.testSuiteIds}
      />
    </div>
  )
}

export default CreateTestCaseFromTemplate
