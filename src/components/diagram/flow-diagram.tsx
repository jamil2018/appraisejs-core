'use client'

import {
  addEdge,
  Background,
  ConnectionMode,
  Controls,
  Edge,
  Node,
  NodeProps,
  OnConnect,
  ReactFlow,
  useEdgesState,
  useNodesState,
  Connection,
  DefaultEdgeOptions,
  useUpdateNodeInternals,
} from '@xyflow/react'
import type { ReactFlowInstance } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  useCallback,
  useState,
  useEffect,
  useMemo,
  memo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import ButtonEdge, { flowEdgeMutationGuardRef } from './button-edge'
import { FlowDiagramBlockDialog } from './flow-diagram-block-dialog'
import { FlowDiagramBlockOverlays } from './flow-diagram-block-overlays'
import { FlowDiagramGroupingHints } from './flow-diagram-grouping-hints'
import { FlowDiagramToolbar } from './flow-diagram-toolbar'
import OptionsHeaderNode from './options-header-node'
import { AddNodePromptNode, type AddNodePromptFlowNode } from './add-node-prompt-node'
import NodeForm from './node-form'
import type { NodeFormData } from '@/constants/form-opts/diagram/node-form'
import { NodeOrderMap, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'
import { Environment, Locator, TemplateStep, TemplateStepParameter, LocatorGroup, Module } from '@prisma/client'
import type { InlineLocatorSaveResult } from '@/app/(base)/locators/create/create-locator-workspace-helpers'
import { toast } from '@/hooks/use-toast'
import {
  buildNodeFormData,
  createAddNodePromptNode,
  createEditableNodeData,
  determineNodeOrders,
  determineStartNodeIds,
  generateInitialNodesAndEdges,
  getFlowBlockBounds,
  getFlowBlockMembershipMap,
  hasOrphanedFlowNode,
  isAddNodePromptNode,
  isEdgeWithinSameFlowBlock,
  isValidDiagramConnection,
  removeOrphanedEdges,
  searchFlowNodesByLabel,
} from './flow-diagram-helpers'
import type { FlowBlock } from '@/types/diagram/diagram'

const flowEdgeTypes = {
  buttonEdge: ButtonEdge,
}

const defaultEdgeOptions: DefaultEdgeOptions = {
  type: 'buttonEdge',
  zIndex: 12,
  style: {
    stroke: 'rgb(148 163 184 / 0.9)',
    strokeWidth: 1.75,
    strokeLinecap: 'round',
  },
}

const flowDiagramProOptions = { hideAttribution: true }
const partialSelectionMode = 'partial' as never
const layoutRefreshDelays = [0, 80, 180, 360]

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

const flowDiagramHandlersRef = {
  current: {
    onEditNode: (nodeId: string) => {
      void nodeId
    },
    onOpenAddNode: (sourceNodeId?: string) => {
      void sourceNodeId
    },
  },
}

function OptionsHeaderNodeWrapper(props: NodeProps) {
  return (
    <OptionsHeaderNode
      {...props}
      onEdit={nodeId => flowDiagramHandlersRef.current.onEditNode(nodeId)}
      onAddConnectedNode={nodeId => flowDiagramHandlersRef.current.onOpenAddNode(nodeId)}
    />
  )
}

function AddNodePromptNodeWrapper(props: NodeProps) {
  return (
    <AddNodePromptNode
      {...(props as NodeProps<AddNodePromptFlowNode>)}
      onOpenAddNode={() => flowDiagramHandlersRef.current.onOpenAddNode()}
    />
  )
}

const flowNodeTypes = {
  optionsHeaderNode: OptionsHeaderNodeWrapper,
  addNodePromptNode: AddNodePromptNodeWrapper,
}

type FlowLayoutRefreshProps = {
  nodeIds: string[]
  containerRef: RefObject<HTMLDivElement | null>
  refreshKey?: string | number | boolean
}

function FlowLayoutRefresh({ nodeIds, containerRef, refreshKey }: FlowLayoutRefreshProps) {
  const updateNodeInternals = useUpdateNodeInternals()
  const frameRef = useRef<number | null>(null)
  const timeoutRefs = useRef<number[]>([])

  const clearScheduledRefreshes = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    timeoutRefs.current.forEach(timeoutId => window.clearTimeout(timeoutId))
    timeoutRefs.current = []
  }, [])

  const refreshNodeInternals = useCallback(() => {
    if (nodeIds.length === 0) {
      return
    }

    updateNodeInternals(nodeIds)
  }, [nodeIds, updateNodeInternals])

  const scheduleLayoutRefresh = useCallback(() => {
    if (typeof window === 'undefined') {
      return
    }

    clearScheduledRefreshes()
    layoutRefreshDelays.forEach(delay => {
      if (delay === 0) {
        frameRef.current = window.requestAnimationFrame(refreshNodeInternals)
        return
      }

      timeoutRefs.current.push(window.setTimeout(refreshNodeInternals, delay))
    })
  }, [clearScheduledRefreshes, refreshNodeInternals])

  useEffect(() => {
    scheduleLayoutRefresh()

    return clearScheduledRefreshes
  }, [clearScheduledRefreshes, refreshKey, scheduleLayoutRefresh])

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const container = containerRef.current
    if (!container) {
      return
    }

    const resizeObserver = new ResizeObserver(scheduleLayoutRefresh)
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [containerRef, scheduleLayoutRefresh])

  return null
}

type FlowDiagramProps = {
  nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap
  templateStepParams: TemplateStepParameter[]
  templateSteps: TemplateStep[]
  locators: Array<Pick<Locator, 'id' | 'name' | 'locatorGroupId'>>
  locatorGroups: Array<Pick<LocatorGroup, 'id' | 'name' | 'route' | 'moduleId'>>
  environments: Array<Pick<Environment, 'id' | 'name'>>
  modules: Array<Pick<Module, 'id' | 'name' | 'parentId'>>
  defaultValueInput?: boolean
  enableNodeSearch?: boolean
  enableNodeGrouping?: boolean
  flowBlocks?: FlowBlock[]
  layoutRefreshKey?: string | number | boolean
  onFlowBlocksChange?: (flowBlocks: FlowBlock[]) => void
  onNodeOrderChange: (nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap) => void
}

const EMPTY_FLOW_BLOCKS: FlowBlock[] = []

// fallow-ignore-next-line complexity
const FlowDiagram = ({
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
}: FlowDiagramProps) => {
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
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchHighlightedNodeId, setSearchHighlightedNodeId] = useState<string | null>(null)
  const [isGroupingSelectionMode, setIsGroupingSelectionMode] = useState(false)
  const [selectedGroupingNodeIds, setSelectedGroupingNodeIds] = useState<string[]>([])
  const [pendingBlockNodeIds, setPendingBlockNodeIds] = useState<string[]>([])
  const [blockName, setBlockName] = useState('')
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false)
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

  const nodeSearchResults = useMemo(() => searchFlowNodesByLabel(nodes, searchQuery), [nodes, searchQuery])
  const shouldShowSearchSuggestions = enableNodeSearch && isSearchOpen && searchQuery.trim().length >= 3
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
  const flowBlockMembership = useMemo(() => getFlowBlockMembershipMap(flowBlocks), [flowBlocks])
  const flowBlockBounds = useMemo(() => getFlowBlockBounds(nodes, flowBlocks), [nodes, flowBlocks])
  const hasOrphanedNodes = useMemo(() => hasOrphanedFlowNode(nodes, edges), [nodes, edges])
  const blockTopologyMessage = 'Remove flow blocks before changing flow structure.'
  const blockOrphanedNodeMessage = 'Connect or remove orphaned nodes before creating a block.'

  const showTopologyBlockedToast = useCallback(() => {
    toast({
      title: 'Flow structure locked',
      description: blockTopologyMessage,
      variant: 'destructive',
    })
  }, [])

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false)
    setSearchQuery('')
  }, [])

  const openSearch = useCallback(() => {
    setIsSearchOpen(true)
    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
    })
  }, [])

  const toggleSearch = useCallback(() => {
    if (isSearchOpen) {
      closeSearch()
      return
    }

    openSearch()
  }, [closeSearch, isSearchOpen, openSearch])

  const clearSearchHighlight = useCallback(() => {
    setSearchHighlightedNodeId(null)
  }, [])

  const handleFlowPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!isSearchOpen) {
        return
      }

      const target = event.target as HTMLElement | null
      if (target?.closest('[data-node-search-root="true"]')) {
        return
      }

      closeSearch()
    },
    [closeSearch, isSearchOpen],
  )

  const handleSearchResultClick = useCallback(
    (nodeId: string) => {
      const node = nodes.find(node => node.id === nodeId)
      if (!node || isAddNodePromptNode(node)) {
        return
      }

      setSearchHighlightedNodeId(nodeId)
      flowInstanceRef.current?.setCenter(node.position.x + 72, node.position.y + 72, {
        zoom: 1.15,
        duration: 420,
      })
      handleEditNode(nodeId)
    },
    [handleEditNode, nodes],
  )

  const handlePaneClick = useCallback(() => {
    clearSearchHighlight()
  }, [clearSearchHighlight])

  const handleNodeClick = useCallback(
    (_event: ReactMouseEvent, node: Node) => {
      if (searchHighlightedNodeId && node.id !== searchHighlightedNodeId) {
        clearSearchHighlight()
      }
    },
    [clearSearchHighlight, searchHighlightedNodeId],
  )

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
    setNodes(currentNodes => {
      const nextEdges = removeOrphanedEdges(currentNodes, edges)
      const startNodeIds = determineStartNodeIds(currentNodes, nextEdges)
      const isConnectionInProgress = isConnectionInProgressRef.current

      let hasUpdates = false
      const updatedNodes = currentNodes.map(node => {
        if (isAddNodePromptNode(node)) {
          return node
        }

        const isFirstNode = startNodeIds.has(node.id)
        const hasOutgoingConnection = nextEdges.some(edge => edge.source === node.id)
        const currentIsFirstNode = Boolean((node.data as { isFirstNode?: boolean }).isFirstNode)
        const currentHasOutgoingConnection = Boolean(
          (node.data as { hasOutgoingConnection?: boolean }).hasOutgoingConnection,
        )
        const currentIsConnectionInProgress = Boolean(
          (node.data as { isConnectionInProgress?: boolean }).isConnectionInProgress,
        )
        const currentIsSearchHighlighted = Boolean((node.data as { isSearchHighlighted?: boolean }).isSearchHighlighted)
        const isDeleteDisabled = flowBlockMembership.has(node.id)
        const currentIsDeleteDisabled = Boolean((node.data as { isDeleteDisabled?: boolean }).isDeleteDisabled)
        const isSearchHighlighted = searchHighlightedNodeId === node.id
        if (
          currentIsFirstNode === isFirstNode &&
          currentHasOutgoingConnection === hasOutgoingConnection &&
          currentIsConnectionInProgress === isConnectionInProgress &&
          currentIsSearchHighlighted === isSearchHighlighted &&
          currentIsDeleteDisabled === isDeleteDisabled
        ) {
          return node
        }

        hasUpdates = true
        return {
          ...node,
          data: {
            ...node.data,
            isFirstNode,
            hasOutgoingConnection,
            isConnectionInProgress,
            isSearchHighlighted,
            isDeleteDisabled,
          },
        }
      })

      return hasUpdates ? updatedNodes : currentNodes
    })
  }, [edges, flowBlockMembership, searchHighlightedNodeId, setNodes])

  useEffect(() => {
    syncNodePresentationMetadata()
  }, [nodes, edges, flowBlockMembership, searchHighlightedNodeId, syncNodePresentationMetadata])

  const isValidConnection = useCallback(
    (connection: Connection | Edge) =>
      !isEdgeWithinSameFlowBlock(connection as Edge, flowBlockMembership) &&
      isValidDiagramConnection(edges, connection),
    [edges, flowBlockMembership],
  )

  const onConnect: OnConnect = useCallback(
    params => {
      if (isEdgeWithinSameFlowBlock(params as Edge, flowBlockMembership)) {
        showTopologyBlockedToast()
        return
      }
      if (isValidConnection(params)) {
        setEdges(eds => addEdge(params, eds))
      }
    },
    [setEdges, isValidConnection, flowBlockMembership, showTopologyBlockedToast],
  )

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      const blockedDeleteIds = changes.reduce<Set<string>>((ids, change) => {
        if (change.type !== 'remove') {
          return ids
        }

        const edge = edges.find(edge => edge.id === change.id)
        if (edge && isEdgeWithinSameFlowBlock(edge, flowBlockMembership)) {
          ids.add(edge.id)
        }

        return ids
      }, new Set())

      if (blockedDeleteIds.size > 0) {
        showTopologyBlockedToast()
      }

      onEdgesChange(changes.filter(change => change.type !== 'remove' || !blockedDeleteIds.has(change.id)))
    },
    [edges, flowBlockMembership, onEdgesChange, showTopologyBlockedToast],
  )

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      const blockedDeleteIds = new Set(
        changes.flatMap(change => (change.type === 'remove' && flowBlockMembership.has(change.id) ? [change.id] : [])),
      )

      if (blockedDeleteIds.size > 0) {
        showTopologyBlockedToast()
      }

      onNodesChange(changes.filter(change => change.type !== 'remove' || !blockedDeleteIds.has(change.id)))
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

  return (
    <>
      <div className="relative flex h-full min-h-0 w-full flex-col" onPointerDown={handleFlowPointerDown}>
        <FlowDiagramToolbar
          enableNodeSearch={enableNodeSearch}
          enableNodeGrouping={enableNodeGrouping}
          isSearchOpen={isSearchOpen}
          searchQuery={searchQuery}
          searchInputRef={searchInputRef}
          shouldShowSearchSuggestions={shouldShowSearchSuggestions}
          nodeSearchResults={nodeSearchResults}
          isGroupingSelectionMode={isGroupingSelectionMode}
          onSearchQueryChange={setSearchQuery}
          onToggleSearch={toggleSearch}
          onSearchResultSelect={handleSearchResultClick}
          onToggleGroupingSelectionMode={() => {
            setIsGroupingSelectionMode(current => !current)
            setSelectedGroupingNodeIds(current => (current.length === 0 ? current : []))
          }}
          onOpenAddNodeDialog={openAddNodeDialog}
        />
        <div ref={flowContainerRef} className="h-full min-h-80 flex-1">
          <ReactFlow
            className="size-full"
            nodes={nodes}
            onNodesChange={handleNodesChange}
            edges={edges}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onConnectStart={handleConnectStart}
            onConnectEnd={handleConnectEnd}
            fitView
            colorMode="dark"
            connectionMode={ConnectionMode.Loose}
            edgeTypes={edgeTypes}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            connectOnClick={false}
            deleteKeyCode="Backspace"
            edgesReconnectable
            nodesConnectable
            panOnDrag={!isGroupingSelectionMode}
            selectionMode={partialSelectionMode}
            selectionOnDrag={isGroupingSelectionMode}
            selectNodesOnDrag={false}
            onSelectionChange={handleSelectionChange}
            onPaneClick={handlePaneClick}
            onNodeClick={handleNodeClick}
            isValidConnection={isValidConnection}
            proOptions={flowDiagramProOptions}
            onInit={instance => {
              flowInstanceRef.current = instance
            }}
          >
            <FlowLayoutRefresh
              nodeIds={layoutRefreshNodeIds}
              containerRef={flowContainerRef}
              refreshKey={layoutRefreshKey}
            />
            <FlowDiagramBlockOverlays
              flowBlockBounds={flowBlockBounds}
              onRenameBlock={openRenameBlockDialog}
              onDeleteBlock={deleteBlock}
            />
            <Background />
            <Controls />
          </ReactFlow>
        </div>
        <FlowDiagramGroupingHints
          showCreateBlock={
            enableNodeGrouping &&
            isGroupingSelectionMode &&
            selectedGroupingNodeIds.length >= 2 &&
            !hasOrphanedNodes
          }
          showOrphanMessage={
            enableNodeGrouping &&
            isGroupingSelectionMode &&
            selectedGroupingNodeIds.length >= 2 &&
            hasOrphanedNodes
          }
          orphanMessage={blockOrphanedNodeMessage}
          onCreateBlock={openCreateBlockDialog}
        />
      </div>

      <FlowDiagramBlockDialog
        open={isBlockDialogOpen}
        onOpenChange={setIsBlockDialogOpen}
        editingBlockId={editingBlockId}
        blockName={blockName}
        onBlockNameChange={setBlockName}
        onSubmit={handleBlockDialogSubmit}
      />

      <NodeForm
        onSubmitAction={addNode}
        mode="add"
        initialValues={{
          label: '',
          gherkinStep: '',
          templateStepId: '',
          parameters: [],
        }}
        templateSteps={memoizedTemplateSteps}
        templateStepParams={memoizedTemplateStepParams}
        showAddNodeDialog={showAddNodeDialog}
        setShowAddNodeDialog={setShowAddNodeDialog}
        locators={mergedLocators}
        defaultValueInput={defaultValueInput}
        locatorGroups={mergedLocatorGroups}
        environments={environments}
        modules={modules}
        onLocatorCreated={handleLocatorCreated}
      />

      {editNodeData && (
        <NodeForm
          onSubmitAction={handleEditNodeSubmit}
          mode="edit"
          initialValues={{
            label: editNodeData?.label ?? '',
            gherkinStep: editNodeData?.gherkinStep ?? '',
            templateStepId: editNodeData?.templateStepId ?? '',
            parameters: editNodeData?.parameters ?? [],
          }}
          templateSteps={memoizedTemplateSteps}
          templateStepParams={memoizedTemplateStepParams}
          showAddNodeDialog={showEditNodeDialog}
          setShowAddNodeDialog={setShowEditNodeDialog}
          locators={mergedLocators}
          defaultValueInput={defaultValueInput}
          locatorGroups={mergedLocatorGroups}
          environments={environments}
          modules={modules}
          onLocatorCreated={handleLocatorCreated}
        />
      )}
    </>
  )
}

export default memo(FlowDiagram)
