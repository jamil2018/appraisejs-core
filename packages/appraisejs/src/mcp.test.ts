import { realpath } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import {
  agentGuide,
  approvalPendingResponse,
  applyAuthoringResponseMode,
  applyEventResponseMode,
  applyLifecycleResponseMode,
  applyResponseMode,
  baselineRecoveryForLifecycle,
  buildAgentPreflight,
  canonicalExpectedTargetWorkspacePath,
  compactAgentPreflight,
  compactMcpCapabilityMetadata,
  compactProjectDiagnostic,
  createAppraiseMcpServer,
  diagnosticGuidance,
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
import { VALIDATION_AST_JSON_SCHEMA } from './managed-validation-contracts.js'

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
        planContentHash: 'sha256:test',
        planStateHash: 'sha256:state',
        reviewBindingHash: 'sha256:review',
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
      planContentHash: 'sha256:test',
      planStateHash: 'sha256:state',
      reviewBindingHash: 'sha256:review',
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
        'planContentHash',
        'planStateHash',
        'reviewBindingHash',
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

  it('preserves project scope when adding the validation-review query', () => {
    const response = validationReviewPendingResponse({
      planId: 'plan-1',
      current: {
        plan: { revision: 1, lifecycle: 'awaiting_validation_review' },
        contentHash: 'sha256:test',
        links: {
          appraise: 'appraise://plans/plan-1',
          browser: 'http://localhost:3000/plans/plan-1?project=project-1',
        },
      },
      events: [{ sequence: 6, type: 'validation_review_ready' }],
      afterSequence: 4,
    })

    expect(response.browserUrl).toBe('http://localhost:3000/plans/plan-1?project=project-1&review=validation')
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
  it('keeps planning and validation authoring summaries within their token budgets', () => {
    const compact = applyAuthoringResponseMode(
      {
        status: 'coverage_review_required',
        planId: 'plan-1',
        candidateHash: `sha256:${'a'.repeat(64)}`,
        taskShapeHash: `sha256:${'b'.repeat(64)}`,
        contextHash: `sha256:${'c'.repeat(64)}`,
        blockers: [{ code: 'missing_filtering' }],
        candidatePlan: { duplicatedDetail: 'x'.repeat(30_000) },
        nextRecommendedAction: 'Repair the task mapping.',
      },
      'summary',
    )
    expect(measureMcpResponse(compact).estimatedTokens).toBeLessThan(MCP_RESPONSE_TOKEN_BUDGETS.planCreation)
    expect(measureMcpResponse(compact).estimatedTokens).toBeLessThan(MCP_RESPONSE_TOKEN_BUDGETS.validationMutation)
  })

  it('flattens the review-ready planning handoff without repeating nested plan payloads', () => {
    const compact = applyAuthoringResponseMode(
      {
        created: { planId: 'plan-1', planContentHash: `sha256:${'a'.repeat(64)}`, duplicatedPlan: 'x'.repeat(20_000) },
        reviewReady: {
          planId: 'plan-1',
          goal: 'Build a focused notes app.',
          description: 'Users can create and search persistent notes.',
          lifecycle: 'awaiting_plan_review',
          revision: 1,
          planContentHash: `sha256:${'a'.repeat(64)}`,
          planStateHash: `sha256:${'b'.repeat(64)}`,
          reviewBindingHash: `sha256:${'c'.repeat(64)}`,
          browserUrl: 'http://localhost:3000/plans/plan-1?project=project-1',
          appraiseUrl: 'appraise://plans/plan-1',
          currentAfterSequence: 0,
          nextAfterSequence: 2,
          recommendedWait: { tool: 'plan_review_loop', afterSequence: 2, timeoutMs: 120_000 },
          duplicatedPlan: 'x'.repeat(20_000),
        },
        nextRequiredAgentBehavior: 'standby_for_appraise_review',
      },
      'summary',
    )

    expect(compact).toMatchObject({
      planId: 'plan-1',
      goal: 'Build a focused notes app.',
      description: 'Users can create and search persistent notes.',
      lifecycle: 'awaiting_plan_review',
      browserUrl: 'http://localhost:3000/plans/plan-1?project=project-1',
      nextAfterSequence: 2,
    })
    expect(compact).not.toHaveProperty('created')
    expect(compact).not.toHaveProperty('reviewReady')
    expect(measureMcpResponse(compact).estimatedTokens).toBeLessThan(MCP_RESPONSE_TOKEN_BUDGETS.planCreation)
  })

  it('summarizes validation resources as counts instead of returning the full Step Definition registry', () => {
    const compact = applyAuthoringResponseMode(
      {
        planId: 'plan-1',
        contextHash: `sha256:${'a'.repeat(64)}`,
        resources: {
          stepDefinitions: Array.from({ length: 35 }, (_, index) => ({
            id: `step-${index}`,
            version: '1',
            definitionHash: `sha256:${'a'.repeat(64)}`,
          })),
          modules: [],
          locators: [],
        },
      },
      'summary',
    )

    expect(compact).toMatchObject({
      returnedResourceCounts: { stepDefinitions: 35, modules: 0, locators: 0 },
      resourceSearchGuidance: expect.stringContaining('step_search'),
    })
    expect(compact).not.toHaveProperty('resources')
    expect(measureMcpResponse(compact).estimatedTokens).toBeLessThan(MCP_RESPONSE_TOKEN_BUDGETS.validationMutation)
  })

  it('keeps the bounded resource proposal contract in the default authoring response', () => {
    const compact = applyAuthoringResponseMode(
      {
        planId: 'plan-1',
        contextHash: `sha256:${'a'.repeat(64)}`,
        authoring: {
          contextPack: { duplicatedIntent: 'x'.repeat(20_000) },
          resourceProposalContract: {
            contractId: 'appraise.validation/resource-proposal',
            version: 2,
            request: {
              type: 'object',
              additionalProperties: false,
              required: ['schemaVersion', 'idempotencyKey'],
              properties: {
                schemaVersion: { const: 2 },
                idempotencyKey: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
              },
            },
            relationshipRules: [
              {
                id: 'locator-group-reference',
                appliesTo: ['locators[].groupKey'],
                rule: 'Each groupKey must reference locatorGroups[].localKey.',
              },
            ],
            example: {
              schemaVersion: 2,
              idempotencyKey: 'validation-resource-example',
              modules: [],
              locatorGroups: [],
              locators: [],
              environments: [],
            },
            responseBindingExample: {
              environments: [],
              locatorGroups: [],
              locators: [],
            },
          },
        },
      },
      'summary',
    )

    expect(compact).toMatchObject({
      resourceProposalContract: {
        contractId: 'appraise.validation/resource-proposal',
        version: 2,
        example: { schemaVersion: 2 },
      },
    })
    expect(compact).not.toHaveProperty('authoring')
    expect(measureMcpResponse(compact).estimatedTokens).toBeLessThan(MCP_RESPONSE_TOKEN_BUDGETS.validationMutation)
  })

  it('keeps the plan source hash and proposal bindings in validation authoring summaries', () => {
    const compact = applyAuthoringResponseMode(
      {
        plan: { planId: 'plan-1', sourceHash: `sha256:${'a'.repeat(64)}` },
        contextHash: `sha256:${'b'.repeat(64)}`,
        ids: { locators: { input: 'locator-row-id' }, environments: { local: 'environment-row-id' } },
        bindings: {
          locators: [
            {
              localKey: 'input',
              id: 'locator-row-id',
              astRef: 'locator_locator-row-id',
              version: '1',
              targetProjectId: 'project-1',
              moduleId: 'module-1',
            },
          ],
          environments: [{ localKey: 'local', id: 'environment-row-id', reference: 'environment-row-id' }],
        },
      },
      'summary',
    )

    expect(compact).toMatchObject({
      expectedPlanHash: `sha256:${'a'.repeat(64)}`,
      bindings: {
        locators: [
          {
            localKey: 'input',
            id: 'locator-row-id',
            astRef: 'locator_locator-row-id',
            version: '1',
          },
        ],
        environments: [{ localKey: 'local', id: 'environment-row-id', reference: 'environment-row-id' }],
      },
    })
    expect(compact).not.toHaveProperty('ids')
    expect(JSON.stringify(compact)).not.toContain('targetProjectId')
    expect(measureMcpResponse(compact).estimatedTokens).toBeLessThan(MCP_RESPONSE_TOKEN_BUDGETS.validationMutation)
  })

  it('publishes a versioned self-describing Validation AST schema', () => {
    expect(VALIDATION_AST_JSON_SCHEMA).toMatchObject({
      $id: 'appraise://contracts/validation-ast/v2',
      properties: {
        ast: { $ref: '#/$defs/ast' },
        stepDefinitionSelections: {
          type: 'array',
          minItems: 1,
          maxItems: 32,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['receiptId', 'correlationId'],
          },
        },
      },
      $defs: { ast: { properties: { scenarios: expect.any(Object) } } },
    })
    expect(VALIDATION_AST_JSON_SCHEMA.properties).not.toHaveProperty('stepDefinitionSelection')
  })

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

  it('keeps bounded failure signatures in compact test-run evidence', () => {
    expect(
      applyResponseMode(
        {
          executionRunId: 'run-1',
          evidenceHealth: 'valid',
          failureSignatures: ['Expected HomeChores but found SecondWife'],
          logExcerpt: Array.from({ length: 20 }, (_, index) => `unhelpful tail ${index}`),
        },
        'summary',
      ),
    ).toMatchObject({ failureSignatures: ['Expected HomeChores but found SecondWife'] })
  })

  it('preserves nested baseline attempt and test run evidence in compact lifecycle responses', () => {
    const compact = applyLifecycleResponseMode(
      {
        plan: { planId: 'plan-1', lifecycle: 'baseline_review', revision: 1 },
        validation: {
          baselineAttempts: [
            {
              id: 'attempt-1',
              testRunId: 'run-1',
              status: 'completed',
              classification: 'expected_product_failure',
            },
          ],
        },
      },
      'summary',
    )

    expect(compact).toMatchObject({
      planId: 'plan-1',
      attemptId: 'attempt-1',
      attemptIds: ['attempt-1'],
      testRunIds: ['run-1'],
      evidence: [
        expect.objectContaining({
          id: 'attempt-1',
          testRunId: 'run-1',
          classification: 'expected_product_failure',
        }),
      ],
    })
  })

  it('keeps the current validation hash required by baseline repair in summary mode', () => {
    const currentValidationHash = `sha256:${'b'.repeat(64)}`
    expect(
      applyLifecycleResponseMode({ planId: 'plan-1', lifecycle: 'baseline_review', currentValidationHash }, 'summary'),
    ).toMatchObject({ currentValidationHash })
  })

  it('compacts event payloads by default while preserving cursor metadata', () => {
    const batch = {
      planId: 'plan-1',
      events: [{ sequence: 7, type: 'validation_published', payload: { ast: 'x'.repeat(20_000) } }],
      latestEvent: { sequence: 7, type: 'validation_published', payload: { ast: 'x'.repeat(20_000) } },
      currentAfterSequence: 6,
      nextAfterSequence: 7,
    }

    expect(applyEventResponseMode(batch, 'summary')).toEqual({
      planId: 'plan-1',
      events: [{ sequence: 7, type: 'validation_published' }],
      latestEvent: { sequence: 7, type: 'validation_published' },
      currentAfterSequence: 6,
      nextAfterSequence: 7,
    })
    expect(applyEventResponseMode(batch, 'full')).toBe(batch)
  })

  it('projects the active baseline execution instead of historical attempt identities', () => {
    const compact = applyLifecycleResponseMode(
      {
        plan: { planId: 'plan-1', lifecycle: 'baseline_running', revision: 1 },
        validation: {
          baselineAttempts: [
            { id: 'historical-attempt', testRunId: 'historical-run', status: 'completed' },
            { id: 'current-attempt', testRunId: 'current-run', status: 'running' },
          ],
        },
        baselineExecution: {
          attempts: [
            {
              attemptId: 'current-attempt',
              testRunId: 'current-run',
              validationId: 'validation',
              status: 'running',
            },
          ],
        },
      },
      'summary',
    )

    expect(compact).toMatchObject({
      attemptId: 'current-attempt',
      attemptIds: ['current-attempt'],
      testRunIds: ['current-run'],
      evidence: [expect.objectContaining({ attemptId: 'current-attempt', testRunId: 'current-run' })],
    })
    expect(JSON.stringify(compact)).not.toContain('historical-attempt')
  })

  it('keeps implementation mutation results actionable in summary mode', () => {
    const compact = applyLifecycleResponseMode(
      {
        planId: 'plan-1',
        implementation: {
          taskStates: { foundation: 'verified', ui: 'in_progress' },
          approvedGroupIds: ['core'],
          validationRuns: [{ id: 'validation-run-1' }],
        },
        runnableTaskIds: ['ui'],
        readiness: { ready: false, blockers: ['Task ui is not verified.'] },
        nextAllowedAction: { tool: 'implementation_task_update', taskId: 'ui', status: 'implemented' },
      },
      'summary',
    )

    expect(compact).toMatchObject({
      planId: 'plan-1',
      approvedGroupIds: ['core'],
      runnableTaskIds: ['ui'],
      counts: { tasks: 2, verifiedTasks: 1, validationRuns: 1 },
      blockers: ['Task ui is not verified.'],
      nextAllowedAction: { tool: 'implementation_task_update', taskId: 'ui', status: 'implemented' },
    })
  })

  it('keeps completion receipts, bounded evidence counts, and final runs in summary mode', () => {
    const evidenceHash = `sha256:${'e'.repeat(64)}`
    const compact = applyLifecycleResponseMode(
      {
        plan: { planId: 'plan-1', lifecycle: 'validation_passed', revision: 1 },
        evidenceHash,
        eventSequence: 58,
        readiness: { ready: true, blockers: [] },
        tasks: [
          { id: 'foundation', status: 'verified', verbose: 'x'.repeat(10_000) },
          { id: 'quality', status: 'verified', verbose: 'x'.repeat(10_000) },
        ],
        validationRuns: [
          {
            id: 'implementation-run-1',
            validationId: 'happy-path',
            testRunId: 'test-run-1',
            status: 'passed',
            fresh: true,
            assurance: 'full',
            verbose: 'x'.repeat(10_000),
          },
        ],
        blockingRemarks: [],
        nonBlockingRemarks: [{ id: 'remark-1', verbose: 'x'.repeat(10_000) }],
        links: { browser: 'http://localhost:3000/plans/plan-1', appraise: 'appraise://plans/plan-1' },
      },
      'summary',
    )

    expect(compact).toMatchObject({
      planId: 'plan-1',
      lifecycle: 'validation_passed',
      evidenceHash,
      eventSequence: 58,
      ready: true,
      counts: { tasks: 2, verifiedTasks: 2, validationRuns: 1, blockingRemarks: 0, nonBlockingRemarks: 1 },
      runs: [
        {
          id: 'implementation-run-1',
          validationId: 'happy-path',
          testRunId: 'test-run-1',
          status: 'passed',
          fresh: true,
          assurance: 'full',
        },
      ],
      links: { browser: 'http://localhost:3000/plans/plan-1', appraise: 'appraise://plans/plan-1' },
    })
    expect(compact).not.toHaveProperty('tasks')
    expect(measureMcpResponse(compact).estimatedTokens).toBeLessThan(MCP_RESPONSE_TOKEN_BUDGETS.validationMutation)
  })

  it('does not repeat baseline attempts in implementation mutation summaries', () => {
    const compact = applyLifecycleResponseMode(
      {
        validation: {
          baselineAttempts: [{ id: 'baseline-attempt', testRunId: 'baseline-run', details: 'x'.repeat(10_000) }],
          implementation: {
            taskStates: { foundation: 'pending' },
            approvedGroupIds: ['core'],
            validationRuns: [],
          },
        },
        runs: [{ id: 'implementation-run', testRunId: 'current-run', status: 'running' }],
      },
      'summary',
    )

    expect(compact).toHaveProperty('evidence', undefined)
    expect(compact).toMatchObject({ runs: [{ id: 'implementation-run', testRunId: 'current-run' }] })
    expect(JSON.stringify(compact)).not.toContain('baseline-run')
  })

  it('projects direct implementation task updates without a stale checkpoint', () => {
    const compact = applyLifecycleResponseMode(
      {
        taskStates: { foundation: 'verified', ui: 'implemented' },
        approvedGroupIds: ['core'],
        checkpoint: { type: 'after_task', taskIds: ['foundation'] },
        validationRuns: [],
      },
      'summary',
    )

    expect(compact).toMatchObject({
      taskStates: { foundation: 'verified', ui: 'implemented' },
      approvedGroupIds: ['core'],
      counts: { tasks: 2, verifiedTasks: 1, validationRuns: 0 },
    })
    expect(compact).not.toHaveProperty('checkpoint')
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
})

describe('MCP capability and recovery metadata', () => {
  const diagnostic = {
    ok: true,
    hubProject: { cwd: '/hub', fingerprint: 'hub', canonicalPath: '/hub' },
    project: { cwd: '/hub', fingerprint: 'hub' },
    targetProjects: [{ canonicalPath: '/targets/secondwife' }],
    contractVersion: '1',
    baseUrl: 'http://127.0.0.1:3000',
    checks: [{ id: 'application', status: 'ok' as const, message: 'reachable' }],
    warnings: [],
    recommendedValidationBaseRevision: undefined,
    recoveryActions: [],
    links: { application: 'http://127.0.0.1:3000' },
  }

  it('canonicalizes filesystem aliases before comparing target bindings', async () => {
    await expect(canonicalExpectedTargetWorkspacePath('/var')).resolves.toBe(await realpath('/var'))
  })

  it('does not claim the immutable current-task capability snapshot without caller observations', () => {
    expect(buildAgentPreflight(diagnostic)).toMatchObject({
      status: 'needs_observation',
      ready: false,
      layers: {
        activeMcpTransport: { status: 'ready' },
        currentTaskCapabilities: { status: 'unverified' },
        targetProjectBinding: { status: 'not_applicable' },
      },
    })
  })

  it('reports ready when the current task sees all sentinels and the expected target is registered', () => {
    expect(
      buildAgentPreflight(diagnostic, {
        observedTools: compactMcpCapabilityMetadata.workflowSentinelTools,
        observedResources: compactMcpCapabilityMetadata.workflowSentinelResources,
        expectedTargetWorkspacePath: '/targets/secondwife',
      }),
    ).toMatchObject({
      status: 'ready',
      ready: true,
      layers: {
        currentTaskCapabilities: { status: 'ready' },
        targetProjectBinding: { status: 'ready', matchedScope: 'target' },
      },
    })
  })

  it('keeps the ready agent preflight compact without losing layer status', () => {
    const preflight = buildAgentPreflight(diagnostic, {
      observedTools: compactMcpCapabilityMetadata.workflowSentinelTools,
      observedResources: compactMcpCapabilityMetadata.workflowSentinelResources,
      expectedTargetWorkspacePath: '/targets/secondwife',
    })

    expect(compactAgentPreflight(preflight)).toMatchObject({
      status: 'ready',
      ready: true,
      layers: {
        currentTaskCapabilities: { status: 'ready', missingTools: [], missingResources: [] },
        targetProjectBinding: { status: 'ready', matchedScope: 'target' },
      },
    })
    expect(measureMcpResponse(compactAgentPreflight(preflight)).estimatedTokens).toBeLessThan(300)
  })

  it('blocks with exact missing capabilities before lifecycle work begins', () => {
    expect(
      buildAgentPreflight(diagnostic, {
        observedTools: ['project_diagnostic'],
        observedResources: [],
        expectedTargetWorkspacePath: '/targets/missing',
      }),
    ).toMatchObject({
      status: 'blocked',
      ready: false,
      layers: {
        currentTaskCapabilities: {
          status: 'blocked',
          tools: { missing: expect.arrayContaining(['planning_session_create']) },
          resources: { missing: expect.arrayContaining(['appraise://agent-guide']) },
        },
        targetProjectBinding: { status: 'blocked' },
      },
      recovery: { status: 'missing_or_stale' },
    })
  })

  it('registers contract and visual resources at distinct URIs', async () => {
    await expect(
      createAppraiseMcpServer({ cwd: process.cwd(), baseUrl: 'http://127.0.0.1:3000' }),
    ).resolves.toBeDefined()
  })

  it('exposes workflow-critical tools and resources for stale server checks', () => {
    expect(mcpCapabilityMetadata.packageVersion).toMatch(/^\d+\.\d+\.\d+/)
    expect(mcpCapabilityMetadata.workflowCriticalTools).toEqual(
      expect.arrayContaining([
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
    expect(mcpCapabilityMetadata.workflowCriticalTools).not.toContain('validation_decide')
    expect(mcpCapabilityMetadata.workflowResourceUris).toEqual(
      expect.arrayContaining([
        'appraise://project',
        'appraise://workflow/planning',
        'appraise://workflow/validation-preparation',
        'appraise://workflow/standby',
        'appraise://plans/{planId}',
        'appraise://plans/{planId}/validation-context',
        'appraise://plans/{planId}/validation-draft',
      ]),
    )
  })

  it('exposes the managed AST workflow before validation review is published', () => {
    expect(agentGuide.validationPreparationWorkflow).toBe(validationPreparationWorkflow)
    expect(validationPreparationWorkflow.preferredTool).toBe('validation_ast_compile')
    expect(validationPreparationWorkflow.artifactContract).toBe('appraise.validation-ast')
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

  it('keeps healthy project diagnostics bounded and routes target enumeration to project_list', () => {
    const fullDiagnostic = {
      ok: true,
      hubProject: { cwd: '/repo', fingerprint: 'sha256:hub', canonicalPath: '/repo' },
      project: { cwd: '/repo', fingerprint: 'sha256:hub' },
      targetProjects: Array.from({ length: 30 }, (_, index) => ({
        id: `target-${index}`,
        displayName: `Target ${index}`,
      })),
      contractVersion: 'test',
      baseUrl: 'http://127.0.0.1:3000',
      checks: [],
      warnings: [],
      recommendedValidationBaseRevision: undefined,
      recoveryActions: [],
      links: { application: 'http://127.0.0.1:3000' },
    }
    const compactDiagnostic = compactProjectDiagnostic(fullDiagnostic)
    const preflight = buildAgentPreflight(fullDiagnostic, {
      observedTools: compactMcpCapabilityMetadata.workflowSentinelTools,
      observedResources: compactMcpCapabilityMetadata.workflowSentinelResources,
      expectedTargetWorkspacePath: '/repo',
    })

    expect(compactDiagnostic).not.toHaveProperty('targetProjects')
    expect(compactDiagnostic).toMatchObject({
      targetProjectCount: 30,
      targetProjectDiscovery: expect.stringContaining('project_list'),
    })
    const response = {
      ...compactDiagnostic,
      agentPreflight: compactAgentPreflight(preflight),
      preflightReceipt: { id: 'receipt', status: 'ready', snapshotHash: 'sha256:receipt' },
      capabilities: compactMcpCapabilityMetadata,
      capabilityStatus: 'available',
      ...diagnosticGuidance(fullDiagnostic, preflight),
    }
    expect(response).toMatchObject({ nextRequiredAgentBehavior: 'start_explicit_target_planning' })
    expect(measureMcpResponse(response).estimatedTokens).toBeLessThan(MCP_RESPONSE_TOKEN_BUDGETS.diagnostic)
  })
})

describe('MCP planning session target selection', () => {
  it('returns structured recovery instead of silently creating a hub-scoped plan', () => {
    const response = planningSessionTargetRequiredResponse({
      planDescription: 'Agent-authored plan for a small recipe organizer app.',
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
