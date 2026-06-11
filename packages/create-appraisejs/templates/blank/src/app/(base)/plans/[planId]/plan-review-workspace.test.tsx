// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

import { PlanReviewWorkspace } from './plan-review-workspace'

vi.mock('@xyflow/react', () => ({
  Background: () => null,
  Controls: () => null,
  MarkerType: { ArrowClosed: 'arrowclosed' },
  ReactFlow: ({ nodes }: { nodes: Array<{ id: string }> }) => (
    <div aria-label="Plan dependency graph">
      {nodes.map(node => (
        <span key={node.id}>{node.id}</span>
      ))}
    </div>
  ),
  useEdgesState: (value: unknown) => [value, vi.fn(), vi.fn()],
  useNodesState: (value: unknown) => [value, vi.fn(), vi.fn()],
}))

vi.mock('@/actions/plan-review/plan-review-actions', () => ({
  addPlanRemarkAction: vi.fn(),
  approvePlanRevisionAction: vi.fn(),
  publishSharedPlanLayoutAction: vi.fn(),
  retargetPlanRemarkAction: vi.fn(),
  savePersonalPlanLayoutAction: vi.fn(),
  transitionPlanRemarkAction: vi.fn(),
}))

const detail: PlanReviewDetail = {
  plan: {
    version: '1',
    planId: 'accessible-plan',
    revision: 2,
    lifecycle: 'awaiting_plan_review',
    goal: 'Accessible plan review',
    tasks: [
      {
        id: 'task-one',
        title: 'First task',
        description: 'Do the first task.',
        acceptanceCriteria: ['It works'],
        validationIntent: 'Run the test',
      },
    ],
    edges: [],
    implementationGroups: [],
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
        title: 'First task',
        description: 'Do the first task.',
        acceptanceCriteria: ['It works'],
        validationIntent: 'Run the test',
        status: 'blocked',
      },
    ],
    edges: [],
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
  personalPositions: {},
  sharedPositions: {},
  blockingThreadIds: [],
  orphanedThreadIds: [],
  reviewReady: true,
  listFallback: false,
}

describe('PlanReviewWorkspace', () => {
  it('provides an equivalent keyboard-operable list with non-color status text', async () => {
    const user = userEvent.setup()
    render(<PlanReviewWorkspace detail={detail} />)
    expect(screen.getByLabelText('Plan dependency graph')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /accessible list/i }))

    const taskButton = screen.getByRole('button', { name: /first task/i })
    taskButton.focus()
    expect(taskButton).toHaveFocus()
    expect(taskButton).toHaveTextContent('blocked')
  })
})
