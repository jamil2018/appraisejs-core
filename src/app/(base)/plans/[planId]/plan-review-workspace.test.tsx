// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

import { PlanReviewWorkspace } from './plan-review-workspace'

const { approvePlanRevisionAction, fitView, publishSharedPlanLayoutAction, savePersonalPlanLayoutAction, setNodes } =
  vi.hoisted(() => ({
    approvePlanRevisionAction: vi.fn(),
    fitView: vi.fn(),
    publishSharedPlanLayoutAction: vi.fn(),
    savePersonalPlanLayoutAction: vi.fn(),
    setNodes: vi.fn(),
  }))

vi.mock('@xyflow/react', () => ({
  Background: () => null,
  Controls: () => null,
  Handle: () => null,
  MarkerType: { ArrowClosed: 'arrowclosed' },
  Position: { Left: 'left', Right: 'right' },
  ReactFlow: ({
    nodes,
    edges,
    onInit,
    onNodeClick,
  }: {
    nodes: Array<{ id: string; data: { step: number; title: string }; position: { x: number; y: number } }>
    edges: Array<{ id: string; source: string; target: string; label: string }>
    onInit: (instance: { fitView: typeof fitView }) => void
    onNodeClick: (event: unknown, node: { id: string }) => void
  }) => {
    onInit({ fitView })
    return (
      <div aria-label="Plan dependency graph">
        {nodes.map(node => (
          <button key={node.id} onClick={() => onNodeClick({}, node)}>
            Step {node.data.step}: {node.data.title} at {node.position.x},{node.position.y}
          </button>
        ))}
        {edges.map(edge => (
          <span key={edge.id}>
            {edge.label}: {edge.source} to {edge.target}
          </span>
        ))}
      </div>
    )
  },
  useEdgesState: (value: unknown) => [value, vi.fn(), vi.fn()],
  useNodesState: (value: unknown) => [value, setNodes, vi.fn()],
}))

vi.mock('@/actions/plan-review/plan-review-actions', () => ({
  addPlanRemarkAction: vi.fn(),
  acceptBaselineAction: vi.fn(),
  acknowledgeBaselineFailureAction: vi.fn(),
  approvePlanRevisionAction,
  cancelBaselineExecutionAction: vi.fn(),
  justifyBaselineRegressionPassAction: vi.fn(),
  publishSharedPlanLayoutAction,
  reconcileBaselineExecutionAction: vi.fn(),
  retargetPlanRemarkAction: vi.fn(),
  savePersonalPlanLayoutAction,
  startBaselineExecutionAction: vi.fn(),
  startImplementationAction: vi.fn(),
  transitionPlanRemarkAction: vi.fn(),
}))

const detail: PlanReviewDetail = {
  plan: {
    version: '1',
    planId: 'accessible-plan',
    revision: 2,
    lifecycle: 'awaiting_plan_review',
    goal: 'Accessible plan review',
    description: 'Review an accessible plan with graph and list representations.',
    tasks: [
      {
        id: 'task-one',
        title: 'Dependent task',
        description: 'Do the dependent task.',
        acceptanceCriteria: ['It works'],
        validationIntent: 'Run the test',
      },
      {
        id: 'task-two',
        title: 'Prerequisite task',
        description: 'Do the prerequisite task.',
        acceptanceCriteria: ['It starts first'],
        validationIntent: 'Run the prerequisite test',
      },
    ],
    edges: [
      { from: 'task-one', to: 'task-two', type: 'depends-on' },
      { from: 'task-one', to: 'task-two', type: 'blocks' },
      { from: 'task-two', to: 'task-one', type: 'relates-to' },
    ],
    implementationGroups: [{ id: 'delivery', taskIds: ['task-one', 'task-two'] }],
  },
  review: {
    version: '1',
    planId: 'accessible-plan',
    threads: [],
    planApprovals: [],
    fileApprovals: [],
  },
  graph: {
    nodes: [
      {
        id: 'task-one',
        title: 'Dependent task',
        description: 'Do the dependent task.',
        acceptanceCriteria: ['It works'],
        validationIntent: 'Run the test',
        status: 'blocked',
      },
      {
        id: 'task-two',
        title: 'Prerequisite task',
        description: 'Do the prerequisite task.',
        acceptanceCriteria: ['It starts first'],
        validationIntent: 'Run the prerequisite test',
        status: 'ready',
      },
    ],
    edges: [
      {
        id: 'task-one-depends-on-task-two-0',
        from: 'task-one',
        to: 'task-two',
        type: 'depends-on',
      },
      {
        id: 'task-one-blocks-task-two-1',
        from: 'task-one',
        to: 'task-two',
        type: 'blocks',
      },
      {
        id: 'task-two-relates-to-task-one-2',
        from: 'task-two',
        to: 'task-one',
        type: 'relates-to',
      },
    ],
  },
  projection: {
    sourceHash: 'sha256:test',
    lifecycle: 'awaiting_plan_review',
    stale: false,
    conflicted: false,
    lastValidProjectedAt: new Date(),
    updatedAt: new Date(),
  },
  issues: [],
  revisions: [],
  events: [],
  personalPositions: { 'task-one': { x: 900, y: 901 } },
  sharedPositions: {
    'task-one': { x: 700, y: 701 },
    'task-two': { x: 500, y: 501 },
  },
  blockingThreadIds: [],
  orphanedThreadIds: [],
  reviewReady: true,
  listFallback: false,
}

describe('PlanReviewWorkspace', () => {
  it('renders the plan title and description as separate header content', () => {
    render(<PlanReviewWorkspace detail={detail} />)

    expect(screen.getByRole('heading', { name: 'Accessible plan review' })).toBeInTheDocument()
    expect(screen.getByText('Review an accessible plan with graph and list representations.')).toBeInTheDocument()
    expect(screen.getByText('delivery (2)')).toBeInTheDocument()
    expect(screen.getByText('It works')).toBeInTheDocument()
  })

  it('renders semantic node numbering, projected edge direction, relationship labels, and stage guidance', () => {
    render(<PlanReviewWorkspace detail={detail} />)

    expect(screen.getByText('Step 1: Prerequisite task at 500,501')).toBeInTheDocument()
    expect(screen.getByText('Step 2: Dependent task at 900,901')).toBeInTheDocument()
    expect(screen.getByText('depends-on: task-two to task-one')).toBeInTheDocument()
    expect(screen.getByText('blocks: task-one to task-two')).toBeInTheDocument()
    expect(screen.getByText('relates-to: task-two to task-one')).toBeInTheDocument()
    expect(screen.getByText(/tasks in the same stage may proceed in parallel/i)).toBeInTheDocument()
  })

  it('provides a semantically ordered keyboard-operable list with matching numbers and status text', async () => {
    const user = userEvent.setup()
    render(<PlanReviewWorkspace detail={detail} />)
    expect(screen.getByLabelText('Plan dependency graph')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /accessible list/i }))

    const taskButtons = screen.getAllByRole('button', { name: /task/i })
    expect(taskButtons[0]).toHaveTextContent('1')
    expect(taskButtons[0]).toHaveTextContent('Prerequisite task')
    expect(taskButtons[1]).toHaveTextContent('2')
    expect(taskButtons[1]).toHaveTextContent('Dependent task')
    expect(taskButtons[0]).toHaveTextContent('Stage 1')
    expect(taskButtons[0]).toHaveTextContent('depends-on to task-one')
    expect(taskButtons[0]).toHaveTextContent('blocks from task-one')
    expect(taskButtons[1]).toHaveTextContent('Stage 2')
    expect(taskButtons[1]).toHaveTextContent('depends-on from task-two')
    expect(taskButtons[1]).toHaveTextContent('relates-to from task-two')

    const taskButton = screen.getByRole('button', { name: /dependent task/i })
    taskButton.focus()
    expect(taskButton).toHaveFocus()
    expect(taskButton).toHaveTextContent('blocked')
  })

  it('keeps review controls keyboard reachable across tabs, remarks, layout, and approval', async () => {
    const user = userEvent.setup()
    render(<PlanReviewWorkspace detail={detail} />)

    await user.tab()
    expect(screen.getByRole('button', { name: /save layout/i })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: /publish shared/i })).toHaveFocus()
    await user.click(screen.getByRole('tab', { name: /accessible list/i }))
    await user.tab()
    expect(screen.getByRole('tabpanel', { name: /accessible list/i })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: /prerequisite task/i })).toHaveFocus()
    screen.getByRole('button', { name: /reset to flow/i }).focus()
    expect(screen.getByRole('button', { name: /reset to flow/i })).toHaveFocus()
    screen.getByRole('tab', { name: /accessible list/i }).focus()
    expect(screen.getByRole('tab', { name: /accessible list/i })).toHaveFocus()
    screen.getByRole('textbox', { name: /add remark/i }).focus()
    expect(screen.getByRole('textbox', { name: /add remark/i })).toHaveFocus()
    screen.getByRole('button', { name: /approve exact revision/i }).focus()
    expect(screen.getByRole('button', { name: /approve exact revision/i })).toHaveFocus()
  })

  it('keeps node selection working with custom graph nodes', async () => {
    const user = userEvent.setup()
    render(<PlanReviewWorkspace detail={detail} />)

    await user.click(screen.getByRole('button', { name: /step 1: prerequisite task/i }))

    expect(screen.getByText('Do the prerequisite task.')).toBeInTheDocument()
  })

  it('resets nodes to semantic positions and fits the graph', async () => {
    const user = userEvent.setup()
    render(<PlanReviewWorkspace detail={detail} />)

    await user.click(screen.getByRole('button', { name: /reset to flow/i }))

    const updateNodes = setNodes.mock.calls.at(-1)?.[0] as (
      nodes: Array<{ id: string; position: { x: number; y: number } }>,
    ) => Array<{ id: string; position: { x: number; y: number } }>
    expect(
      updateNodes([
        { id: 'task-one', position: { x: 900, y: 901 } },
        { id: 'task-two', position: { x: 500, y: 501 } },
      ]),
    ).toEqual([
      { id: 'task-one', position: { x: 340, y: 0 } },
      { id: 'task-two', position: { x: 0, y: 0 } },
    ])
    await vi.waitFor(() => expect(fitView).toHaveBeenCalled())
  })

  it('saves only the currently displayed coordinates', async () => {
    const user = userEvent.setup()
    savePersonalPlanLayoutAction.mockResolvedValueOnce({ success: false, error: 'Expected test stop.' })
    render(<PlanReviewWorkspace detail={detail} />)

    await user.click(screen.getByRole('button', { name: /save layout/i }))

    expect(savePersonalPlanLayoutAction).toHaveBeenCalledWith({
      planId: 'accessible-plan',
      positions: {
        'task-one': { x: 900, y: 901 },
        'task-two': { x: 500, y: 501 },
      },
    })
  })

  it('publishes the currently displayed coordinates to the shared layout sidecar', async () => {
    const user = userEvent.setup()
    publishSharedPlanLayoutAction.mockResolvedValueOnce({ success: false, error: 'Expected test stop.' })
    render(<PlanReviewWorkspace detail={detail} />)

    await user.click(screen.getByRole('button', { name: /publish shared/i }))

    expect(publishSharedPlanLayoutAction).toHaveBeenCalledWith({
      planId: 'accessible-plan',
      positions: {
        'task-one': { x: 900, y: 901 },
        'task-two': { x: 500, y: 501 },
      },
    })
  })

  it('submits approval for the exact displayed revision', async () => {
    const user = userEvent.setup()
    approvePlanRevisionAction.mockResolvedValueOnce({ success: false, error: 'Expected test stop.' })
    render(<PlanReviewWorkspace detail={detail} />)

    await user.click(screen.getByRole('button', { name: /approve exact revision/i }))

    expect(approvePlanRevisionAction).toHaveBeenCalledWith({
      planId: 'accessible-plan',
      displayedRevision: 2,
      confirmSuspiciousReplacement: false,
    })
  })

  it('defaults to list review and explains approval lockout when graph readiness failed', () => {
    render(<PlanReviewWorkspace detail={{ ...detail, reviewReady: false, listFallback: true }} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Graph unavailable, list review enabled')
    expect(screen.getByRole('tab', { name: /graph/i })).toBeDisabled()
    expect(screen.getByRole('tabpanel', { name: /accessible list/i })).toBeInTheDocument()
    const approvalButton = screen.getByRole('button', { name: /approve exact revision/i })
    expect(approvalButton).toBeDisabled()
    expect(
      screen.getByText(/approval is disabled until the graph and list review representation is ready/i),
    ).toBeInTheDocument()
  })
})
