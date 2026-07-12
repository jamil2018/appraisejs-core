import { describe, expect, it } from 'vitest'

import {
  agentGuide,
  approvalPendingResponse,
  applyLifecycleResponseMode,
  baselineRecoveryForLifecycle,
  createAppraiseMcpServer,
  createPlanFromBrief,
  latestGateEvent,
  mcpCapabilityMetadata,
  MCP_RESPONSE_TOKEN_BUDGETS,
  measureMcpResponse,
  missingCapabilityRecovery,
  normalizeOptionalRef,
  nextApprovalWaitSequence,
  orderedEventBatch,
  planningSessionTargetRequiredResponse,
  planningWorkflow,
  reviewReadyPendingResponse,
  standbyWorkflow,
  validationGateStatus,
  validationReviewPendingResponse,
  validationPreparationWorkflow,
} from './mcp.js'
import { assessPlanRequirements } from './plan-requirements.js'

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

  it('uses the latest validation gate event so changes requested supersedes stale approval', () => {
    const event = latestGateEvent(
      [
        { sequence: 4, type: 'validations_approved' },
        { sequence: 5, type: 'validation_changes_requested' },
      ],
      type => {
        if (type === 'validations_approved') return 'approved'
        if (type === 'validation_changes_requested') return 'changes_requested'
        return undefined
      },
    )

    expect(event).toEqual({ sequence: 5, type: 'validation_changes_requested' })
    expect(validationGateStatus('validation_changes_requested')).toBe('changes_requested')
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
    expect(response.handoffMarkdown).toContain('No wait call before complete URL handoff')
    expect(response.handoffMarkdown).toContain('Direct browser URL: http://127.0.0.1:3000/plans/plan-1')
    expect(response.handoffMarkdown).toContain('Plan ID: plan-1')
    expect(response.handoffMarkdown).toContain('Recommended wait call: plan_wait_for_approval')
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
      terminal: false,
      mustContinue: true,
      nextRequiredAgentBehavior: 'wait_for_plan_review_ready',
    })
    expect(response.reviewGatePause).toContain('Do not present the review as durable')
    expect(response.standbyPresentation.instruction).toContain('browser URL')
    expect(response.handoffMarkdown).toContain('No wait call before complete URL handoff')
    expect(response.handoffMarkdown).toContain('Recommended wait call: plan_review_loop')
  })

  it('returns a sub-kilobyte delta when a review wait has no new events', () => {
    const response = approvalPendingResponse({
      planId: 'plan-1',
      current: {
        plan: { revision: 2, lifecycle: 'awaiting_plan_review' },
        contentHash: 'sha256:test',
        links: {},
      },
      events: [],
      afterSequence: 4,
    })

    expect(response.status).toBe('pending_unchanged')
    expect(JSON.stringify(response).length).toBeLessThan(1_000)
    expect(response).not.toHaveProperty('handoffMarkdown')
  })

  it('returns a sub-kilobyte validation-review delta when no event changed', () => {
    const response = validationReviewPendingResponse({
      planId: 'plan-1',
      current: {
        plan: { revision: 1, lifecycle: 'awaiting_validation_review' },
        contentHash: 'sha256:test',
        links: {},
      },
      events: [],
      afterSequence: 9,
    })
    expect(response.status).toBe('pending_unchanged')
    expect(JSON.stringify(response).length).toBeLessThan(1_000)
    expect(response).not.toHaveProperty('links')
  })

  it('orders bounded event batches and projects the newest event', () => {
    expect(
      orderedEventBatch(3, [
        { sequence: 5, type: 'validation_review_ready' },
        { sequence: 2, type: 'ignored' },
        { sequence: 4, type: 'validation_changes_requested' },
      ]),
    ).toMatchObject({
      events: [{ sequence: 4 }, { sequence: 5 }],
      latestEvent: { sequence: 5, type: 'validation_review_ready' },
      nextAfterSequence: 5,
    })
  })
})

describe('compact lifecycle responses', () => {
  it('keeps compact lifecycle mutations inside the validation and baseline budgets', () => {
    const compact = applyLifecycleResponseMode(
      {
        planId: 'plan-1',
        lifecycle: 'validation_changes_requested',
        hash: `sha256:${'a'.repeat(64)}`,
        blockers: [{ code: 'FILE_MISSING', path: 'automation/steps/notes.steps.ts' }],
        links: { review: '/plans/plan-1' },
        nextAllowedAction: { tool: 'validation_context_read' },
        result: { repeatedArtifact: 'x'.repeat(20_000) },
      },
      'summary',
    )
    const measurement = measureMcpResponse(compact)

    expect(measurement.estimatedTokens).toBeLessThan(MCP_RESPONSE_TOKEN_BUDGETS.validationMutation)
    expect(measurement.estimatedTokens).toBeLessThan(MCP_RESPONSE_TOKEN_BUDGETS.baselineMutation)
    expect(measurement.duplicationRatio).toBeLessThan(0.5)
    expect(compact).toEqual(
      expect.objectContaining({ planId: 'plan-1', nextAllowedAction: { tool: 'validation_context_read' } }),
    )
  })

  it('normalizes empty optional validation references without hiding invalid values', () => {
    expect(normalizeOptionalRef('')).toBeUndefined()
    expect(normalizeOptionalRef('   ')).toBeUndefined()
    expect(normalizeOptionalRef('step-block:notes')).toBe('step-block:notes')
  })

  it('returns validation repair after a baseline harness failure transition', () => {
    expect(baselineRecoveryForLifecycle('validation_changes_requested')).toEqual(
      expect.objectContaining({
        nextRequiredAgentBehavior: 'revise_validation_artifacts',
        nextAllowedAction: { tool: 'validation_context_read' },
      }),
    )
  })

  const full = {
    plan: {
      planId: 'plan-1',
      lifecycle: 'baseline_running',
      revision: 2,
      tasks: Array.from({ length: 100 }, (_, id) => ({ id })),
    },
    attemptId: 'attempt-2',
    testRunId: 'run-2',
    evidenceSummary: { status: 'running' },
    blockers: [],
    manifestPaths: ['automation/features/test.feature'],
    nextRecommendedAction: 'Reconcile.',
  }

  it.each(['summary', 'evidenceOnly', 'blockersOnly', 'linksOnly'] as const)(
    'keeps %s actionable and bounded',
    mode => {
      const response = applyLifecycleResponseMode(full, mode)
      expect(JSON.stringify(response).length).toBeLessThan(2_000)
      expect(response).toHaveProperty('nextRecommendedAction', 'Reconcile.')
      expect(response).not.toHaveProperty('plan.tasks')
    },
  )
})

describe('plan requirement extraction', () => {
  it('ignores lifecycle completion prose while preserving explicit record completion', () => {
    const lifecycleOnly = assessPlanRequirements(
      'Build a motivation quotes app, run final validation, and complete the flow.',
      [],
    )
    expect(lifecycleOnly.requirements.map(requirement => requirement.id)).not.toContain('completion')

    const todoCompletion = assessPlanRequirements('Build a todo app where users complete and reactivate tasks.', [])
    expect(todoCompletion.requirements.map(requirement => requirement.id)).toContain('completion')
  })

  it('reduces API confidence when API language is negated', () => {
    const positive = assessPlanRequirements('Build an API app for weather lookup.', [])
    const negated = assessPlanRequirements('Build a local notes app, not an API app.', [])

    expect(
      positive.domainCandidates.find(candidate => candidate.domain === 'api-information')?.confidence,
    ).toBeGreaterThan(0)
    expect(negated.domainCandidates.find(candidate => candidate.domain === 'api-information')).toBeUndefined()
    expect(negated.selectedDomain).toBe('notes')
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
      projectBrief: 'Review the release checklist and prepare it for Appraise approval.',
      displayName: 'Release checklist review',
      sourceFiles: ['src/App.tsx'],
    })

    expect(plan).toMatchObject({
      version: '1',
      lifecycle: 'draft',
      goal: 'Release checklist review',
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

  it('creates weather-specific tasks for an API-backed information app brief', () => {
    const plan = createPlanFromBrief({
      projectBrief:
        'Build Weather Guy as a React Vite web app. Users enter a location, search the weather API, see current conditions and forecast details, and get clear loading and error states. Add focused validation.',
      displayName: 'Weather Guy',
    })

    const taskText = plan.tasks
      .map(task =>
        [task.id, task.title, task.description, task.acceptanceCriteria.join(' '), task.validationIntent].join(' '),
      )
      .join(' ')

    expect(plan.tasks.map(task => task.id)).toEqual([
      'scaffold-setup',
      'input-search',
      'api-integration',
      'result-rendering',
      'validation',
    ])
    expect(taskText).toMatch(/location|query/i)
    expect(taskText).toMatch(/weather API/i)
    expect(taskText).toMatch(/weather results|current conditions|forecast/i)
    expect(taskText).toMatch(/loading.*error|error.*loading/i)
    expect(taskText).not.toMatch(/\btodo\b|completion-toggle|completed items|CRUD/i)
    expect(taskText).not.toMatch(/persist/i)
  })

  it('keeps ambiguous app briefs reviewable instead of inventing todo behavior', () => {
    const plan = createPlanFromBrief({
      projectBrief: 'Build a small web app for comparing neighborhood ideas. Use React and make it easy to review.',
      displayName: 'Ideas app',
    })

    const taskText = plan.tasks.map(task => `${task.title} ${task.description}`).join(' ')
    expect(plan.tasks.map(task => task.id)).toEqual(['scaffold-setup', 'review-plan'])
    expect(taskText).toContain('preserving only behavior that appears in the brief')
    expect(taskText).not.toMatch(/\btodo\b|completion|CRUD|persistence/i)
  })

  it('states reviewable defaults for empty frontend app briefs', () => {
    const plan = createPlanFromBrief({
      projectBrief: 'Build a small todo web app with saved state.',
      displayName: 'Saved todo app',
    })

    expect(plan.tasks[0]).toMatchObject({
      id: 'scaffold-setup',
      description: expect.stringContaining('React 19, TypeScript, Vite, and local browser validation'),
      acceptanceCriteria: expect.arrayContaining([
        expect.stringContaining('React 19, TypeScript, Vite, and local browser validation'),
        'Stack assumptions are stated clearly in the review-ready plan.',
      ]),
    })
    expect(plan.tasks.find(task => task.id === 'persistence')?.description).toContain('saved state')
  })
})

describe('MCP capability and recovery metadata', () => {
  it('registers contract and visual resources at distinct URIs', async () => {
    await expect(
      createAppraiseMcpServer({ cwd: process.cwd(), baseUrl: 'http://127.0.0.1:3000' }),
    ).resolves.toBeDefined()
  })

  it('exposes workflow-critical tools and resources for stale server checks', () => {
    expect(mcpCapabilityMetadata.packageVersion).toMatch(/^\d+\.\d+\.\d+/)
    expect(mcpCapabilityMetadata.workflowCriticalTools).toEqual(
      expect.arrayContaining([
        'action_categories_list',
        'actions_list',
        'actions_read',
        'project_diagnostic',
        'planning_session_create',
        'plan_review_loop',
        'validation_context_read',
        'validation_ast_check',
        'validation_ast_preview',
        'validation_ast_compile',
        'validation_review_loop',
        'test_run_preflight',
        'test_run_read',
        'test_run_diagnose',
        'baseline_start',
        'baseline_reconcile',
        'baseline_accept',
        'implementation_start',
        'implementation_group_approve',
        'implementation_validation_start',
        'implementation_validation_reconcile',
        'implementation_completion_review',
      ]),
    )
    expect(mcpCapabilityMetadata.workflowResourceUris).toEqual(
      expect.arrayContaining([
        'appraise://actions/catalog',
        'appraise://actions/category/{categoryId}',
        'appraise://project',
        'appraise://workflow/planning',
        'appraise://workflow/validation-preparation',
        'appraise://workflow/standby',
        'appraise://resources/template-steps',
        'appraise://resources/locators',
      ]),
    )
  })

  it('exposes the v2-only AST workflow before validation review is published', () => {
    expect(agentGuide.validationPreparationWorkflow).toBe(validationPreparationWorkflow)
    expect(validationPreparationWorkflow.preferredTool).toBe('validation_ast_compile')
    expect(validationPreparationWorkflow.artifactContract).toBe('appraise.validation-ast/v2')
    expect(validationPreparationWorkflow.happyPath).toEqual(
      expect.arrayContaining([
        'validation_context_read',
        'validation_ast_check',
        'validation_ast_preview',
        'validation_ast_compile',
      ]),
    )
    expect(validationPreparationWorkflow.ownership).toContain('immutable runtime capsules')
    expect(validationPreparationWorkflow.recovery).not.toContain('validation_publish')
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

describe('brief requirement fidelity', () => {
  const reminderBrief =
    'Build a reminder app with a title, optional notes, due date and time, CRUD, completion and reactivation, active and completed filters, persistence, accessibility, responsive layouts, and automated tests.'

  it('keeps a reminder with optional notes out of the editor template', () => {
    const plan = createPlanFromBrief({ projectBrief: reminderBrief })

    expect(plan.tasks.map(task => task.id)).toEqual(
      expect.arrayContaining([
        'reminder-model-ui',
        'reminder-crud-completion',
        'reminder-filtering-persistence',
        'reminder-quality-validation',
      ]),
    )
    expect(plan.tasks.map(task => task.title).join(' ')).not.toContain('editor')
  })

  it('maps every explicit reminder requirement to a plan task surface', () => {
    const plan = createPlanFromBrief({ projectBrief: reminderBrief })
    const assessment = assessPlanRequirements(reminderBrief, plan.tasks)

    expect(assessment.selectedDomain).toBe('reminder')
    expect(assessment.uncoveredRequirementIds).toEqual([])
    expect(assessment.requirements.every(requirement => requirement.coveredBy.length > 0)).toBe(true)
    expect(assessment.requirements.map(requirement => requirement.id)).toEqual(
      expect.arrayContaining(['create', 'edit', 'delete']),
    )
  })

  it('does not let a notes field override a dominant product noun', () => {
    const brief = 'Build a recipe organizer with notes, tags, search, favorites, responsive layouts, and tests.'
    const plan = createPlanFromBrief({ projectBrief: brief })

    expect(plan.requirementAssessment?.selectedDomain).toBe('recipe-organizer')
    expect(
      plan.tasks
        .map(task => task.title)
        .join(' ')
        .toLowerCase(),
    ).not.toContain('editor')
  })

  it('creates a local notes plan without API or reminder-domain leakage', () => {
    const brief =
      'Build a local notes app, not an API app, with CRUD, persistence, deterministic ordering, search, accessibility, responsive layouts, and tests.'
    const plan = createPlanFromBrief({ projectBrief: brief })
    const taskText = plan.tasks.map(task => `${task.title} ${task.description} ${task.validationIntent}`).join(' ')

    expect(plan.requirementAssessment?.selectedDomain).toBe('notes')
    expect(plan.tasks.map(task => task.id)).toEqual([
      'scaffold-setup',
      'notes-crud',
      'notes-organization',
      'notes-quality',
    ])
    expect(taskText).toMatch(/CRUD|persistence|ordering|search|accessibility/i)
    expect(taskText).not.toMatch(/API integration|location query|weather results/i)
    expect(plan.requirementAssessment?.requirements.map(requirement => requirement.id)).not.toEqual(
      expect.arrayContaining(['reminder-title', 'reminder-notes', 'reminder-due-date-time']),
    )
  })

  it('does not count a generic brief echo as durable requirement coverage', () => {
    const brief = 'Create a garden planner with accessible responsive workflows and automated tests.'
    const plan = createPlanFromBrief({ projectBrief: brief })

    expect(plan.tasks).toHaveLength(1)
    expect(plan.requirementAssessment?.uncoveredRequirementIds).toEqual(
      expect.arrayContaining(['accessibility', 'responsive', 'testing']),
    )
  })

  it('requires quality requirements in both acceptance and validation surfaces', () => {
    const assessment = assessPlanRequirements('Build an accessible responsive app with tests.', [
      {
        id: 'quality-only-in-acceptance',
        description: 'Build the interface.',
        acceptanceCriteria: ['The interface is accessible and responsive.'],
        validationIntent: 'Run tests for the interface.',
      },
    ])

    expect(assessment.uncoveredRequirementIds).toEqual(expect.arrayContaining(['accessibility', 'responsive']))
    expect(assessment.uncoveredRequirementIds).not.toContain('testing')
  })
})
