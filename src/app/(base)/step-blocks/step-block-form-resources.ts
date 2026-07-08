import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import { getAllLocatorsAction } from '@/actions/locator/locator-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import {
  getAllTemplateStepParamsAction,
  getAllTemplateStepsAction,
} from '@/actions/template-step/template-step-actions'

import {
  getEnvironmentRows,
  getLocatorGroupRows,
  getLocatorRows,
  getModuleRows,
} from '../test-cases/test-case-resource-rows'

export async function loadStepBlockFormResources() {
  const [
    templateStepsResponse,
    templateStepParamsResponse,
    locatorsResponse,
    locatorGroupsResponse,
    modulesResponse,
    environmentsResponse,
  ] = await Promise.all([
    getAllTemplateStepsAction(),
    getAllTemplateStepParamsAction(),
    getAllLocatorsAction(),
    getAllLocatorGroupsAction(),
    getAllModulesAction(),
    getAllEnvironmentsAction(),
  ])

  const error = [
    templateStepsResponse,
    templateStepParamsResponse,
    locatorsResponse,
    locatorGroupsResponse,
    modulesResponse,
    environmentsResponse,
  ].find(response => response.error)?.error

  return {
    error,
    templateSteps: templateStepsResponse.data,
    templateStepParams: templateStepParamsResponse.data,
    locators: getLocatorRows(locatorsResponse.data),
    locatorGroups: getLocatorGroupRows(locatorGroupsResponse.data),
    modules: getModuleRows(modulesResponse.data),
    environments: getEnvironmentRows(environmentsResponse.data),
  }
}
