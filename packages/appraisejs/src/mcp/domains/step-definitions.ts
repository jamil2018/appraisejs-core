import type { McpRegistryContext } from '../registry.js'
import { text, z } from '../shared.js'

const draftMutationSchema = {
  draftId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
}

export function registerStepDefinitionOperations({ server, api }: McpRegistryContext): void {
  server.registerTool(
    'step_definition_draft_create',
    {
      description: 'Create a bounded non-executable Step Definition draft after searching ready definitions.',
      inputSchema: { definition: z.unknown(), reuseJustification: z.string().min(1).max(2_000) },
    },
    async ({ definition }) =>
      text(await api.request('step-definitions/drafts', { method: 'POST', body: JSON.stringify(definition) })),
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

  server.registerTool(
    'step_definition_draft_submit_for_review',
    {
      description: 'Bind exact human review authority to a validated draft and reviewed artifact hash.',
      inputSchema: { ...draftMutationSchema, reviewAuthority: z.string().min(1).max(200) },
    },
    async ({ draftId, ...body }) =>
      text(
        await api.request(`step-definitions/drafts/${draftId}/review`, { method: 'POST', body: JSON.stringify(body) }),
      ),
  )

  server.registerTool(
    'step_definition_publish',
    {
      description: 'Atomically publish the exact reviewed draft as one immutable ready Step Definition.',
      inputSchema: { ...draftMutationSchema, conformanceRunId: z.string().min(1).max(200) },
    },
    async ({ draftId, ...body }) =>
      text(
        await api.request(`step-definitions/drafts/${draftId}/publish`, { method: 'POST', body: JSON.stringify(body) }),
      ),
  )

  server.registerTool(
    'step_definition_deprecate',
    {
      description: 'Deprecate an immutable ready definition while preserving historical resolution.',
      inputSchema: {
        stepId: z.string().min(1),
        version: z.string().min(1),
        reason: z.string().min(1).max(2_000),
        actor: z.string().min(1).max(200),
        replacement: z.object({ id: z.string().min(1), version: z.string().min(1) }).optional(),
      },
    },
    async ({ stepId, version, ...body }) =>
      text(
        await api.request(`step-definitions/definitions/${stepId}/${version}/deprecate`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      ),
  )
}
