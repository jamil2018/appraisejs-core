import { StepParameterType, TemplateStepIcon } from '@prisma/client'

import { buildCanonicalInvocationJson, type CanonicalTemplateStepMapping } from '@/lib/operation-catalog/invocation'

type AuthoredStep = {
  gherkinStep: string
  nodeId?: string
  label?: string
  icon?: string
  templateStepId: string
  order: number
  parameters: Array<{ name: string; value: string; type: string; order: number }>
}

type FlowBlock = { id: string; name: string; nodeIds: string[] }
type MappingByTemplateStep = Map<string, CanonicalTemplateStepMapping>

function authoredStepBase(step: AuthoredStep, mappings: MappingByTemplateStep) {
  return {
    gherkinStep: step.gherkinStep,
    flowNodeId: step.nodeId,
    label: step.label ?? '',
    icon: (step.icon ?? '') as TemplateStepIcon,
    templateStepId: step.templateStepId,
    operationInvocationJson: buildCanonicalInvocationJson(mappings.get(step.templateStepId), step),
    order: step.order,
  }
}

export function testCaseStepCreates(steps: AuthoredStep[], mappings: MappingByTemplateStep) {
  return steps.map(step => ({
    ...authoredStepBase(step, mappings),
    parameters: {
      create: step.parameters.map(parameter => ({
        name: parameter.name,
        value: parameter.value,
        type: parameter.type as StepParameterType,
        order: parameter.order,
      })),
    },
  }))
}

export function templateTestCaseStepCreates(steps: AuthoredStep[], mappings: MappingByTemplateStep) {
  return steps.map(step => {
    const { templateStepId, ...base } = authoredStepBase(step, mappings)
    return {
      ...base,
      TemplateStep: { connect: { id: templateStepId } },
      parameters: {
        create: step.parameters.map(parameter => ({
          name: parameter.name,
          defaultValue: parameter.value,
          type: parameter.type as StepParameterType,
          order: parameter.order,
        })),
      },
    }
  })
}

export function flowBlockCreates(flowBlocks: FlowBlock[] = []) {
  return flowBlocks.map((block, order) => ({
    id: block.id,
    name: block.name,
    order,
    nodes: { create: block.nodeIds.map(flowNodeId => ({ flowNodeId })) },
  }))
}
