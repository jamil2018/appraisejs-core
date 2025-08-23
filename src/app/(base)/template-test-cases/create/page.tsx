import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Blocks } from 'lucide-react'
import React from 'react'
import TemplateTestCaseForm from '../template-test-case-form'
import { Locator, TemplateStep, TemplateStepParameter } from '@prisma/client'
import { getAllLocatorsAction } from '@/actions/locator/locator-actions'
import { getAllTemplateStepParamsAction } from '@/actions/template-step/template-step-actions'
import { getAllTemplateStepsAction } from '@/actions/template-step/template-step-actions'
import { createTemplateTestCaseAction } from '@/actions/template-test-case/template-test-case-actions'

const CreateTemplateTestCase = async () => {
  const { data: templateStepParams, error: templateStepParamsError } = await getAllTemplateStepParamsAction()

  const { data: templateSteps, error: templateStepsError } = await getAllTemplateStepsAction()

  const { data: locators, error: locatorsError } = await getAllLocatorsAction()

  if (templateStepParamsError || templateStepsError || locatorsError) {
    return <div>Error: {templateStepParamsError || templateStepsError || locatorsError}</div>
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
        onSubmitAction={createTemplateTestCaseAction}
        defaultValueInput={true}
      />
    </>
  )
}

export default CreateTemplateTestCase
