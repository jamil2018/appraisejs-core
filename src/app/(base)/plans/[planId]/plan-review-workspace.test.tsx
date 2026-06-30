// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

import { PlanReviewWorkspace } from './plan-review-workspace'

const {
  approvePlanRevisionAction,
  approveValidationFileAction,
  decideValidationNodeAction,
  fitView,
  publishSharedPlanLayoutAction,
  requestPlanChangesAction,
  savePersonalPlanLayoutAction,
  setNodes,
  submitValidationFeedbackAction,
  submitValidationReviewAction,
} = vi.hoisted(() => ({
  approvePlanRevisionAction: vi.fn(),
  approveValidationFileAction: vi.fn(),
  decideValidationNodeAction: vi.fn(),
  fitView: vi.fn(),
  publishSharedPlanLayoutAction: vi.fn(),
  requestPlanChangesAction: vi.fn(),
  savePersonalPlanLayoutAction: vi.fn(),
  setNodes: vi.fn(),
  submitValidationFeedbackAction: vi.fn(),
  submitValidationReviewAction: vi.fn(),
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
  approveValidationFileAction,
  approvePlanRevisionAction,
  cancelBaselineExecutionAction: vi.fn(),
  decideValidationNodeAction,
  justifyBaselineRegressionPassAction: vi.fn(),
  publishSharedPlanLayoutAction,
  reconcileBaselineExecutionAction: vi.fn(),
  requestPlanChangesAction,
  retargetPlanRemarkAction: vi.fn(),
  savePersonalPlanLayoutAction,
  startBaselineExecutionAction: vi.fn(),
  startImplementationAction: vi.fn(),
  submitValidationFeedbackAction,
  submitValidationReviewAction,
  transitionPlanRemarkAction: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

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
  contentHash: `sha256:${'a'.repeat(64)}`,
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
    slug: 'accessible-plan',
    legacyPlanId: null,
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

const hashA = `sha256:${'a'.repeat(64)}`
const hashB = `sha256:${'b'.repeat(64)}`
const hashC = `sha256:${'c'.repeat(64)}`

const validationDetail: PlanReviewDetail = {
  ...detail,
  plan: { ...detail.plan, lifecycle: 'awaiting_validation_review' },
  projection: { ...detail.projection, lifecycle: 'awaiting_validation_review' },
  review: {
    ...detail.review!,
    fileApprovals: [
      { path: 'src/app/page.tsx', contentHash: hashC, approvedBy: 'local-user', approvedAt: new Date().toISOString() },
    ],
  },
  validation: {
    version: '1',
    planId: 'accessible-plan',
    revision: 2,
    baseRevision: { gitCommit: null, snapshotHash: hashA, reducedAssurance: true },
    classificationOverrides: [],
    validations: [
      {
        id: 'browser-validation',
        taskIds: ['task-one', 'task-two'],
        required: true,
        testCaseIds: ['keyboard-review'],
        gherkinPaths: ['automation/features/review.feature'],
        stepPaths: ['automation/steps/review.steps.ts'],
        executable: { path: 'automation/steps/review.steps.ts', selector: 'validation review' },
        matrix: [{ browser: 'chromium', environment: 'local' }],
        expectedFailures: [
          {
            browser: 'chromium',
            environment: 'local',
            signature: 'Fails until the reviewed UI exists.',
            order: 0,
            lastPassingStepId: 'task-one',
          },
        ],
      },
      {
        id: 'optional-validation',
        taskIds: ['task-two'],
        required: false,
        testCaseIds: ['optional-smoke'],
        gherkinPaths: ['automation/features/optional.feature'],
        stepPaths: ['automation/steps/optional.steps.ts'],
        executable: { path: 'automation/steps/optional.steps.ts' },
        matrix: [{ browser: 'webkit', environment: 'local' }],
        expectedFailures: [],
      },
    ],
    approvals: [],
    validationDecisions: [
      {
        validationId: 'browser-validation',
        decision: 'approved',
        contentHash: hashB,
        decidedBy: 'local-user',
        decidedAt: new Date().toISOString(),
      },
      {
        validationId: 'optional-validation',
        decision: 'deferred',
        contentHash: hashA,
        decidedBy: 'local-user',
        decidedAt: new Date().toISOString(),
      },
    ],
    files: [
      {
        path: 'automation/features/review.feature',
        classification: 'test_only',
        rationale: 'Feature-only validation artifact.',
        status: 'added',
        beforeHash: null,
        contentHash: hashB,
        patch: 'diff',
        declared: true,
      },
      {
        path: 'src/app/page.tsx',
        classification: 'production',
        rationale: 'Production helper changed during validation prep.',
        status: 'modified',
        beforeHash: hashA,
        contentHash: hashC,
        patch: 'diff',
        declared: true,
      },
    ],
    manifestPaths: ['automation/features/review.feature', 'src/app/page.tsx'],
    baselineAttempts: [],
    baselineAcknowledgements: [],
    baselineDecision: 'pending',
  },
  validationReview: {
    nodeHashes: { 'browser-validation': hashB, 'optional-validation': hashA },
    fileHashes: { 'automation/features/review.feature': hashB, 'src/app/page.tsx': hashC },
    readiness: { ready: true, blockers: [] },
  },
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
    expect(screen.getByRole('button', { name: /hide inspector/i })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('tab', { name: /graph/i })).toHaveFocus()
    screen.getByRole('button', { name: /save layout/i }).focus()
    expect(screen.getByRole('button', { name: /save layout/i })).toHaveFocus()
    screen.getByRole('button', { name: /publish shared/i }).focus()
    expect(screen.getByRole('button', { name: /publish shared/i })).toHaveFocus()
    await user.click(screen.getByRole('tab', { name: /accessible list/i }))
    await user.tab()
    expect(screen.getByRole('tabpanel', { name: /accessible list/i })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: /prerequisite task/i })).toHaveFocus()
    await user.click(screen.getByRole('tab', { name: /graph/i }))
    screen.getByRole('button', { name: /reset view/i }).focus()
    expect(screen.getByRole('button', { name: /reset view/i })).toHaveFocus()
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

    await user.click(screen.getByRole('button', { name: /reset view/i }))

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
      expectedPlanHash: `sha256:${'a'.repeat(64)}`,
      confirmSuspiciousReplacement: false,
    })
  })

  it('submits change requests for the exact displayed revision with blocking remarks', async () => {
    const user = userEvent.setup()
    const withBlockingRemark: PlanReviewDetail = {
      ...detail,
      review: {
        ...detail.review!,
        threads: [
          {
            id: 'remark-blocker',
            target: { type: 'plan' },
            blocking: true,
            events: [
              {
                id: 'event-created',
                action: 'created',
                actor: 'reviewer',
                createdAt: new Date().toISOString(),
                body: 'Please cover empty-list state.',
              },
            ],
          },
        ],
      },
      blockingThreadIds: ['remark-blocker'],
    }
    requestPlanChangesAction.mockResolvedValueOnce({ success: false, error: 'Expected test stop.' })
    render(<PlanReviewWorkspace detail={withBlockingRemark} />)

    await user.click(screen.getByRole('button', { name: /request changes/i }))

    expect(requestPlanChangesAction).toHaveBeenCalledWith({
      planId: 'accessible-plan',
      displayedRevision: 2,
      expectedPlanHash: `sha256:${'a'.repeat(64)}`,
    })
  })

  it('requires a blocking remark before requesting changes', () => {
    render(<PlanReviewWorkspace detail={detail} />)

    expect(screen.getByRole('button', { name: /request changes/i })).toBeDisabled()
    expect(screen.getByText(/add a blocking remark before requesting changes/i)).toBeInTheDocument()
  })

  it('locks approval and change requests for draft plans with a submitted-for-review message', () => {
    const draftDetail: PlanReviewDetail = {
      ...detail,
      plan: { ...detail.plan, lifecycle: 'draft' },
      projection: { ...detail.projection, lifecycle: 'draft' },
      blockingThreadIds: ['remark-blocker'],
    }

    render(<PlanReviewWorkspace detail={draftDetail} />)

    expect(screen.getByRole('alert')).toHaveTextContent(/draft not submitted for review/i)
    expect(screen.getByRole('button', { name: /approve exact revision/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /request changes/i })).toBeDisabled()
    expect(screen.getAllByText(/this draft has not been submitted for plan review/i)).toHaveLength(2)
  })

  it('uses the same non-review lifecycle lockout for approval and change requests', () => {
    const inProgressDetail: PlanReviewDetail = {
      ...detail,
      plan: { ...detail.plan, lifecycle: 'in_progress' },
      projection: { ...detail.projection, lifecycle: 'in_progress' },
      blockingThreadIds: ['remark-blocker'],
    }

    render(<PlanReviewWorkspace detail={inProgressDetail} />)

    expect(screen.getByRole('button', { name: /approve exact revision/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /request changes/i })).toBeDisabled()
    expect(screen.getAllByText(/the plan is not awaiting plan review/i)).toHaveLength(2)
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

  it('opens directly to the validation tab with node and changed-file evidence', () => {
    render(<PlanReviewWorkspace detail={validationDetail} initialTab="validations" />)

    expect(screen.getByRole('tabpanel', { name: /validations/i })).toBeInTheDocument()
    expect(screen.getByText('browser-validation')).toBeInTheDocument()
    expect(screen.getByText('Required')).toBeInTheDocument()
    expect(screen.getByText('approved')).toBeInTheDocument()
    expect(screen.getByText('optional-validation')).toBeInTheDocument()
    expect(screen.getByText('deferred')).toBeInTheDocument()
    expect(screen.getByText('automation/steps/review.steps.ts :: validation review')).toBeInTheDocument()
    expect(screen.getByText('chromium/local')).toBeInTheDocument()
    expect(screen.getByText(/fails until the reviewed ui exists/i)).toBeInTheDocument()
    expect(screen.getAllByText('automation/features/review.feature').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('src/app/page.tsx')).toBeInTheDocument()
    expect(screen.getByText('production')).toBeInTheDocument()
    expect(screen.getAllByText('Declared')).toHaveLength(2)
    expect(screen.getAllByText('In manifest')).toHaveLength(2)
    expect(screen.getByText('Approved')).toBeInTheDocument()
  })

  it('submits validation node decisions, file approvals, validation review, and feedback actions', async () => {
    const user = userEvent.setup()
    decideValidationNodeAction.mockResolvedValueOnce({ success: false, error: 'Expected test stop.' })
    approveValidationFileAction.mockResolvedValueOnce({ success: false, error: 'Expected test stop.' })
    submitValidationReviewAction.mockResolvedValueOnce({ success: false, error: 'Expected test stop.' })
    submitValidationFeedbackAction.mockResolvedValueOnce({ success: false, error: 'Expected test stop.' })
    const needsFileApproval: PlanReviewDetail = {
      ...validationDetail,
      review: { ...validationDetail.review!, fileApprovals: [] },
      validationReview: {
        ...validationDetail.validationReview!,
        readiness: {
          ready: false,
          blockers: ['File src/app/page.tsx requires approval for its current content hash.'],
        },
      },
    }

    const { rerender } = render(<PlanReviewWorkspace detail={needsFileApproval} initialTab="validations" />)

    await user.click(screen.getAllByRole('button', { name: /^Approve$/i })[0]!)
    expect(decideValidationNodeAction).toHaveBeenCalledWith({
      planId: 'accessible-plan',
      validationId: 'browser-validation',
      decision: 'approved',
    })

    await user.click(screen.getByRole('button', { name: /approve file/i }))
    expect(approveValidationFileAction).toHaveBeenCalledWith({
      planId: 'accessible-plan',
      path: 'src/app/page.tsx',
    })

    await user.click(screen.getAllByRole('button', { name: /feedback/i })[0]!)
    await user.type(screen.getByRole('textbox', { name: /feedback/i }), 'Tighten this validation.')
    await user.click(screen.getByRole('button', { name: /submit validation feedback/i }))
    expect(submitValidationFeedbackAction).toHaveBeenCalledWith({
      planId: 'accessible-plan',
      scope: 'test_artifact',
      target: { type: 'validation', validationId: 'browser-validation' },
      body: 'Tighten this validation.',
      affectedValidationIds: ['browser-validation'],
      affectedFilePaths: undefined,
    })

    rerender(<PlanReviewWorkspace detail={validationDetail} initialTab="validations" />)
    await user.click(screen.getByRole('button', { name: /submit validation review/i }))
    expect(submitValidationReviewAction).toHaveBeenCalledWith({ planId: 'accessible-plan' })
  })
})
