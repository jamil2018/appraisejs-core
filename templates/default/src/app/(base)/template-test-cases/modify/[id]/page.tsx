import {
  Locator,
  LocatorGroup,
  TemplateStep,
  TemplateStepParameter,
  TemplateTestCase,
  TemplateTestCaseStep,
  TemplateTestCaseStepParameter,
} from '@prisma/client'
import React from 'react'
import TemplateTestCaseForm from '../../template-test-case-form'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import {
  getAllTemplateStepParamsAction,
  getAllTemplateStepsAction,
} from '@/actions/template-step/template-step-actions'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import { TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'
import {
  getTemplateTestCaseByIdAction,
  updateTemplateTestCaseAction,
} from '@/actions/template-test-case/template-test-case-actions'
import { getAllLocatorsAction } from '@/actions/locator/locator-actions'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Appraise | Modify Template Test Case',
  description: 'Modify a template test case',
}

const ModifyTemplateTestCase = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const { data, error } = await getTemplateTestCaseByIdAction(id)

  if (error) {
    return <div>Error: {error}</div>
  }
  const templateTestCase = data as TemplateTestCase & {
    steps: (TemplateTestCaseStep & {
      parameters: TemplateTestCaseStepParameter[]
    })[]
  }
  const { data: templateStepParams, error: templateStepParamsError } = await getAllTemplateStepParamsAction()
  const { data: templateSteps, error: templateStepsError } = await getAllTemplateStepsAction()
  const { data: locators, error: locatorsError } = await getAllLocatorsAction()
  const { data: locatorGroups, error: locatorGroupsError } = await getAllLocatorGroupsAction()
  if (templateStepParamsError || templateStepsError || locatorsError || locatorGroupsError) {
    return <div>Error: {templateStepParamsError || templateStepsError || locatorsError || locatorGroupsError}</div>
  }
  return (
    <>
      <div className="mb-8">
        <PageHeader>Modify Template Test Case</PageHeader>
        <HeaderSubtitle>Modify a template test case</HeaderSubtitle>
      </div>
      <TemplateTestCaseForm
        onSubmitAction={updateTemplateTestCaseAction}
        id={id}
        defaultTitle={templateTestCase.name}
        defaultDescription={templateTestCase.description || ''}
        templateStepParams={templateStepParams as TemplateStepParameter[]}
        templateSteps={templateSteps as TemplateStep[]}
        locators={locators as Locator[]}
        locatorGroups={locatorGroups as LocatorGroup[]}
        defaultNodesOrder={templateTestCase.steps.reduce((acc, step) => {
          acc[step.id] = {
            order: step.order,
            label: step.label,
            gherkinStep: step.gherkinStep,
            icon: step.icon,
            parameters: ((step.parameters || []) as TemplateTestCaseStepParameter[]).map(
              (param: TemplateTestCaseStepParameter) => ({
                name: param.name,
                defaultValue: param.defaultValue,
                type: param.type,
                order: param.order,
              }),
            ),
            templateStepId: step.templateStepId,
          }
          return acc
        }, {} as TemplateTestCaseNodeOrderMap)}
      />
    </>
  )
}

export default ModifyTemplateTestCase
