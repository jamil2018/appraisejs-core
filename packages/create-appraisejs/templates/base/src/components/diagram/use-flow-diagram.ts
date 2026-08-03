'use client'

import { applyNodeChanges, type Connection, type Edge, type Node, type NodeChange } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'

import type { FlowBlock } from '@/types/diagram/diagram'

import type { AuthoredFlow } from './authored-flow-model'
import { groupedNodeIds, updatedFlowBlockMembership } from './authored-flow-blocks'
import type { DiagramNodeData } from './flow-diagram-surface'
import type { FlowInvocationController } from './flow-invocation-controller'

type FlowGraphOptions = {
  flow: AuthoredFlow
  controller: Pick<FlowInvocationController, 'flowBlocks' | 'removeNode' | 'moveNode' | 'reorderNodes'>
  onEdit: (nodeId: string) => void
  onInsert: (nodeId: string) => void
}

function distinctBlockMembership(blocks: FlowBlock[]): Map<string, string> {
  const memberships = new Map<string, string>()
  blocks.forEach(block => block.nodeIds.forEach(nodeId => memberships.set(nodeId, block.id)))
  return memberships
}

function displayParameterValue(value: unknown): string {
  if (typeof value === 'string') return value || 'Not set'
  if (value === undefined) return 'Not set'
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

export function isValidFlowConnection(
  connection: Pick<Connection, 'source' | 'target'>,
  membership: ReadonlyMap<string, string>,
): boolean {
  if (!connection.source || !connection.target || connection.source === connection.target) return false
  return membership.get(connection.source) === membership.get(connection.target)
}

function flowNodes(
  flow: AuthoredFlow,
  onEdit: (nodeId: string) => void,
  onInsert: (nodeId: string) => void,
  onRemove: (nodeId: string) => void,
  blockMembership: ReadonlyMap<string, string>,
  blockNames: ReadonlyMap<string, string>,
  positions: Record<string, { x: number; y: number }>,
  measurements: Record<string, Node<DiagramNodeData>['measured']>,
): Node<DiagramNodeData>[] {
  return flow.map((item, index) => ({
    id: item.nodeId,
    type: 'flowStep',
    focusable: true,
    ariaLabel: `${item.node.label} flow step`,
    position: positions[item.nodeId] ?? { x: index * 520, y: 80 },
    measured: measurements[item.nodeId],
    data: {
      label: item.node.label,
      gherkinStep: item.node.gherkinStep,
      parameters: Object.entries(item.node.invocation.inputs).map(([name, value]) => ({
        name,
        value: displayParameterValue(value),
      })),
      onEdit,
      onInsert,
      onRemove,
      hasIncomingConnector: index > 0,
      hasOutgoingConnector: true,
      blockId: blockMembership.get(item.nodeId),
      blockName: blockNames.get(blockMembership.get(item.nodeId) ?? ''),
    },
  }))
}

function flowEdges(flow: AuthoredFlow): Edge[] {
  return flow.slice(1).map((item, index) => ({
    id: `${flow[index]!.nodeId}-${item.nodeId}`,
    source: flow[index]!.nodeId,
    target: item.nodeId,
  }))
}

function useFlowCanvasState() {
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({})
  const [nodeMeasurements, setNodeMeasurements] = useState<Record<string, Node<DiagramNodeData>['measured']>>({})
  const resetNodePositions = useCallback(() => setNodePositions({}), [])
  return { nodePositions, nodeMeasurements, setNodePositions, setNodeMeasurements, resetNodePositions }
}

function useFlowNodeChanges(
  nodes: Node<DiagramNodeData>[],
  setNodePositions: Dispatch<SetStateAction<Record<string, { x: number; y: number }>>>,
  setNodeMeasurements: Dispatch<SetStateAction<Record<string, Node<DiagramNodeData>['measured']>>>,
) {
  const onNodesChange = useCallback(
    (changes: NodeChange<Node<DiagramNodeData>>[]) => {
      const changedNodes = applyNodeChanges(changes, nodes)
      setNodePositions(() =>
        Object.fromEntries(changedNodes.map(node => [node.id, { x: node.position.x, y: node.position.y }])),
      )
      setNodeMeasurements(current => ({
        ...current,
        ...Object.fromEntries(changedNodes.flatMap(node => (node.measured ? [[node.id, node.measured]] : []))),
      }))
    },
    [nodes, setNodeMeasurements, setNodePositions],
  )
  return onNodesChange
}

function nodeIdsOrderedByPosition(flow: AuthoredFlow, positions: Record<string, { x: number; y: number }>): string[] {
  return [...flow]
    .sort((left, right) => {
      const leftPosition = positions[left.nodeId] ?? { x: left.node.order, y: 0 }
      const rightPosition = positions[right.nodeId] ?? { x: right.node.order, y: 0 }
      return leftPosition.x - rightPosition.x || leftPosition.y - rightPosition.y
    })
    .map(item => item.nodeId)
}

function useFlowDragOrdering(
  flow: AuthoredFlow,
  nodePositions: Record<string, { x: number; y: number }>,
  reorderNodes: (nodeIds: string[]) => void,
) {
  return useCallback(
    (_event: unknown, node: Node<DiagramNodeData>) => {
      const nodeIds = nodeIdsOrderedByPosition(flow, { ...nodePositions, [node.id]: node.position })
      if (nodeIds.every((nodeId, index) => nodeId === flow[index]!.nodeId)) return
      reorderNodes(nodeIds)
    },
    [flow, nodePositions, reorderNodes],
  )
}

function useFlowConnections(
  membership: ReadonlyMap<string, string>,
  moveNode: (nodeId: string, afterNodeId: string | null) => void,
  resetNodePositions: () => void,
) {
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => isValidFlowConnection(connection, membership),
    [membership],
  )
  const publishConnection = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || !isValidConnection(connection)) return
      resetNodePositions()
      moveNode(connection.target, connection.source)
    },
    [isValidConnection, moveNode, resetNodePositions],
  )
  const onConnect = useCallback((connection: Connection) => publishConnection(connection), [publishConnection])
  const onReconnect = useCallback(
    (_edge: Edge, connection: Connection) => publishConnection(connection),
    [publishConnection],
  )
  return { isValidConnection, onConnect, onReconnect }
}

export function useFlowGraph({ flow, controller, onEdit, onInsert }: FlowGraphOptions) {
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const membership = useMemo(() => distinctBlockMembership(controller.flowBlocks), [controller.flowBlocks])
  const blockNames = useMemo(
    () => new Map(controller.flowBlocks.map(block => [block.id, block.name])),
    [controller.flowBlocks],
  )
  const { nodePositions, nodeMeasurements, setNodePositions, setNodeMeasurements, resetNodePositions } =
    useFlowCanvasState()
  const moveNode = useCallback(
    (nodeId: string, afterNodeId: string | null) => {
      resetNodePositions()
      controller.moveNode(nodeId, afterNodeId)
    },
    [controller, resetNodePositions],
  )
  const nodes = useMemo(
    () =>
      flowNodes(flow, onEdit, onInsert, controller.removeNode, membership, blockNames, nodePositions, nodeMeasurements),
    [blockNames, controller.removeNode, flow, membership, nodeMeasurements, nodePositions, onEdit, onInsert],
  )
  const onNodesChange = useFlowNodeChanges(nodes, setNodePositions, setNodeMeasurements)
  const edges = useMemo(() => flowEdges(flow), [flow])
  const { isValidConnection, onConnect, onReconnect } = useFlowConnections(membership, moveNode, resetNodePositions)
  const onNodeDragStop = useFlowDragOrdering(flow, nodePositions, controller.reorderNodes)
  const onSelectionChange = useCallback(({ nodes: selected }: { nodes: Node[] }) => {
    const nextIds = selected.map(node => node.id)
    setSelectedNodeIds(current => (current.join('|') === nextIds.join('|') ? current : nextIds))
  }, [])
  const clearSelection = useCallback(() => setSelectedNodeIds([]), [])

  return {
    nodes,
    edges,
    flowBlocks: controller.flowBlocks,
    membership,
    selectedNodeIds,
    isValidConnection,
    onConnect,
    onReconnect,
    onNodesChange,
    onNodeDragStop,
    moveNode,
    onSelectionChange,
    clearSelection,
  }
}

type FlowBlocksOptions = {
  flowBlocks: FlowBlock[]
  flow: AuthoredFlow
  selectedNodeIds: string[]
  updateFlowBlocks: (flowBlocks: FlowBlock[]) => void
  clearSelection: () => void
}

export function useFlowBlocks({
  flow,
  flowBlocks,
  selectedNodeIds,
  updateFlowBlocks,
  clearSelection,
}: FlowBlocksOptions) {
  const [blockName, setBlockName] = useState('')
  const createBlock = useCallback(() => {
    if (selectedNodeIds.length < 2) return
    const nodeIds = groupedNodeIds(flow, selectedNodeIds, flowBlocks)
    if (!nodeIds) return
    updateFlowBlocks([...flowBlocks, { id: crypto.randomUUID(), name: blockName, nodeIds }])
    setBlockName('')
    clearSelection()
  }, [blockName, clearSelection, flow, flowBlocks, selectedNodeIds, updateFlowBlocks])
  const renameBlock = useCallback(
    (blockId: string, name: string) => {
      const nextBlocks = flowBlocks.map(block => (block.id === blockId ? { ...block, name } : block))
      updateFlowBlocks(nextBlocks)
    },
    [flowBlocks, updateFlowBlocks],
  )
  const deleteBlock = useCallback(
    (blockId: string) => updateFlowBlocks(flowBlocks.filter(block => block.id !== blockId)),
    [flowBlocks, updateFlowBlocks],
  )
  const updateMembership = useCallback(
    (blockId: string, nodeIds: string[]) => {
      const nextBlocks = updatedFlowBlockMembership(flow, flowBlocks, blockId, nodeIds)
      if (nextBlocks) updateFlowBlocks(nextBlocks)
    },
    [flow, flowBlocks, updateFlowBlocks],
  )

  return { blockName, setBlockName, createBlock, renameBlock, deleteBlock, updateMembership }
}

export function useFlowNodeSearch(flow: AuthoredFlow) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return []
    return flow.filter(item =>
      `${item.node.label} ${item.node.gherkinStep ?? ''}`.toLowerCase().includes(normalizedQuery),
    )
  }, [flow, query])
  const close = useCallback(() => setIsOpen(false), [])

  return { isOpen, setIsOpen, query, setQuery, results, close }
}

function graphShortcut(event: KeyboardEvent): 'search' | 'insert' | undefined {
  const isModified = (event.metaKey || event.ctrlKey) && event.shiftKey
  const isEditableTarget =
    event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')
  if (!isModified || isEditableTarget) return undefined
  return event.key.toLowerCase() === 's' ? 'search' : event.key.toLowerCase() === 'c' ? 'insert' : undefined
}

export function useFlowGraphShortcuts({
  lastNodeId,
  toggleSearch,
  startInserting,
}: {
  lastNodeId?: string
  toggleSearch: () => void
  startInserting: (afterNodeId: string | null) => void
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = graphShortcut(event)
      if (!shortcut) return
      event.preventDefault()
      if (shortcut === 'search') toggleSearch()
      else startInserting(lastNodeId ?? null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lastNodeId, startInserting, toggleSearch])
}
