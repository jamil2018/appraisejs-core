// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import FlowDiagram from './flow-diagram'

const xyflowMocks = vi.hoisted(() => ({
  setCenter: vi.fn(),
  updateNodeInternals: vi.fn(),
}))

vi.mock('@xyflow/react', async () => {
  const React = await import('react')

  return {
    addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
    Background: () => <div data-testid="flow-background" />,
    ConnectionMode: { Loose: 'loose' },
    Controls: () => <div data-testid="flow-controls" />,
    ReactFlow: ({
      children,
      edges = [],
      nodes = [],
      onInit,
      onConnect,
      onPaneClick,
      onNodeClick,
      onSelectionChange,
    }: {
      children: React.ReactNode
      edges?: Array<{ source: string; target: string }>
      nodes?: Array<{
        id: string
        data?: { isDeleteDisabled?: boolean; isSearchHighlighted?: boolean; label?: string }
      }>
      onInit?: (instance: unknown) => void
      onConnect?: (connection: { source: string; target: string }) => void
      onPaneClick?: () => void
      onNodeClick?: (event: React.MouseEvent, node: { id: string }) => void
      onSelectionChange?: (selection: { nodes: Array<{ id: string }> }) => void
    }) => {
      React.useEffect(() => {
        onInit?.({ setCenter: xyflowMocks.setCenter })
      }, [onInit])

      const handlePaneKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onPaneClick?.()
        }
      }

      return (
        <div
          data-testid="react-flow"
          role="group"
          aria-label="Flow canvas mock"
          tabIndex={0}
          onClick={onPaneClick}
          onKeyDown={handlePaneKeyDown}
        >
          {nodes.map(node => (
            <button
              key={node.id}
              type="button"
              data-testid={`flow-node-${node.id}`}
              data-delete-disabled={node.data?.isDeleteDisabled ? 'true' : undefined}
              data-search-highlighted={node.data?.isSearchHighlighted ? 'true' : undefined}
              onClick={event => {
                event.stopPropagation()
                onNodeClick?.(event, node)
              }}
            >
              {node.id}
            </button>
          ))}
          <button type="button" onClick={() => onSelectionChange?.({ nodes })}>
            Select all flow nodes
          </button>
          {nodes.some(node => node.id === 'node-3') && (
            <button type="button" onClick={() => onConnect?.({ source: 'node-2', target: 'node-3' })}>
              Connect node-2 to node-3
            </button>
          )}
          <output data-testid="edge-count">{edges.length}</output>
          {children}
        </div>
      )
    },
    ViewportPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useEdgesState: (initialEdges: unknown[]) => {
      const [edges, setEdges] = React.useState(initialEdges)
      return [edges, setEdges, vi.fn()]
    },
    useNodesState: (initialNodes: unknown[]) => {
      const [nodes, setNodes] = React.useState(initialNodes)
      return [nodes, setNodes, vi.fn()]
    },
    useUpdateNodeInternals: () => xyflowMocks.updateNodeInternals,
  }
})

vi.mock('./node-form', () => ({
  default: ({ mode, showAddNodeDialog }: { mode: string; showAddNodeDialog: boolean }) =>
    showAddNodeDialog ? <div role="dialog">Node form {mode}</div> : null,
}))

const requiredProps = {
  templateStepParams: [],
  templateSteps: [],
  locators: [],
  locatorGroups: [],
  environments: [],
  modules: [],
  onNodeOrderChange: vi.fn(),
}

function renderFlowDiagram(enableNodeSearch = true) {
  return render(
    <FlowDiagram
      {...requiredProps}
      enableNodeSearch={enableNodeSearch}
      nodeOrder={{
        'node-1': {
          order: 1,
          label: 'Open Checkout',
          gherkinStep: 'Given cart page',
          parameters: [],
          templateStepId: 'step-1',
        },
        'node-2': {
          order: 2,
          label: 'Submit Payment',
          gherkinStep: 'When the Visa card is submitted',
          parameters: [
            {
              name: 'card',
              value: 'visa',
              type: 'STRING',
              order: 1,
            },
          ],
          templateStepId: 'step-2',
        },
      }}
    />,
  )
}

function renderInteractiveFlowDiagram() {
  return render(
    <FlowDiagram
      {...requiredProps}
      enableNodeSearch
      enableNodeGrouping
      nodeOrder={{
        'node-1': {
          order: 1,
          label: 'Open Checkout',
          gherkinStep: 'Given cart page',
          parameters: [],
          templateStepId: 'step-1',
        },
        'node-2': {
          order: 2,
          label: 'Submit Payment',
          gherkinStep: 'When payment is submitted',
          parameters: [],
          templateStepId: 'step-2',
        },
      }}
    />,
  )
}

describe('FlowDiagram node search', () => {
  beforeEach(() => {
    xyflowMocks.setCenter.mockClear()
    xyflowMocks.updateNodeInternals.mockClear()
  })

  it('reveals search input only when enabled', async () => {
    const user = userEvent.setup()
    renderFlowDiagram()

    await user.click(screen.getByRole('button', { name: /search nodes/i }))

    expect(screen.getByRole('textbox', { name: /search nodes/i })).toBeInTheDocument()
  })

  it('keeps suggestions hidden until three characters and renders matching labels only', async () => {
    const user = userEvent.setup()
    renderFlowDiagram()

    await user.click(screen.getByRole('button', { name: /search nodes/i }))
    await user.type(screen.getByRole('textbox', { name: /search nodes/i }), 'pa')

    expect(screen.queryByText('Submit Payment')).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: /search nodes/i }), 'y')

    expect(screen.getByText('Submit Payment')).toBeInTheDocument()
    expect(screen.queryByText('Open Checkout')).not.toBeInTheDocument()
  })

  it('shows an empty state when no labels match', async () => {
    const user = userEvent.setup()
    renderFlowDiagram()

    await user.click(screen.getByRole('button', { name: /search nodes/i }))
    await user.type(screen.getByRole('textbox', { name: /search nodes/i }), 'zzz')

    expect(screen.getByText('No matching labels')).toBeInTheDocument()
  })

  it('closes search when clicking elsewhere in the flow builder', async () => {
    const user = userEvent.setup()
    renderFlowDiagram()

    await user.click(screen.getByRole('button', { name: /search nodes/i }))
    expect(screen.getByRole('textbox', { name: /search nodes/i })).toBeInTheDocument()

    await user.pointer({ keys: '[MouseLeft]', target: screen.getByTestId('react-flow') })

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: /search nodes/i })).not.toBeInTheDocument()
    })
  })

  it('opens edit settings and focuses the matched node when a suggestion is selected', async () => {
    const user = userEvent.setup()
    renderFlowDiagram()

    await user.click(screen.getByRole('button', { name: /search nodes/i }))
    await user.type(screen.getByRole('textbox', { name: /search nodes/i }), 'pay')
    await user.click(screen.getByText('Submit Payment'))

    expect(screen.getByRole('dialog')).toHaveTextContent('Node form edit')
    expect(xyflowMocks.setCenter).toHaveBeenCalledWith(1072, 72, {
      zoom: 1.15,
      duration: 420,
    })
  })

  it('clears the search highlight when clicking away on the canvas', async () => {
    const user = userEvent.setup()
    renderFlowDiagram()

    await user.click(screen.getByRole('button', { name: /search nodes/i }))
    await user.type(screen.getByRole('textbox', { name: /search nodes/i }), 'pay')
    await user.click(screen.getByText('Submit Payment'))

    await waitFor(() => {
      expect(screen.getByTestId('flow-node-node-2')).toHaveAttribute('data-search-highlighted', 'true')
    })

    await user.click(screen.getByTestId('react-flow'))

    await waitFor(() => {
      expect(screen.getByTestId('flow-node-node-2')).not.toHaveAttribute('data-search-highlighted')
    })
  })

  it('clears the search highlight when selecting a different node', async () => {
    const user = userEvent.setup()
    renderFlowDiagram()

    await user.click(screen.getByRole('button', { name: /search nodes/i }))
    await user.type(screen.getByRole('textbox', { name: /search nodes/i }), 'pay')
    await user.click(screen.getByText('Submit Payment'))

    await waitFor(() => {
      expect(screen.getByTestId('flow-node-node-2')).toHaveAttribute('data-search-highlighted', 'true')
    })

    await user.click(screen.getByTestId('flow-node-node-1'))

    await waitFor(() => {
      expect(screen.getByTestId('flow-node-node-2')).not.toHaveAttribute('data-search-highlighted')
    })
  })

  it('refreshes node internals when the layout refresh key changes', async () => {
    const { rerender } = render(
      <FlowDiagram
        {...requiredProps}
        layoutRefreshKey={false}
        nodeOrder={{
          'node-1': {
            order: 1,
            label: 'Open Checkout',
            gherkinStep: 'Given cart page',
            parameters: [],
            templateStepId: 'step-1',
          },
        }}
      />,
    )

    await waitFor(() => {
      expect(xyflowMocks.updateNodeInternals).toHaveBeenCalledWith(['node-1'])
    })

    xyflowMocks.updateNodeInternals.mockClear()

    rerender(
      <FlowDiagram
        {...requiredProps}
        layoutRefreshKey
        nodeOrder={{
          'node-1': {
            order: 1,
            label: 'Open Checkout',
            gherkinStep: 'Given cart page',
            parameters: [],
            templateStepId: 'step-1',
          },
        }}
      />,
    )

    await waitFor(() => {
      expect(xyflowMocks.updateNodeInternals).toHaveBeenCalledWith(['node-1'])
    })
  })
})

describe('FlowDiagram keyboard shortcuts', () => {
  beforeEach(() => {
    xyflowMocks.setCenter.mockClear()
    xyflowMocks.updateNodeInternals.mockClear()
  })

  it('handles shortcuts while the flow builder page is mounted', async () => {
    const user = userEvent.setup()
    renderInteractiveFlowDiagram()

    await user.keyboard('{Control>}{Shift>}s{/Shift}{/Control}')

    expect(await screen.findByRole('textbox', { name: /search nodes/i })).toBeInTheDocument()
  })

  it('opens and focuses search', async () => {
    const user = userEvent.setup()
    renderInteractiveFlowDiagram()

    await user.keyboard('{Control>}{Shift>}s{/Shift}{/Control}')

    const searchInput = await screen.findByRole('textbox', { name: /search nodes/i })
    await waitFor(() => {
      expect(searchInput).toHaveFocus()
    })
  })

  it('toggles search closed when the shortcut is pressed again', async () => {
    const user = userEvent.setup()
    renderInteractiveFlowDiagram()

    await user.keyboard('{Control>}{Shift>}s{/Shift}{/Control}')
    expect(await screen.findByRole('textbox', { name: /search nodes/i })).toBeInTheDocument()

    await user.keyboard('{Control>}{Shift>}s{/Shift}{/Control}')

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: /search nodes/i })).not.toBeInTheDocument()
    })
  })

  it('supports macOS-style meta search shortcuts', async () => {
    const user = userEvent.setup()
    renderInteractiveFlowDiagram()

    await user.keyboard('{Meta>}{Shift>}s{/Shift}{/Meta}')

    expect(await screen.findByRole('textbox', { name: /search nodes/i })).toBeInTheDocument()
  })

  it('toggles block selection mode when grouping is enabled', async () => {
    const user = userEvent.setup()
    renderInteractiveFlowDiagram()

    await user.keyboard('{Control>}{Shift>}b{/Shift}{/Control}')

    expect(screen.getByRole('button', { name: /exit block selection mode/i })).toBeInTheDocument()

    await user.keyboard('{Control>}{Shift>}b{/Shift}{/Control}')

    expect(screen.getByRole('button', { name: /select nodes for block/i })).toBeInTheDocument()
  })

  it('toggles the add-node sheet', async () => {
    const user = userEvent.setup()
    renderInteractiveFlowDiagram()

    await user.keyboard('{Control>}{Shift>}c{/Shift}{/Control}')

    expect(screen.getByRole('dialog')).toHaveTextContent('Node form add')

    await user.keyboard('{Control>}{Shift>}c{/Shift}{/Control}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ignores shortcuts while the node sheet is open', async () => {
    const user = userEvent.setup()
    renderInteractiveFlowDiagram()

    await user.click(screen.getByRole('button', { name: 'Add Node' }))
    await user.keyboard('{Control>}{Shift>}b{/Shift}{/Control}')

    expect(screen.queryByRole('button', { name: /exit block selection mode/i })).not.toBeInTheDocument()
  })

  it('ignores shortcuts while the block dialog is open', async () => {
    const user = userEvent.setup()
    render(
      <FlowDiagram
        {...requiredProps}
        enableNodeSearch
        enableNodeGrouping
        nodeOrder={{
          'node-1': {
            order: 1,
            label: 'Open Checkout',
            gherkinStep: 'Given cart page',
            parameters: [],
            templateStepId: 'step-1',
          },
          'node-2': {
            order: 2,
            label: 'Submit Payment',
            gherkinStep: 'When payment is submitted',
            parameters: [],
            templateStepId: 'step-2',
          },
        }}
      />,
    )

    await user.keyboard('{Control>}{Shift>}b{/Shift}{/Control}')
    await user.click(screen.getByRole('button', { name: /select all flow nodes/i }))
    await user.click(screen.getByRole('button', { name: /^create block$/i }))
    await user.keyboard('{Control>}{Shift>}s{/Shift}{/Control}')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /search nodes/i })).not.toBeInTheDocument()
  })

  it('ignores shortcuts from editable targets', async () => {
    const user = userEvent.setup()
    renderInteractiveFlowDiagram()

    await user.click(screen.getByRole('button', { name: /search nodes/i }))
    await user.click(screen.getByRole('textbox', { name: /search nodes/i }))
    await user.keyboard('{Control>}{Shift>}c{/Shift}{/Control}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows shortcut hints in toolbar tooltips', async () => {
    const user = userEvent.setup()
    renderInteractiveFlowDiagram()

    await user.hover(screen.getByRole('button', { name: /search nodes/i }))
    expect((await screen.findAllByText('Search nodes')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ctrl').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Shift').length).toBeGreaterThan(0)
    expect(screen.getAllByText('S').length).toBeGreaterThan(0)

    await user.unhover(screen.getByRole('button', { name: /search nodes/i }))
    await user.hover(screen.getByRole('button', { name: /select nodes for block/i }))
    expect((await screen.findAllByText('Create block')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('B').length).toBeGreaterThan(0)

    await user.unhover(screen.getByRole('button', { name: /select nodes for block/i }))
    await user.hover(screen.getByRole('button', { name: 'Add Node' }))
    expect((await screen.findAllByText('Add Node')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('C').length).toBeGreaterThan(0)
  })
})

describe('FlowDiagram node grouping', () => {
  it('keeps the main add-node action available after a block exists', async () => {
    const user = userEvent.setup()
    render(
      <FlowDiagram
        {...requiredProps}
        enableNodeGrouping
        nodeOrder={{
          'node-1': {
            order: 1,
            label: 'Open Checkout',
            gherkinStep: 'Given cart page',
            parameters: [],
            templateStepId: 'step-1',
          },
          'node-2': {
            order: 2,
            label: 'Submit Payment',
            gherkinStep: 'When payment is submitted',
            parameters: [],
            templateStepId: 'step-2',
          },
        }}
        flowBlocks={[{ id: 'block-1', name: 'Checkout block', nodeIds: ['node-1', 'node-2'] }]}
      />,
    )

    const addNodeButton = screen.getByRole('button', { name: 'Add Node' })

    expect(addNodeButton).toBeEnabled()

    await user.click(addNodeButton)

    expect(screen.getByRole('dialog')).toHaveTextContent('Node form add')
  })

  it('disables delete only for nodes that belong to a block', async () => {
    render(
      <FlowDiagram
        {...requiredProps}
        enableNodeGrouping
        nodeOrder={{
          'node-1': {
            order: 1,
            label: 'Open Checkout',
            gherkinStep: 'Given cart page',
            parameters: [],
            templateStepId: 'step-1',
          },
          'node-2': {
            order: 2,
            label: 'Submit Payment',
            gherkinStep: 'When payment is submitted',
            parameters: [],
            templateStepId: 'step-2',
          },
          'node-3': {
            order: -1,
            label: 'Outside block',
            gherkinStep: 'Then outside',
            parameters: [],
            templateStepId: 'step-3',
          },
        }}
        flowBlocks={[{ id: 'block-1', name: 'Checkout block', nodeIds: ['node-1', 'node-2'] }]}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('flow-node-node-1')).toHaveAttribute('data-delete-disabled', 'true')
      expect(screen.getByTestId('flow-node-node-3')).not.toHaveAttribute('data-delete-disabled')
    })
  })

  it('does not open block creation when selection mode is toggled on an empty flow', async () => {
    const user = userEvent.setup()
    render(<FlowDiagram {...requiredProps} enableNodeGrouping nodeOrder={{}} />)

    await user.click(screen.getByRole('button', { name: /select nodes for block/i }))

    expect(screen.queryByRole('button', { name: /create block/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not allow block creation while any real node is orphaned', async () => {
    const user = userEvent.setup()
    render(
      <FlowDiagram
        {...requiredProps}
        enableNodeGrouping
        nodeOrder={{
          'node-1': {
            order: 1,
            label: 'Open Checkout',
            gherkinStep: 'Given cart page',
            parameters: [],
            templateStepId: 'step-1',
          },
          'node-2': {
            order: 2,
            label: 'Submit Payment',
            gherkinStep: 'When payment is submitted',
            parameters: [],
            templateStepId: 'step-2',
          },
          'node-3': {
            order: -1,
            label: 'Orphaned node',
            gherkinStep: 'Then orphaned',
            parameters: [],
            templateStepId: 'step-3',
          },
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: /select nodes for block/i }))
    await user.click(screen.getByRole('button', { name: /select all flow nodes/i }))

    expect(screen.queryByRole('button', { name: /create block/i })).not.toBeInTheDocument()
    expect(screen.getByText('Connect or remove orphaned nodes before creating a block.')).toBeInTheDocument()
  })

  it('allows a block node to connect to an outside node', async () => {
    const user = userEvent.setup()
    const onNodeOrderChange = vi.fn()

    render(
      <FlowDiagram
        {...requiredProps}
        onNodeOrderChange={onNodeOrderChange}
        enableNodeGrouping
        nodeOrder={{
          'node-1': {
            order: 1,
            label: 'Open Checkout',
            gherkinStep: 'Given cart page',
            parameters: [],
            templateStepId: 'step-1',
          },
          'node-2': {
            order: 2,
            label: 'Submit Payment',
            gherkinStep: 'When payment is submitted',
            parameters: [],
            templateStepId: 'step-2',
          },
          'node-3': {
            order: -1,
            label: 'Outside block',
            gherkinStep: 'Then outside',
            parameters: [],
            templateStepId: 'step-3',
          },
        }}
        flowBlocks={[{ id: 'block-1', name: 'Checkout block', nodeIds: ['node-1', 'node-2'] }]}
      />,
    )

    await user.click(screen.getByRole('button', { name: /connect node-2 to node-3/i }))

    await waitFor(() => {
      expect(onNodeOrderChange).toHaveBeenCalledWith(
        expect.objectContaining({
          'node-3': expect.objectContaining({ order: 3 }),
        }),
      )
    })
  })

  it('renders block labels with stronger visual emphasis', () => {
    render(
      <FlowDiagram
        {...requiredProps}
        enableNodeGrouping
        nodeOrder={{
          'node-1': {
            order: 1,
            label: 'Open Checkout',
            gherkinStep: 'Given cart page',
            parameters: [],
            templateStepId: 'step-1',
          },
          'node-2': {
            order: 2,
            label: 'Submit Payment',
            gherkinStep: 'When payment is submitted',
            parameters: [],
            templateStepId: 'step-2',
          },
        }}
        flowBlocks={[{ id: 'block-1', name: 'Checkout block', nodeIds: ['node-1', 'node-2'] }]}
      />,
    )

    expect(screen.getByText('Checkout block').parentElement).toHaveClass('text-sm', 'font-semibold', 'text-foreground')
  })
})
