import type { Node } from '@xyflow/react'
import { StepParameterType, type TemplateStep, type TemplateStepParameter } from '@prisma/client'

import type { NodeData as NodeFormData } from '@/constants/form-opts/diagram/node-form'
import { checkMissingMandatoryParams } from '@/lib/utils/node-param-validation'
import type { NodeOrderMap, TemplateTestCaseNodeData, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'

import { isAddNodePromptNode } from './flow-add-node-prompt-helpers'

type DiagramParameter = NodeFormData['parameters'][number] | TemplateTestCaseNodeData['parameters'][number]
export type DiagramNodeOrder = NodeOrderMap | TemplateTestCaseNodeOrderMap

export type FlowNodeData = {
  label: string
  gherkinStep: string
  icon: string
  parameters: Array<{
    name: string
    value: string
    type: StepParameterType
    order: number
  }>
  templateStepId: string
  isFirstNode?: boolean
  isMissingParams?: true
}

function toRuntimeParameters(parameters: DiagramParameter[]) {
  return parameters.map(parameter => ({
    name: parameter.name,
    value: 'value' in parameter ? parameter.value : parameter.defaultValue,
    type: parameter.type ?? StepParameterType.STRING,
    order: parameter.order,
  }))
}

export function toSerializableParameters(parameters: NodeFormData['parameters']) {
  return parameters.map(parameter => ({
    name: parameter.name,
    value: parameter.value,
    type: parameter.type ?? StepParameterType.STRING,
    order: parameter.order,
  }))
}

export function buildFlowNodeData(
  nodeData: DiagramNodeOrder[string],
  templateStepParams: TemplateStepParameter[],
  defaultValueInput: boolean,
): FlowNodeData {
  const parameters = toRuntimeParameters(nodeData.parameters ?? [])
  const baseNodeData = {
    label: nodeData.label,
    gherkinStep: nodeData.gherkinStep ?? '',
    icon: nodeData.icon ?? '',
    parameters,
    templateStepId: nodeData.templateStepId ?? '',
    ...('isFirstNode' in nodeData ? { isFirstNode: nodeData.isFirstNode ?? false } : {}),
  }

  const isMissingParams = checkMissingMandatoryParams(
    {
      parameters: baseNodeData.parameters,
      templateStepId: baseNodeData.templateStepId,
    },
    templateStepParams,
    defaultValueInput,
  )

  return isMissingParams ? { ...baseNodeData, isMissingParams: true } : baseNodeData
}

export function createEditableNodeData(node: Node | undefined): NodeFormData | null {
  if (!node) {
    return null
  }

  if (isAddNodePromptNode(node)) {
    return null
  }

  return {
    ...(node.data as NodeFormData),
    gherkinStep: (node.data.gherkinStep as string) ?? '',
    parameters: ((node.data.parameters as NodeFormData['parameters']) ?? []).map(parameter => ({
      name: parameter.name,
      value: parameter.value,
      type: parameter.type ?? StepParameterType.STRING,
      order: parameter.order,
    })),
    templateStepId: (node.data.templateStepId as string) ?? '',
  }
}

function getTemplateStepIcon(templateSteps: TemplateStep[], templateStepId: string) {
  return templateSteps.find(templateStep => templateStep.id === templateStepId)?.icon ?? 'MOUSE'
}

export function buildNodeFormData(
  formData: NodeFormData,
  templateSteps: TemplateStep[],
  templateStepParams: TemplateStepParameter[],
  defaultValueInput: boolean,
  isFirstNode: boolean,
) {
  const icon = getTemplateStepIcon(templateSteps, formData.templateStepId)
  const isMissingParams = checkMissingMandatoryParams(
    {
      parameters: formData.parameters,
      templateStepId: formData.templateStepId,
    },
    templateStepParams,
    defaultValueInput,
  )

  return {
    ...formData,
    icon,
    isFirstNode,
    isMissingParams,
  }
}
