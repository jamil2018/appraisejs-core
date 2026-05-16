'use client'

import { addEdge, type Connection, type Edge, type Node, useEdgesState, useNodesState } from '@xyflow/react'
import type { ReactFlowInstance } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flowEdgeMutationGuardRef } from './button-edge'
import type { NodeFormData } from '@/constants/form-opts/diagram/node-form'
import type { FlowDiagramProps } from './flow-diagram-types'
import { EMPTY_FLOW_BLOCKS } from './flow-diagram-types'
import type { InlineLocatorSaveResult } from '@/app/(base)/locators/create/create-locator-workspace-helpers'
import { toast } from '@/hooks/use-toast'
import {
  buildNodeFormData,
  createAddNodePromptNode,
  createEditableNodeData,
  determineNodeOrders,
  generateInitialNodesAndEdges,
  isAddNodePromptNode,
  isEdgeWithinSameFlowBlock,
  isValidDiagramConnection,
  removeOrphanedEdges,
} from './flow-diagram-helpers'
import {
  createOnConnectHandler,
  filterBlockedEdgeChanges,
  filterBlockedNodeChanges,
  isValidFlowDiagramConnection,
  syncFlowNodePresentationMetadata,
} from './flow-diagram-connection-guards'
import { flowDiagramHandlersRef, flowEdgeTypes, flowNodeTypes } from './flow-diagram-node-types'
import { useFlowDiagramBlockGrouping } from './use-flow-diagram-block-grouping'
import { useFlowDiagramSearch } from './use-flow-diagram-search'

function mergeRecordsById<T extends { id: string }>(base: T[], overrides: T[]): T[] {
  const byId = new Map<string, T>()
  for (const item of base) {
    byId.set(item.id, item)
  }
  for (const item of overrides) {
    byId.set(item.id, item)
  }
  return [...byId.values()]
}

export function useFlowDiagram({
  nodeOrder,
  templateStepParams,
  templateSteps,
  locators,
  locatorGroups,
  environments,
  modules,
  onNodeOrderChange,
  defaultValueInput = false,
  enableNodeSearch = false,
  enableNodeGrouping = false,
  flowBlocks = EMPTY_FLOW_BLOCKS,
  layoutRefreshKey,
  onFlowBlocksChange,
}: FlowDiagramProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => generateInitialNodesAndEdges(nodeOrder, templateStepParams, defaultValueInput),
    [defaultValueInput, nodeOrder, templateStepParams],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [showAddNodeDialog, setShowAddNodeDialog] = useState(false)
  const [showEditNodeDialog, setShowEditNodeDialog] = useState(false)
  const [editNodeId, setEditNodeId] = useState<string | null>(null)
  const [editNodeData, setEditNodeData] = useState<NodeFormData | null>(null)
  const [pendingAddSourceNodeId, setPendingAddSourceNodeId] = useState<string | null>(null)
  const isConnectionInProgressRef = useRef(false)
  const [pendingLocators, setPendingLocators] = useState<FlowDiagramProps['locators']>([])
  const [pendingLocatorGroups, setPendingLocatorGroups] = useState<FlowDiagramProps['locatorGroups']>([])
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null)
  const flowContainerRef = useRef<HTMLDivElement | null>(null)
  const onNodeOrderChangeRef = useRef(onNodeOrderChange)
  useEffect(() => {
    onNodeOrderChangeRef.current = onNodeOrderChange
  }, [onNodeOrderChange])
  const edgeTypes = useMemo(() => flowEdgeTypes, [])
  const nodeTypes = useMemo(() => flowNodeTypes, [])

  const mergedLocators = useMemo(() => mergeRecordsById(locators, pendingLocators), [locators, pendingLocators])
  const mergedLocatorGroups = useMemo(
    () => mergeRecordsById(locatorGroups, pendingLocatorGroups),
    [locatorGroups, pendingLocatorGroups],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prune optimistic rows once server props include them
    setPendingLocators(prev => prev.filter(p => !locators.some(l => l.id === p.id)))
  }, [locators])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prune optimistic rows once server props include them
    setPendingLocatorGroups(prev => prev.filter(p => !locatorGroups.some(g => g.id === p.id)))
  }, [locatorGroups])

  const handleEditNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find(node => node.id === nodeId)
      const editableNodeData = createEditableNodeData(node)
      if (!editableNodeData) {
        return
      }

      setEditNodeData(editableNodeData)
      setEditNodeId(nodeId)
      setShowEditNodeDialog(true)
    },
    [nodes],
  )

  const layoutRefreshNodeIds = useMemo(
    () =>
      nodes.reduce<string[]>((nodeIds, node) => {
        if (!isAddNodePromptNode(node)) {
          nodeIds.push(node.id)
        }

        return nodeIds
      }, []),
    [nodes],
  )
  const realNodeIds = useMemo(() => new Set(layoutRefreshNodeIds), [layoutRefreshNodeIds])
  const blockTopologyMessage = 'Remove flow blocks before changing flow structure.'

  const showTopologyBlockedToast = useCallback(() => {
    toast({
      title: 'Flow structure locked',
      description: blockTopologyMessage,
      variant: 'destructive',
    })
  }, [])

  const search = useFlowDiagramSearch({
    enableNodeSearch,
    nodes,
    onEditNode: handleEditNode,
    flowInstanceRef,
  })

  const grouping = useFlowDiagramBlockGrouping({
    enableNodeGrouping,
    flowBlocks,
    nodes,
    edges,
    realNodeIds,
    onFlowBlocksChange,
  })

  const { flowBlockMembership } = grouping
  const { searchHighlightedNodeId } = search

  useEffect(() => {
    flowDiagramHandlersRef.current.onEditNode = handleEditNode
    flowDiagramHandlersRef.current.onOpenAddNode = sourceNodeId => {
      setPendingAddSourceNodeId(sourceNodeId ?? null)
      setShowAddNodeDialog(true)
    }
    flowEdgeMutationGuardRef.current = {
      isEdgeDeleteBlocked: edge => isEdgeWithinSameFlowBlock(edge, flowBlockMembership),
      isNodeDeleteBlocked: nodeId => flowBlockMembership.has(nodeId),
      onBlocked: showTopologyBlockedToast,
    }
  }, [flowBlockMembership, handleEditNode, showTopologyBlockedToast])

  const addNode = useCallback(
    (formData: NodeFormData) => {
      const realCount = nodes.filter(n => !isAddNodePromptNode(n)).length
      const sourceNode = pendingAddSourceNodeId ? nodes.find(node => node.id === pendingAddSourceNodeId) : undefined
      const newNodeId = crypto.randomUUID()
      const newNode: Node = {
        id: newNodeId,
        data: buildNodeFormData(formData, templateSteps, templateStepParams, defaultValueInput, realCount === 0),
        position: sourceNode ? { x: sourceNode.position.x + 500, y: sourceNode.position.y } : { x: 0, y: 0 },
        type: 'optionsHeaderNode',
      }
      const connectedEdge: Edge | null =
        sourceNode && pendingAddSourceNodeId
          ? {
              id: `${pendingAddSourceNodeId}-${newNodeId}`,
              source: pendingAddSourceNodeId,
              target: newNodeId,
              type: 'buttonEdge',
            }
          : null
      setNodes(nds => nds.filter(n => !isAddNodePromptNode(n)).concat(newNode))
      if (connectedEdge && isValidDiagramConnection(edges, connectedEdge)) {
        setEdges(eds => addEdge(connectedEdge, eds))
      }
      setShowAddNodeDialog(false)
      setPendingAddSourceNodeId(null)
    },
    [setEdges, setNodes, nodes, edges, pendingAddSourceNodeId, templateSteps, templateStepParams, defaultValueInput],
  )

  const handleEditNodeSubmit = useCallback(
    (formData: NodeFormData) => {
      if (!editNodeId) return
      const nextNodeData = buildNodeFormData(formData, templateSteps, templateStepParams, defaultValueInput, false)

      setNodes(nds =>
        nds.map(node =>
          node.id === editNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...nextNodeData,
                },
              }
            : node,
        ),
      )
      setShowEditNodeDialog(false)
    },
    [editNodeId, setNodes, templateSteps, templateStepParams, defaultValueInput],
  )

  useEffect(() => {
    onNodeOrderChangeRef.current(determineNodeOrders(nodes, edges))
  }, [nodes, edges])

  useEffect(() => {
    const hasRealNode = nodes.some(n => !isAddNodePromptNode(n))
    if (hasRealNode) {
      return
    }
    const hasPrompt = nodes.some(n => isAddNodePromptNode(n))
    if (hasPrompt) {
      return
    }
    setNodes([createAddNodePromptNode()])
  }, [nodes, setNodes])

  useEffect(() => {
    const nextEdges = removeOrphanedEdges(nodes, edges)

    if (nextEdges.length !== edges.length) {
      setEdges(nextEdges)
    }
  }, [nodes, edges, setEdges])

  const syncNodePresentationMetadata = useCallback(() => {
    setNodes(currentNodes =>
      syncFlowNodePresentationMetadata(
        currentNodes,
        edges,
        flowBlockMembership,
        searchHighlightedNodeId,
        isConnectionInProgressRef.current,
      ),
    )
  }, [edges, flowBlockMembership, searchHighlightedNodeId, setNodes])

  useEffect(() => {
    syncNodePresentationMetadata()
  }, [nodes, edges, flowBlockMembership, searchHighlightedNodeId, syncNodePresentationMetadata])

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => isValidFlowDiagramConnection(connection, edges, flowBlockMembership),
    [edges, flowBlockMembership],
  )

  const onConnect = useMemo(
    () => createOnConnectHandler(edges, flowBlockMembership, setEdges, showTopologyBlockedToast),
    [edges, flowBlockMembership, setEdges, showTopologyBlockedToast],
  )

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      const { blockedDeleteIds, allowedChanges } = filterBlockedEdgeChanges(changes, edges, flowBlockMembership)

      if (blockedDeleteIds.size > 0) {
        showTopologyBlockedToast()
      }

      onEdgesChange(allowedChanges)
    },
    [edges, flowBlockMembership, onEdgesChange, showTopologyBlockedToast],
  )

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      const { blockedDeleteIds, allowedChanges } = filterBlockedNodeChanges(changes, flowBlockMembership)

      if (blockedDeleteIds.size > 0) {
        showTopologyBlockedToast()
      }

      onNodesChange(allowedChanges)
    },
    [flowBlockMembership, onNodesChange, showTopologyBlockedToast],
  )

  const handleConnectStart = useCallback(() => {
    isConnectionInProgressRef.current = true
    syncNodePresentationMetadata()
  }, [syncNodePresentationMetadata])

  const handleConnectEnd = useCallback(() => {
    isConnectionInProgressRef.current = false
    syncNodePresentationMetadata()
  }, [syncNodePresentationMetadata])

  const memoizedTemplateSteps = useMemo(() => templateSteps, [templateSteps])
  const memoizedTemplateStepParams = useMemo(() => templateStepParams, [templateStepParams])

  const handleLocatorCreated = useCallback((result: InlineLocatorSaveResult) => {
    setPendingLocatorGroups(current => {
      const nextGroup = {
        id: result.locatorGroupId,
        name: result.locatorGroupName,
        route: result.route,
        moduleId: result.moduleId,
      }

      return current.some(group => group.id === result.locatorGroupId)
        ? current.map(group => (group.id === result.locatorGroupId ? { ...group, ...nextGroup } : group))
        : [...current, nextGroup]
    })

    setPendingLocators(current => {
      const nextLocator = {
        id: result.locatorId,
        name: result.locatorName,
        locatorGroupId: result.locatorGroupId,
      }

      return current.some(locator => locator.id === result.locatorId)
        ? current.map(locator => (locator.id === result.locatorId ? { ...locator, ...nextLocator } : locator))
        : [...current, nextLocator]
    })
  }, [])

  const openAddNodeDialog = useCallback(() => {
    setPendingAddSourceNodeId(null)
    setShowAddNodeDialog(true)
  }, [])


return {
    enableNodeSearch,
    enableNodeGrouping,
    defaultValueInput,
    environments,
    modules,
    layoutRefreshKey,
    search,
    grouping,
    flowContainerRef,
    flowInstanceRef,
    nodes,
    handleNodesChange,
    edges,
    handleEdgesChange,
    onConnect,
    handleConnectStart,
    handleConnectEnd,
    edgeTypes,
    nodeTypes,
    isValidConnection,
    layoutRefreshNodeIds,
    openAddNodeDialog,
    addNode,
    handleEditNodeSubmit,
    showAddNodeDialog,
    setShowAddNodeDialog,
    showEditNodeDialog,
    setShowEditNodeDialog,
    editNodeData,
    memoizedTemplateSteps,
    memoizedTemplateStepParams,
    mergedLocators,
    mergedLocatorGroups,
    handleLocatorCreated,
  }
}
