'use client'

import '@xyflow/react/dist/style.css'
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react'
import { Plus, Search, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { flowFromNodeOrder, type AuthoredFlow } from './authored-flow-model'
import { FlowInvocationEditor, type FlowInvocationController } from './flow-invocation-controller'
import {
  FlowBlockControls,
  FlowAuthoringSidebar,
  FlowGraphCanvas,
  FlowNodeSearch,
  type DiagramNodeData,
} from './flow-diagram-surface'
import type { FlowDiagramProps } from './flow-diagram-types'
import { useFlowBlocks, useFlowGraph, useFlowGraphShortcuts, useFlowNodeSearch } from './use-flow-diagram'

export { isValidFlowConnection } from './use-flow-diagram'

type FlowDiagramWithControllerProps = FlowDiagramProps & { invocationController: FlowInvocationController }

function useFlowDiagramModel(
  { nodeOrder, invocationController }: FlowDiagramWithControllerProps,
  revealDetails: () => void,
) {
  const flow = useMemo(() => flowFromNodeOrder(nodeOrder), [nodeOrder])
  const editor = invocationController
  const graph = useFlowGraph({
    flow,
    controller: editor,
    onEdit: nodeId => {
      editor.startEditing(nodeId)
      revealDetails()
    },
    onInsert: nodeId => {
      editor.startInserting(nodeId)
      revealDetails()
    },
  })
  const blocks = useFlowBlocks({
    flowBlocks: editor.flowBlocks,
    flow,
    selectedNodeIds: graph.selectedNodeIds,
    updateFlowBlocks: editor.updateFlowBlocks,
    clearSelection: graph.clearSelection,
  })
  const addStep = useCallback(() => {
    editor.startInserting(flow.at(-1)?.nodeId ?? null)
    revealDetails()
  }, [editor, flow, revealDetails])

  return { flow, editor, graph, blocks, addStep }
}

function useFlowDiagramInteractions(flow: AuthoredFlow, editor: FlowInvocationController, revealDetails: () => void) {
  const search = useFlowNodeSearch(flow)
  const toggleSearch = useCallback(() => {
    if (flow.length > 0) search.setIsOpen(open => !open)
  }, [flow.length, search])

  useFlowGraphShortcuts({
    lastNodeId: flow.at(-1)?.nodeId,
    toggleSearch,
    startInserting: nodeId => {
      editor.startInserting(nodeId)
      revealDetails()
    },
  })

  return { search }
}

export default function FlowDiagram(props: FlowDiagramWithControllerProps) {
  const { stepDefinitions, locators, locatorGroups, environments, modules, onInlineLocatorSave, layoutRefreshKey } =
    props
  const flowInstanceRef = useRef<ReactFlowInstance<Node<DiagramNodeData>, Edge> | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const revealDetails = useCallback(() => setIsDetailsOpen(true), [])
  const { flow, editor, graph, blocks, addStep } = useFlowDiagramModel(props, revealDetails)
  const { search } = useFlowDiagramInteractions(flow, editor, revealDetails)
  const revealNewStepDetails = useCallback(() => {
    if (!editor.session) editor.setSelectedDefinition(undefined)
    revealDetails()
  }, [editor, revealDetails])
  const drawerEditor = useMemo(
    () => ({
      ...editor,
      closeEditor: () => {
        editor.closeEditor()
        setIsDetailsOpen(false)
      },
      saveEditor: (inputs: Record<string, unknown>) => {
        editor.saveEditor(inputs)
        setIsDetailsOpen(false)
      },
    }),
    [editor],
  )

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden" aria-label="Graph step editor">
      <div className="flex min-h-[22rem] min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="flex justify-start">
          <ButtonGroup aria-label="Graph authoring tools">
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Open step details"
              onClick={revealNewStepDetails}
            >
              <Plus aria-hidden />
            </Button>
            <FlowBlockControls
              enabled={Boolean(props.onFlowBlocksChange)}
              disabled={graph.nodes.length < 2}
              blockName={blocks.blockName}
              selectedNodeCount={graph.selectedNodeIds.length}
              onNameChange={blocks.setBlockName}
              onCreate={blocks.createBlock}
            />
            <Popover open={search.isOpen} onOpenChange={search.setIsOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Search nodes"
                  disabled={graph.nodes.length === 0}
                >
                  <Search aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-96 p-2">
                <FlowNodeSearch
                  isOpen
                  query={search.query}
                  results={search.results}
                  nodes={graph.nodes}
                  flowInstanceRef={flowInstanceRef}
                  onQueryChange={search.setQuery}
                  onEdit={nodeId => {
                    editor.startEditing(nodeId)
                    revealDetails()
                  }}
                  onClose={search.close}
                />
              </PopoverContent>
            </Popover>
          </ButtonGroup>
        </div>
        <FlowGraphCanvas
          nodes={graph.nodes}
          edges={graph.edges}
          flowBlocks={graph.flowBlocks}
          layoutRefreshKey={layoutRefreshKey}
          flowInstanceRef={flowInstanceRef}
          onConnect={graph.onConnect}
          onReconnect={graph.onReconnect}
          onNodesChange={graph.onNodesChange}
          onNodeDragStop={graph.onNodeDragStop}
          isValidConnection={graph.isValidConnection}
          onSelectionChange={graph.onSelectionChange}
          onRenameBlock={blocks.renameBlock}
          onDeleteBlock={blocks.deleteBlock}
          onUpdateBlockMembership={blocks.updateMembership}
          onAddFirst={() => {
            editor.setSelectedDefinition(undefined)
            revealDetails()
          }}
          canAddFirst={stepDefinitions.length > 0}
        />
      </div>
      <Drawer direction="right" open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DrawerContent
          overlayClassName="bg-transparent"
          onOverlayClick={() => setIsDetailsOpen(false)}
          className="inset-y-0 left-auto right-0 mt-0 h-full w-[min(24rem,calc(100vw-1rem))] rounded-l-md rounded-tr-none [&>div:first-child]:hidden"
        >
          <DrawerHeader className="relative border-b pr-14 text-left">
            <DrawerTitle>Step details</DrawerTitle>
            <DrawerDescription>Choose a ready definition, then configure its inputs.</DrawerDescription>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3"
                aria-label="Close step details"
              >
                <X aria-hidden />
              </Button>
            </DrawerClose>
          </DrawerHeader>
          <FlowAuthoringSidebar
            definitions={stepDefinitions}
            value={editor.activeDefinition}
            onDefinitionChange={editor.setSelectedDefinition}
            onAdd={addStep}
          >
            {editor.session ? (
              <FlowInvocationEditor
                controller={drawerEditor}
                variant="sidebar"
                resources={{ locators, locatorGroups, environments, modules, onInlineLocatorSave }}
              />
            ) : null}
          </FlowAuthoringSidebar>
        </DrawerContent>
      </Drawer>
    </section>
  )
}

export { parseStepInvocationInput } from './step-invocation-fields'
