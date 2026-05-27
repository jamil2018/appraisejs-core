import {
  Locator,
  LocatorGroup,
  Environment,
  Module,
  TemplateStep,
  TemplateStepParameter,
  TemplateTestCase,
  TemplateTestCaseStep,
  TemplateTestCaseStepParameter,
  TemplateTestCaseFlowBlock,
  TemplateTestCaseFlowBlockNode,
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
import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
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
  if (!id?.trim()) {
    return <div>Error: Invalid template test case id.</div>
  }

  const [
    templateCaseResponse,
    { data: templateStepParams, error: templateStepParamsError },
    { data: templateSteps, error: templateStepsError },
    { data: locators, error: locatorsError },
    { data: locatorGroups, error: locatorGroupsError },
    { data: environments, error: environmentsError },
    { data: modules, error: modulesError },
  ] = await Promise.all([
    getTemplateTestCaseByIdAction(id),
    getAllTemplateStepParamsAction(),
    getAllTemplateStepsAction(),
    getAllLocatorsAction(),
    getAllLocatorGroupsAction(),
    getAllEnvironmentsAction(),
    getAllModulesAction(),
  ])

  const { data, error } = templateCaseResponse

  if (error) {
    return <div>Error: {error}</div>
  }

  if (!data) {
    return <div>Error: Template test case not found.</div>
  }

  const templateTestCase = data as TemplateTestCase & {
    steps: (TemplateTestCaseStep & {
      parameters: TemplateTestCaseStepParameter[]
    })[]
    flowBlocks: (TemplateTestCaseFlowBlock & { nodes: TemplateTestCaseFlowBlockNode[] })[]
  }
  if (
    templateStepParamsError ||
    templateStepsError ||
    locatorsError ||
    locatorGroupsError ||
    environmentsError ||
    modulesError
  ) {
    return (
      <div>
        Error:{' '}
        {templateStepParamsError ||
          templateStepsError ||
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
        environments={environments as Environment[]}
        modules={modules as Module[]}
        defaultNodesOrder={templateTestCase.steps.reduce((acc, step) => {
          const nodeId = step.flowNodeId ?? step.id
          acc[nodeId] = {
            nodeId,
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
        defaultFlowBlocks={templateTestCase.flowBlocks
          .slice()
          .sort((left, right) => left.order - right.order)
          .map(block => ({
            id: block.id,
            name: block.name,
            nodeIds: block.nodes.map(node => node.flowNodeId),
          }))}
      />
    </>
  )
}

export default ModifyTemplateTestCase
