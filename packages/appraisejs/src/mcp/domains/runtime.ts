import type { McpRegistryContext } from '../registry.js'
import { applyCapsuleDiagnosticMode, applyResponseMode, responseModeSchema, text, toolError, z } from '../shared.js'

export function registerRuntimeOperations(context: McpRegistryContext): void {
  const { server, api } = context
  server.registerTool(
    'test_run_preflight',
    {
      description:
        'Read-only blocker check before creating a managed target test run. Use this before plan-bound test_run calls.',
      inputSchema: {
        target: z.string().min(1).optional(),
        environmentId: z.string().min(1).optional(),
        planId: z.string().min(1).optional(),
        validationId: z.string().min(1).optional(),
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
    'test_run',
    {
      description:
        'Run existing Appraise-compatible Cucumber/Playwright artifacts from an attached target repository and record a managed Appraise test run.',
      inputSchema: {
        target: z.string().min(1),
        environmentId: z.string().min(1),
        name: z.string().min(1).optional(),
        tagExpression: z.string().optional(),
        testWorkersCount: z.number().int().positive().optional(),
        browserEngine: z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']).optional(),
        planId: z.string().min(1).optional(),
        validationId: z.string().min(1).optional(),
        implementationValidationRunId: z.string().min(1).optional(),
        featurePaths: z.array(z.string().min(1)).optional(),
        importPaths: z.array(z.string().min(1)).optional(),
        supportPaths: z.array(z.string().min(1)).optional(),
        prepareWorkspace: z.boolean().optional(),
        expectedTestCases: z
          .array(z.object({ testCaseId: z.string().min(1), testSuiteId: z.string().min(1) }))
          .optional(),
        responseMode: responseModeSchema,
      },
    },
    async ({ responseMode, ...input }) => {
      try {
        return text(applyResponseMode(await api.runTargetTests(input), responseMode))
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'test_run_read',
    {
      description: 'Read bounded status and evidence summary for a managed Appraise test run.',
      inputSchema: { runId: z.string().uuid(), planId: z.string().optional(), responseMode: responseModeSchema },
    },
    async ({ runId, planId, responseMode }) => {
      try {
        return text(applyResponseMode(await api.readTestRun(runId, planId), responseMode))
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'test_run_diagnose',
    {
      description: 'Diagnose invalid or suspicious managed test-run evidence with concise blockers and next action.',
      inputSchema: { runId: z.string().uuid(), planId: z.string().optional(), responseMode: responseModeSchema },
    },
    async ({ runId, planId, responseMode }) => {
      try {
        const result = (await api.diagnoseTestRun(runId, planId)) as {
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
