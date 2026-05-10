// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StepParameterType, TemplateStepIcon } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import OptionsHeaderNode from './options-header-node'

const xyflowMocks = vi.hoisted(() => ({
  nodeId: 'node-1',
  setNodes: vi.fn(),
}))

vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-testid={`${type}-handle`} data-position={position} />
  ),
  Position: {
    Left: 'left',
    Right: 'right',
  },
  useNodeId: () => xyflowMocks.nodeId,
  useReactFlow: () => ({
    setNodes: xyflowMocks.setNodes,
  }),
}))

function renderOptionsHeaderNode(
  data: Record<string, unknown> = {},
  props: {
    selected?: boolean
    onEdit?: (nodeId: string) => void
    onAddConnectedNode?: (nodeId: string) => void
  } = {},
) {
  const onEdit = props.onEdit ?? vi.fn()
  const onAddConnectedNode = props.onAddConnectedNode ?? vi.fn()

  render(
    <OptionsHeaderNode
      {...({
        selected: props.selected ?? false,
        data: {
          label: 'Click submit',
          gherkinStep: 'When click "Submit"',
          icon: TemplateStepIcon.MOUSE,
          isFirstNode: false,
          parameters: [
            {
              name: 'count',
              value: '3',
              type: StepParameterType.NUMBER,
              order: 2,
            },
            {
              name: 'target',
              value: 'Submit',
              type: StepParameterType.STRING,
              order: 1,
            },
          ],
          ...data,
        },
      } as never)}
      onEdit={onEdit}
      onAddConnectedNode={onAddConnectedNode}
    />,
  )

  return { onEdit, onAddConnectedNode }
}

describe('OptionsHeaderNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the large icon, title, and hover-triggered gherkin param tooltips', async () => {
    const user = userEvent.setup()
    renderOptionsHeaderNode()

    expect(screen.getByTestId('node-step-icon')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Click submit' })).toBeInTheDocument()
    await user.hover(screen.getByTestId('options-header-node'))
    expect(screen.getByText('When click "', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Submit')).toBeInTheDocument()
    expect(screen.queryByText('target')).not.toBeInTheDocument()
    await user.hover(screen.getByText('Submit'))

    expect(await screen.findByRole('tooltip')).toHaveTextContent('target')
  })

  it('calls the edit callback with the current node id', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    renderOptionsHeaderNode({}, { onEdit })

    await user.hover(screen.getByTestId('options-header-node'))
    await user.click(screen.getByRole('button', { name: /edit/i }))

    expect(onEdit).toHaveBeenCalledWith('node-1')
  })

  it('always renders the add-connected button', () => {
    renderOptionsHeaderNode()

    expect(screen.getByRole('button', { name: /add connected node/i })).toBeInTheDocument()
  })

  it('renders the add-connected button when selected', () => {
    renderOptionsHeaderNode({}, { selected: true })

    expect(screen.getByRole('button', { name: /add connected node/i })).toBeInTheDocument()
  })

  it('calls the add-connected callback with the current node id', async () => {
    const user = userEvent.setup()
    const onAddConnectedNode = vi.fn()
    renderOptionsHeaderNode({}, { onAddConnectedNode })

    await user.hover(screen.getByTestId('options-header-node'))
    await user.click(screen.getByRole('button', { name: /add connected node/i }))

    expect(onAddConnectedNode).toHaveBeenCalledWith('node-1')
  })

  it('hides the add-connected button when the node already has an outgoing connection', () => {
    const onAddConnectedNode = vi.fn()
    renderOptionsHeaderNode({ hasOutgoingConnection: true }, { onAddConnectedNode })

    expect(screen.queryByRole('button', { name: /add connected node/i })).not.toBeInTheDocument()
    expect(onAddConnectedNode).not.toHaveBeenCalled()
  })

  it('hides the add-connected button while a connection drag is in progress', () => {
    const onAddConnectedNode = vi.fn()
    renderOptionsHeaderNode({ isConnectionInProgress: true }, { onAddConnectedNode })

    expect(screen.queryByRole('button', { name: /add connected node/i })).not.toBeInTheDocument()
    expect(onAddConnectedNode).not.toHaveBeenCalled()
  })

  it('removes the current node from React Flow state on delete', async () => {
    const user = userEvent.setup()
    renderOptionsHeaderNode()

    await user.hover(screen.getByTestId('options-header-node'))
    await user.click(screen.getByRole('button', { name: /delete/i }))

    expect(xyflowMocks.setNodes).toHaveBeenCalledTimes(1)

    const updateNodes = xyflowMocks.setNodes.mock.calls[0]?.[0] as (
      nodes: Array<{ id: string }>,
    ) => Array<{ id: string }>

    expect(updateNodes([{ id: 'node-1' }, { id: 'node-2' }])).toEqual([{ id: 'node-2' }])
  })

  it('disables node deletion when the flow structure is locked', async () => {
    const user = userEvent.setup()
    renderOptionsHeaderNode({ isDeleteDisabled: true })

    await user.hover(screen.getByTestId('options-header-node'))

    const deleteButton = screen.getByRole('button', { name: /delete/i })
    expect(deleteButton).toBeDisabled()
    await user.click(deleteButton)

    expect(xyflowMocks.setNodes).not.toHaveBeenCalled()
  })

  it('keeps missing-param warning nodes readable and omits empty chip rows', async () => {
    const user = userEvent.setup()
    renderOptionsHeaderNode({
      isMissingParams: true,
      parameters: [],
    })

    expect(screen.getByTestId('options-header-node')).toHaveAttribute('data-missing-params', 'true')
    expect(screen.getByRole('heading', { name: 'Click submit' })).toBeInTheDocument()
    await user.hover(screen.getByTestId('options-header-node'))
    expect(screen.getByText('When click "Submit"')).toBeInTheDocument()
    expect(screen.queryByTestId('node-param-chip-row')).not.toBeInTheDocument()
  })

  it('styles start nodes with rounded left edge and hides incoming handle', () => {
    renderOptionsHeaderNode({ isFirstNode: true })

    expect(screen.getByTestId('options-header-node')).toHaveAttribute('data-first-node', 'true')
    expect(screen.getByTestId('options-header-node')).toHaveClass('rounded-l-3xl')
    expect(screen.queryByTestId('target-handle')).not.toBeInTheDocument()
    expect(screen.getByTestId('source-handle')).toBeInTheDocument()
  })

  it('marks search-highlighted nodes without removing missing-param or start-node styling', () => {
    renderOptionsHeaderNode({
      isSearchHighlighted: true,
      isMissingParams: true,
      isFirstNode: true,
    })

    expect(screen.getByTestId('options-header-node')).toHaveAttribute('data-search-highlighted', 'true')
    expect(screen.getByTestId('options-header-node')).toHaveAttribute('data-missing-params', 'true')
    expect(screen.getByTestId('options-header-node')).toHaveAttribute('data-first-node', 'true')
    expect(screen.getByTestId('options-header-node')).toHaveClass('ring-emerald-500/70')
    expect(screen.getByTestId('options-header-node')).toHaveClass('border-destructive/70')
    expect(screen.getByTestId('options-header-node')).toHaveClass('rounded-l-3xl')
  })
})
