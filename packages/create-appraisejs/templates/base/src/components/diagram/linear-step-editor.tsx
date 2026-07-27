'use client'

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useMemo } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { FlowBlock, NodeOrderMap, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'
import type { StepDefinitionOption } from '@/types/step-definition-option'
import type { Environment, Locator, LocatorGroup, Module } from '@prisma/client'
import type { InlineLocatorSaveResult } from '@/app/(base)/locators/create/create-locator-workspace-helpers'

import { flowFromNodeOrder, type AuthoredFlow, type AuthoredFlowItem } from './authored-flow-model'
import { FlowInvocationEditor, type FlowInvocationController } from './flow-invocation-controller'
import { StepDefinitionPicker } from './step-definition-picker'

const EMPTY_RESOURCES: never[] = []

export type LinearStepEditorProps = {
  nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap
  stepDefinitions: StepDefinitionOption[]
  onNodeOrderChange: (nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap) => void
  locators?: Array<Pick<Locator, 'id' | 'name' | 'locatorGroupId'>>
  locatorGroups?: Array<Pick<LocatorGroup, 'id' | 'name' | 'route' | 'moduleId'>>
  environments?: Array<Pick<Environment, 'id' | 'name'>>
  modules?: Array<Pick<Module, 'id' | 'name' | 'parentId'>>
  onInlineLocatorSave?: (result: InlineLocatorSaveResult) => void
  flowBlocks?: FlowBlock[]
  onFlowBlocksChange?: (flowBlocks: FlowBlock[]) => void
  invocationController: FlowInvocationController
}

type LinearStepListProps = {
  flow: AuthoredFlow
  onEdit: (nodeId: string) => void
  onInsert: (nodeId: string) => void
  onMove: (nodeId: string, afterNodeId: string | null) => void
  onRemove: (nodeId: string) => void
}

function LinearStepRow({
  item,
  index,
  canMoveUp,
  precedingNodeId,
  followingNodeId,
  onEdit,
  onInsert,
  onMove,
  onRemove,
}: {
  item: AuthoredFlowItem
  index: number
  canMoveUp: boolean
  precedingNodeId: string | null
  followingNodeId?: string
  onEdit: (nodeId: string) => void
  onInsert: (nodeId: string) => void
  onMove: (nodeId: string, afterNodeId: string | null) => void
  onRemove: (nodeId: string) => void
}) {
  const { node, nodeId } = item
  return (
    <Card className="flex flex-wrap items-center gap-3 p-3">
      <span className="w-6 text-sm text-muted-foreground">{index + 1}</span>
      <div className="min-w-48 flex-1">
        <p className="font-medium">{node.label}</p>
        <p className="text-sm text-muted-foreground">{node.gherkinStep}</p>
      </div>
      <Button type="button" size="sm" variant="outline" data-invocation-edit={nodeId} onClick={() => onEdit(nodeId)}>
        <Pencil className="size-3" aria-hidden /> Edit
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-invocation-insert={nodeId}
        onClick={() => onInsert(nodeId)}
      >
        <Plus className="size-3" aria-hidden /> Insert after
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={`Move ${node.label} up`}
        disabled={!canMoveUp}
        onClick={() => onMove(nodeId, precedingNodeId)}
      >
        <ArrowUp className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={`Move ${node.label} down`}
        disabled={!followingNodeId}
        onClick={() => onMove(nodeId, followingNodeId ?? null)}
      >
        <ArrowDown className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={`Remove ${node.label}`}
        onClick={() => onRemove(nodeId)}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </Card>
  )
}

function LinearStepList({ flow, onEdit, onInsert, onMove, onRemove }: LinearStepListProps) {
  if (flow.length === 0) return <p className="text-sm text-muted-foreground">Add a ready Step Definition to begin.</p>

  return flow.map((item, index) => (
    <LinearStepRow
      key={item.nodeId}
      item={item}
      index={index}
      canMoveUp={index > 0}
      precedingNodeId={flow[index - 2]?.nodeId ?? null}
      followingNodeId={flow[index + 1]?.nodeId}
      onEdit={onEdit}
      onInsert={onInsert}
      onMove={onMove}
      onRemove={onRemove}
    />
  ))
}

export function LinearStepEditor({
  nodeOrder,
  stepDefinitions,
  locators = EMPTY_RESOURCES,
  locatorGroups = EMPTY_RESOURCES,
  environments = EMPTY_RESOURCES,
  modules = EMPTY_RESOURCES,
  onInlineLocatorSave,
  invocationController,
}: LinearStepEditorProps) {
  const flow = useMemo(() => flowFromNodeOrder(nodeOrder), [nodeOrder])
  const editor = invocationController
  const addStep = useCallback(() => editor.startInserting(flow.at(-1)?.nodeId ?? null), [editor, flow])

  return (
    <section className="flex h-full min-h-0 flex-col gap-3" aria-label="Linear step editor">
      <div className="flex flex-wrap items-end gap-3">
        <StepDefinitionPicker
          definitions={stepDefinitions}
          value={editor.activeDefinition}
          onChange={editor.setSelectedDefinition}
        />
        <Button type="button" disabled={!editor.activeDefinition} onClick={addStep}>
          <Plus className="size-4" aria-hidden /> Add step
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto">
        <LinearStepList
          flow={flow}
          onEdit={editor.startEditing}
          onInsert={editor.startInserting}
          onMove={editor.moveNode}
          onRemove={editor.removeNode}
        />
      </div>
      <FlowInvocationEditor
        controller={editor}
        resources={{ locators, locatorGroups, environments, modules, onInlineLocatorSave }}
      />
    </section>
  )
}
