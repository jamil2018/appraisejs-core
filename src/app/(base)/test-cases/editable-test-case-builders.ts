import type { FlowBlock, NodeOrderMap } from '@/types/diagram/diagram'

import type { EditableTestCase } from './editable-test-case-types'

export function buildNodeOrderFromTestCaseSteps(steps: EditableTestCase['steps']): NodeOrderMap {
  return steps.reduce<NodeOrderMap>((acc, step) => {
    const hasCanonicalInvocation =
      typeof step.operationInvocationJson === 'string' && step.operationInvocationJson.length > 0
    const transitionalTemplateStepId = step.templateStepId ?? undefined
    if (!hasCanonicalInvocation && !transitionalTemplateStepId)
      throw new Error(
        `Test case step ${step.id} has neither a canonical operation invocation nor a TemplateStep fallback.`,
      )
    const nodeId = step.flowNodeId ?? step.id
    acc[nodeId] = {
      nodeId,
      order: step.order,
      label: step.label,
      gherkinStep: step.gherkinStep,
      icon: step.icon,
      parameters: (step.parameters || []).map(parameter => ({
        name: parameter.name,
        value: parameter.value,
        type: parameter.type,
        order: parameter.order,
      })),
      // A TemplateStep only preserves the transitional editor projection. Runtime authority is the exact invocation.
      templateStepId: transitionalTemplateStepId ?? '',
    }
    return acc
  }, {})
}

export function buildFlowBlocksFromTestCaseRows(flowBlocks: EditableTestCase['flowBlocks'] = []): FlowBlock[] {
  return flowBlocks
    .slice()
    .sort((left, right) => left.order - right.order)
    .map(block => ({
      id: block.id,
      name: block.name,
      nodeIds: block.nodes.map(node => node.flowNodeId),
    }))
}
