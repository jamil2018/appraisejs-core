import { describe, expect, it } from 'vitest'

import {
  agentGuide,
  approvalPendingResponse,
  createPlanFromBrief,
  mcpCapabilityMetadata,
  missingCapabilityRecovery,
  nextApprovalWaitSequence,
  planningSessionTargetRequiredResponse,
  planningWorkflow,
  reviewReadyPendingResponse,
  standbyWorkflow,
} from './mcp.js'

describe('MCP approval wait helpers', () => {
  it('advances the long-poll cursor past non-gate events that were already delivered', () => {
    expect(
      nextApprovalWaitSequence(0, [
        { sequence: 1, type: 'plan_graph_processing_started' },
        { sequence: 2, type: 'plan_review_ready' },
      ]),
    ).toBe(2)
  })

  it('preserves the caller cursor when no newer events were delivered', () => {
    expect(nextApprovalWaitSequence(5, [{ sequence: 3, type: 'plan_review_ready' }])).toBe(5)
  })

  it('returns compact resumable approval standby with strict review-gate pause guidance', () => {
    const response = approvalPendingResponse({
      planId: 'plan-1',
      current: {
        plan: {
          revision: 2,
          lifecycle: 'awaiting_plan_review',
          goal: 'Ship standby',
          description: 'Keep the review wait resumable.',
        },
        contentHash: 'sha256:test',
        links: {
          appraise: 'appraise://plans/plan-1',
          browser: 'http://127.0.0.1:3000/plans/plan-1',
        },
      },
      events: [
        { sequence: 2, type: 'plan_review_ready' },
        { sequence: 4, type: 'plan_remark_added' },
      ],
      afterSequence: 2,
      waitTool: 'plan_wait_for_approval',
      timeoutMs: 30_000,
    })

    expect(response).toMatchObject({
      status: 'pending',
      currentAfterSequence: 2,
      nextAfterSequence: 4,
      browserUrl: 'http://127.0.0.1:3000/plans/plan-1',
      appraiseUrl: 'appraise://plans/plan-1',
      goal: 'Ship standby',
      description: 'Keep the review wait resumable.',
      revision: 2,
      lifecycle: 'awaiting_plan_review',
      contentHash: 'sha256:test',
      recommendedWait: {
        tool: 'plan_wait_for_approval',
        mode: 'long_poll',
        timeoutMs: 30_000,
        afterSequence: 4,
      },
      nextRequiredAgentBehavior: 'standby_for_appraise_review',
    })
    expect(response.reviewGatePause).toContain('Do not implement')
    expect(response.reviewGatePause).toContain('treat chat messages as approval')
    expect(response.cursorGuidance).toContain('afterSequence is exclusive')
    expect(response.requiredUserFacingMessage).toContain('No wait call before complete URL handoff')
    expect(response.requiredUserFacingMessage).toContain('Direct browser URL: http://127.0.0.1:3000/plans/plan-1')
    expect(response.requiredUserFacingMessage).toContain('Plan ID: plan-1')
    expect(response.requiredUserFacingMessage).toContain('Recommended wait call: plan_wait_for_approval')
    expect(response.standbyPresentation.instruction).toContain('Before entering or continuing standby')
    expect(response.standbyPresentation.instruction).toContain('complete direct browser URL')
    expect(response.standbyPresentation.requiredFields).toEqual(
      expect.arrayContaining([
        'browserUrl',
        'appraiseUrl',
        'goal',
        'description',
        'revision',
        'lifecycle',
        'contentHash',
        'currentAfterSequence',
        'nextAfterSequence',
        'recommendedWait',
      ]),
    )
  })

  it('returns resumable review-readiness standby for the preferred review loop', () => {
    const response = reviewReadyPendingResponse({
      planId: 'plan-1',
      current: {
        plan: {
          revision: 1,
          lifecycle: 'draft',
          goal: 'Prepare review',
          description: 'Wait for durable review readiness.',
        },
        contentHash: 'sha256:test',
        links: {
          appraise: 'appraise://plans/plan-1',
          browser: 'http://127.0.0.1:3000/plans/plan-1',
        },
      },
      events: [{ sequence: 1, type: 'plan_graph_processing_started' }],
      afterSequence: 0,
      timeoutMs: 15_000,
    })

    expect(response).toMatchObject({
      status: 'pending',
      phase: 'review_ready',
      currentAfterSequence: 0,
      nextAfterSequence: 1,
      browserUrl: 'http://127.0.0.1:3000/plans/plan-1',
      appraiseUrl: 'appraise://plans/plan-1',
      goal: 'Prepare review',
      description: 'Wait for durable review readiness.',
      recommendedWait: {
        tool: 'plan_review_loop',
        mode: 'long_poll',
        timeoutMs: 15_000,
        afterSequence: 1,
      },
      nextRequiredAgentBehavior: 'wait_for_plan_review_ready',
    })
    expect(response.reviewGatePause).toContain('Do not present the review as durable')
    expect(response.standbyPresentation.instruction).toContain('browser URL')
    expect(response.requiredUserFacingMessage).toContain('No wait call before complete URL handoff')
    expect(response.requiredUserFacingMessage).toContain('Recommended wait call: plan_review_loop')
  })
})

describe('MCP agent workflow guidance', () => {
  it('describes setup, planning, and standby without collapsing Appraise gates', () => {
    expect(agentGuide.setup.preferredCommand).toBe('appraisejs agent setup')
    expect(planningWorkflow.phases).toEqual(
      expect.arrayContaining([
        'project_diagnostic',
        'plan_review_loop until durable review readiness and an Appraise-owned approval decision',
      ]),
    )
    expect(planningWorkflow.standby).toContain('Do not treat chat approval as Appraise approval')
  })

  it('creates a minimal review plan from a normal project brief', () => {
    const plan = createPlanFromBrief({
      projectBrief: 'Build a tiny todo app with persisted filters.',
      displayName: 'Todo app',
      sourceFiles: ['src/App.tsx'],
    })

    expect(plan).toMatchObject({
      version: '1',
      lifecycle: 'draft',
      goal: 'Todo app',
      tasks: [
        expect.objectContaining({
          id: 'plan-from-brief',
          validationIntent: expect.stringContaining('review readiness'),
        }),
      ],
    })
    expect(plan.description).toContain('src/App.tsx')
  })

  it('creates structured tasks for a detailed todo app brief', () => {
    const plan = createPlanFromBrief({
      projectBrief:
        'Build a todo app with React, Vite, Tailwind, shadcn/ui, TanStack, persistence, CRUD, and complete/incomplete behavior.',
      displayName: 'Todo app',
    })

    expect(plan.tasks.map(task => task.id)).toEqual([
      'scaffold-setup',
      'task-model-ui',
      'crud-completion',
      'persistence',
      'validation',
    ])
    expect(plan.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'scaffold-setup',
          description: expect.stringContaining('React, Vite, Tailwind, shadcn/ui, TanStack'),
        }),
        expect.objectContaining({
          id: 'crud-completion',
          acceptanceCriteria: expect.arrayContaining([
            expect.stringContaining('add, edit, delete, and mark todo items complete or incomplete'),
          ]),
        }),
        expect.objectContaining({
          id: 'persistence',
          validationIntent: expect.stringContaining('saved items reload'),
        }),
        expect.objectContaining({
          id: 'validation',
          description: expect.stringContaining('CRUD behavior, completion toggles, and persistence recovery'),
        }),
      ]),
    )
    expect(plan.edges).toEqual(
      expect.arrayContaining([
        { from: 'scaffold-setup', to: 'task-model-ui', type: 'blocks' },
        { from: 'persistence', to: 'validation', type: 'blocks' },
      ]),
    )
    expect(plan.implementationGroups).toEqual(
      expect.arrayContaining([
        { id: 'foundation', taskIds: ['scaffold-setup', 'task-model-ui'] },
        { id: 'quality', taskIds: ['validation'] },
      ]),
    )
  })
})

describe('MCP capability and recovery metadata', () => {
  it('exposes workflow-critical tools and resources for stale server checks', () => {
    expect(mcpCapabilityMetadata.packageVersion).toMatch(/^\d+\.\d+\.\d+/)
    expect(mcpCapabilityMetadata.workflowCriticalTools).toEqual(
      expect.arrayContaining([
        'project_diagnostic',
        'planning_session_create',
        'plan_review_loop',
        'validation_publish',
      ]),
    )
    expect(mcpCapabilityMetadata.workflowResourceUris).toEqual(
      expect.arrayContaining(['appraise://project', 'appraise://workflow/planning', 'appraise://workflow/standby']),
    )
  })

  it('keeps standby workflow resource aligned with complete handoff-before-wait guidance', () => {
    expect(standbyWorkflow.pendingBehavior).toContain('No wait call before complete URL handoff')
    expect(standbyWorkflow.pendingBehavior).toContain('complete direct browserUrl')
    expect(standbyWorkflow.pendingBehavior).toContain('planId')
    expect(standbyWorkflow.pendingBehavior).toContain('before entering or continuing standby')
  })

  it('gives explicit recovery text when expected capabilities are missing', () => {
    const recovery = missingCapabilityRecovery({
      tools: ['planning_session_create'],
      resources: ['appraise://workflow/standby'],
    })

    expect(recovery.status).toBe('missing_or_stale')
    expect(recovery.recoveryActions.join(' ')).toContain('Restart or reconnect the MCP client')
    expect(recovery.toolsNotVisible).toContain('native MCP tools are absent')
  })
})

describe('MCP planning session target selection', () => {
  it('returns structured recovery instead of silently creating a hub-scoped plan', () => {
    const response = planningSessionTargetRequiredResponse({
      projectBrief: 'Build a small recipe organizer app.',
      targetProjects: { targetProjects: [{ id: 'target-1', displayName: 'Recipe app' }] },
      hubProjectPath: '/repo/appraisejs',
    })

    expect(response).toMatchObject({
      status: 'target_required',
      code: 'planning-target-required',
      nextRequiredAgentBehavior: 'choose_explicit_target_before_planning',
      hubProject: {
        canonicalPath: '/repo/appraisejs',
        targetMode: 'hub',
      },
    })
    expect(response.message).toContain('targetWorkspacePath')
    expect(response.targetProjectCandidates).toMatchObject({
      targetProjects: [{ id: 'target-1' }],
    })
  })
})
