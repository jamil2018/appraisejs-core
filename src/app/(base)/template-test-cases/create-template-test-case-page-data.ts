import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import { getAllLocatorsAction } from '@/actions/locator/locator-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import { listReadyStepDefinitionOptionsAction } from '@/actions/step-definition/step-definition-actions'
import type { Environment, Locator, LocatorGroup, Module } from '@prisma/client'
import type { StepDefinitionOption } from '@/types/step-definition-option'

export type CreateTemplateTestCasePageData =
  | { status: 'error'; message: string }
  | {
      status: 'success'
      stepDefinitions: StepDefinitionOption[]
      locators: Locator[]
      locatorGroups: LocatorGroup[]
      environments: Environment[]
      modules: Module[]
    }

type ResourceResponse = { error?: string; data?: unknown }

function getLoadError(resources: ResourceResponse[]): string | null {
  return resources.map(resource => resource.error).find((error): error is string => Boolean(error)) ?? null
}

function getResourceRows<T>(resource: ResourceResponse): T[] {
  return Array.isArray(resource.data) ? (resource.data as T[]) : []
}

export async function loadCreateTemplateTestCasePageData(): Promise<CreateTemplateTestCasePageData> {
  const [definitions, locators, locatorGroups, environments, modules] = await Promise.all([
    listReadyStepDefinitionOptionsAction(),
    getAllLocatorsAction(),
    getAllLocatorGroupsAction(),
    getAllEnvironmentsAction(),
    getAllModulesAction(),
  ])
  const error = getLoadError([definitions, locators, locatorGroups, environments, modules])
  if (error) return { status: 'error', message: error }
  return {
    status: 'success',
    stepDefinitions: getResourceRows<StepDefinitionOption>(definitions),
    locators: getResourceRows<Locator>(locators),
    locatorGroups: getResourceRows<LocatorGroup>(locatorGroups),
    environments: getResourceRows<Environment>(environments),
    modules: getResourceRows<Module>(modules),
  }
}
