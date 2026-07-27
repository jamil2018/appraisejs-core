import type {
  NodeData,
  NodeOrderMap,
  TemplateTestCaseNodeData,
  TemplateTestCaseNodeOrderMap,
} from '@/types/diagram/diagram'
import type { StepDefinitionOption } from '@/types/step-definition-option'

export type AuthoredFlowNode = NodeOrderMap[string] | TemplateTestCaseNodeOrderMap[string]

export type AuthoredFlowItem = {
  nodeId: string
  node: AuthoredFlowNode
}

export type AuthoredFlow = AuthoredFlowItem[]

type NodeOrder = NodeOrderMap | TemplateTestCaseNodeOrderMap

function presentationFor(definition: StepDefinitionOption, inputs: Record<string, unknown>): string {
  let inputIndex = 0
  const description = definition.signature.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const input = definition.inputs[inputIndex++]
    const value = inputs[name] ?? (input ? inputs[input.name] : undefined)
    return String(value ?? `{${name}}`)
  })
  return `${definition.keywordCompatibility[0] ?? 'When'} ${description}`
}

function parameterValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function inputParameters(definition: StepDefinitionOption, inputs: Record<string, unknown>) {
  return definition.inputs.flatMap((input, order) => {
    if (!(input.name in inputs)) return []
    return [{ name: input.name, value: parameterValue(inputs[input.name]), type: 'STRING' as const, order }]
  })
}

function templateInputParameters(definition: StepDefinitionOption, inputs: Record<string, unknown>) {
  return definition.inputs.flatMap((input, order) => {
    if (!(input.name in inputs)) return []
    return [{ name: input.name, defaultValue: parameterValue(inputs[input.name]), type: 'STRING' as const, order }]
  })
}

function isTestCaseNode(node: AuthoredFlowNode): node is NodeData {
  return node.parameters.every(parameter => 'value' in parameter)
}

function validateInput(definition: StepDefinitionOption['inputs'][number], value: unknown): void {
  if (value === undefined || value === '') {
    if (definition.required) throw new Error(`${definition.name} is required.`)
    return
  }

  if (definition.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(`${definition.name} must be a finite number.`)
  }
  if (definition.type === 'boolean' && typeof value !== 'boolean') {
    throw new Error(`${definition.name} must be a boolean.`)
  }
}

export function assertValidAuthoredFlow(items: AuthoredFlow, definitions?: StepDefinitionOption[]): void {
  const ids = new Set<string>()
  const sorted = [...items].sort((left, right) => left.node.order - right.node.order)
  const startingOrder = sorted[0]?.node.order ?? 1
  if (startingOrder !== 0 && startingOrder !== 1) {
    throw new Error('Authored flow orders must be contiguous and start at 0 or 1.')
  }

  sorted.forEach((item, index) => {
    if (!item.nodeId || ids.has(item.nodeId)) throw new Error('Each authored flow node needs a unique node ID.')
    ids.add(item.nodeId)
    if (item.node.order !== startingOrder + index) throw new Error('Authored flow orders must be contiguous.')
    if (
      !item.node.invocation?.step?.id ||
      !item.node.invocation.step.version ||
      !item.node.invocation.step.definitionHash
    ) {
      throw new Error(`Step ${item.nodeId} must retain an exact Step Definition reference.`)
    }
    const definition = definitions?.find(
      option =>
        option.reference.id === item.node.invocation.step.id &&
        option.reference.version === item.node.invocation.step.version &&
        option.reference.definitionHash === item.node.invocation.step.definitionHash,
    )
    definition?.inputs.forEach(input => validateInput(input, item.node.invocation.inputs[input.name]))
  })
}

export function flowFromNodeOrder(nodeOrder: NodeOrder): AuthoredFlow {
  const items = Object.entries(nodeOrder).map(([key, node]) => ({ nodeId: node.nodeId ?? key, node }))
  assertValidAuthoredFlow(items)
  return items.sort((left, right) => left.node.order - right.node.order)
}

export function nodeOrderFromFlow<T extends NodeOrder>(items: AuthoredFlow): T {
  const normalized = items.map((item, index) => ({
    ...item,
    node: { ...item.node, nodeId: item.nodeId, order: index + 1 },
  }))
  assertValidAuthoredFlow(normalized)
  return Object.fromEntries(normalized.map(item => [item.nodeId, item.node])) as T
}

function initialInvocation(definition: StepDefinitionOption) {
  const inputs = Object.fromEntries(
    definition.inputs.flatMap(input => {
      if (input.defaultValue !== undefined) return [[input.name, input.defaultValue]]
      return input.required ? [[input.name, '']] : []
    }),
  )
  const gherkinStep = presentationFor(definition, inputs)
  return { inputs, gherkinStep }
}

export function createAuthoredFlowNode(definition: StepDefinitionOption, nodeId = crypto.randomUUID()): NodeData {
  const { inputs, gherkinStep } = initialInvocation(definition)
  return {
    nodeId,
    order: 1,
    label: definition.title,
    gherkinStep,
    icon: 'MOUSE',
    parameters: inputParameters(definition, inputs),
    invocation: {
      step: definition.reference,
      inputs,
      presentation: {
        keyword: definition.keywordCompatibility[0] ?? 'When',
        description: gherkinStep.replace(/^(Given|When|Then|And)\s+/, ''),
      },
    },
  }
}

export function createTemplateAuthoredFlowNode(
  definition: StepDefinitionOption,
  nodeId = crypto.randomUUID(),
): TemplateTestCaseNodeData {
  const { inputs, gherkinStep } = initialInvocation(definition)
  return {
    nodeId,
    order: 1,
    label: definition.title,
    gherkinStep,
    icon: 'MOUSE',
    parameters: templateInputParameters(definition, inputs),
    invocation: {
      step: definition.reference,
      inputs,
      presentation: {
        keyword: definition.keywordCompatibility[0] ?? 'When',
        description: gherkinStep.replace(/^(Given|When|Then|And)\s+/, ''),
      },
    },
  }
}

export function appendFlowNode(items: AuthoredFlow, node: AuthoredFlowNode): AuthoredFlow {
  return [...items, { nodeId: node.nodeId ?? crypto.randomUUID(), node }]
}

export function insertFlowNode(items: AuthoredFlow, afterNodeId: string | null, node: AuthoredFlowNode): AuthoredFlow {
  const item = { nodeId: node.nodeId ?? crypto.randomUUID(), node }
  if (afterNodeId === null) return [item, ...items]
  const index = items.findIndex(current => current.nodeId === afterNodeId)
  if (index < 0) throw new Error(`Cannot insert after unknown node ${afterNodeId}.`)
  return [...items.slice(0, index + 1), item, ...items.slice(index + 1)]
}

export function removeFlowNode(items: AuthoredFlow, nodeId: string): AuthoredFlow {
  if (!items.some(item => item.nodeId === nodeId)) throw new Error(`Cannot remove unknown node ${nodeId}.`)
  return items.filter(item => item.nodeId !== nodeId)
}

export function moveFlowNode(items: AuthoredFlow, nodeId: string, afterNodeId: string | null): AuthoredFlow {
  const item = items.find(current => current.nodeId === nodeId)
  if (!item) throw new Error(`Cannot move unknown node ${nodeId}.`)
  const withoutItem = items.filter(current => current.nodeId !== nodeId)
  return insertFlowNode(withoutItem, afterNodeId, item.node)
}

export function reorderFlowNodes(items: AuthoredFlow, nodeIds: string[]): AuthoredFlow {
  if (nodeIds.length !== items.length || new Set(nodeIds).size !== items.length) {
    throw new Error('Flow reorder must include each node exactly once.')
  }
  const nodesById = new Map(items.map(item => [item.nodeId, item]))
  const reordered = nodeIds.map(nodeId => nodesById.get(nodeId))
  if (reordered.some(item => !item)) throw new Error('Flow reorder contains an unknown node ID.')
  return reordered as AuthoredFlow
}

export function updateFlowInvocation(
  items: AuthoredFlow,
  nodeId: string,
  definition: StepDefinitionOption,
  inputs: Record<string, unknown>,
): AuthoredFlow {
  definition.inputs.forEach(input => validateInput(input, inputs[input.name]))
  return items.map(item => {
    if (item.nodeId !== nodeId) return item
    const gherkinStep = presentationFor(definition, inputs)
    const invocation = {
      ...item.node.invocation,
      step: definition.reference,
      inputs,
      presentation: {
        keyword: definition.keywordCompatibility[0] ?? 'When',
        description: gherkinStep.replace(/^(Given|When|Then|And)\s+/, ''),
      },
    }
    const node: NodeData | TemplateTestCaseNodeData = isTestCaseNode(item.node)
      ? {
          ...item.node,
          label: definition.title,
          gherkinStep,
          parameters: inputParameters(definition, inputs),
          invocation,
        }
      : {
          ...item.node,
          label: definition.title,
          gherkinStep,
          parameters: templateInputParameters(definition, inputs),
          invocation,
        }
    return {
      ...item,
      node,
    }
  })
}
