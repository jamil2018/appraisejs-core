import type { NodeOrderMap, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'

type DiagramNodeOrder = NodeOrderMap | TemplateTestCaseNodeOrderMap
type DiagramNodeParameter =
  | NodeOrderMap[string]['parameters'][number]
  | TemplateTestCaseNodeOrderMap[string]['parameters'][number]

export function toNodeOrderMap(nodeOrder: DiagramNodeOrder): NodeOrderMap {
  const convertedNodeOrder: NodeOrderMap = {}

  Object.entries(nodeOrder).forEach(([key, nodeData]) => {
    convertedNodeOrder[key] = {
      order: nodeData.order,
      label: nodeData.label,
      gherkinStep: nodeData.gherkinStep,
      icon: nodeData.icon,
      isFirstNode: 'isFirstNode' in nodeData ? nodeData.isFirstNode : undefined,
      parameters: nodeData.parameters.map((parameter: DiagramNodeParameter) => ({
        name: parameter.name,
        value: 'defaultValue' in parameter ? parameter.defaultValue : parameter.value,
        type: parameter.type,
        order: parameter.order,
      })),
      invocation: nodeData.invocation,
    }
  })

  return convertedNodeOrder
}

export function toTemplateTestCaseNodeOrderMap(nodeOrder: DiagramNodeOrder): TemplateTestCaseNodeOrderMap {
  const convertedNodeOrder: TemplateTestCaseNodeOrderMap = {}

  Object.entries(nodeOrder).forEach(([key, nodeData]) => {
    convertedNodeOrder[key] = {
      order: nodeData.order,
      label: nodeData.label,
      gherkinStep: nodeData.gherkinStep,
      icon: nodeData.icon,
      parameters: nodeData.parameters.map((parameter: DiagramNodeParameter) => ({
        name: parameter.name,
        defaultValue: 'value' in parameter ? parameter.value : parameter.defaultValue,
        type: parameter.type,
        order: parameter.order,
      })),
      invocation: nodeData.invocation,
    }
  })

  return convertedNodeOrder
}
