import type { FlowBlock } from '@/types/diagram/diagram'

import type { AuthoredFlow } from './authored-flow-model'

function nodeIndexById(flow: AuthoredFlow): Map<string, number> {
  return new Map(flow.map((item, index) => [item.nodeId, index]))
}

function contiguousNodeIds(nodeIds: string[], indexes: Map<string, number>): string[] | null {
  const unique = Array.from(new Set(nodeIds))
  const ordered = unique
    .map(nodeId => ({ nodeId, index: indexes.get(nodeId) }))
    .filter((item): item is { nodeId: string; index: number } => item.index !== undefined)
    .sort((left, right) => left.index - right.index)
  if (ordered.length < 2 || ordered.length !== unique.length) return null
  return ordered.every((item, index) => index === 0 || item.index === ordered[index - 1]!.index + 1)
    ? ordered.map(item => item.nodeId)
    : null
}

export function normalizeAuthoredFlowBlocks(flow: AuthoredFlow, flowBlocks: FlowBlock[]): FlowBlock[] {
  const indexes = nodeIndexById(flow)
  const assignedNodeIds = new Set<string>()
  return flowBlocks.flatMap(block => {
    const nodeIds = contiguousNodeIds(block.nodeIds, indexes)
    if (!nodeIds || nodeIds.some(nodeId => assignedNodeIds.has(nodeId))) return []
    nodeIds.forEach(nodeId => assignedNodeIds.add(nodeId))
    return [{ id: block.id, name: block.name.trim() || 'Untitled block', nodeIds }]
  })
}

export function groupedNodeIds(
  flow: AuthoredFlow,
  selectedNodeIds: string[],
  flowBlocks: FlowBlock[],
): string[] | null {
  const membership = new Set(flowBlocks.flatMap(block => block.nodeIds))
  if (selectedNodeIds.some(nodeId => membership.has(nodeId))) return null
  return contiguousNodeIds(selectedNodeIds, nodeIndexById(flow))
}

export function updatedFlowBlockMembership(
  flow: AuthoredFlow,
  flowBlocks: FlowBlock[],
  blockId: string,
  selectedNodeIds: string[],
): FlowBlock[] | null {
  const block = flowBlocks.find(candidate => candidate.id === blockId)
  if (!block) return null
  const otherBlocks = flowBlocks.filter(candidate => candidate.id !== blockId)
  const nodeIds = groupedNodeIds(flow, selectedNodeIds, otherBlocks)
  if (!nodeIds) return null
  return normalizeAuthoredFlowBlocks(
    flow,
    flowBlocks.map(candidate => (candidate.id === blockId ? { ...candidate, nodeIds } : candidate)),
  )
}
