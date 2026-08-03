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
import { Boxes, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, type MutableRefObject, type ReactNode, type RefObject } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import type { FlowBlock } from '@/types/diagram/diagram'
import type { StepDefinitionOption } from '@/types/step-definition-option'

import type { AuthoredFlow } from './authored-flow-model'
import { getFlowBlockBounds } from './flow-block-helpers'
import { FlowDiagramBlockOverlays } from './flow-diagram-block-overlays'
import { StepDefinitionPicker } from './step-definition-picker'

export type DiagramNodeData = {
  label: string
  gherkinStep?: string
  parameters: Array<{ name: string; value: string }>
  onEdit: (nodeId: string) => void
  onInsert: (nodeId: string) => void
  onRemove: (nodeId: string) => void
  hasIncomingConnector: boolean
  hasOutgoingConnector: boolean
  blockId?: string
  blockName?: string
}

function FlowStepNode({ id, data }: NodeProps<Node<DiagramNodeData>>) {
  return (
    <div className="relative w-[31rem]">
      {data.hasIncomingConnector ? (
        <Handle
          type="target"
          position={Position.Left}
          id="target"
          className="z-20 !size-3 !border-2 !border-primary !bg-background"
          aria-label={`Connect before ${data.label}`}
        />
      ) : null}
      <Card className="border-border/80 bg-card/95 ring-primary/10 relative w-[28rem] overflow-hidden p-0 shadow-xl ring-1 backdrop-blur-sm">
        <CardHeader className="flex-row items-start justify-between gap-4 p-4">
          <div className="min-w-0">
            <CardTitle>{data.label}</CardTitle>
            {data.blockName ? (
              <Badge variant="outline" className="border-primary/30 bg-primary/5 mt-2 text-primary">
                Block: {data.blockName}
              </Badge>
            ) : null}
          </div>
          <div className="nodrag flex shrink-0 gap-2" data-node-actions>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Edit"
              data-invocation-edit={id}
              onClick={() => data.onEdit(id)}
            >
              <Pencil aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label={`Remove ${data.label}`}
              onClick={() => data.onRemove(id)}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="flex flex-col gap-3 p-4">
          {data.gherkinStep ? (
            <p className="bg-muted/35 rounded-md px-3 py-2 text-sm leading-relaxed text-muted-foreground">
              {data.gherkinStep}
            </p>
          ) : null}
          <div aria-label={`${data.label} parameters`}>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Parameters</p>
            {data.parameters.length > 0 ? (
              <dl className="grid grid-cols-2 gap-2">
                {data.parameters.map(parameter => (
                  <div
                    key={parameter.name}
                    className="border-border/70 bg-background/35 min-w-0 rounded-md border px-3 py-2"
                  >
                    <dt className="truncate text-xs text-muted-foreground">{parameter.name}</dt>
                    <dd className="mt-1 truncate font-mono text-xs font-medium text-foreground" title={parameter.value}>
                      {parameter.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-xs text-muted-foreground">No parameters configured</p>
            )}
          </div>
        </CardContent>
      </Card>
      {data.hasOutgoingConnector ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="source"
            className="!left-[28rem] !right-auto z-20 !size-3 !-translate-x-1/2 !-translate-y-1/2 !border-2 !border-primary !bg-background"
            aria-label={`Connect after ${data.label}`}
          />
          <div
            className="nodrag nopan absolute left-[28rem] top-1/2 z-10 flex -translate-y-1/2 items-center"
            data-edge-insert
          >
            <span className="h-0.5 w-7 bg-primary" aria-hidden />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="border-primary/60 relative z-10 size-7 rounded-full bg-background shadow-md hover:bg-primary hover:text-primary-foreground"
              aria-label={`Add connected step after ${data.label}`}
              data-invocation-insert={id}
              onClick={() => data.onInsert(id)}
            >
              <Plus aria-hidden />
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}

const nodeTypes = { flowStep: FlowStepNode }

type FlowAuthoringSidebarProps = {
  definitions: StepDefinitionOption[]
  value?: StepDefinitionOption
  onDefinitionChange: (definition?: StepDefinitionOption) => void
  children?: ReactNode
}

export function FlowAuthoringSidebar({ definitions, value, onDefinitionChange, children }: FlowAuthoringSidebarProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-col gap-4">
        <StepDefinitionPicker
          id="graph-step-definition"
          definitions={definitions}
          value={value}
          onChange={onDefinitionChange}
        />
        {children}
      </div>
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
  onAddFirst: () => void
  canAddFirst: boolean
}

function EmptyFlowCanvas({ canAddFirst, onAddFirst }: Pick<FlowGraphCanvasProps, 'canAddFirst' | 'onAddFirst'>) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <button
        type="button"
        data-invocation-insert="first"
        aria-label="Add first step"
        className="border-primary/55 bg-primary/[0.04] hover:bg-primary/[0.08] group flex min-h-28 w-64 flex-col items-center justify-center rounded-md border border-dashed p-5 text-center transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        disabled={!canAddFirst}
        onClick={onAddFirst}
      >
        <span className="border-primary/30 bg-primary/10 flex size-9 items-center justify-center rounded-md border text-primary">
          <Plus aria-hidden />
        </span>
        <span className="mt-3 text-sm font-medium text-foreground">Add first step</span>
        <span className="mt-1 text-xs text-muted-foreground">
          {canAddFirst ? 'Open step details to configure this node' : 'No ready Step Definitions are available'}
        </span>
      </button>
    </div>
  )
}

function PopulatedFlowCanvas({
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
}: Omit<FlowGraphCanvasProps, 'onAddFirst' | 'canAddFirst'>) {
  const blockInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const focusBlockEditor = useCallback((blockId: string) => blockInputRefs.current[blockId]?.focus(), [])
  const flowBlockBounds = getFlowBlockBounds(nodes, flowBlocks)
  return (
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
  )
}

export function FlowGraphCanvas(props: FlowGraphCanvasProps) {
  return (
    <div className="relative min-h-80 flex-1 overflow-hidden rounded-md border border-white/[0.1] bg-[radial-gradient(circle_at_18%_8%,rgba(38,83,121,0.22),transparent_24rem),rgba(8,13,22,0.32)]">
      {props.nodes.length > 0 ? (
        <PopulatedFlowCanvas {...props} />
      ) : (
        <EmptyFlowCanvas canAddFirst={props.canAddFirst} onAddFirst={props.onAddFirst} />
      )}
    </div>
  )
}

type FlowBlockControlsProps = {
  enabled: boolean
  disabled?: boolean
  blockName: string
  selectedNodeCount: number
  onNameChange: (name: string) => void
  onCreate: () => void
}

export function FlowBlockControls({
  enabled,
  disabled = false,
  blockName,
  selectedNodeCount,
  onNameChange,
  onCreate,
}: FlowBlockControlsProps) {
  if (!enabled) return null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="icon" variant="outline" aria-label="Create flow block" disabled={disabled}>
          <Boxes aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Create flow block</p>
          <p className="text-xs text-muted-foreground">Name a block for the selected graph nodes.</p>
        </div>
        <input
          aria-label="Flow block name"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={blockName}
          onChange={event => onNameChange(event.target.value)}
          placeholder="Block name"
        />
        <Button type="button" size="sm" disabled={selectedNodeCount < 2} onClick={onCreate}>
          <Boxes data-icon="inline-start" aria-hidden />
          Group selected nodes
        </Button>
      </PopoverContent>
    </Popover>
  )
}
