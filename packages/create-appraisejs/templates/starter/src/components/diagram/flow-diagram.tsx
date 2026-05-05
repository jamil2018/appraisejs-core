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
} from '@xyflow/react'
import type { ReactFlowInstance } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useState, useEffect, useMemo, memo, useRef, type PointerEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import ButtonEdge from './button-edge'
import { Plus, Search, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import OptionsHeaderNode from './options-header-node'
import { AddNodePromptNode, type AddNodePromptFlowNode } from './add-node-prompt-node'
import NodeForm from './node-form'
import { NodeData } from '@/constants/form-opts/diagram/node-form'
import { NodeOrderMap, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'
import { Environment, Locator, TemplateStep, TemplateStepParameter, LocatorGroup, Module } from '@prisma/client'
import type { InlineLocatorSaveResult } from '@/app/(base)/locators/create/create-locator-workspace-helpers'
import {
  buildNodeFormData,
  createAddNodePromptNode,
  createEditableNodeData,
  determineNodeOrders,
  determineStartNodeIds,
  generateInitialNodesAndEdges,
  isAddNodePromptNode,
  isValidDiagramConnection,
  removeOrphanedEdges,
  searchFlowNodesByLabel,
} from './flow-diagram-helpers'

const edgeTypes = {
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

const nodeTypes = {
  optionsHeaderNode: OptionsHeaderNodeWrapper,
  addNodePromptNode: AddNodePromptNodeWrapper,
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
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null)

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

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false)
    setSearchQuery('')
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

  useEffect(() => {
    flowDiagramHandlersRef.current.onEditNode = handleEditNode
    flowDiagramHandlersRef.current.onOpenAddNode = sourceNodeId => {
      setPendingAddSourceNodeId(sourceNodeId ?? null)
      setShowAddNodeDialog(true)
    }
  }, [handleEditNode])

  const addNode = useCallback(
    (formData: NodeData) => {
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
        const isSearchHighlighted = searchHighlightedNodeId === node.id
        if (
          currentIsFirstNode === isFirstNode &&
          currentHasOutgoingConnection === hasOutgoingConnection &&
          currentIsConnectionInProgress === isConnectionInProgress &&
          currentIsSearchHighlighted === isSearchHighlighted
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
          },
        }
      })

      return hasUpdates ? updatedNodes : currentNodes
    })
  }, [nodes, edges, isConnectionInProgress, searchHighlightedNodeId, setNodes])

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => isValidDiagramConnection(edges, connection),
    [edges],
  )

  const onConnect: OnConnect = useCallback(
    params => {
      if (isValidConnection(params)) {
        setEdges(eds => addEdge(params, eds))
      }
    },
    [setEdges, isValidConnection],
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
    setPendingAddSourceNodeId(null)
    setShowAddNodeDialog(true)
  }, [])

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
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" size="icon" onClick={openAddNodeDialog} aria-label="Add Node">
                  <Plus />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Add Node</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="min-h-0 flex-1">
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
            isValidConnection={isValidConnection}
            proOptions={flowDiagramProOptions}
            onInit={instance => {
              flowInstanceRef.current = instance
            }}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      </div>

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
