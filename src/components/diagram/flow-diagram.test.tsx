// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import FlowDiagram from './flow-diagram'

const xyflowMocks = vi.hoisted(() => ({
  setCenter: vi.fn(),
}))

vi.mock('@xyflow/react', async () => {
  const React = await import('react')

  return {
    addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
    Background: () => <div data-testid="flow-background" />,
    ConnectionMode: { Loose: 'loose' },
    Controls: () => <div data-testid="flow-controls" />,
    ReactFlow: ({ children, onInit }: { children: React.ReactNode; onInit?: (instance: unknown) => void }) => {
      React.useEffect(() => {
        onInit?.({ setCenter: xyflowMocks.setCenter })
      }, [onInit])

      return <div data-testid="react-flow">{children}</div>
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
