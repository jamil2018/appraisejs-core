import type { McpRegistryContext } from '../registry.js'
import { text, z } from '../shared.js'

export function registerStepDefinitionOperations({ server, api }: McpRegistryContext): void {
  server.registerTool(
    'step_definition_draft_read',
    {
      description: 'Read one exact Step Definition draft and its separate reviewed-extension artifact.',
      inputSchema: { draftId: z.string().uuid() },
    },
    async ({ draftId }) => text(await api.request(`step-definitions/drafts/${draftId}`)),
  )
}
