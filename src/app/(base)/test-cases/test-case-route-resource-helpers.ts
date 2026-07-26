import { listReadyStepDefinitionOptionsAction } from '@/actions/step-definition/step-definition-actions'
import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { getAllLocatorsAction } from '@/actions/locator/locator-actions'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import { getAllTagsAction } from '@/actions/tags/tag-actions'
import { getAllTestCasesAction } from '@/actions/test-case/test-case-actions'
import { getAllTestSuitesAction } from '@/actions/test-suite/test-suite-actions'
import type { StepDefinitionOption } from '@/types/step-definition-option'
import type { ActionResponse } from '@/types/form/actionHandler'

import {
  getEnvironmentRows,
  getLocatorGroupRows,
  getLocatorRows,
  getModuleRows,
  getTagRows,
  getTestSuiteRows,
} from './test-case-resource-rows'
import { getTestCaseRows } from './test-case-row-helpers'

export type TestCaseFormResourceResponses = {
  stepDefinitionsResponse: ActionResponse
  testSuitesResponse: ActionResponse
  locatorsResponse: ActionResponse
  locatorGroupsResponse: ActionResponse
  tagsResponse: ActionResponse
  testCasesResponse: ActionResponse
  moduleListResponse: ActionResponse
  environmentsResponse: ActionResponse
}

export async function loadTestCaseFormResourceResponses(): Promise<TestCaseFormResourceResponses> {
  const [
    stepDefinitionsResponse,
    testSuitesResponse,
    locatorsResponse,
    locatorGroupsResponse,
    tagsResponse,
    testCasesResponse,
    moduleListResponse,
    environmentsResponse,
  ] = await Promise.all([
    listReadyStepDefinitionOptionsAction(),
    getAllTestSuitesAction(),
    getAllLocatorsAction(),
    getAllLocatorGroupsAction(),
    getAllTagsAction(),
    getAllTestCasesAction(),
    getAllModulesAction(),
    getAllEnvironmentsAction(),
  ])

  return {
    stepDefinitionsResponse,
    testSuitesResponse,
    locatorsResponse,
    locatorGroupsResponse,
    tagsResponse,
    testCasesResponse,
    moduleListResponse,
    environmentsResponse,
  }
}

export function getTestCaseRouteLoadError(responses: readonly ActionResponse[]) {
  return responses.find(response => response.error)?.error
}

export function getTestCaseFormRouteResources({
  stepDefinitionsResponse,
  testSuitesResponse,
  locatorsResponse,
  locatorGroupsResponse,
  tagsResponse,
  testCasesResponse,
  moduleListResponse,
  environmentsResponse,
}: TestCaseFormResourceResponses) {
  return {
    stepDefinitions: (stepDefinitionsResponse.data ?? []) as StepDefinitionOption[],
    testSuites: getTestSuiteRows(testSuitesResponse.data),
    locators: getLocatorRows(locatorsResponse.data),
    locatorGroups: getLocatorGroupRows(locatorGroupsResponse.data),
    tags: getTagRows(tagsResponse.data),
    testCases: getTestCaseRows(testCasesResponse.data),
    moduleList: getModuleRows(moduleListResponse.data),
    environments: getEnvironmentRows(environmentsResponse.data),
  }
}

export type TestCaseFormRouteResources = ReturnType<typeof getTestCaseFormRouteResources>
