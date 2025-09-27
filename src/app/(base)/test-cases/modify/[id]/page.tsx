import { getTestCaseByIdAction, updateTestCaseAction } from '@/actions/test-case/test-case-actions'
import {
  Locator,
  LocatorGroup,
  TemplateStep,
  TemplateStepParameter,
  TestCase,
  TestCaseStep,
  TestCaseStepParameter,
  TestSuite,
} from '@prisma/client'
import React from 'react'
import TestCaseForm from '../../test-case-form'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import {
  getAllTemplateStepParamsAction,
  getAllTemplateStepsAction,
} from '@/actions/template-step/template-step-actions'
import { getAllLocatorsAction } from '@/actions/locator/locator-actions'
import { getAllTestSuitesAction } from '@/actions/test-suite/test-suite-actions'
import { NodeOrderMap } from '@/types/diagram/diagram'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'

const ModifyTestCase = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const { data, error } = await getTestCaseByIdAction(id)

  if (error) {
    return <div>Error: {error}</div>
  }
  const testCase = data as TestCase & {
    steps: (TestCaseStep & { parameters: TestCaseStepParameter[] })[]
    testSuiteIds: string[]
  }
  const { data: templateStepParams, error: templateStepParamsError } = await getAllTemplateStepParamsAction()
  const { data: templateSteps, error: templateStepsError } = await getAllTemplateStepsAction()
  const { data: locators, error: locatorsError } = await getAllLocatorsAction()
  const { data: testSuites, error: testSuitesError } = await getAllTestSuitesAction()
  const { data: locatorGroups, error: locatorGroupsError } = await getAllLocatorGroupsAction()
  if (templateStepParamsError || templateStepsError || locatorsError || testSuitesError || locatorGroupsError) {
    return <div>Error: {templateStepParamsError || templateStepsError || locatorsError || testSuitesError}</div>
  }
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
        templateStepParams={templateStepParams as TemplateStepParameter[]}
        templateSteps={templateSteps as TemplateStep[]}
        locators={locators as Locator[]}
        locatorGroups={locatorGroups as LocatorGroup[]}
        testSuites={testSuites as TestSuite[]}
        defaultNodesOrder={testCase.steps.reduce((acc, step) => {
          acc[step.id] = {
            order: step.order,
            label: step.label,
            gherkinStep: step.gherkinStep,
            icon: step.icon,
            parameters: ((step.parameters || []) as TestCaseStepParameter[]).map((param: TestCaseStepParameter) => ({
              name: param.name,
              value: param.value,
              type: param.type,
              order: param.order,
            })),
            templateStepId: step.templateStepId,
          }
          return acc
        }, {} as NodeOrderMap)}
      />
    </>
  )
}

export default ModifyTestCase
