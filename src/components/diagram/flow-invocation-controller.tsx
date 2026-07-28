'use client'

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { FlowBlock } from '@/types/diagram/diagram'
import type { StepDefinitionOption } from '@/types/step-definition-option'

import {
  createAuthoredFlowNode,
  createTemplateAuthoredFlowNode,
  insertFlowNode,
  moveFlowNode,
  reorderFlowNodes,
  removeFlowNode,
  updateFlowInvocation,
  type AuthoredFlow,
  type AuthoredFlowNode,
} from './authored-flow-model'
import { normalizeAuthoredFlowBlocks } from './authored-flow-blocks'
import { StepInvocationEditor } from './step-invocation-editor'
import type { StepInvocationResources } from './step-invocation-resources'

type InvocationSession = {
  definition: StepDefinitionOption
  editingNodeId: string | null
  insertingAfterNodeId: string | null
  values: Record<string, unknown>
  errors: Record<string, string>
  returnFocusTarget: HTMLElement | null
  returnFocusSelector: string
}

type FlowInvocationControllerOptions = {
  flow: AuthoredFlow
  /** Definitions available to resolve already-persisted invocation references. */
  definitions: StepDefinitionOption[]
  /** Ready-only definitions which may be selected for a new insertion. */
  readyDefinitions?: StepDefinitionOption[]
  publish: (flow: AuthoredFlow) => void
  flowBlocks?: FlowBlock[]
  onFlowBlocksChange?: (flowBlocks: FlowBlock[]) => void
  nodeKind?: 'test-case' | 'template-test-case'
}

export type FlowInvocationController = {
  activeDefinition?: StepDefinitionOption
  setSelectedDefinition: (definition?: StepDefinitionOption) => void
  session: InvocationSession | null
  closeEditor: () => void
  startEditing: (nodeId: string) => void
  startInserting: (afterNodeId: string | null) => void
  updateDraft: (name: string, value: unknown) => void
  updateErrors: (errors: Record<string, string>) => void
  saveEditor: (inputs: Record<string, unknown>) => void
  flowBlocks: FlowBlock[]
  removeNode: (nodeId: string) => void
  moveNode: (nodeId: string, afterNodeId: string | null) => void
  reorderNodes: (nodeIds: string[]) => void
  updateFlowBlocks: (flowBlocks: FlowBlock[]) => void
}

type InvocationEditorProps = {
  controller: FlowInvocationController
  resources: StepInvocationResources
  variant?: 'dialog' | 'sidebar'
}

function sameDefinition(
  reference: StepDefinitionOption['reference'],
  definition: StepDefinitionOption['reference'],
): boolean {
  return (
    reference.id === definition.id &&
    reference.version === definition.version &&
    reference.definitionHash === definition.definitionHash
  )
}

function mergeStepDefinitionOptions(
  readyDefinitions: StepDefinitionOption[],
  editorDefinitions: StepDefinitionOption[],
): StepDefinitionOption[] {
  return Array.from(
    new Map(
      [...readyDefinitions, ...editorDefinitions].map(definition => [
        `${definition.reference.id}@${definition.reference.version}@${definition.reference.definitionHash}`,
        definition,
      ]),
    ).values(),
  )
}

export function useMergedStepDefinitionOptions(
  readyDefinitions: StepDefinitionOption[],
  editorDefinitions: StepDefinitionOption[],
): StepDefinitionOption[] {
  return useMemo(
    () => mergeStepDefinitionOptions(readyDefinitions, editorDefinitions),
    [editorDefinitions, readyDefinitions],
  )
}

function definitionForFlowNode(
  nodeId: string,
  flow: AuthoredFlow,
  definitions: StepDefinitionOption[],
): StepDefinitionOption | undefined {
  const reference = flow.find(item => item.nodeId === nodeId)?.node.invocation.step
  return definitions.find(definition => reference && sameDefinition(reference, definition.reference))
}

function activeDefinitionFor(
  selectedDefinition: StepDefinitionOption | undefined,
  definitions: StepDefinitionOption[],
): StepDefinitionOption | undefined {
  if (!selectedDefinition) return undefined
  return definitions.some(definition => sameDefinition(definition.reference, selectedDefinition.reference))
    ? selectedDefinition
    : undefined
}

function editorSession(
  definition: StepDefinitionOption,
  editingNodeId: string | null,
  insertingAfterNodeId: string | null,
  values: Record<string, unknown>,
  returnFocusTarget: HTMLElement | null,
  returnFocusSelector: string,
): InvocationSession {
  return { definition, editingNodeId, insertingAfterNodeId, values, errors: {}, returnFocusTarget, returnFocusSelector }
}

function nodeForKind(
  definition: StepDefinitionOption,
  nodeKind: FlowInvocationControllerOptions['nodeKind'],
  nodeId = crypto.randomUUID(),
): AuthoredFlowNode {
  return nodeKind === 'template-test-case'
    ? createTemplateAuthoredFlowNode(definition, nodeId)
    : createAuthoredFlowNode(definition, nodeId)
}

function useFlowMutations({ flow, flowBlocks, publish, onFlowBlocksChange }: FlowInvocationControllerOptions) {
  const normalizedFlowBlocks = useMemo(() => normalizeAuthoredFlowBlocks(flow, flowBlocks ?? []), [flow, flowBlocks])
  const publishFlow = useCallback(
    (nextFlow: AuthoredFlow) => {
      publish(nextFlow)
      onFlowBlocksChange?.(normalizeAuthoredFlowBlocks(nextFlow, flowBlocks ?? []))
    },
    [flowBlocks, onFlowBlocksChange, publish],
  )
  const updateFlowBlocks = useCallback(
    (nextFlowBlocks: FlowBlock[]) => onFlowBlocksChange?.(normalizeAuthoredFlowBlocks(flow, nextFlowBlocks)),
    [flow, onFlowBlocksChange],
  )
  const removeNode = useCallback((nodeId: string) => publishFlow(removeFlowNode(flow, nodeId)), [flow, publishFlow])
  const moveNode = useCallback(
    (nodeId: string, afterNodeId: string | null) => publishFlow(moveFlowNode(flow, nodeId, afterNodeId)),
    [flow, publishFlow],
  )
  const reorderNodes = useCallback(
    (nodeIds: string[]) => publishFlow(reorderFlowNodes(flow, nodeIds)),
    [flow, publishFlow],
  )
  return { flowBlocks: normalizedFlowBlocks, publishFlow, updateFlowBlocks, removeNode, moveNode, reorderNodes }
}

export function FlowInvocationEditor({ controller, resources, variant }: InvocationEditorProps) {
  const session = controller.session
  if (!session) return null

  return (
    <StepInvocationEditor
      key={`${session.editingNodeId ?? session.insertingAfterNodeId ?? 'first'}-${session.definition.reference.definitionHash}`}
      title={session.editingNodeId ? 'Edit step invocation' : 'Insert step invocation'}
      definition={session.definition}
      values={session.values}
      errors={session.errors}
      onCancel={controller.closeEditor}
      onChange={controller.updateDraft}
      onErrorsChange={controller.updateErrors}
      onSave={controller.saveEditor}
      resources={resources}
      variant={variant}
    />
  )
}

export function useFlowInvocationController({
  flow,
  definitions,
  readyDefinitions = definitions,
  publish,
  flowBlocks,
  onFlowBlocksChange,
  nodeKind = 'test-case',
}: FlowInvocationControllerOptions): FlowInvocationController {
  const [selectedDefinition, setSelectedDefinition] = useState<StepDefinitionOption | undefined>(readyDefinitions[0])
  const [session, setSession] = useState<InvocationSession | null>(null)
  const pendingReturnFocusRef = useRef<Pick<InvocationSession, 'returnFocusTarget' | 'returnFocusSelector'> | null>(
    null,
  )
  const activeDefinition = useMemo(
    () => activeDefinitionFor(selectedDefinition, readyDefinitions),
    [readyDefinitions, selectedDefinition],
  )
  const {
    flowBlocks: normalizedFlowBlocks,
    publishFlow,
    updateFlowBlocks,
    removeNode,
    moveNode,
    reorderNodes,
  } = useFlowMutations({
    flow,
    definitions,
    publish,
    flowBlocks,
    onFlowBlocksChange,
    nodeKind,
  })
  useLayoutEffect(() => {
    if (session || !pendingReturnFocusRef.current) return
    const { returnFocusTarget, returnFocusSelector } = pendingReturnFocusRef.current
    pendingReturnFocusRef.current = null
    // Let React remove the dialog before returning focus. Otherwise the browser can
    // move focus back to <body> as it tears down the focused dialog subtree.
    window.setTimeout(() => {
      const fallback = document.querySelector<HTMLElement>(returnFocusSelector)
      const previousTarget =
        returnFocusTarget && returnFocusTarget !== document.body && returnFocusTarget.isConnected
          ? returnFocusTarget
          : fallback
      previousTarget?.focus()
    }, 0)
  }, [session])
  const closeEditor = useCallback(() => {
    setSession(current => {
      if (current) {
        pendingReturnFocusRef.current = current
      }
      return null
    })
  }, [])
  const startEditing = useCallback(
    (nodeId: string) => {
      const definition = definitionForFlowNode(nodeId, flow, definitions)
      const inputs = flow.find(item => item.nodeId === nodeId)?.node.invocation.inputs
      if (!definition || !inputs) return
      setSelectedDefinition(definition)
      setSession(
        editorSession(
          definition,
          nodeId,
          null,
          inputs,
          document.activeElement as HTMLElement | null,
          `[data-invocation-edit="${nodeId}"]`,
        ),
      )
    },
    [definitions, flow],
  )
  const startInserting = useCallback(
    (afterNodeId: string | null) => {
      if (!activeDefinition) return
      setSession(
        editorSession(
          activeDefinition,
          null,
          afterNodeId,
          nodeForKind(activeDefinition, nodeKind).invocation.inputs,
          document.activeElement as HTMLElement | null,
          `[data-invocation-insert="${afterNodeId ?? 'first'}"]`,
        ),
      )
    },
    [activeDefinition, nodeKind],
  )
  const updateDraft = useCallback((name: string, value: unknown) => {
    setSession(current => (current ? { ...current, values: { ...current.values, [name]: value } } : current))
  }, [])
  const selectDefinition = useCallback(
    (definition?: StepDefinitionOption) => {
      setSelectedDefinition(definition)
      if (!definition) return
      setSession(current => {
        if (!current || current.editingNodeId) return current
        return editorSession(
          definition,
          null,
          current.insertingAfterNodeId,
          nodeForKind(definition, nodeKind).invocation.inputs,
          current.returnFocusTarget,
          current.returnFocusSelector,
        )
      })
    },
    [nodeKind],
  )
  const updateErrors = useCallback((errors: Record<string, string>) => {
    setSession(current => (current ? { ...current, errors } : current))
  }, [])
  const saveEditor = useCallback(
    (inputs: Record<string, unknown>) => {
      if (!session) return
      const editingNodeId = session.editingNodeId
      if (editingNodeId) {
        publishFlow(updateFlowInvocation(flow, editingNodeId, session.definition, inputs))
      } else {
        const nodeId = crypto.randomUUID()
        const node = nodeForKind(session.definition, nodeKind, nodeId)
        const updated = updateFlowInvocation([{ nodeId, node }], nodeId, session.definition, inputs)[0]!.node
        publishFlow(insertFlowNode(flow, session.insertingAfterNodeId, updated))
      }
      closeEditor()
    },
    [closeEditor, flow, nodeKind, publishFlow, session],
  )

  return {
    activeDefinition,
    setSelectedDefinition: selectDefinition,
    session,
    closeEditor,
    startEditing,
    startInserting,
    updateDraft,
    updateErrors,
    saveEditor,
    flowBlocks: normalizedFlowBlocks,
    removeNode,
    moveNode,
    reorderNodes,
    updateFlowBlocks,
  }
}
