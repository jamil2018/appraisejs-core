import { describe, expect, it } from 'vitest'

import {
  appendFlowNode,
  assertValidAuthoredFlow,
  createAuthoredFlowNode,
  flowFromNodeOrder,
  insertFlowNode,
  nodeOrderFromFlow,
  reorderFlowNodes,
  removeFlowNode,
  updateFlowInvocation,
} from './authored-flow-model'
import type { StepDefinitionOption } from '@/types/step-definition-option'

const definition: StepDefinitionOption = {
  reference: { id: 'browser.viewport.set', version: '1', definitionHash: 'sha256:ready' },
  title: 'Set viewport',
  description: 'Sets a viewport.',
  signature: 'I set the viewport to {width}',
  keywordCompatibility: ['When'],
  groupId: 'browser',
  inputs: [{ name: 'width', type: 'number', required: true }],
}

describe('authored flow model', () => {
  it('keeps exact Step Definition references through add, insert, edit, and remove operations', () => {
    const first = createAuthoredFlowNode(definition, 'first')
    const second = createAuthoredFlowNode(definition, 'second')
    const appended = appendFlowNode([], first)
    const inserted = insertFlowNode(appended, 'first', second)
    const edited = updateFlowInvocation(inserted, 'second', definition, { width: 1280 })
    const result = nodeOrderFromFlow(removeFlowNode(edited, 'first'))

    expect(Object.keys(result)).toEqual(['second'])
    expect(result.second?.order).toBe(1)
    expect(result.second?.invocation).toMatchObject({
      step: definition.reference,
      inputs: { width: 1280 },
    })
    expect(flowFromNodeOrder(result)).toHaveLength(1)
  })

  it('rejects duplicate IDs, non-contiguous order, and references without a definition hash', () => {
    const node = createAuthoredFlowNode(definition, 'node')
    expect(() =>
      assertValidAuthoredFlow([
        { nodeId: 'node', node },
        { nodeId: 'node', node },
      ]),
    ).toThrow('unique node ID')
    expect(() => assertValidAuthoredFlow([{ nodeId: 'node', node: { ...node, order: 2 } }])).toThrow('contiguous')
    expect(() =>
      assertValidAuthoredFlow([
        {
          nodeId: 'node',
          node: { ...node, invocation: { ...node.invocation, step: { ...node.invocation.step, definitionHash: '' } } },
        },
      ]),
    ).toThrow('exact Step Definition reference')
  })

  it('rejects incompatible typed inputs instead of silently coercing them', () => {
    const node = createAuthoredFlowNode(definition, 'node')
    expect(() => updateFlowInvocation([{ nodeId: 'node', node }], 'node', definition, { width: 'wide' })).toThrow(
      'finite number',
    )
  })

  it('renders positional Gherkin placeholders from the definition inputs', () => {
    const positionalDefinition: StepDefinitionOption = {
      ...definition,
      signature: 'I navigate to the {string} url',
      inputs: [{ name: 'url', type: 'string', required: true }],
    }
    const node = createAuthoredFlowNode(positionalDefinition, 'node')
    const updated = updateFlowInvocation([{ nodeId: 'node', node }], 'node', positionalDefinition, { url: '/' })

    expect(updated[0]?.node.gherkinStep).toBe('When I navigate to the / url')
  })

  it('accepts contiguous zero-based persisted flow orders and normalizes writes to one-based orders', () => {
    const node = createAuthoredFlowNode(definition, 'node')
    const legacy = { nodeId: 'node', node: { ...node, order: 0 } }

    expect(flowFromNodeOrder({ node: legacy.node })).toEqual([legacy])
    expect(nodeOrderFromFlow([legacy]).node?.order).toBe(1)
  })

  it('omits optional blank inputs and never writes undefined parameter values', () => {
    const optionalDefinition: StepDefinitionOption = {
      ...definition,
      inputs: [
        { name: 'width', type: 'number', required: true },
        { name: 'options', type: 'json', required: false },
        { name: 'target', type: 'locator', required: false },
        { name: 'enabled', type: 'boolean', required: false },
      ],
    }
    const node = createAuthoredFlowNode(optionalDefinition, 'node')
    const updated = updateFlowInvocation([{ nodeId: 'node', node }], 'node', optionalDefinition, { width: 1280 })[0]!

    expect(updated.node.invocation.inputs).toEqual({ width: 1280 })
    expect(updated.node.parameters).toEqual([{ name: 'width', value: '1280', type: 'STRING', order: 0 }])
    expect(updated.node.parameters.some(parameter => Object.values(parameter).some(value => value === undefined))).toBe(
      false,
    )
  })

  it('reorders every node exactly once and rejects incomplete reorder requests', () => {
    const first = createAuthoredFlowNode(definition, 'first')
    const second = createAuthoredFlowNode(definition, 'second')
    const third = createAuthoredFlowNode(definition, 'third')
    const flow = [
      { nodeId: 'first', node: first },
      { nodeId: 'second', node: { ...second, order: 2 } },
      { nodeId: 'third', node: { ...third, order: 3 } },
    ]

    expect(reorderFlowNodes(flow, ['third', 'first', 'second']).map(item => item.nodeId)).toEqual([
      'third',
      'first',
      'second',
    ])
    expect(() => reorderFlowNodes(flow, ['first', 'first', 'second'])).toThrow('exactly once')
  })
})
