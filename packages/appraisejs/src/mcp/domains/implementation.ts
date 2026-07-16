import type { McpRegistryContext } from '../registry.js'
import {
  applyLifecycleResponseMode,
  implementationValidationRunInputSchema,
  lifecycleToolPayload,
  responseModeSchema,
  text,
  z,
} from '../shared.js'

export function registerImplementationOperations(context: McpRegistryContext): void {
  const { server, api } = context
  server.registerTool(
    'implementation_start',
    {
      description: 'Agent-owned execution tool: start implementation after accepted baseline evidence.',
      inputSchema: { planId: z.string(), responseMode: responseModeSchema },
    },
    async ({ planId, responseMode }) =>
      text(
        applyLifecycleResponseMode(
          lifecycleToolPayload({
            planId,
            result: await api.request(`plans/${planId}/implementation/start`, { method: 'POST', body: '{}' }),
            nextRecommendedAction: 'Approve the first implementation group, then update a returned runnable task.',
            nextRequiredAgentBehavior: 'approve_implementation_group',
            nextAllowedAction: { tool: 'implementation_group_approve' },
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'implementation_checkpoint',
    {
      description: 'Reach an implementation checkpoint and receive currently runnable tasks.',
      inputSchema: {
        planId: z.string(),
        type: z.enum([
          'before_task',
          'after_task',
          'before_group',
          'after_group',
          'before_validation',
          'before_completion',
        ]),
        taskIds: z.array(z.string()).optional(),
        queuedFeedbackCount: z.number().int().nonnegative().optional(),
        responseMode: responseModeSchema,
      },
    },
    async ({ planId, responseMode, ...body }) =>
      text(
        applyLifecycleResponseMode(
          await api.request(`plans/${planId}/implementation/checkpoint`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'implementation_group_approve',
    {
      description: 'Approve implementation groups and receive currently runnable task IDs.',
      inputSchema: {
        planId: z.string(),
        groupIds: z.array(z.string().min(1)).min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ planId, groupIds, responseMode }) =>
      text(
        applyLifecycleResponseMode(
          lifecycleToolPayload({
            planId,
            result: await api.request(`plans/${planId}/implementation/groups`, {
              method: 'POST',
              body: JSON.stringify({ groupIds }),
            }),
            nextRecommendedAction: 'Start one of the returned runnable tasks.',
            nextRequiredAgentBehavior: 'start_runnable_task',
            nextAllowedAction: { tool: 'implementation_task_update', status: 'in_progress' },
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'implementation_task_update',
    {
      description: 'Move an implementation task through pending, in progress, implemented, and verified.',
      inputSchema: {
        planId: z.string(),
        taskId: z.string(),
        status: z.enum(['pending', 'in_progress', 'implemented', 'verified']),
        commitHash: z.string().optional(),
        responseMode: responseModeSchema,
      },
    },
    async ({ planId, taskId, responseMode, ...body }) =>
      text(
        applyLifecycleResponseMode(
          await api.request(`plans/${planId}/implementation/tasks/${taskId}`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'implementation_validation_record',
    {
      description:
        'Record exceptional manual implementation validation evidence. This is always reduced assurance and does not replace managed Appraise TestRun evidence for required runtime validations.',
      inputSchema: {
        planId: z.string(),
        run: implementationValidationRunInputSchema,
        responseMode: responseModeSchema,
      },
    },
    async ({ planId, run, responseMode }) =>
      text(
        applyLifecycleResponseMode(
          await api.request(`plans/${planId}/implementation/validations`, {
            method: 'POST',
            body: JSON.stringify({ run }),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'implementation_validation_start',
    {
      description:
        'Create agent-owned, plan-bound implementation validation run records and return bound test_run inputs to execute through Appraise.',
      inputSchema: {
        planId: z.string(),
        validationIds: z.array(z.string().min(1)).optional(),
        commitHash: z.string().min(1).optional(),
        responseMode: responseModeSchema.optional(),
      },
    },
    async ({ planId, validationIds, commitHash, responseMode }) =>
      text(
        applyLifecycleResponseMode(
          lifecycleToolPayload({
            planId,
            result: await api.request(`plans/${planId}/implementation/validations/start`, {
              method: 'POST',
              body: JSON.stringify({ validationIds, commitHash }),
            }),
            nextRecommendedAction:
              'Managed runtime capsules start automatically. Call implementation_validation_reconcile with the returned implementation run IDs until evidence is terminal.',
            nextRequiredAgentBehavior: 'reconcile_bound_test_runs',
            nextAllowedAction: { tool: 'implementation_validation_reconcile' },
          }),
          responseMode ?? 'summary',
        ),
      ),
  )

  server.registerTool(
    'implementation_validation_reconcile',
    {
      description:
        'Reconcile Appraise-owned validation runs by implementation run id or public TestRun id, and optionally verify implemented tasks atomically with an idempotency key.',
      inputSchema: {
        planId: z.string(),
        runIds: z.array(z.string().min(1)).optional(),
        verifyTaskIds: z.array(z.string().min(1)).optional(),
        idempotencyKey: z.string().min(1).optional(),
        responseMode: responseModeSchema,
      },
    },
    async ({ planId, runIds, verifyTaskIds, idempotencyKey, responseMode }) =>
      text(
        applyLifecycleResponseMode(
          lifecycleToolPayload({
            planId,
            result: await api.request(`plans/${planId}/implementation/validations/reconcile`, {
              method: 'POST',
              body: JSON.stringify({ runIds, verifyTaskIds, idempotencyKey }),
            }),
            nextRecommendedAction:
              'If readiness is blocked, inspect test_run_diagnose for invalid evidence; otherwise continue toward implementation_completion_review.',
            nextRequiredAgentBehavior: 'inspect_validation_readiness_then_continue',
            nextAllowedAction: { tool: 'implementation_completion_review' },
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'implementation_feedback',
    {
      description: 'Analyze and, after user confirmation, apply blocking feedback impact.',
      inputSchema: {
        planId: z.string(),
        affectedTaskIds: z.array(z.string()).min(1),
        confirmed: z.boolean(),
        pausePlanWide: z.boolean().optional(),
        responseMode: responseModeSchema,
      },
    },
    async ({ planId, responseMode, ...body }) =>
      text(
        applyLifecycleResponseMode(
          await api.request(`plans/${planId}/implementation/feedback`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'implementation_control',
    {
      description: 'Pause, resume, or cancel implementation; cancellation separately controls active runs.',
      inputSchema: {
        planId: z.string(),
        action: z.enum(['pause', 'resume', 'cancel']),
        stopActiveRuns: z.boolean().optional(),
        responseMode: responseModeSchema,
      },
    },
    async ({ planId, responseMode, ...body }) =>
      text(
        applyLifecycleResponseMode(
          await api.request(`plans/${planId}/implementation/control`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'implementation_completion_review',
    {
      description: 'Read final task, commit, validation, evidence, failure, and remark review data.',
      inputSchema: { planId: z.string(), responseMode: responseModeSchema },
    },
    async ({ planId, responseMode }) =>
      text(applyLifecycleResponseMode(await api.request(`plans/${planId}/completion`), responseMode)),
  )

  server.registerTool(
    'implementation_complete',
    {
      description: 'Explicit user/Appraise decision relay: complete a validation-passed plan after final approval.',
      inputSchema: {
        planId: z.string(),
        approvedBy: z.string(),
        contentHash: z.string(),
        responseMode: responseModeSchema,
      },
    },
    async ({ planId, responseMode, ...body }) =>
      text(
        applyLifecycleResponseMode(
          await api.request(`plans/${planId}/implementation/complete`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )
}
