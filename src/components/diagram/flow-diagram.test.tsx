// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xyflow/react', () => ({
  Handle: ({ type, ...props }: { type: string }) => <div data-handle-type={type} {...props} />,
  Position: { Left: 'left', Right: 'right' },
  Background: () => null,
  Controls: () => null,
  Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ViewportPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
  applyNodeChanges: (
    changes: Array<{ id: string; type: 'position'; position: { x: number; y: number } }>,
    nodes: Array<{ id: string; position: { x: number; y: number } }>,
  ) =>
    nodes.map(node => {
      const change = changes.find(candidate => candidate.id === node.id && candidate.type === 'position')
      return change ? { ...node, position: change.position } : node
    }),
  ReactFlow: ({
    children,
    nodes,
    edges,
    nodeTypes,
    onConnect,
    onReconnect,
    onNodesChange,
    onNodeDragStop,
  }: {
    children: ReactNode
    nodes: Array<{ id: string; type: string; data: unknown; position: { x: number; y: number } }>
    edges: Array<{ id: string; source: string; target: string }>
    nodeTypes: Record<string, React.ComponentType<{ id: string; data: unknown }>>
    onConnect: (connection: { source: string; target: string }) => void
    onReconnect: (
      edge: { id: string; source: string; target: string },
      connection: { source: string; target: string },
    ) => void
    onNodesChange: (changes: Array<{ id: string; type: 'position'; position: { x: number; y: number } }>) => void
    onNodeDragStop: (
      event: unknown,
      node: { id: string; type: string; data: unknown; position: { x: number; y: number } },
    ) => void
  }) => (
    <div
      data-testid="react-flow"
      data-edge-count={edges.length}
      data-node-positions={JSON.stringify(nodes.map(({ id, position }) => ({ id, position })))}
    >
      {nodes.map(node => {
        const NodeComponent = nodeTypes[node.type]!
        return <NodeComponent key={node.id} id={node.id} data={node.data} />
      })}
      {edges.map(edge => (
        <div key={edge.id} data-testid={`edge-${edge.source}-${edge.target}`} />
      ))}
      <button type="button" onClick={() => onConnect({ source: nodes[0]!.id, target: nodes.at(-1)!.id })}>
        Connect first to last
      </button>
      <button
        type="button"
        onClick={() => onReconnect(edges.at(-1)!, { source: nodes[0]!.id, target: nodes.at(-1)!.id })}
      >
        Reconnect first to last
      </button>
      <button type="button" onClick={() => onNodeDragStop({}, { ...nodes.at(-1)!, position: { x: -1, y: 80 } })}>
        Drag last before first
      </button>
      <button
        type="button"
        onClick={() => onNodesChange([{ id: nodes.at(-1)!.id, type: 'position', position: { x: 999, y: 80 } }])}
      >
        Offset last node
      </button>
      {children}
    </div>
  ),
}))

import FlowDiagram, { isValidFlowConnection, parseStepInvocationInput } from './flow-diagram'
import { createAuthoredFlowNode, flowFromNodeOrder, nodeOrderFromFlow, type AuthoredFlow } from './authored-flow-model'
import { useFlowInvocationController } from './flow-invocation-controller'
import type { FlowDiagramProps } from './flow-diagram-types'
import type { StepDefinitionOption } from '@/types/step-definition-option'
import type { NodeData, NodeOrderMap } from '@/types/diagram/diagram'

const definition: StepDefinitionOption = {
  reference: { id: 'browser.viewport.set', version: '1', definitionHash: 'sha256:definition' },
  title: 'Set viewport',
  description: 'Sets viewport dimensions.',
  signature: 'I set viewport {width} by {height} enabled {enabled} options {options} at {target}',
  keywordCompatibility: ['When'],
  groupId: 'browser',
  inputs: [
    { name: 'width', type: 'number', required: true },
    { name: 'height', type: 'number', required: true, defaultValue: 720 },
    { name: 'enabled', type: 'boolean', required: true, defaultValue: false },
    { name: 'options', type: 'json', required: true },
    { name: 'target', type: 'locator', required: false },
  ],
}

function FlowDiagramTestHarness(props: FlowDiagramProps) {
  const { nodeOrder, onNodeOrderChange, stepDefinitions } = props
  const flow = useMemo(() => flowFromNodeOrder(nodeOrder), [nodeOrder])
  const publish = useCallback(
    (next: AuthoredFlow) => onNodeOrderChange(nodeOrderFromFlow(next) as FlowDiagramProps['nodeOrder']),
    [onNodeOrderChange],
  )
  const invocationController = useFlowInvocationController({
    flow,
    definitions: stepDefinitions,
    publish,
    flowBlocks: props.flowBlocks,
    onFlowBlocksChange: props.onFlowBlocksChange,
  })
  return <FlowDiagram {...props} invocationController={invocationController} />
}

function chooseStepDefinition(name: string) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Step Definition results' }))
  fireEvent.click(screen.getByRole('option', { name: new RegExp(name, 'i') }))
}

describe('typed Step Invocation input authoring', () => {
  it('disables unavailable graph tools and dismisses step details from the overlay', async () => {
    const onNodeOrderChange = vi.fn()
    const Harness = () => {
      const [nodeOrder, setNodeOrder] = useState<NodeOrderMap>({})
      return (
        <FlowDiagramTestHarness
          nodeOrder={nodeOrder}
          stepDefinitions={[]}
          locators={[]}
          locatorGroups={[]}
          environments={[]}
          modules={[]}
          onFlowBlocksChange={vi.fn()}
          onNodeOrderChange={next => {
            onNodeOrderChange(next)
            setNodeOrder(next as NodeOrderMap)
          }}
        />
      )
    }

    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Add first step' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create flow block' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Search nodes' })).toBeDisabled()
    expect(screen.queryByRole('dialog', { name: 'Step details' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open step details' }))

    expect(screen.getByRole('dialog', { name: 'Step details' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Add step' })).toBeDisabled()
    const overlay = document.querySelector('[data-slot="drawer-overlay"]')!
    fireEvent.pointerDown(overlay)
    fireEvent.pointerUp(overlay)
    fireEvent.click(overlay)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Step details' })).not.toBeInTheDocument())
    expect(onNodeOrderChange).not.toHaveBeenCalled()
  })

  it('enables flow block creation only when the graph has at least two nodes', () => {
    const first = createAuthoredFlowNode(definition, 'first')
    const second = { ...createAuthoredFlowNode(definition, 'second'), order: 2 }
    const commonProps = {
      stepDefinitions: [definition],
      locators: [],
      locatorGroups: [],
      environments: [],
      modules: [],
      onFlowBlocksChange: vi.fn(),
      onNodeOrderChange: vi.fn(),
    }
    const { rerender } = render(<FlowDiagramTestHarness {...commonProps} nodeOrder={{ first }} />)

    expect(screen.getByRole('button', { name: 'Create flow block' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Search nodes' })).toBeEnabled()

    rerender(<FlowDiagramTestHarness {...commonProps} nodeOrder={{ first, second }} />)
    expect(screen.getByRole('button', { name: 'Create flow block' })).toBeEnabled()
  })

  it('preserves numeric timeout and viewport dimensions instead of stringifying them', () => {
    const number = { name: 'timeout', type: 'number' as const, required: true }
    expect(parseStepInvocationInput(number, '250')).toBe(250)
    expect(parseStepInvocationInput({ ...number, name: 'width' }, '1280')).toBe(1280)
    expect(parseStepInvocationInput({ ...number, name: 'height' }, '720')).toBe(720)
    expect(parseStepInvocationInput(number, '')).toBe('')
    expect(() => parseStepInvocationInput(number, 'wide')).toThrow('finite number')
  })

  it('omits blank optional typed values while retaining required-value validation inputs', () => {
    expect(parseStepInvocationInput({ name: 'optionalNumber', type: 'number', required: false }, '')).toBeUndefined()
    expect(parseStepInvocationInput({ name: 'optionalJson', type: 'json', required: false }, '')).toBeUndefined()
    expect(parseStepInvocationInput({ name: 'optionalLocator', type: 'locator', required: false }, '')).toBeUndefined()
    expect(parseStepInvocationInput({ name: 'requiredNumber', type: 'number', required: true }, '')).toBe('')
  })

  it('rejects self-links and cross-block links so graph editing remains one executable path', () => {
    const membership = new Map([
      ['left', 'first-block'],
      ['right', 'second-block'],
    ])
    expect(isValidFlowConnection({ source: 'left', target: 'left' }, membership)).toBe(false)
    expect(isValidFlowConnection({ source: 'left', target: 'right' }, membership)).toBe(false)
    expect(isValidFlowConnection({ source: 'unblocked-left', target: 'unblocked-right' }, membership)).toBe(true)
  })

  it('opens typed insertion from the graph toolbar and only commits valid required inputs', () => {
    const onNodeOrderChange = vi.fn()
    const Harness = () => {
      const [nodeOrder, setNodeOrder] = useState({})
      return (
        <FlowDiagramTestHarness
          nodeOrder={nodeOrder}
          stepDefinitions={[definition]}
          locators={[]}
          locatorGroups={[]}
          environments={[]}
          modules={[]}
          onNodeOrderChange={next => {
            onNodeOrderChange(next)
            setNodeOrder(next as NodeOrderMap)
          }}
        />
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Add first step' }))
    expect(screen.getByRole('combobox', { name: 'Step Definition results' })).toHaveTextContent(
      'Select a ready Step Definition',
    )
    chooseStepDefinition('Set viewport')
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
    expect(screen.getByRole('dialog', { name: 'Insert step invocation' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('width'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(screen.getByText('width is required.')).toBeVisible()
    expect(onNodeOrderChange).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('width'), { target: { value: '1440' } })
    fireEvent.change(screen.getByLabelText('options'), { target: { value: '{}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    const node = Object.values(onNodeOrderChange.mock.calls.at(-1)![0] as Record<string, NodeData>)[0]!
    expect(node.invocation.inputs).toMatchObject({ width: 1440, height: 720, enabled: false, options: {} })
    expect(node.invocation.inputs).not.toHaveProperty('target')
    expect(node.invocation.step).toEqual(definition.reference)
  })

  it('refreshes sidebar input details when the selected definition changes during insertion', () => {
    const alternateDefinition = {
      ...definition,
      title: 'Wait for page',
      signature: 'I wait for {duration}',
      reference: {
        id: 'browser.waits.page-ready',
        version: '1',
        definitionHash: 'sha256:wait',
      },
      inputs: [{ name: 'duration', type: 'number' as const, required: true, defaultValue: 500 }],
    }
    render(
      <FlowDiagramTestHarness
        nodeOrder={{}}
        stepDefinitions={[definition, alternateDefinition]}
        locators={[]}
        locatorGroups={[]}
        environments={[]}
        modules={[]}
        onNodeOrderChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add first step' }))
    chooseStepDefinition('Set viewport')
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
    expect(screen.getByLabelText('width')).toBeVisible()
    chooseStepDefinition('Wait for page')
    expect(screen.getByLabelText('duration')).toBeVisible()
    expect(screen.queryByLabelText('width')).not.toBeInTheDocument()
  })

  it('renders real node handles and reorders a multi-node serial path through connect and reconnect', () => {
    const first = createAuthoredFlowNode(definition, 'first')
    const second = createAuthoredFlowNode(definition, 'second')
    const third = createAuthoredFlowNode(definition, 'third')
    const onNodeOrderChange = vi.fn()
    const Harness = () => {
      const [nodeOrder, setNodeOrder] = useState<NodeOrderMap>({
        first,
        second: { ...second, order: 2 },
        third: { ...third, order: 3 },
      })
      return (
        <FlowDiagramTestHarness
          nodeOrder={nodeOrder}
          stepDefinitions={[definition]}
          locators={[]}
          locatorGroups={[]}
          environments={[]}
          modules={[]}
          onNodeOrderChange={next => {
            onNodeOrderChange(next)
            setNodeOrder(next as NodeOrderMap)
          }}
        />
      )
    }

    render(<Harness />)
    expect(screen.getAllByTestId('react-flow')).toHaveLength(1)
    expect(screen.getAllByLabelText(/Connect before Set viewport/)).toHaveLength(3)
    expect(screen.getAllByLabelText(/Connect after Set viewport/)).toHaveLength(3)
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-edge-count', '2')

    fireEvent.click(screen.getByRole('button', { name: 'Offset last node' }))
    expect(screen.getByTestId('react-flow')).toHaveAttribute(
      'data-node-positions',
      JSON.stringify([
        { id: 'first', position: { x: 0, y: 80 } },
        { id: 'second', position: { x: 340, y: 80 } },
        { id: 'third', position: { x: 999, y: 80 } },
      ]),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Connect first to last' }))
    expect(Object.keys(onNodeOrderChange.mock.calls.at(-1)![0])).toEqual(['first', 'third', 'second'])
    expect(screen.getByTestId('edge-first-third')).toBeVisible()
    expect(screen.getByTestId('react-flow')).toHaveAttribute(
      'data-node-positions',
      JSON.stringify([
        { id: 'first', position: { x: 0, y: 80 } },
        { id: 'third', position: { x: 340, y: 80 } },
        { id: 'second', position: { x: 680, y: 80 } },
      ]),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect first to last' }))
    expect(Object.keys(onNodeOrderChange.mock.calls.at(-1)![0])).toEqual(['first', 'second', 'third'])

    fireEvent.click(screen.getByRole('button', { name: 'Drag last before first' }))
    expect(Object.keys(onNodeOrderChange.mock.calls.at(-1)![0])).toEqual(['third', 'first', 'second'])
  })

  it('moves the second graph node left to the start without dereferencing a missing predecessor', () => {
    const first = createAuthoredFlowNode(definition, 'first')
    const second = { ...createAuthoredFlowNode(definition, 'second'), order: 2 }
    const onNodeOrderChange = vi.fn()
    const Harness = () => {
      const [nodeOrder, setNodeOrder] = useState<NodeOrderMap>({ first, second })
      return (
        <FlowDiagramTestHarness
          nodeOrder={nodeOrder}
          stepDefinitions={[definition]}
          locators={[]}
          locatorGroups={[]}
          environments={[]}
          modules={[]}
          onNodeOrderChange={next => {
            onNodeOrderChange(next)
            setNodeOrder(next as NodeOrderMap)
          }}
        />
      )
    }

    render(<Harness />)
    const moveLeftButtons = screen.getAllByRole('button', { name: 'Move Set viewport left' })
    expect(moveLeftButtons[0]).toBeDisabled()
    expect(moveLeftButtons[1]).toBeEnabled()
    fireEvent.click(moveLeftButtons[1]!)
    expect(Object.keys(onNodeOrderChange.mock.calls.at(-1)![0])).toEqual(['second', 'first'])
  })

  it('rejects a cross-block graph connection without changing the canonical serial path', () => {
    const first = createAuthoredFlowNode(definition, 'first')
    const second = { ...createAuthoredFlowNode(definition, 'second'), order: 2 }
    const third = { ...createAuthoredFlowNode(definition, 'third'), order: 3 }
    const fourth = { ...createAuthoredFlowNode(definition, 'fourth'), order: 4 }
    const onNodeOrderChange = vi.fn()

    render(
      <FlowDiagramTestHarness
        nodeOrder={{ first, second, third, fourth }}
        stepDefinitions={[definition]}
        locators={[]}
        locatorGroups={[]}
        environments={[]}
        modules={[]}
        flowBlocks={[
          { id: 'setup', name: 'Setup', nodeIds: ['first', 'second'] },
          { id: 'exercise', name: 'Exercise', nodeIds: ['third', 'fourth'] },
        ]}
        onNodeOrderChange={onNodeOrderChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Connect first to last' }))
    expect(onNodeOrderChange).not.toHaveBeenCalled()
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-edge-count', '3')
  })

  it('keeps graph search shortcuts out of editable fields and exposes renameable flow-block overlays', () => {
    const onFlowBlocksChange = vi.fn()
    const node = createAuthoredFlowNode(definition, 'node-1')
    const secondNode = { ...createAuthoredFlowNode(definition, 'node-2'), order: 2 }
    const thirdNode = { ...createAuthoredFlowNode(definition, 'node-3'), order: 3 }
    render(
      <FlowDiagramTestHarness
        nodeOrder={{ 'node-1': node, 'node-2': secondNode, 'node-3': thirdNode }}
        stepDefinitions={[definition]}
        locators={[]}
        locatorGroups={[]}
        environments={[]}
        modules={[]}
        flowBlocks={[{ id: 'block-1', name: 'Setup', nodeIds: ['node-1', 'node-2'] }]}
        onFlowBlocksChange={onFlowBlocksChange}
        onNodeOrderChange={vi.fn()}
      />,
    )

    fireEvent.keyDown(window, { key: 's', ctrlKey: true, shiftKey: true })
    expect(screen.getByLabelText('Search flow nodes')).toBeVisible()
    expect(screen.getByLabelText('Search flow nodes')).toHaveFocus()
    fireEvent.keyDown(screen.getByLabelText('Search flow nodes'), { key: 'c', ctrlKey: true, shiftKey: true })
    expect(screen.queryByRole('dialog', { name: 'Insert step invocation' })).not.toBeInTheDocument()

    expect(screen.getByRole('group', { name: 'Setup flow block' })).toBeVisible()
    expect(screen.getAllByText('Block: Setup')).toHaveLength(2)
    expect(screen.getByLabelText('Edit Setup')).toBeVisible()
    expect(screen.getByLabelText('Delete Setup')).toBeVisible()
    expect(screen.getByTestId('react-flow').querySelector('[data-flow-block-overlay="block-1"]')).toHaveStyle({
      left: '-32px',
      top: '48px',
      width: '664px',
      height: '224px',
    })
    fireEvent.click(screen.getByLabelText('Edit Setup'))
    expect(screen.getByLabelText('Rename Setup block')).toHaveFocus()
    fireEvent.change(screen.getByLabelText('Rename Setup block'), { target: { value: 'Arrange' } })
    expect(onFlowBlocksChange).toHaveBeenLastCalledWith([
      { id: 'block-1', name: 'Arrange', nodeIds: ['node-1', 'node-2'] },
    ])
    fireEvent.click(within(screen.getByRole('group', { name: 'Setup flow block' })).getAllByRole('checkbox')[2]!)
    expect(onFlowBlocksChange).toHaveBeenLastCalledWith([
      { id: 'block-1', name: 'Setup', nodeIds: ['node-1', 'node-2', 'node-3'] },
    ])
  })

  it('normalizes grouped membership when removing a grouped node', () => {
    const first = createAuthoredFlowNode(definition, 'first')
    const second = { ...createAuthoredFlowNode(definition, 'second'), order: 2 }
    const onFlowBlocksChange = vi.fn()
    render(
      <FlowDiagramTestHarness
        nodeOrder={{ first, second }}
        stepDefinitions={[definition]}
        locators={[]}
        locatorGroups={[]}
        environments={[]}
        modules={[]}
        flowBlocks={[{ id: 'setup', name: 'Setup', nodeIds: ['first', 'second'] }]}
        onFlowBlocksChange={onFlowBlocksChange}
        onNodeOrderChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove Set viewport' })[0]!)
    expect(onFlowBlocksChange).toHaveBeenLastCalledWith([])
  })
})
