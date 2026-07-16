import type { McpRegistryContext } from '../registry.js'
import {
  CoordinatorRequestError,
  applyLifecycleResponseMode,
  baselineRecoveryForLifecycle,
  lifecycleToolPayload,
  responseModeSchema,
  text,
  toolError,
  z,
} from '../shared.js'

export function registerBaselineOperations(context: McpRegistryContext): void {
  const { server, api } = context
  server.registerTool(
    'baseline_start',
    {
      description: 'Agent-owned execution tool: start required baseline executions after validation review approval.',
      inputSchema: { planId: z.string(), responseMode: responseModeSchema },
    },
    async ({ planId, responseMode }) =>
      text(
        applyLifecycleResponseMode(
          lifecycleToolPayload({
            planId,
            result: await api.request(`plans/${planId}/baseline/start`, { method: 'POST', body: '{}' }),
            nextRecommendedAction: 'Call baseline_reconcile until baseline evidence enters review.',
            nextRequiredAgentBehavior: 'reconcile_baseline',
            nextAllowedAction: { tool: 'baseline_reconcile' },
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'baseline_reconcile',
    {
      description: 'Agent-owned execution tool: refresh baseline evidence and detect when review is ready.',
      inputSchema: { planId: z.string(), responseMode: responseModeSchema },
    },
    async ({ planId, responseMode }) => {
      const result = await api.request(`plans/${planId}/baseline/reconcile`, { method: 'POST', body: '{}' })
      const lifecycle =
        result && typeof result === 'object' && 'plan' in result
          ? (result as { plan?: { lifecycle?: string } }).plan?.lifecycle
          : undefined
      const recovery = baselineRecoveryForLifecycle(lifecycle)
      return text(
        applyLifecycleResponseMode(
          lifecycleToolPayload({
            planId,
            result,
            ...recovery,
          }),
          responseMode,
        ),
      )
    },
  )

  server.registerTool(
    'baseline_cancel',
    {
      description:
        'Explicit user/Appraise interrupt relay: cancel active baseline executions and return the plan to baseline changes requested.',
      inputSchema: { planId: z.string(), responseMode: responseModeSchema },
    },
    async ({ planId, responseMode }) =>
      text(
        applyLifecycleResponseMode(
          lifecycleToolPayload({
            planId,
            result: await api.request(`plans/${planId}/baseline/cancel`, { method: 'POST', body: '{}' }),
            nextRecommendedAction: 'Revise validation or baseline setup, then call baseline_start again when ready.',
            nextRequiredAgentBehavior: 'revise_baseline_or_validation',
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'baseline_retry',
    {
      description:
        'Return invalid baseline evidence to validation repair while preserving historical attempts and requiring a fresh exact review.',
      inputSchema: {
        planId: z.string(),
        reason: z.string().trim().min(1),
        expectedValidationHash: z.string().startsWith('sha256:'),
      },
    },
    async ({ planId, reason, expectedValidationHash }) => {
      try {
        return text(
          lifecycleToolPayload({
            planId,
            result: await api.request(`plans/${planId}/baseline/retry`, {
              method: 'POST',
              body: JSON.stringify({ reason, expectedValidationHash }),
            }),
            nextRecommendedAction:
              'Repair the managed Validation AST and submit it through check, preview, and compile for fresh review.',
            nextRequiredAgentBehavior: 'revise_validation_artifacts',
            nextAllowedAction: { tool: 'validation_context_read' },
          }),
        )
      } catch (error) {
        if (error instanceof CoordinatorRequestError) return toolError(error)
        throw error
      }
    },
  )

  server.registerTool(
    'baseline_failure_acknowledge',
    {
      description:
        'Explicit user/Appraise decision relay: acknowledge a current unrelated baseline failure by attempt id.',
      inputSchema: { planId: z.string(), attemptId: z.string(), acknowledgedBy: z.string().min(1) },
    },
    async ({ planId, attemptId, acknowledgedBy }) =>
      text(
        lifecycleToolPayload({
          planId,
          result: await api.request(`plans/${planId}/baseline/failures/${attemptId}/acknowledge`, {
            method: 'POST',
            body: JSON.stringify({ acknowledgedBy }),
          }),
          nextRecommendedAction: 'Continue baseline review and call baseline_accept when all blockers are resolved.',
          nextRequiredAgentBehavior: 'review_and_accept_baseline',
          nextAllowedAction: { tool: 'baseline_accept' },
        }),
      ),
  )

  server.registerTool(
    'baseline_regression_justify',
    {
      description:
        'Explicit user/Appraise decision relay: justify an accepted regression-pass baseline attempt before baseline acceptance.',
      inputSchema: { planId: z.string(), attemptId: z.string(), justification: z.string().min(1) },
    },
    async ({ planId, attemptId, justification }) =>
      text(
        lifecycleToolPayload({
          planId,
          result: await api.request(`plans/${planId}/baseline/regressions/${attemptId}/justify`, {
            method: 'POST',
            body: JSON.stringify({ justification }),
          }),
          nextRecommendedAction: 'Continue baseline review and call baseline_accept when all blockers are resolved.',
          nextRequiredAgentBehavior: 'review_and_accept_baseline',
          nextAllowedAction: { tool: 'baseline_accept' },
        }),
      ),
  )

  server.registerTool(
    'baseline_accept',
    {
      description: 'Explicit user/Appraise decision relay: accept complete baseline evidence.',
      inputSchema: { planId: z.string() },
    },
    async ({ planId }) =>
      text(
        lifecycleToolPayload({
          planId,
          result: await api.request(`plans/${planId}/baseline/accept`, { method: 'POST', body: '{}' }),
          nextRecommendedAction: 'Call implementation_start before recording implementation checkpoints.',
          nextRequiredAgentBehavior: 'start_implementation',
          nextAllowedAction: { tool: 'implementation_start' },
        }),
      ),
  )
}
