import { z } from 'zod'

import type { McpRegistryContext } from '../registry.js'
import { text } from '../shared.js'

const identifier = z.string().min(1).max(200)

export function registerQualityJourneyCompatibilityOperations({ server, api }: McpRegistryContext) {
  server.registerTool(
    'quality_journey_compatibility_read',
    {
      description:
        'Read legacy Quality Plan history as a read-only compatibility projection. It does not establish Quality Journey lineage or authority.',
      inputSchema: {
        target: identifier,
        qualityPlanId: identifier.optional(),
        revisionId: identifier.optional(),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ target, qualityPlanId, revisionId, offset, limit }) => {
      const parameters = new URLSearchParams({ target })
      if (qualityPlanId !== undefined) parameters.set('qualityPlanId', qualityPlanId)
      if (revisionId !== undefined) parameters.set('revisionId', revisionId)
      if (offset !== undefined) parameters.set('offset', String(offset))
      if (limit !== undefined) parameters.set('limit', String(limit))
      return text(await api.request(`quality/compatibility?${parameters}`))
    },
  )
}
