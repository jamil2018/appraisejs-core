// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { useCallback, useMemo, useState } from 'react'
import { describe, expect, it } from 'vitest'

import { createAuthoredFlowNode, flowFromNodeOrder, nodeOrderFromFlow, type AuthoredFlow } from './authored-flow-model'
import { useFlowInvocationController } from './flow-invocation-controller'
import { LinearStepEditor } from './linear-step-editor'
import type { FlowBlock, NodeOrderMap } from '@/types/diagram/diagram'
import type { StepDefinitionOption } from '@/types/step-definition-option'

const definition: StepDefinitionOption = {
  reference: { id: 'browser.viewport.set', version: '1', definitionHash: 'sha256:ready' },
  title: 'Set viewport',
  description: 'Sets a viewport.',
  signature: 'I set the viewport to {width}',
  keywordCompatibility: ['When'],
  groupId: 'browser',
  inputs: [{ name: 'width', type: 'number', required: true, defaultValue: 1280 }],
}

describe('LinearStepEditor', () => {
  it('disables typed insertion when no ready Step Definition is available', () => {
    const Harness = () => {
      const [nodes, setNodes] = useState<NodeOrderMap>({})
      const flow = useMemo(() => flowFromNodeOrder(nodes), [nodes])
      const publish = useCallback((next: AuthoredFlow) => setNodes(nodeOrderFromFlow(next) as NodeOrderMap), [])
      const invocationController = useFlowInvocationController({ flow, definitions: [], publish })
      return (
        <LinearStepEditor
          nodeOrder={nodes}
          stepDefinitions={[]}
          onNodeOrderChange={next => setNodes(next as NodeOrderMap)}
          invocationController={invocationController}
        />
      )
    }

    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Add step' })).toBeDisabled()
    expect(screen.queryByRole('dialog', { name: 'Insert step invocation' })).not.toBeInTheDocument()
  })

  it('opens typed insertion from the toolbar and does not persist a blank required input', () => {
    const Harness = () => {
      const [nodes, setNodes] = useState<NodeOrderMap>({})
      const flow = useMemo(() => flowFromNodeOrder(nodes), [nodes])
      const publish = useCallback((next: AuthoredFlow) => setNodes(nodeOrderFromFlow(next) as NodeOrderMap), [])
      const invocationController = useFlowInvocationController({ flow, definitions: [definition], publish })
      return (
        <>
          <LinearStepEditor
            nodeOrder={nodes}
            stepDefinitions={[definition]}
            onNodeOrderChange={next => setNodes(next as NodeOrderMap)}
            invocationController={invocationController}
          />
          <output aria-label="Node count">{Object.keys(nodes).length}</output>
        </>
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
    expect(screen.getByRole('dialog', { name: 'Insert step invocation' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('width'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(screen.getByText('width is required.')).toBeVisible()
    expect(screen.getByLabelText('Node count')).toHaveTextContent('0')

    fireEvent.change(screen.getByLabelText('width'), { target: { value: '1440' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(screen.getByLabelText('Node count')).toHaveTextContent('1')
  })

  it('moves the second row to the beginning through the same exact invocation state', () => {
    const Harness = () => {
      const [nodes, setNodes] = useState<NodeOrderMap>({
        first: createNode('first', 1),
        second: createNode('second', 2),
      })
      const flow = useMemo(() => flowFromNodeOrder(nodes), [nodes])
      const publish = useCallback((next: AuthoredFlow) => setNodes(nodeOrderFromFlow(next) as NodeOrderMap), [])
      const invocationController = useFlowInvocationController({ flow, definitions: [definition], publish })
      return (
        <>
          <LinearStepEditor
            nodeOrder={nodes}
            stepDefinitions={[definition]}
            onNodeOrderChange={next => setNodes(next as NodeOrderMap)}
            invocationController={invocationController}
          />
          <output aria-label="Node order">
            {Object.entries(nodes)
              .sort(([, left], [, right]) => left.order - right.order)
              .map(([nodeId]) => nodeId)
              .join(',')}
          </output>
        </>
      )
    }

    render(<Harness />)

    const moveButtons = screen.getAllByRole('button', { name: 'Move Set viewport up' })
    expect(moveButtons[0]).toBeDisabled()
    expect(moveButtons[1]).toBeEnabled()
    fireEvent.click(moveButtons[1]!)
    expect(screen.getByLabelText('Node order')).toHaveTextContent('second,first')
  })

  it('normalizes flow blocks after linear reorder and removal', () => {
    const first = createNode('first', 1)
    const second = createNode('second', 2)
    const third = createNode('third', 3)
    const Harness = () => {
      const [nodes, setNodes] = useState<NodeOrderMap>({ first, second, third })
      const [flowBlocks, setFlowBlocks] = useState<FlowBlock[]>([
        { id: 'setup', name: 'Setup', nodeIds: ['first', 'second'] },
      ])
      const flow = useMemo(() => flowFromNodeOrder(nodes), [nodes])
      const publish = useCallback((next: AuthoredFlow) => setNodes(nodeOrderFromFlow(next) as NodeOrderMap), [])
      const invocationController = useFlowInvocationController({
        flow,
        definitions: [definition],
        publish,
        flowBlocks,
        onFlowBlocksChange: setFlowBlocks,
      })
      return (
        <>
          <LinearStepEditor
            nodeOrder={nodes}
            stepDefinitions={[definition]}
            onNodeOrderChange={next => setNodes(next as NodeOrderMap)}
            invocationController={invocationController}
            flowBlocks={flowBlocks}
            onFlowBlocksChange={setFlowBlocks}
          />
          <output aria-label="Flow blocks">{JSON.stringify(flowBlocks)}</output>
        </>
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Move Set viewport down' })[1]!)
    expect(screen.getByLabelText('Flow blocks')).toHaveTextContent('[]')

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove Set viewport' })[0]!)
    expect(screen.getByLabelText('Flow blocks')).toHaveTextContent('[]')
  })
})

function createNode(nodeId: string, order: number) {
  return { ...createAuthoredFlowNode(definition, nodeId), order }
}
