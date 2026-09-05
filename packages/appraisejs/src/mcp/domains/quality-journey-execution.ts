import { z } from 'zod'
import type { McpRegistryContext } from '../registry.js'
import { text } from '../shared.js'

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const ids = z
  .array(id)
  .min(1)
  .max(512)
  .refine(
    values =>
      new Set(values).size === values.length &&
      values.every((value, index) => index === 0 || values[index - 1] < value),
    'Identifiers must be unique and sorted.',
  )
const scope = { target: z.string().min(1), journeyId: id }
const command = { ...scope, expectedStateHash: hash, idempotencyKey: id }
const environment = {
  environmentId: id,
  browserEngine: z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']).default('CHROMIUM'),
  executionConsentId: id.optional(),
}
const reason = z.string().trim().min(1).max(8_000)

export const executionStartInput = z.object({ ...command, ...environment, preparedRuntimeCapsuleIds: ids }).strict()
export const executionCancelInput = z
  .object({ ...command, cycleId: id.optional(), testRunIds: ids.optional(), reason })
  .strict()
export const executionReconcileInput = z.object({ ...scope, cycleId: id, idempotencyKey: id }).strict()
export const rerunProposalInput = z
  .object({
    ...scope,
    sourceCycleId: id,
    sourceEvidenceReceiptIds: ids,
    selectedScenarioRevisionIds: ids,
    reason,
    idempotencyKey: id,
  })
  .strict()
export const rerunStartInput = z.object({ ...command, ...environment, proposalId: id }).strict()

/** User consent and rerun approval are deliberately issued only by the local UI. */
export function registerQualityJourneyExecutionOperations({ server, api }: McpRegistryContext) {
  server.registerTool(
    'quality_journey_execution_get',
    {
      description:
        'Read immutable Journey execution cycles, live TestRun links, ownership diagnostics, consent requests, rerun proposals and sealed evidence.',
      inputSchema: { ...scope, cycleId: id.optional() },
    },
    async ({ target, journeyId, cycleId }) => {
      const parameters = new URLSearchParams({ target, ...(cycleId ? { cycleId } : {}) })
      return text(await api.request(`quality/journeys/${journeyId}/execution/context?${parameters}`))
    },
  )
  const definitions = [
    {
      name: 'quality_journey_execution_start',
      path: 'start',
      schema: executionStartInput,
      description:
        'Start managed execution from exact prepared approved scenarios. Required consent must already be granted in Appraise.',
    },
    {
      name: 'quality_journey_execution_cancel',
      path: 'cancel',
      schema: executionCancelInput,
      description:
        'Request cancellation of exact Journey runs while preserving durable ownership and historical evidence.',
    },
    {
      name: 'quality_journey_execution_reconcile',
      path: 'reconcile',
      schema: executionReconcileInput,
      description: 'Reconcile managed terminal results and seal exact Journey evidence. This never launches a process.',
    },
    {
      name: 'quality_journey_rerun_propose',
      path: 'rerun-proposals',
      schema: rerunProposalInput,
      description:
        'Propose a selective rerun linked to exact predecessor evidence and scenario revisions; requires user approval in Appraise.',
    },
    {
      name: 'quality_journey_rerun_start',
      path: 'rerun-start',
      schema: rerunStartInput,
      description:
        'Start a new immutable cycle from a user-approved rerun proposal and any required execution consent.',
    },
  ] as const
  for (const definition of definitions) {
    server.registerTool(
      definition.name,
      { description: definition.description, inputSchema: definition.schema.shape },
      async (input: unknown) => {
        const { target, journeyId, ...body } = definition.schema.parse(input)
        return text(
          await api.request(`quality/journeys/${journeyId}/execution/${definition.path}`, {
            method: 'POST',
            body: JSON.stringify({ target, ...body }),
          }),
        )
      },
    )
  }
}
