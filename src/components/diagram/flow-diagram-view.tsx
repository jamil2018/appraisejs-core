'use client'

/* eslint-disable react-hooks/refs -- The composite view model forwards refs without reading `.current` during render. */

import { Background, ConnectionMode, Controls, ReactFlow, type DefaultEdgeOptions } from '@xyflow/react'
import { FlowDiagramBlockDialog } from './flow-diagram-block-dialog'
import { FlowDiagramBlockOverlays } from './flow-diagram-block-overlays'
import { FlowDiagramGroupingHints } from './flow-diagram-grouping-hints'
import { FlowDiagramToolbar } from './flow-diagram-toolbar'
import { FlowDiagramStepBlockSheet } from './flow-diagram-step-block-sheet'
import NodeForm from './node-form'
import type { ComponentType, RefObject } from 'react'

import type { useFlowDiagram } from './use-flow-diagram'

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

type FlowDiagramViewProps = {
  model: ReturnType<typeof useFlowDiagram>
  FlowLayoutRefresh: ComponentType<{
    nodeIds: string[]
    containerRef: RefObject<HTMLDivElement | null>
    refreshKey?: string | number | boolean
  }>
}

export function FlowDiagramView({ model, FlowLayoutRefresh }: FlowDiagramViewProps) {
  return (
    <>
      <div className="relative flex h-full min-h-0 w-full flex-col" onPointerDown={model.search.handleFlowPointerDown}>
        <FlowDiagramToolbar
          enableNodeSearch={model.enableNodeSearch}
          enableNodeGrouping={model.enableNodeGrouping}
          isSearchOpen={model.search.isSearchOpen}
          searchQuery={model.search.searchQuery}
          searchInputRef={model.search.searchInputRef}
          shouldShowSearchSuggestions={model.search.shouldShowSearchSuggestions}
          nodeSearchResults={model.search.nodeSearchResults}
          isGroupingSelectionMode={model.grouping.isGroupingSelectionMode}
          canAddStepBlock={model.stepBlocks.length > 0}
          onSearchQueryChange={model.search.setSearchQuery}
          onToggleSearch={model.search.toggleSearch}
          onSearchResultSelect={model.search.handleSearchResultClick}
          onToggleGroupingSelectionMode={model.grouping.toggleGroupingSelectionMode}
          onOpenAddStepBlockDialog={model.openAddStepBlockDialog}
          onOpenAddNodeDialog={model.openAddNodeDialog}
        />
        <div ref={model.flowContainerRef} className="h-full min-h-80 flex-1">
          <ReactFlow
            className="size-full"
            nodes={model.nodes}
            onNodesChange={model.handleNodesChange}
            edges={model.edges}
            onEdgesChange={model.handleEdgesChange}
            onConnect={model.onConnect}
            onConnectStart={model.handleConnectStart}
            onConnectEnd={model.handleConnectEnd}
            fitView
            colorMode="dark"
            connectionMode={ConnectionMode.Loose}
            edgeTypes={model.edgeTypes}
            nodeTypes={model.nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            connectOnClick={false}
            deleteKeyCode="Backspace"
            edgesReconnectable
            nodesConnectable
            panOnDrag={!model.grouping.isGroupingSelectionMode}
            selectionMode={partialSelectionMode}
            selectionOnDrag={model.grouping.isGroupingSelectionMode}
            selectNodesOnDrag={false}
            onSelectionChange={model.grouping.handleSelectionChange}
            onPaneClick={model.search.handlePaneClick}
            onNodeClick={model.search.handleNodeClick}
            isValidConnection={model.isValidConnection}
            proOptions={flowDiagramProOptions}
            onInit={model.handleFlowInit}
          >
            <FlowLayoutRefresh
              nodeIds={model.layoutRefreshNodeIds}
              containerRef={model.flowContainerRef}
              refreshKey={model.layoutRefreshKey}
            />
            <FlowDiagramBlockOverlays
              flowBlockBounds={model.grouping.flowBlockBounds}
              onEditBlock={model.openEditStepBlockDialog}
              onDeleteBlock={model.grouping.deleteBlock}
            />
            <Background />
            <Controls />
          </ReactFlow>
        </div>
        <FlowDiagramGroupingHints
          showCreateBlock={
            model.enableNodeGrouping &&
            model.grouping.isGroupingSelectionMode &&
            model.grouping.selectedGroupingNodeIds.length >= 2 &&
            !model.grouping.hasOrphanedNodes
          }
          showOrphanMessage={
            model.enableNodeGrouping &&
            model.grouping.isGroupingSelectionMode &&
            model.grouping.selectedGroupingNodeIds.length >= 2 &&
            model.grouping.hasOrphanedNodes
          }
          orphanMessage={model.grouping.blockOrphanedNodeMessage}
          onCreateBlock={model.grouping.openCreateBlockDialog}
        />
      </div>

      <FlowDiagramBlockDialog
        open={model.grouping.isBlockDialogOpen}
        onOpenChange={model.grouping.setIsBlockDialogOpen}
        editingBlockId={model.grouping.editingBlockId}
        blockName={model.grouping.blockName}
        onBlockNameChange={model.grouping.setBlockName}
        onSubmit={model.grouping.handleBlockDialogSubmit}
      />

      <NodeForm
        onSubmitAction={model.addNode}
        mode="add"
        initialValues={{
          label: '',
          gherkinStep: '',
          templateStepId: '',
          parameters: [],
        }}
        templateSteps={model.memoizedTemplateSteps}
        templateStepParams={model.memoizedTemplateStepParams}
        showAddNodeDialog={model.showAddNodeDialog}
        setShowAddNodeDialog={model.setShowAddNodeDialog}
        locators={model.mergedLocators}
        defaultValueInput={model.defaultValueInput}
        locatorGroups={model.mergedLocatorGroups}
        environments={model.environments}
        modules={model.modules}
        onLocatorCreated={model.handleLocatorCreated}
      />

      <FlowDiagramStepBlockSheet
        open={model.showAddStepBlockDialog}
        mode="add"
        stepBlocks={model.stepBlocks}
        locators={model.mergedLocators}
        locatorGroups={model.mergedLocatorGroups}
        environments={model.environments}
        modules={model.modules}
        onLocatorCreated={model.handleLocatorCreated}
        onOpenChange={model.setShowAddStepBlockDialog}
        onSubmit={model.addStepBlock}
      />

      <FlowDiagramStepBlockSheet
        open={model.showEditStepBlockDialog}
        mode="edit"
        stepBlocks={model.stepBlocks}
        initialBlockName={model.editStepBlockName}
        initialSteps={model.editStepBlockSteps}
        locators={model.mergedLocators}
        locatorGroups={model.mergedLocatorGroups}
        environments={model.environments}
        modules={model.modules}
        onLocatorCreated={model.handleLocatorCreated}
        onOpenChange={model.setShowEditStepBlockDialog}
        onSubmit={model.updateStepBlock}
      />

      {model.editNodeData ? (
        <NodeForm
          onSubmitAction={model.handleEditNodeSubmit}
          mode="edit"
          initialValues={{
            label: model.editNodeData.label ?? '',
            gherkinStep: model.editNodeData.gherkinStep ?? '',
            templateStepId: model.editNodeData.templateStepId ?? '',
            parameters: model.editNodeData.parameters ?? [],
          }}
          templateSteps={model.memoizedTemplateSteps}
          templateStepParams={model.memoizedTemplateStepParams}
          showAddNodeDialog={model.showEditNodeDialog}
          setShowAddNodeDialog={model.setShowEditNodeDialog}
          locators={model.mergedLocators}
          defaultValueInput={model.defaultValueInput}
          locatorGroups={model.mergedLocatorGroups}
          environments={model.environments}
          modules={model.modules}
          onLocatorCreated={model.handleLocatorCreated}
        />
      ) : null}
    </>
  )
}
