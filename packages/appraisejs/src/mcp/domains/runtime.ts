import type { McpRegistryContext } from '../registry.js'
import { applyCapsuleDiagnosticMode, applyResponseMode, responseModeSchema, text, toolError, z } from '../shared.js'

export function registerRuntimeOperations(context: McpRegistryContext): void {
  const { server, api } = context
  server.registerTool(
    'test_run_start',
    {
      description:
        'Start an independent capsule-only TestRun from an exact published validation or target-owned authored suite/case selection. Independent runs never create Assessment evidence.',
      inputSchema: {
        target: z.string().min(1),
        environmentId: z.string().min(1),
        name: z.string().min(1).max(200),
        source: z.discriminatedUnion('sourceKind', [
          z.object({
            sourceKind: z.literal('PUBLISHED_VALIDATION'),
            publicationId: z.string().min(1),
            validationVersionId: z.string().min(1),
            idempotencyKey: z.string().min(1),
          }),
          z.object({
            sourceKind: z.literal('AUTHORED_TEST_SNAPSHOT'),
            selections: z
              .array(z.object({ testSuiteId: z.string().min(1), testCaseId: z.string().min(1) }))
              .min(1)
              .max(200),
          }),
        ]),
        browserEngine: z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']).optional(),
        responseMode: responseModeSchema,
      },
    },
    async ({ responseMode, source, ...input }) => {
      try {
        const result = await api.request('test-runs', {
          method: 'POST',
          body: JSON.stringify({ ...input, ...source }),
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
      description:
        'Read bounded status and evidence summary for a managed Appraise test run. A human-verification block is terminal and requires a fresh TestRun; it cannot be resumed.',
      inputSchema: { target: z.string().min(1), runId: z.string().uuid(), responseMode: responseModeSchema },
    },
    async ({ target, runId, responseMode }) => {
      try {
        return text(applyResponseMode(await api.readTestRun(runId, target), responseMode))
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'test_run_diagnose',
    {
      description: 'Diagnose invalid or suspicious managed test-run evidence with concise blockers and next action.',
      inputSchema: { target: z.string().min(1), runId: z.string().uuid(), responseMode: responseModeSchema },
    },
    async ({ target, runId, responseMode }) => {
      try {
        const result = (await api.diagnoseTestRun(runId, target)) as {
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
