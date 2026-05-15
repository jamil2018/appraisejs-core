import { getAllLocatorsAction } from '@/actions/locator/locator-actions'
import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import { getAllTemplateStepParamsAction } from '@/actions/template-step/template-step-actions'
import { getAllTemplateStepsAction } from '@/actions/template-step/template-step-actions'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import type { Environment, Locator, LocatorGroup, Module, TemplateStep, TemplateStepParameter } from '@prisma/client'

export type CreateTemplateTestCasePageData =
  | { status: 'error'; message: string }
  | {
      status: 'success'
      templateStepParams: TemplateStepParameter[]
      templateSteps: TemplateStep[]
      locators: Locator[]
      locatorGroups: LocatorGroup[]
      environments: Environment[]
      modules: Module[]
    }

export async function loadCreateTemplateTestCasePageData(): Promise<CreateTemplateTestCasePageData> {
  const { data: templateStepParams, error: templateStepParamsError } = await getAllTemplateStepParamsAction()

  if (templateStepParamsError) {
    return { status: 'error', message: templateStepParamsError }
  }

  const [
    { data: templateSteps, error: templateStepsError },
    { data: locators, error: locatorsError },
    { data: locatorGroups, error: locatorGroupsError },
    { data: environments, error: environmentsError },
    { data: modules, error: modulesError },
  ] = await Promise.all([
    getAllTemplateStepsAction(),
    getAllLocatorsAction(),
    getAllLocatorGroupsAction(),
    getAllEnvironmentsAction(),
    getAllModulesAction(),
  ])

  const secondaryError =
    templateStepsError || locatorsError || locatorGroupsError || environmentsError || modulesError

  if (secondaryError) {
    return { status: 'error', message: secondaryError }
  }

  return {
    status: 'success',
    templateStepParams: templateStepParams as TemplateStepParameter[],
    templateSteps: templateSteps as TemplateStep[],
    locators: locators as Locator[],
    locatorGroups: locatorGroups as LocatorGroup[],
    environments: environments as Environment[],
    modules: modules as Module[],
  }
}
