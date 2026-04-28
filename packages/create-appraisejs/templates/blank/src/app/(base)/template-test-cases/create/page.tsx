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
  const { data: templateStepParams, error: templateStepParamsError } = await getAllTemplateStepParamsAction()

  const { data: templateSteps, error: templateStepsError } = await getAllTemplateStepsAction()

  const { data: locators, error: locatorsError } = await getAllLocatorsAction()

  const { data: locatorGroups, error: locatorGroupsError } = await getAllLocatorGroupsAction()
  const { data: environments, error: environmentsError } = await getAllEnvironmentsAction()
  const { data: modules, error: modulesError } = await getAllModulesAction()

  if (templateStepParamsError || templateStepsError || locatorsError || locatorGroupsError || environmentsError || modulesError) {
    return (
      <div>
        Error: {templateStepParamsError || templateStepsError || locatorsError || locatorGroupsError || environmentsError || modulesError}
      </div>
    )
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Blocks className="mr-2 h-8 w-8" />
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
