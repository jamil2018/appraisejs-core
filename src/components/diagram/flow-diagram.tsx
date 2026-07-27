'use client'

import '@xyflow/react/dist/style.css'
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react'
import { useCallback, useMemo, useRef } from 'react'

import { flowFromNodeOrder, type AuthoredFlow } from './authored-flow-model'
import { FlowInvocationEditor, type FlowInvocationController } from './flow-invocation-controller'
import {
  FlowBlockControls,
  FlowDiagramToolbar,
  FlowGraphCanvas,
  FlowNodeSearch,
  type DiagramNodeData,
} from './flow-diagram-surface'
import type { FlowDiagramProps } from './flow-diagram-types'
import { useFlowBlocks, useFlowGraph, useFlowGraphShortcuts, useFlowNodeSearch } from './use-flow-diagram'

export { isValidFlowConnection } from './use-flow-diagram'

type FlowDiagramWithControllerProps = FlowDiagramProps & { invocationController: FlowInvocationController }

function useFlowDiagramModel({ nodeOrder, invocationController }: FlowDiagramWithControllerProps) {
  const flow = useMemo(() => flowFromNodeOrder(nodeOrder), [nodeOrder])
  const editor = invocationController
  const graph = useFlowGraph({
    flow,
    controller: editor,
    onEdit: editor.startEditing,
    onInsert: editor.startInserting,
  })
  const blocks = useFlowBlocks({
    flowBlocks: editor.flowBlocks,
    flow,
    selectedNodeIds: graph.selectedNodeIds,
    updateFlowBlocks: editor.updateFlowBlocks,
    clearSelection: graph.clearSelection,
  })
  const addStep = useCallback(() => editor.startInserting(flow.at(-1)?.nodeId ?? null), [editor, flow])

  return { flow, editor, graph, blocks, addStep }
}

function useFlowDiagramInteractions(flow: AuthoredFlow, editor: FlowInvocationController) {
  const search = useFlowNodeSearch(flow)
  const toggleSearch = useCallback(() => search.setIsOpen(open => !open), [search])

  useFlowGraphShortcuts({
    lastNodeId: flow.at(-1)?.nodeId,
    toggleSearch,
    startInserting: editor.startInserting,
  })

  return { search, toggleSearch }
}

export default function FlowDiagram(props: FlowDiagramWithControllerProps) {
  const { stepDefinitions, locators, locatorGroups, environments, modules, onInlineLocatorSave, layoutRefreshKey } =
    props
  const flowInstanceRef = useRef<ReactFlowInstance<Node<DiagramNodeData>, Edge> | null>(null)
  const { flow, editor, graph, blocks, addStep } = useFlowDiagramModel(props)
  const { search, toggleSearch } = useFlowDiagramInteractions(flow, editor)

  return (
    <section className="flex h-full min-h-0 flex-col gap-3" aria-label="Graph step editor">
      <FlowDiagramToolbar
        definitions={stepDefinitions}
        value={editor.activeDefinition}
        onDefinitionChange={editor.setSelectedDefinition}
        onAdd={addStep}
        onInsertFirst={() => editor.startInserting(null)}
        onToggleSearch={toggleSearch}
        isSearchOpen={search.isOpen}
      />
      <FlowNodeSearch
        isOpen={search.isOpen}
        query={search.query}
        results={search.results}
        nodes={graph.nodes}
        flowInstanceRef={flowInstanceRef}
        onQueryChange={search.setQuery}
        onEdit={editor.startEditing}
        onClose={search.close}
      />
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
      />
      <FlowBlockControls
        enabled={Boolean(props.onFlowBlocksChange)}
        blockName={blocks.blockName}
        selectedNodeCount={graph.selectedNodeIds.length}
        onNameChange={blocks.setBlockName}
        onCreate={blocks.createBlock}
      />
      <FlowInvocationEditor
        controller={editor}
        resources={{ locators, locatorGroups, environments, modules, onInlineLocatorSave }}
      />
    </section>
  )
}

export { parseStepInvocationInput } from './step-invocation-fields'
