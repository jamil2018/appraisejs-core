import type { FlowBlock, NodeOrderMap } from '@/types/diagram/diagram'

import type { EditableTestCase } from './editable-test-case-types'

export function buildNodeOrderFromTestCaseSteps(steps: EditableTestCase['steps']): NodeOrderMap {
  return steps.reduce<NodeOrderMap>((acc, step) => {
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
      templateStepId: step.templateStepId,
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
