import type { Connection, Edge, Node } from '@xyflow/react'
import type { TemplateStepParameter } from '@prisma/client'

import type { NodeData as NodeFormData } from '@/constants/form-opts/diagram/node-form'
import type { NodeOrderMap } from '@/types/diagram/diagram'

import { createAddNodePromptNode, isAddNodePromptNode } from './flow-add-node-prompt-helpers'
import { buildFlowNodeData, type DiagramNodeOrder, toSerializableParameters } from './flow-node-data-helpers'

function toDiagramNodeOrderEntry(node: Node, order: number) {
  return {
    nodeId: node.id,
    order,
    label: node.data.label as string,
    gherkinStep: (node.data.gherkinStep as string) ?? '',
    isFirstNode: (node.data.isFirstNode as boolean) ?? false,
    icon: (node.data.icon as string) ?? '',
    parameters: toSerializableParameters((node.data.parameters as NodeFormData['parameters']) ?? []),
    templateStepId: (node.data.templateStepId as string) ?? '',
  }
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

export function determineStartNodeIds(nodes: Node[], edges: Edge[]) {
  const realNodes = nodes.filter(node => !isAddNodePromptNode(node))

  const nodeIds = new Set(realNodes.map(node => node.id))
  const inDegree: Record<string, number> = {}
  const hasConnections: Record<string, boolean> = {}

  realNodes.forEach(node => {
    inDegree[node.id] = 0
    hasConnections[node.id] = false
  })

  edges.forEach(edge => {
    if (edge.source && edge.target && nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      inDegree[edge.target] = (inDegree[edge.target] || 0) + 1
      hasConnections[edge.source] = true
      hasConnections[edge.target] = true
    }
  })

  const startCandidates = realNodes
    .filter(node => inDegree[node.id] === 0 && hasConnections[node.id])
    .map(node => node.id)

  if (startCandidates.length !== 1) {
    return new Set<string>()
  }

  return new Set(startCandidates)
}

export function isValidDiagramConnection(edges: Edge[], connection: Connection | Edge) {
  const hasSourceConnection = edges.some(edge => edge.source === connection.source)
  const hasTargetConnection = edges.some(edge => edge.target === connection.target)
  const isReconnecting = edges.some(edge => edge.source === connection.source && edge.target === connection.target)

  return isReconnecting || (!hasSourceConnection && !hasTargetConnection)
}
