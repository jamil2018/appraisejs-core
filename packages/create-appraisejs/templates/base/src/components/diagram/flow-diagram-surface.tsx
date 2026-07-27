'use client'

import {
  Background,
  Controls,
  Handle,
  Panel,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { FlowBlock } from '@/types/diagram/diagram'
import type { StepDefinitionOption } from '@/types/step-definition-option'

import type { AuthoredFlow } from './authored-flow-model'
import { getFlowBlockBounds } from './flow-block-helpers'
import { FlowDiagramBlockOverlays } from './flow-diagram-block-overlays'
import { StepDefinitionPicker } from './step-definition-picker'

export type DiagramNodeData = {
  label: string
  gherkinStep?: string
  onEdit: (nodeId: string) => void
  onInsert: (nodeId: string) => void
  onRemove: (nodeId: string) => void
  onMoveLeft?: () => void
  onMoveRight?: () => void
  blockId?: string
  blockName?: string
}

function FlowStepNode({ id, data }: NodeProps<Node<DiagramNodeData>>) {
  return (
    <Card className="min-w-56 border-white/15 bg-[rgba(18,37,64,0.96)] p-3 shadow-lg">
      <Handle type="target" position={Position.Left} id="target" aria-label={`Connect before ${data.label}`} />
      <p className="font-medium">{data.label}</p>
      <p className="mt-1 text-sm text-muted-foreground">{data.gherkinStep}</p>
      {data.blockName ? <p className="mt-1 text-xs text-emerald-300">Block: {data.blockName}</p> : null}
      <div className="nodrag mt-3 flex gap-1">
        <Button type="button" size="sm" variant="outline" data-invocation-edit={id} onClick={() => data.onEdit(id)}>
          <Pencil className="size-3" aria-hidden /> Edit
        </Button>
        <Button type="button" size="sm" variant="outline" data-invocation-insert={id} onClick={() => data.onInsert(id)}>
          <Plus className="size-3" aria-hidden /> Insert after
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`Remove ${data.label}`}
          onClick={() => data.onRemove(id)}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="nodrag mt-2 flex gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Move ${data.label} left`}
          disabled={!data.onMoveLeft}
          onClick={data.onMoveLeft}
        >
          Move left
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Move ${data.label} right`}
          disabled={!data.onMoveRight}
          onClick={data.onMoveRight}
        >
          Move right
        </Button>
      </div>
      <Handle type="source" position={Position.Right} id="source" aria-label={`Connect after ${data.label}`} />
    </Card>
  )
}

const nodeTypes = { flowStep: FlowStepNode }

type FlowDiagramToolbarProps = {
  definitions: StepDefinitionOption[]
  value?: StepDefinitionOption
  onDefinitionChange: (definition?: StepDefinitionOption) => void
  onAdd: () => void
  onInsertFirst: () => void
  onToggleSearch: () => void
  isSearchOpen: boolean
}

export function FlowDiagramToolbar({
  definitions,
  value,
  onDefinitionChange,
  onAdd,
  onInsertFirst,
  onToggleSearch,
  isSearchOpen,
}: FlowDiagramToolbarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <StepDefinitionPicker definitions={definitions} value={value} onChange={onDefinitionChange} />
      <Button type="button" disabled={!value} onClick={onAdd}>
        <Plus className="size-4" aria-hidden /> Add step
      </Button>
      <Button type="button" variant="outline" disabled={!value} onClick={onInsertFirst}>
        Insert first step
      </Button>
      <Button type="button" variant="outline" onClick={onToggleSearch} aria-expanded={isSearchOpen}>
        <Search className="size-4" aria-hidden /> Search nodes
      </Button>
    </div>
  )
}

type FlowNodeSearchProps = {
  isOpen: boolean
  query: string
  results: AuthoredFlow
  nodes: Node<DiagramNodeData>[]
  flowInstanceRef: RefObject<ReactFlowInstance<Node<DiagramNodeData>, Edge> | null>
  onQueryChange: (query: string) => void
  onEdit: (nodeId: string) => void
  onClose: () => void
}

export function FlowNodeSearch({
  isOpen,
  query,
  results,
  nodes,
  flowInstanceRef,
  onQueryChange,
  onEdit,
  onClose,
}: FlowNodeSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])
  if (!isOpen) return null

  const selectResult = (nodeId: string) => {
    const graphNode = nodes.find(node => node.id === nodeId)
    if (graphNode) {
      flowInstanceRef.current?.setCenter(graphNode.position.x + 120, graphNode.position.y + 60, {
        zoom: 1.15,
        duration: 250,
      })
    }
    onEdit(nodeId)
    onClose()
  }

  return (
    <div className="rounded-md border p-2" data-node-search-root="true">
      <label className="sr-only" htmlFor="flow-node-search">
        Search flow nodes
      </label>
      <input
        id="flow-node-search"
        ref={inputRef}
        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        placeholder="Search graph nodes"
        value={query}
        onChange={event => onQueryChange(event.target.value)}
      />
      {results.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {results.map(item => (
            <Button
              key={item.nodeId}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => selectResult(item.nodeId)}
            >
              {item.node.label}
            </Button>
          ))}
        </div>
      ) : query ? (
        <p className="mt-2 text-sm text-muted-foreground">No graph nodes match.</p>
      ) : null}
    </div>
  )
}

type FlowBlocksPanelProps = {
  flowBlocks: FlowBlock[]
  nodes: Node<DiagramNodeData>[]
  onRename: (blockId: string, name: string) => void
  onDelete: (blockId: string) => void
  onUpdateMembership: (blockId: string, nodeIds: string[]) => void
  blockInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>
}

function FlowBlocksPanel({
  flowBlocks,
  nodes,
  onRename,
  onDelete,
  onUpdateMembership,
  blockInputRefs,
}: FlowBlocksPanelProps) {
  if (flowBlocks.length === 0) return null
  return (
    <Panel position="top-left" className="pointer-events-auto m-3 flex max-w-80 flex-col gap-2">
      {flowBlocks.map(block => (
        <div
          key={block.id}
          role="group"
          aria-label={`${block.name} flow block`}
          className="bg-background/90 rounded-md border border-emerald-400/30 p-2 shadow-sm backdrop-blur"
        >
          <label className="sr-only" htmlFor={`flow-block-${block.id}`}>
            Rename {block.name} block
          </label>
          <input
            id={`flow-block-${block.id}`}
            ref={input => {
              blockInputRefs.current[block.id] = input
            }}
            className="h-7 w-full rounded border bg-background px-2 text-xs"
            value={block.name}
            onChange={event => onRename(block.id, event.target.value)}
          />
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{block.nodeIds.length} graph nodes</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Delete ${block.name} block`}
              onClick={() => onDelete(block.id)}
            >
              Delete
            </Button>
          </div>
          <fieldset className="mt-2 space-y-1">
            <legend className="text-xs text-muted-foreground">Block membership</legend>
            {nodes.map(node => {
              const checked = block.nodeIds.includes(node.id)
              const assignedElsewhere = node.data.blockId && node.data.blockId !== block.id
              return (
                <label key={node.id} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={Boolean(assignedElsewhere)}
                    onChange={() =>
                      onUpdateMembership(
                        block.id,
                        checked ? block.nodeIds.filter(nodeId => nodeId !== node.id) : [...block.nodeIds, node.id],
                      )
                    }
                  />
                  {node.data.label}
                </label>
              )
            })}
          </fieldset>
        </div>
      ))}
    </Panel>
  )
}

type FlowGraphCanvasProps = {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
  flowBlocks: FlowBlock[]
  layoutRefreshKey?: string | number | boolean
  flowInstanceRef: RefObject<ReactFlowInstance<Node<DiagramNodeData>, Edge> | null>
  onConnect: (connection: Connection) => void
  onReconnect: (edge: Edge, connection: Connection) => void
  onNodesChange: (changes: NodeChange<Node<DiagramNodeData>>[]) => void
  onNodeDragStop: (event: unknown, node: Node<DiagramNodeData>) => void
  isValidConnection: (connection: Connection | Edge) => boolean
  onSelectionChange: ({ nodes }: { nodes: Node[] }) => void
  onRenameBlock: (blockId: string, name: string) => void
  onDeleteBlock: (blockId: string) => void
  onUpdateBlockMembership: (blockId: string, nodeIds: string[]) => void
}

export function FlowGraphCanvas({
  nodes,
  edges,
  flowBlocks,
  layoutRefreshKey,
  flowInstanceRef,
  onConnect,
  onReconnect,
  onNodesChange,
  onNodeDragStop,
  isValidConnection,
  onSelectionChange,
  onRenameBlock,
  onDeleteBlock,
  onUpdateBlockMembership,
}: FlowGraphCanvasProps) {
  const blockInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const focusBlockEditor = useCallback((blockId: string) => blockInputRefs.current[blockId]?.focus(), [])
  const flowBlockBounds = getFlowBlockBounds(nodes, flowBlocks)
  return (
    <div className="relative min-h-80 flex-1 overflow-hidden rounded-md border border-white/[0.1] bg-[radial-gradient(circle_at_18%_8%,rgba(38,83,121,0.22),transparent_24rem),rgba(8,13,22,0.32)]">
      {nodes.length > 0 ? (
        <ReactFlow
          key={String(layoutRefreshKey ?? 'default')}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          colorMode="dark"
          onConnect={onConnect}
          onReconnect={onReconnect}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          isValidConnection={isValidConnection}
          onSelectionChange={onSelectionChange}
          onInit={instance => {
            flowInstanceRef.current = instance
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
          <FlowDiagramBlockOverlays
            flowBlockBounds={flowBlockBounds}
            onEditBlock={block => focusBlockEditor(block.id)}
            onDeleteBlock={onDeleteBlock}
          />
          <FlowBlocksPanel
            flowBlocks={flowBlocks}
            nodes={nodes}
            onRename={onRenameBlock}
            onDelete={onDeleteBlock}
            onUpdateMembership={onUpdateBlockMembership}
            blockInputRefs={blockInputRefs}
          />
        </ReactFlow>
      ) : (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Select a ready Step Definition and add the first graph node.
        </div>
      )}
    </div>
  )
}

type FlowBlockControlsProps = {
  enabled: boolean
  blockName: string
  selectedNodeCount: number
  onNameChange: (name: string) => void
  onCreate: () => void
}

export function FlowBlockControls({
  enabled,
  blockName,
  selectedNodeCount,
  onNameChange,
  onCreate,
}: FlowBlockControlsProps) {
  if (!enabled) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
      <input
        aria-label="Flow block name"
        className="h-9 rounded-md border bg-background px-2 text-sm"
        value={blockName}
        onChange={event => onNameChange(event.target.value)}
        placeholder="Block name"
      />
      <Button type="button" size="sm" variant="outline" disabled={selectedNodeCount < 2} onClick={onCreate}>
        Group selected nodes
      </Button>
    </div>
  )
}
