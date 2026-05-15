import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Blocks } from 'lucide-react'
import React from 'react'
import TemplateTestCaseForm from '../template-test-case-form'
import { Environment, Locator, TemplateStep, TemplateStepParameter, LocatorGroup, Module } from '@prisma/client'
import { getAllLocatorsAction } from '@/actions/locator/locator-actions'
import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import { getAllTemplateStepParamsAction } from '@/actions/template-step/template-step-actions'
import { getAllTemplateStepsAction } from '@/actions/template-step/template-step-actions'
import { createTemplateTestCaseAction } from '@/actions/template-test-case/template-test-case-actions'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Appraise | Create Template Test Case',
  description: 'Create a new template test case to quickly create test cases',
}

const CreateTemplateTestCase = async () => {
  const [
    { data: templateStepParams, error: templateStepParamsError },
    { data: templateSteps, error: templateStepsError },
    { data: locators, error: locatorsError },
    { data: locatorGroups, error: locatorGroupsError },
    { data: environments, error: environmentsError },
    { data: modules, error: modulesError },
  ] = await Promise.all([
    getAllTemplateStepParamsAction(),
    getAllTemplateStepsAction(),
    getAllLocatorsAction(),
    getAllLocatorGroupsAction(),
    getAllEnvironmentsAction(),
    getAllModulesAction(),
  ])

  if (templateStepParamsError) {
    return <div>Error: {templateStepParamsError}</div>
  }

  if (
    templateStepsError ||
    locatorsError ||
    locatorGroupsError ||
    environmentsError ||
    modulesError
  ) {
    return (
      <div>
        Error:{' '}
        {templateStepsError ||
          locatorsError ||
          locatorGroupsError ||
          environmentsError ||
          modulesError}
      </div>
    )
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Blocks className="mr-2 size-8" />
            Create Template Test Case
          </span>
        </PageHeader>
        <HeaderSubtitle>Create a new template test case to quickly create test cases</HeaderSubtitle>
      </div>
      <TemplateTestCaseForm
        defaultNodesOrder={{}}
        templateStepParams={templateStepParams as TemplateStepParameter[]}
        templateSteps={templateSteps as TemplateStep[]}
        locators={locators as Locator[]}
        locatorGroups={locatorGroups as LocatorGroup[]}
        environments={environments as Environment[]}
        modules={modules as Module[]}
        onSubmitAction={createTemplateTestCaseAction}
        defaultValueInput={true}
      />
    </>
  )
}

export default CreateTemplateTestCase
