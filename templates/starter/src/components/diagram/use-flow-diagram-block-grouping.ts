'use client'

import { useCallback, useMemo, useState } from 'react'
import type { Node } from '@xyflow/react'
import type { FlowBlock } from '@/types/diagram/diagram'
import { getFlowBlockBounds, getFlowBlockMembershipMap, hasOrphanedFlowNode } from './flow-diagram-helpers'

type UseFlowDiagramBlockGroupingOptions = {
  enableNodeGrouping: boolean
  flowBlocks: FlowBlock[]
  nodes: Node[]
  edges: Parameters<typeof hasOrphanedFlowNode>[1]
  realNodeIds: Set<string>
  onFlowBlocksChange?: (flowBlocks: FlowBlock[]) => void
}

export function useFlowDiagramBlockGrouping({
  enableNodeGrouping,
  flowBlocks,
  nodes,
  edges,
  realNodeIds,
  onFlowBlocksChange,
}: UseFlowDiagramBlockGroupingOptions) {
  const [isGroupingSelectionMode, setIsGroupingSelectionMode] = useState(false)
  const [selectedGroupingNodeIds, setSelectedGroupingNodeIds] = useState<string[]>([])
  const [pendingBlockNodeIds, setPendingBlockNodeIds] = useState<string[]>([])
  const [blockName, setBlockName] = useState('')
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false)

  const flowBlockMembership = useMemo(() => getFlowBlockMembershipMap(flowBlocks), [flowBlocks])
  const flowBlockBounds = useMemo(() => getFlowBlockBounds(nodes, flowBlocks), [nodes, flowBlocks])
  const hasOrphanedNodes = useMemo(() => hasOrphanedFlowNode(nodes, edges), [nodes, edges])
  const blockOrphanedNodeMessage = 'Connect or remove orphaned nodes before creating a block.'

  const openCreateBlockDialog = useCallback(() => {
    if (selectedGroupingNodeIds.length < 2 || hasOrphanedNodes) {
      return
    }

    setPendingBlockNodeIds(selectedGroupingNodeIds)
    setEditingBlockId(null)
    setBlockName('')
    setIsBlockDialogOpen(true)
  }, [hasOrphanedNodes, selectedGroupingNodeIds])

  const openRenameBlockDialog = useCallback((block: FlowBlock) => {
    setPendingBlockNodeIds(block.nodeIds)
    setEditingBlockId(block.id)
    setBlockName(block.name)
    setIsBlockDialogOpen(true)
  }, [])

  const handleBlockDialogSubmit = useCallback(() => {
    const name = blockName.trim() || 'Untitled block'
    if (editingBlockId) {
      onFlowBlocksChange?.(flowBlocks.map(block => (block.id === editingBlockId ? { ...block, name } : block)))
    } else {
      onFlowBlocksChange?.([
        ...flowBlocks,
        {
          id: crypto.randomUUID(),
          name,
          nodeIds: pendingBlockNodeIds.filter(nodeId => realNodeIds.has(nodeId)),
        },
      ])
    }
    setIsBlockDialogOpen(false)
    setBlockName('')
    setPendingBlockNodeIds([])
    setEditingBlockId(null)
    setSelectedGroupingNodeIds([])
  }, [blockName, editingBlockId, flowBlocks, onFlowBlocksChange, pendingBlockNodeIds, realNodeIds])

  const deleteBlock = useCallback(
    (blockId: string) => {
      onFlowBlocksChange?.(flowBlocks.filter(block => block.id !== blockId))
    },
    [flowBlocks, onFlowBlocksChange],
  )

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[] }) => {
      if (!enableNodeGrouping || !isGroupingSelectionMode) {
        return
      }

      const selectedIds = selectedNodes.reduce<string[]>((nodeIds, node) => {
        if (realNodeIds.has(node.id) && !flowBlockMembership.has(node.id)) {
          nodeIds.push(node.id)
        }

        return nodeIds
      }, [])

      setSelectedGroupingNodeIds(current =>
        current.length === selectedIds.length && current.every((nodeId, index) => nodeId === selectedIds[index])
          ? current
          : selectedIds,
      )
    },
    [enableNodeGrouping, flowBlockMembership, isGroupingSelectionMode, realNodeIds],
  )

  const toggleGroupingSelectionMode = useCallback(() => {
    setIsGroupingSelectionMode(current => !current)
    setSelectedGroupingNodeIds(current => (current.length === 0 ? current : []))
  }, [])

  return {
    flowBlockMembership,
    flowBlockBounds,
    hasOrphanedNodes,
    blockOrphanedNodeMessage,
    isGroupingSelectionMode,
    selectedGroupingNodeIds,
    isBlockDialogOpen,
    setIsBlockDialogOpen,
    editingBlockId,
    blockName,
    setBlockName,
    openCreateBlockDialog,
    openRenameBlockDialog,
    handleBlockDialogSubmit,
    deleteBlock,
    handleSelectionChange,
    toggleGroupingSelectionMode,
  }
}
