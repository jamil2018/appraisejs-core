import type { Edge, Node } from '@xyflow/react'

import type { FlowBlock } from '@/types/diagram/diagram'

import { isAddNodePromptNode } from './flow-add-node-prompt-helpers'

export type FlowBlockBounds = FlowBlock & {
  x: number
  y: number
  width: number
  height: number
}

export function normalizeFlowBlocks(flowBlocks: FlowBlock[], validNodeIds?: Set<string>): FlowBlock[] {
  return flowBlocks
    .map(block => {
      const nodeIds = Array.from(new Set(block.nodeIds.filter(nodeId => !validNodeIds || validNodeIds.has(nodeId))))
      return {
        id: block.id,
        name: block.name.trim() || 'Untitled block',
        nodeIds,
      }
    })
    .filter(block => block.nodeIds.length >= 2)
}

export function getFlowBlockMembershipMap(flowBlocks: FlowBlock[]) {
  const membership = new Map<string, string>()
  flowBlocks.forEach(block => {
    block.nodeIds.forEach(nodeId => membership.set(nodeId, block.id))
  })
  return membership
}

export function isEdgeWithinSameFlowBlock(
  edge: Pick<Edge, 'source' | 'target'>,
  flowBlockMembership: Map<string, string>,
) {
  const sourceBlockId = flowBlockMembership.get(edge.source)
  return Boolean(sourceBlockId && sourceBlockId === flowBlockMembership.get(edge.target))
}

export function hasOrphanedFlowNode(nodes: Node[], edges: Edge[]) {
  const realNodeIds = new Set(nodes.filter(node => !isAddNodePromptNode(node)).map(node => node.id))

  if (realNodeIds.size === 0) {
    return false
  }

  const connectedNodeIds = new Set<string>()
  edges.forEach(edge => {
    if (realNodeIds.has(edge.source) && realNodeIds.has(edge.target)) {
      connectedNodeIds.add(edge.source)
      connectedNodeIds.add(edge.target)
    }
  })

  return Array.from(realNodeIds).some(nodeId => !connectedNodeIds.has(nodeId))
}

export function getFlowBlockBounds(nodes: Node[], flowBlocks: FlowBlock[]): FlowBlockBounds[] {
  const nodeById = new Map(nodes.filter(node => !isAddNodePromptNode(node)).map(node => [node.id, node]))

  return normalizeFlowBlocks(flowBlocks, new Set(nodeById.keys())).flatMap(block => {
    const blockNodes = block.nodeIds.map(nodeId => nodeById.get(nodeId)).filter((node): node is Node => Boolean(node))
    if (blockNodes.length < 2) {
      return []
    }

    const padding = 32
    const minX = Math.min(...blockNodes.map(node => node.position.x))
    const minY = Math.min(...blockNodes.map(node => node.position.y))
    const maxX = Math.max(...blockNodes.map(node => node.position.x + (node.measured?.width ?? node.width ?? 260)))
    const maxY = Math.max(...blockNodes.map(node => node.position.y + (node.measured?.height ?? node.height ?? 160)))

    return [
      {
        ...block,
        x: minX - padding,
        y: minY - padding,
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2,
      },
    ]
  })
}
