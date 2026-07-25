import type { McpRegistryContext } from '../registry.js'
import { text, z } from '../shared.js'

const draftMutationSchema = {
  draftId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
}
const reuseEvidenceSchema = z.object({
  indexHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  searchedAt: z.string().datetime(),
  planId: z.string().min(1).max(200).optional(),
  correlationId: z.string().regex(/^[a-zA-Z0-9._:-]{1,100}$/),
  candidateReferences: z.array(z.object({ id: z.string().min(1).max(200), version: z.string().min(1).max(40) })).max(25),
  receiptId: z.string().uuid(),
  reuseJustification: z.string().min(1).max(2_000),
})

export function registerStepDefinitionOperations({ server, api }: McpRegistryContext): void {
  server.registerTool(
    'step_definition_draft_create',
    {
      description: 'Create a bounded non-executable Step Definition draft after searching ready definitions.',
      inputSchema: { definition: z.unknown(), reuseEvidence: reuseEvidenceSchema },
    },
    async ({ definition, reuseEvidence }) =>
      text(
        await api.request('step-definitions/drafts', {
          method: 'POST',
          body: JSON.stringify({ definition, reuseEvidence }),
        }),
      ),
  )

  server.registerTool(
    'step_definition_draft_read',
    {
      description: 'Read one exact Step Definition draft and its separate reviewed-extension artifact.',
      inputSchema: { draftId: z.string().uuid() },
    },
    async ({ draftId }) => text(await api.request(`step-definitions/drafts/${draftId}`)),
  )

  server.registerTool(
    'step_definition_draft_update',
    {
      description: 'Revise a draft with optimistic concurrency; ready definitions are never mutated.',
      inputSchema: { ...draftMutationSchema, definition: z.unknown() },
    },
    async ({ draftId, ...body }) =>
      text(
        await api.request(`step-definitions/drafts/${draftId}/update`, { method: 'POST', body: JSON.stringify(body) }),
      ),
  )

  for (const action of ['validate', 'preview'] as const)
    server.registerTool(
      `step_definition_draft_${action}`,
      {
        description: `${action} an exact Step Definition draft through the shared registry service.`,
        inputSchema: draftMutationSchema,
      },
      async ({ draftId, ...body }) =>
        text(
          await api.request(`step-definitions/drafts/${draftId}/${action}`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
        ),
    )

  server.registerTool(
    'step_definition_draft_artifact_save',
    {
      description: 'Save user-authored handler source and explicit examples separately from definition metadata.',
      inputSchema: { ...draftMutationSchema, artifact: z.unknown() },
    },
    async ({ draftId, ...body }) =>
      text(
        await api.request(`step-definitions/drafts/${draftId}/artifact`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      ),
  )

  server.registerTool(
    'step_definition_draft_compile',
    {
      description: 'Compile and run bounded conformance for the exact saved reviewed-extension artifact.',
      inputSchema: draftMutationSchema,
    },
    async ({ draftId, ...body }) =>
      text(
        await api.request(`step-definitions/drafts/${draftId}/compile`, { method: 'POST', body: JSON.stringify(body) }),
      ),
  )
}
