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
import type { StepBlockEditorStep, StepBlockSubmitValue } from './flow-diagram-step-block-sheet'

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))
}

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
  parameterMode = 'values',
  enableNodeSearch = false,
  enableNodeGrouping = false,
  stepBlocks = [],
  flowBlocks = EMPTY_FLOW_BLOCKS,
  layoutRefreshKey,
  onFlowBlocksChange,
}: FlowDiagramProps) {
  const shouldSkipParameterValidation = defaultValueInput || parameterMode === 'hidden'
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => generateInitialNodesAndEdges(nodeOrder, templateStepParams, shouldSkipParameterValidation),
    [nodeOrder, shouldSkipParameterValidation, templateStepParams],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [showAddNodeDialog, setShowAddNodeDialog] = useState(false)
  const [showEditNodeDialog, setShowEditNodeDialog] = useState(false)
  const [showAddStepBlockDialog, setShowAddStepBlockDialog] = useState(false)
  const [showEditStepBlockDialog, setShowEditStepBlockDialog] = useState(false)
  const [editNodeId, setEditNodeId] = useState<string | null>(null)
  const [editNodeData, setEditNodeData] = useState<NodeFormData | null>(null)
  const [editStepBlockId, setEditStepBlockId] = useState<string | null>(null)
  const [editStepBlockName, setEditStepBlockName] = useState('')
  const [editStepBlockSteps, setEditStepBlockSteps] = useState<StepBlockEditorStep[]>([])
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
  const handleFlowInit = useCallback((instance: ReactFlowInstance) => {
    flowInstanceRef.current = instance
  }, [])

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
  const isBlockingFlowOverlayOpen = showEditNodeDialog || grouping.isBlockDialogOpen

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
        data: buildNodeFormData(
          formData,
          templateSteps,
          templateStepParams,
          shouldSkipParameterValidation,
          realCount === 0,
        ),
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
    [
      setEdges,
      setNodes,
      nodes,
      edges,
      pendingAddSourceNodeId,
      templateSteps,
      templateStepParams,
      shouldSkipParameterValidation,
    ],
  )

  const addStepBlock = useCallback(
    (value: StepBlockSubmitValue) => {
      const realNodes = nodes.filter(node => !isAddNodePromptNode(node))
      const sourceNode = realNodes.at(-1)
      const newNodes = value.steps.map((step, index) => {
        const nodeId = crypto.randomUUID()
        return {
          id: nodeId,
          data: buildNodeFormData(
            step,
            templateSteps,
            templateStepParams,
            shouldSkipParameterValidation,
            realNodes.length === 0,
          ),
          position: sourceNode
            ? { x: sourceNode.position.x + 500 * (index + 1), y: sourceNode.position.y }
            : { x: index * 500, y: 0 },
          type: 'optionsHeaderNode',
        } satisfies Node
      })

      const newEdges = newNodes.reduce<Edge[]>((blockEdges, node, index) => {
        const previousNodeId = index === 0 ? sourceNode?.id : newNodes[index - 1]?.id
        if (previousNodeId) {
          blockEdges.push({
            id: `${previousNodeId}-${node.id}`,
            source: previousNodeId,
            target: node.id,
            type: 'buttonEdge',
          })
        }
        return blockEdges
      }, [])

      setNodes(current => current.filter(node => !isAddNodePromptNode(node)).concat(newNodes))
      setEdges(current => [...current, ...newEdges])
      if (newNodes.length >= 2) {
        onFlowBlocksChange?.([
          ...flowBlocks,
          {
            id: crypto.randomUUID(),
            name: value.name,
            nodeIds: newNodes.map(node => node.id),
          },
        ])
      }
    },
    [
      flowBlocks,
      nodes,
      onFlowBlocksChange,
      setEdges,
      setNodes,
      shouldSkipParameterValidation,
      templateStepParams,
      templateSteps,
    ],
  )

  const openEditStepBlockDialog = useCallback(
    (block: { id: string; name: string; nodeIds: string[] }) => {
      const nodeById = new Map(nodes.map(node => [node.id, node]))
      const editableSteps = block.nodeIds.flatMap(nodeId => {
        const node = nodeById.get(nodeId)
        const editableNodeData = createEditableNodeData(node)
        const templateStep = templateSteps.find(step => step.id === editableNodeData?.templateStepId)
        if (!editableNodeData || !templateStep) {
          return []
        }

        return [
          {
            id: nodeId,
            templateStep: {
              ...templateStep,
              parameters: templateStepParams.filter(parameter => parameter.templateStepId === templateStep.id),
            },
            ...editableNodeData,
          },
        ]
      })

      if (editableSteps.length === 0) {
        return
      }

      setEditStepBlockId(block.id)
      setEditStepBlockName(block.name)
      setEditStepBlockSteps(editableSteps)
      setShowEditStepBlockDialog(true)
    },
    [nodes, templateStepParams, templateSteps],
  )

  const updateStepBlock = useCallback(
    (value: StepBlockSubmitValue) => {
      if (!editStepBlockId) {
        return
      }

      const targetBlock = flowBlocks.find(block => block.id === editStepBlockId)
      if (!targetBlock) {
        return
      }

      setNodes(current =>
        current.map(node => {
          const stepIndex = targetBlock.nodeIds.indexOf(node.id)
          const step = value.steps[stepIndex]
          if (stepIndex === -1 || !step) {
            return node
          }

          return {
            ...node,
            data: {
              ...node.data,
              ...buildNodeFormData(step, templateSteps, templateStepParams, shouldSkipParameterValidation, false),
            },
          }
        }),
      )
      onFlowBlocksChange?.(
        flowBlocks.map(block => (block.id === editStepBlockId ? { ...block, name: value.name } : block)),
      )
      setEditStepBlockId(null)
      setEditStepBlockName('')
      setEditStepBlockSteps([])
    },
    [
      editStepBlockId,
      flowBlocks,
      onFlowBlocksChange,
      setNodes,
      shouldSkipParameterValidation,
      templateStepParams,
      templateSteps,
    ],
  )

  const handleEditNodeSubmit = useCallback(
    (formData: NodeFormData) => {
      if (!editNodeId) return
      const nextNodeData = buildNodeFormData(
        formData,
        templateSteps,
        templateStepParams,
        shouldSkipParameterValidation,
        false,
      )

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
    [editNodeId, setNodes, templateSteps, templateStepParams, shouldSkipParameterValidation],
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

  const openAddStepBlockDialog = useCallback(() => {
    setShowAddStepBlockDialog(true)
  }, [])

  const toggleAddNodeDialog = useCallback(() => {
    setPendingAddSourceNodeId(null)
    setShowAddNodeDialog(current => !current)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !event.shiftKey || (!event.ctrlKey && !event.metaKey)) {
        return
      }

      const key = event.key.toLowerCase()
      const isFlowShortcut = key === 's' || key === 'b' || key === 'c'
      if (!isFlowShortcut) {
        return
      }

      const hasShortcutSurfaceOpen = search.isSearchOpen || showAddNodeDialog || grouping.isGroupingSelectionMode
      if (isBlockingFlowOverlayOpen || (isEditableShortcutTarget(event.target) && !hasShortcutSurfaceOpen)) {
        return
      }

      if (key === 's' && enableNodeSearch) {
        event.preventDefault()
        if (showAddNodeDialog) {
          setShowAddNodeDialog(false)
          setPendingAddSourceNodeId(null)
        }
        if (grouping.isGroupingSelectionMode) {
          grouping.toggleGroupingSelectionMode()
        }
        search.toggleSearch()
        return
      }

      if (key === 'c' && showAddNodeDialog) {
        event.preventDefault()
        if (search.isSearchOpen) {
          search.closeSearch()
        }
        if (grouping.isGroupingSelectionMode) {
          grouping.toggleGroupingSelectionMode()
        }
        toggleAddNodeDialog()
        return
      }

      if (key === 'b' && enableNodeGrouping) {
        event.preventDefault()
        if (search.isSearchOpen) {
          search.closeSearch()
        }
        if (showAddNodeDialog) {
          setShowAddNodeDialog(false)
          setPendingAddSourceNodeId(null)
        }
        grouping.toggleGroupingSelectionMode()
        return
      }

      if (key === 'c') {
        event.preventDefault()
        if (search.isSearchOpen) {
          search.closeSearch()
        }
        if (grouping.isGroupingSelectionMode) {
          grouping.toggleGroupingSelectionMode()
        }
        toggleAddNodeDialog()
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [
    enableNodeGrouping,
    enableNodeSearch,
    grouping,
    isBlockingFlowOverlayOpen,
    search,
    showAddNodeDialog,
    toggleAddNodeDialog,
  ])

  return {
    enableNodeSearch,
    enableNodeGrouping,
    stepBlocks,
    defaultValueInput,
    parameterMode,
    environments,
    modules,
    layoutRefreshKey,
    search,
    grouping,
    flowContainerRef,
    nodes,
    handleNodesChange,
    edges,
    handleEdgesChange,
    onConnect,
    handleConnectStart,
    handleConnectEnd,
    edgeTypes,
    nodeTypes,
    handleFlowInit,
    isValidConnection,
    layoutRefreshNodeIds,
    openAddNodeDialog,
    openAddStepBlockDialog,
    addNode,
    addStepBlock,
    updateStepBlock,
    openEditStepBlockDialog,
    handleEditNodeSubmit,
    showAddNodeDialog,
    setShowAddNodeDialog,
    showEditNodeDialog,
    setShowEditNodeDialog,
    showAddStepBlockDialog,
    setShowAddStepBlockDialog,
    showEditStepBlockDialog,
    setShowEditStepBlockDialog,
    editStepBlockName,
    editStepBlockSteps,
    editNodeData,
    memoizedTemplateSteps,
    memoizedTemplateStepParams,
    mergedLocators,
    mergedLocatorGroups,
    handleLocatorCreated,
  }
}
