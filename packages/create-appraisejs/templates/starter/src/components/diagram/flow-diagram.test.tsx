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
      nodes = [],
      onInit,
      onPaneClick,
      onNodeClick,
    }: {
      children: React.ReactNode
      nodes?: Array<{ id: string; data?: { isSearchHighlighted?: boolean; label?: string } }>
      onInit?: (instance: unknown) => void
      onPaneClick?: () => void
      onNodeClick?: (event: React.MouseEvent, node: { id: string }) => void
    }) => {
      React.useEffect(() => {
        onInit?.({ setCenter: xyflowMocks.setCenter })
      }, [onInit])

      return (
        <div data-testid="react-flow" onClick={onPaneClick}>
          {nodes.map(node => (
            <button
              key={node.id}
              type="button"
              data-testid={`flow-node-${node.id}`}
              data-search-highlighted={node.data?.isSearchHighlighted ? 'true' : undefined}
              onClick={event => {
                event.stopPropagation()
                onNodeClick?.(event, node)
              }}
            >
              {node.id}
            </button>
          ))}
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

describe('FlowDiagram node grouping', () => {
  it('does not open block creation when selection mode is toggled on an empty flow', async () => {
    const user = userEvent.setup()
    render(
      <FlowDiagram
        {...requiredProps}
        enableNodeGrouping
        nodeOrder={{}}
      />,
    )

    await user.click(screen.getByRole('button', { name: /select nodes for block/i }))

    expect(screen.queryByRole('button', { name: /create block/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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
