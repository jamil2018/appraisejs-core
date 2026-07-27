// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { useCallback, useMemo, useState } from 'react'
import { describe, expect, it } from 'vitest'

import type { FlowBlock, NodeOrderMap } from '@/types/diagram/diagram'
import type { StepDefinitionOption } from '@/types/step-definition-option'

import { createAuthoredFlowNode, flowFromNodeOrder, nodeOrderFromFlow, type AuthoredFlow } from './authored-flow-model'
import { useFlowInvocationController } from './flow-invocation-controller'

const definition: StepDefinitionOption = {
  reference: { id: 'browser.viewport.set', version: '1', definitionHash: 'sha256:controller' },
  title: 'Set viewport',
  description: 'Sets a viewport.',
  signature: 'I set the viewport to {width}',
  keywordCompatibility: ['When'],
  groupId: 'browser',
  inputs: [{ name: 'width', type: 'number', required: true, defaultValue: 1280 }],
}

function node(nodeId: string, order: number) {
  return { ...createAuthoredFlowNode(definition, nodeId), order }
}

describe('useFlowInvocationController', () => {
  it('publishes canonical reorder and normalized block state from one form-owned mutation', () => {
    const Harness = () => {
      const [nodes, setNodes] = useState<NodeOrderMap>({
        first: node('first', 1),
        second: node('second', 2),
        third: node('third', 3),
      })
      const [flowBlocks, setFlowBlocks] = useState<FlowBlock[]>([
        { id: 'setup', name: 'Setup', nodeIds: ['first', 'second'] },
      ])
      const flow = useMemo(() => flowFromNodeOrder(nodes), [nodes])
      const publish = useCallback((next: AuthoredFlow) => setNodes(nodeOrderFromFlow(next) as NodeOrderMap), [])
      const controller = useFlowInvocationController({
        flow,
        definitions: [definition],
        publish,
        flowBlocks,
        onFlowBlocksChange: setFlowBlocks,
      })

      return (
        <>
          <button type="button" onClick={() => controller.moveNode('third', 'first')}>
            Move third
          </button>
          <button type="button" onClick={() => controller.reorderNodes(['second', 'first', 'third'])}>
            Reorder nodes
          </button>
          <button type="button" onClick={() => controller.removeNode('first')}>
            Remove first
          </button>
          <output aria-label="Node order">
            {Object.entries(nodes)
              .sort(([, left], [, right]) => left.order - right.order)
              .map(([nodeId]) => nodeId)
              .join(',')}
          </output>
          <output aria-label="Flow blocks">{JSON.stringify(flowBlocks)}</output>
        </>
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Move third' }))
    expect(screen.getByLabelText('Node order')).toHaveTextContent('first,third,second')
    expect(screen.getByLabelText('Flow blocks')).toHaveTextContent('[]')

    fireEvent.click(screen.getByRole('button', { name: 'Reorder nodes' }))
    expect(screen.getByLabelText('Node order')).toHaveTextContent('second,first,third')

    fireEvent.click(screen.getByRole('button', { name: 'Remove first' }))
    expect(screen.getByLabelText('Node order')).toHaveTextContent('second,third')
    expect(screen.getByLabelText('Flow blocks')).toHaveTextContent('[]')
  })
})
