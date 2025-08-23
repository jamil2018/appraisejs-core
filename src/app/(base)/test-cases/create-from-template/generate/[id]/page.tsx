import { getTemplateTestCaseByIdAction } from '@/actions/template-test-case/template-test-case-actions'
import {
  TemplateTestCase,
  TemplateTestCaseStep,
  TemplateTestCaseStepParameter,
  TemplateStep,
  TemplateStepParameter,
  Locator,
  TestSuite,
} from '@prisma/client'
import React from 'react'
import {
  templateTestCaseToTestCaseConverter,
  validateConvertedTestCaseData,
} from '@/lib/transformers/template-test-case-converter'
import TestCaseForm from '../../../test-case-form'
import { createTestCaseAction } from '@/actions/test-case/test-case-actions'
import {
  getAllTemplateStepParamsAction,
  getAllTemplateStepsAction,
} from '@/actions/template-step/template-step-actions'
import { getAllLocatorsAction } from '@/actions/locator/locator-actions'
import { getAllTestSuitesAction } from '@/actions/test-suite/test-suite-actions'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'

const GenerateTestCaseFromTemplate = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const { data: templateTestCase, error } = await getTemplateTestCaseByIdAction(id)
  const { data: templateStepParams, error: templateStepParamsError } = await getAllTemplateStepParamsAction()
  const { data: templateSteps, error: templateStepsError } = await getAllTemplateStepsAction()
  const { data: locators, error: locatorsError } = await getAllLocatorsAction()
  const { data: testSuites, error: testSuitesError } = await getAllTestSuitesAction()
  if (templateStepParamsError || templateStepsError || locatorsError || testSuitesError) {
    return <div>Error: {templateStepParamsError || templateStepsError || locatorsError || testSuitesError}</div>
  }

  if (error) {
    return <div>Error: {error}</div>
  }
  const templateTestCaseData = templateTestCase as TemplateTestCase & {
    steps: (TemplateTestCaseStep & {
      parameters: TemplateTestCaseStepParameter[]
    })[]
  }

  // Convert template test case to test case format
  const convertedData = templateTestCaseToTestCaseConverter(templateTestCaseData)

  // Validate the converted data
  const validation = validateConvertedTestCaseData(convertedData)

  if (!validation.isValid) {
    return <div>Invalid test case</div>
  }

  return (
    <div>
      <PageHeader>Create New Test Case</PageHeader>
      <HeaderSubtitle>Create a new test from a template to execute against your application</HeaderSubtitle>

      <TestCaseForm
        onSubmitAction={createTestCaseAction}
        defaultNodesOrder={convertedData.nodesOrder}
        templateStepParams={templateStepParams as TemplateStepParameter[]}
        templateSteps={templateSteps as TemplateStep[]}
        locators={locators as Locator[]}
        testSuites={testSuites as TestSuite[]}
        defaultTitle={templateTestCaseData.name || ''}
        defaultDescription={templateTestCaseData.description || ''}
        defaultTestSuiteIds={convertedData.testSuiteIds}
      />
    </div>
  )
}

export default GenerateTestCaseFromTemplate
