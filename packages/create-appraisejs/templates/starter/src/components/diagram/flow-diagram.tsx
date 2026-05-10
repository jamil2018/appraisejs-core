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
  ViewportPortal,
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
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import ButtonEdge, { flowEdgeMutationGuardRef } from './button-edge'
import { Boxes, MousePointer2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import OptionsHeaderNode from './options-header-node'
import { AddNodePromptNode, type AddNodePromptFlowNode } from './add-node-prompt-node'
import NodeForm from './node-form'
import { NodeData } from '@/constants/form-opts/diagram/node-form'
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
  isAddNodePromptNode,
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
  flowBlocks = [],
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
  const [editNodeData, setEditNodeData] = useState<NodeData | null>(null)
  const [pendingAddSourceNodeId, setPendingAddSourceNodeId] = useState<string | null>(null)
  const [isConnectionInProgress, setIsConnectionInProgress] = useState(false)
  const [availableLocators, setAvailableLocators] = useState(locators)
  const [availableLocatorGroups, setAvailableLocatorGroups] = useState(locatorGroups)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHighlightedNodeId, setSearchHighlightedNodeId] = useState<string | null>(null)
  const [isGroupingSelectionMode, setIsGroupingSelectionMode] = useState(false)
  const [selectedGroupingNodeIds, setSelectedGroupingNodeIds] = useState<string[]>([])
  const [pendingBlockNodeIds, setPendingBlockNodeIds] = useState<string[]>([])
  const [blockName, setBlockName] = useState('')
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false)
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null)
  const flowContainerRef = useRef<HTMLDivElement | null>(null)
  const edgeTypes = useMemo(() => flowEdgeTypes, [])
  const nodeTypes = useMemo(() => flowNodeTypes, [])

  useEffect(() => {
    setAvailableLocators(locators)
  }, [locators])

  useEffect(() => {
    setAvailableLocatorGroups(locatorGroups)
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
  const realNodeIds = useMemo(() => new Set(nodes.filter(node => !isAddNodePromptNode(node)).map(node => node.id)), [nodes])
  const layoutRefreshNodeIds = useMemo(
    () => nodes.filter(node => !isAddNodePromptNode(node)).map(node => node.id),
    [nodes],
  )
  const flowBlockMembership = useMemo(() => getFlowBlockMembershipMap(flowBlocks), [flowBlocks])
  const flowBlockBounds = useMemo(() => getFlowBlockBounds(nodes, flowBlocks), [nodes, flowBlocks])
  const hasFlowBlocks = flowBlocks.length > 0
  const blockTopologyMessage = 'Remove flow blocks before changing flow structure.'

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
      if (hasFlowBlocks) {
        showTopologyBlockedToast()
        return
      }
      setPendingAddSourceNodeId(sourceNodeId ?? null)
      setShowAddNodeDialog(true)
    }
    flowEdgeMutationGuardRef.current = {
      isBlocked: hasFlowBlocks,
      onBlocked: showTopologyBlockedToast,
    }
  }, [handleEditNode, hasFlowBlocks, showTopologyBlockedToast])

  const addNode = useCallback(
    (formData: NodeData) => {
      if (hasFlowBlocks) {
        showTopologyBlockedToast()
        return
      }
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
    [
      setEdges,
      setNodes,
      nodes,
      edges,
      pendingAddSourceNodeId,
      templateSteps,
      templateStepParams,
      defaultValueInput,
      hasFlowBlocks,
      showTopologyBlockedToast,
    ],
  )

  const handleEditNodeSubmit = useCallback(
    (formData: NodeData) => {
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
    const orders = determineNodeOrders(nodes, edges)
    onNodeOrderChange(orders)
  }, [nodes, edges, onNodeOrderChange])

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

  useEffect(() => {
    const nextEdges = removeOrphanedEdges(nodes, edges)
    const startNodeIds = determineStartNodeIds(nodes, nextEdges)

    setNodes(currentNodes => {
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
        const currentIsDeleteDisabled = Boolean((node.data as { isDeleteDisabled?: boolean }).isDeleteDisabled)
        const isSearchHighlighted = searchHighlightedNodeId === node.id
        if (
          currentIsFirstNode === isFirstNode &&
          currentHasOutgoingConnection === hasOutgoingConnection &&
          currentIsConnectionInProgress === isConnectionInProgress &&
          currentIsSearchHighlighted === isSearchHighlighted &&
          currentIsDeleteDisabled === hasFlowBlocks
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
            isDeleteDisabled: hasFlowBlocks,
          },
        }
      })

      return hasUpdates ? updatedNodes : currentNodes
    })
  }, [nodes, edges, hasFlowBlocks, isConnectionInProgress, searchHighlightedNodeId, setNodes])

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => !hasFlowBlocks && isValidDiagramConnection(edges, connection),
    [edges, hasFlowBlocks],
  )

  const onConnect: OnConnect = useCallback(
    params => {
      if (hasFlowBlocks) {
        showTopologyBlockedToast()
        return
      }
      if (isValidConnection(params)) {
        setEdges(eds => addEdge(params, eds))
      }
    },
    [setEdges, isValidConnection, hasFlowBlocks, showTopologyBlockedToast],
  )

  const handleConnectStart = useCallback(() => {
    setIsConnectionInProgress(true)
  }, [])

  const handleConnectEnd = useCallback(() => {
    setIsConnectionInProgress(false)
  }, [])

  const memoizedTemplateSteps = useMemo(() => templateSteps, [templateSteps])
  const memoizedTemplateStepParams = useMemo(() => templateStepParams, [templateStepParams])
  const memoizedLocators = useMemo(() => availableLocators, [availableLocators])
  const memoizedLocatorGroups = useMemo(() => availableLocatorGroups, [availableLocatorGroups])

  const handleLocatorCreated = useCallback((result: InlineLocatorSaveResult) => {
    setAvailableLocatorGroups(current => {
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

    setAvailableLocators(current => {
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
    if (hasFlowBlocks) {
      showTopologyBlockedToast()
      return
    }
    setPendingAddSourceNodeId(null)
    setShowAddNodeDialog(true)
  }, [hasFlowBlocks, showTopologyBlockedToast])

  const openCreateBlockDialog = useCallback(() => {
    if (selectedGroupingNodeIds.length < 2) {
      return
    }

    setPendingBlockNodeIds(selectedGroupingNodeIds)
    setEditingBlockId(null)
    setBlockName('')
    setIsBlockDialogOpen(true)
  }, [selectedGroupingNodeIds])

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

      const selectedIds = selectedNodes
        .filter(node => realNodeIds.has(node.id) && !flowBlockMembership.has(node.id))
        .map(node => node.id)

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
        <div className="absolute right-4 top-4 z-20 flex items-start gap-2" data-node-search-root="true">
          {enableNodeSearch && (
            <div className="relative flex items-start gap-2">
              <AnimatePresence>
                {isSearchOpen && (
                  <motion.div
                    className="flex flex-col items-end"
                    initial={{ opacity: 0, x: 14, scale: 0.98 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 14, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    <Input
                      aria-label="Search nodes"
                      autoFocus
                      value={searchQuery}
                      onChange={event => setSearchQuery(event.target.value)}
                      placeholder="Search labels..."
                      className="h-9 w-56 border-border/70 bg-background/95 shadow-md backdrop-blur"
                    />
                    <AnimatePresence>
                      {shouldShowSearchSuggestions && (
                        <motion.div
                          className="mt-2 w-64 overflow-hidden rounded-md border border-border/70 bg-popover text-popover-foreground shadow-xl"
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.16, ease: 'easeOut' }}
                        >
                          {nodeSearchResults.length > 0 ? (
                            <div className="max-h-64 overflow-y-auto py-1">
                              {nodeSearchResults.map(result => (
                                <button
                                  key={result.id}
                                  type="button"
                                  className="block w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
                                  onClick={() => handleSearchResultClick(result.id)}
                                >
                                  {result.label}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="px-3 py-2 text-sm text-muted-foreground">No matching labels</div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => (isSearchOpen ? closeSearch() : setIsSearchOpen(true))}
                      aria-label={isSearchOpen ? 'Close node search' : 'Search nodes'}
                    >
                      {isSearchOpen ? <X /> : <Search />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{isSearchOpen ? 'Close search' : 'Search nodes'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
          {enableNodeGrouping && (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={isGroupingSelectionMode ? 'default' : 'outline'}
                    size="icon"
                    onClick={() => {
                      setIsGroupingSelectionMode(current => !current)
                      setSelectedGroupingNodeIds(current => (current.length === 0 ? current : []))
                    }}
                    aria-label={isGroupingSelectionMode ? 'Exit block selection mode' : 'Select nodes for block'}
                  >
                    {isGroupingSelectionMode ? <Boxes /> : <MousePointer2 />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {isGroupingSelectionMode ? 'Selection mode' : 'Create block'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={openAddNodeDialog}
                  disabled={hasFlowBlocks}
                  aria-label="Add Node"
                >
                  <Plus />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{hasFlowBlocks ? blockTopologyMessage : 'Add Node'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div ref={flowContainerRef} className="h-full min-h-80 flex-1">
          <ReactFlow
            className="h-full w-full"
            nodes={nodes}
            onNodesChange={onNodesChange}
            edges={edges}
            onEdgesChange={onEdgesChange}
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
            deleteKeyCode={hasFlowBlocks ? null : 'Backspace'}
            edgesReconnectable={!hasFlowBlocks}
            nodesConnectable={!hasFlowBlocks}
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
            {flowBlockBounds.length > 0 && (
              <ViewportPortal>
                {flowBlockBounds.map(block => (
                  <div
                    key={block.id}
                    className="pointer-events-none absolute rounded-lg border border-emerald-400/70 bg-emerald-400/10"
                    style={{
                      left: block.x,
                      top: block.y,
                      width: block.width,
                      height: block.height,
                      zIndex: -1,
                    }}
                  >
                    <div className="pointer-events-auto absolute -top-9 left-2 flex items-center gap-1 rounded-md border border-emerald-300/80 bg-background/95 px-2.5 py-1.5 text-sm font-semibold text-foreground shadow-md shadow-background/40">
                      <span>{block.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => openRenameBlockDialog(block)}
                        aria-label={`Rename ${block.name}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => deleteBlock(block.id)}
                        aria-label={`Delete ${block.name}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </ViewportPortal>
            )}
            <Background />
            <Controls />
          </ReactFlow>
        </div>
        {enableNodeGrouping && isGroupingSelectionMode && selectedGroupingNodeIds.length >= 2 && (
          <div className="absolute right-4 top-16 z-20 rounded-md border border-border bg-popover p-2 shadow-xl">
            <Button type="button" size="sm" onClick={openCreateBlockDialog}>
              Create block
            </Button>
          </div>
        )}
      </div>

      <Dialog open={isBlockDialogOpen} onOpenChange={setIsBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBlockId ? 'Rename block' : 'Create block'}</DialogTitle>
            <DialogDescription>
              {editingBlockId
                ? 'Update the display name for this flow block.'
                : 'Name the selected nodes before saving them as a flow block.'}
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Block name"
            value={blockName}
            onChange={event => setBlockName(event.target.value)}
            placeholder="Block name"
          />
          <DialogFooter>
            <Button type="button" onClick={handleBlockDialogSubmit}>
              {editingBlockId ? 'Rename' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        locators={memoizedLocators}
        defaultValueInput={defaultValueInput}
        locatorGroups={memoizedLocatorGroups}
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
          locators={memoizedLocators}
          defaultValueInput={defaultValueInput}
          locatorGroups={memoizedLocatorGroups}
          environments={environments}
          modules={modules}
          onLocatorCreated={handleLocatorCreated}
        />
      )}
    </>
  )
}

export default memo(FlowDiagram)
