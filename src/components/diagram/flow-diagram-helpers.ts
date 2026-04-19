import type { Connection, Edge, Node } from '@xyflow/react'
import { StepParameterType, type TemplateStep, type TemplateStepParameter } from '@prisma/client'

import type { NodeData as NodeFormData } from '@/constants/form-opts/diagram/node-form'
import { checkMissingMandatoryParams } from '@/lib/utils/node-param-validation'
import type { NodeOrderMap, TemplateTestCaseNodeData, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'

/** Client-only canvas node: not persisted in node order maps. */
export const ADD_NODE_PROMPT_NODE_ID = '__appraise_add_node_prompt__'

export const ADD_NODE_PROMPT_NODE_TYPE = 'addNodePromptNode' as const

export type AddNodePromptNodeData = Record<string, never>

export function isAddNodePromptNode(node: Node): boolean {
  return node.type === ADD_NODE_PROMPT_NODE_TYPE || node.id === ADD_NODE_PROMPT_NODE_ID
}

export function createAddNodePromptNode(): Node {
  return {
    id: ADD_NODE_PROMPT_NODE_ID,
    type: ADD_NODE_PROMPT_NODE_TYPE,
    position: { x: 0, y: 0 },
    data: {},
    draggable: false,
  }
}

type DiagramParameter =
  | NodeFormData['parameters'][number]
  | TemplateTestCaseNodeData['parameters'][number]

type DiagramNodeOrder = NodeOrderMap | TemplateTestCaseNodeOrderMap
type FlowNodeData = {
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

function toSerializableParameters(parameters: NodeFormData['parameters']) {
  return parameters.map(parameter => ({
    name: parameter.name,
    value: parameter.value,
    type: parameter.type ?? StepParameterType.STRING,
    order: parameter.order,
  }))
}

function toDiagramNodeOrderEntry(node: Node, order: number) {
  return {
    order,
    label: node.data.label as string,
    gherkinStep: (node.data.gherkinStep as string) ?? '',
    isFirstNode: (node.data.isFirstNode as boolean) ?? false,
    icon: (node.data.icon as string) ?? '',
    parameters: toSerializableParameters((node.data.parameters as NodeFormData['parameters']) ?? []),
    templateStepId: (node.data.templateStepId as string) ?? '',
  }
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

export function generateInitialNodesAndEdges(
  nodeOrder: DiagramNodeOrder,
  templateStepParams: TemplateStepParameter[],
  defaultValueInput: boolean,
) {
  if (Object.keys(nodeOrder).length === 0) {
    return { nodes: [createAddNodePromptNode()], edges: [] as Edge[] }
  }

  const nodes: Node[] = []
  const edges: Edge[] = []

  const sortedEntries = Object.entries(nodeOrder).sort(([, left], [, right]) => left.order - right.order)

  sortedEntries.forEach(([id, nodeData], index) => {
    const data = buildFlowNodeData(nodeData, templateStepParams, defaultValueInput)

    if (nodeData.order === -1) {
      nodes.push({
        id,
        data,
        position: { x: 0, y: index * 100 },
        type: 'optionsHeaderNode',
      })
      return
    }

    nodes.push({
      id,
      data,
      position: { x: nodeData.order * 500, y: 0 },
      type: 'optionsHeaderNode',
    })

    if (index < sortedEntries.length - 1) {
      const nextEntry = sortedEntries[index + 1]
      if (nodeData.order !== -1 && nextEntry[1].order !== -1 && nodeData.order === nextEntry[1].order - 1) {
        edges.push({
          id: `${id}-${nextEntry[0]}`,
          source: id,
          target: nextEntry[0],
          type: 'buttonEdge',
        })
      }
    }
  })

  return { nodes, edges }
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

export function getTemplateStepIcon(templateSteps: TemplateStep[], templateStepId: string) {
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

export function determineNodeOrders(nodes: Node[], edges: Edge[]): NodeOrderMap {
  const realNodes = nodes.filter(node => !isAddNodePromptNode(node))

  const graph: Record<string, string[]> = {}
  const inDegree: Record<string, number> = {}
  const hasConnections: Record<string, boolean> = {}
  const nodeIds = new Set(realNodes.map(node => node.id))

  realNodes.forEach(node => {
    graph[node.id] = []
    inDegree[node.id] = 0
    hasConnections[node.id] = false
  })

  edges.forEach(edge => {
    if (edge.source && edge.target && nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      graph[edge.source].push(edge.target)
      inDegree[edge.target] = (inDegree[edge.target] || 0) + 1
      hasConnections[edge.source] = true
      hasConnections[edge.target] = true
    }
  })

  const queue = realNodes.map(node => node.id).filter(nodeId => inDegree[nodeId] === 0 && hasConnections[nodeId])

  const orders: NodeOrderMap = {}
  let orderNumber = 1

  realNodes.forEach(node => {
    if (!hasConnections[node.id]) {
      orders[node.id] = toDiagramNodeOrderEntry(node, -1)
    }
  })

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId) {
      break
    }

    const currentNode = realNodes.find(node => node.id === currentId)
    if (!currentNode) {
      continue
    }

    orders[currentId] = toDiagramNodeOrderEntry(currentNode, orderNumber++)

    graph[currentId].forEach(neighborId => {
      inDegree[neighborId]--
      if (inDegree[neighborId] === 0) {
        queue.push(neighborId)
      }
    })
  }

  realNodes.forEach(node => {
    if (!orders[node.id]) {
      orders[node.id] = toDiagramNodeOrderEntry(node, orderNumber++)
    }
  })

  return orders
}

export function removeOrphanedEdges(nodes: Node[], edges: Edge[]) {
  const nodeIds = new Set(nodes.map(node => node.id))
  return edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
}

export function isValidDiagramConnection(edges: Edge[], connection: Connection | Edge) {
  const hasSourceConnection = edges.some(edge => edge.source === connection.source)
  const hasTargetConnection = edges.some(edge => edge.target === connection.target)
  const isReconnecting = edges.some(edge => edge.source === connection.source && edge.target === connection.target)

  return isReconnecting || (!hasSourceConnection && !hasTargetConnection)
}
