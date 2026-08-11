import type { McpRegistryContext } from '../registry.js'
import { applyCapsuleDiagnosticMode, applyResponseMode, responseModeSchema, text, toolError, z } from '../shared.js'

export function registerRuntimeOperations(context: McpRegistryContext): void {
  const { server, api } = context
  server.registerTool(
    'test_run_preflight',
    {
      description: 'Read-only blocker check before Assessment-owned managed test execution.',
      inputSchema: {
        target: z.string().min(1).optional(),
        environmentId: z.string().min(1).optional(),
        qualityPlanId: z.string().min(1).optional(),
        validationVersionId: z.string().min(1).optional(),
        featurePaths: z.array(z.string().min(1)).optional(),
        importPaths: z.array(z.string().min(1)).optional(),
        supportPaths: z.array(z.string().min(1)).optional(),
        responseMode: responseModeSchema,
      },
    },
    async ({ responseMode, ...input }) => {
      try {
        const result = await api.request('test-runs/preflight', {
          method: 'POST',
          body: JSON.stringify(input),
        })
        return text(applyResponseMode(result, responseMode))
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'test_run_read',
    {
      description: 'Read bounded status and evidence summary for a managed Appraise test run.',
      inputSchema: { runId: z.string().uuid(), responseMode: responseModeSchema },
    },
    async ({ runId, responseMode }) => {
      try {
        return text(applyResponseMode(await api.readTestRun(runId), responseMode))
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'test_run_diagnose',
    {
      description: 'Diagnose invalid or suspicious managed test-run evidence with concise blockers and next action.',
      inputSchema: { runId: z.string().uuid(), responseMode: responseModeSchema },
    },
    async ({ runId, responseMode }) => {
      try {
        const result = (await api.diagnoseTestRun(runId)) as {
          kind?: string
          diagnostic?: unknown
          evidence?: unknown
        }
        const exactDto = result.kind === 'capsule' ? result.diagnostic : (result.evidence ?? result)
        return text(
          result.kind === 'capsule'
            ? applyCapsuleDiagnosticMode(exactDto, responseMode)
            : applyResponseMode(exactDto, responseMode),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
