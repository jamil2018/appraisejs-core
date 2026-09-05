import { z } from 'zod'
import type { McpRegistryContext } from '../registry.js'
import { text } from '../shared.js'

const identifier = z.string().min(1).max(200)
const scope = { target: z.string().min(1), journeyId: identifier }

export function registerQualityJourneyLibraryOperations({ server, api }: McpRegistryContext) {
  server.registerTool(
    'quality_journey_library_list',
    {
      description: 'Browse durable artifacts and historical revisions in one journey, including after closure.',
      inputSchema: {
        ...scope,
        kind: z.string().min(1).optional(),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ target, journeyId, kind, offset, limit }) => {
      const query = new URLSearchParams({ target })
      if (kind !== undefined) query.set('kind', kind)
      if (offset !== undefined) query.set('offset', String(offset))
      if (limit !== undefined) query.set('limit', String(limit))
      return text(await api.request(`quality/journeys/${encodeURIComponent(journeyId)}/library?${query}`))
    },
  )
  server.registerTool(
    'quality_journey_artifact_get',
    {
      description: 'Read one exact artifact-library entry within its owning journey and target.',
      inputSchema: { ...scope, entryId: z.string().min(1).max(512) },
    },
    async ({ target, journeyId, entryId }) =>
      text(
        await api.request(
          `quality/journeys/${encodeURIComponent(journeyId)}/library/${encodeURIComponent(entryId)}?${new URLSearchParams({ target })}`,
        ),
      ),
  )
  server.registerTool(
    'quality_journey_export',
    {
      description: 'Export a read-only journey artifact manifest and durable history, including closed journeys.',
      inputSchema: scope,
    },
    async ({ target, journeyId }) =>
      text(
        await api.request(
          `quality/journeys/${encodeURIComponent(journeyId)}/export?${new URLSearchParams({ target })}`,
        ),
      ),
  )
}
