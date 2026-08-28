import { z } from 'zod'
import type { McpRegistryContext } from '../registry.js'
import { text } from '../shared.js'

const journeyId = z.string().min(1)
const target = z.string().min(1)

export function registerQualityJourneyOperations({ server, api }: McpRegistryContext): void {
  server.registerTool(
    'quality_journey_create',
    {
      description: 'Create or replay one durable target-bound Quality Journey at the intake gate.',
      inputSchema: { target, idempotencyKey: z.string().min(1), requirement: z.unknown() },
    },
    async body => text(await api.request('quality/journeys', { method: 'POST', body: JSON.stringify(body) })),
  )
  server.registerTool(
    'quality_journey_get',
    {
      description: 'Read the authoritative Quality Journey projection, work items, blockers, and event stream.',
      inputSchema: { target, journeyId },
    },
    async ({ target: targetRef, journeyId: id }) =>
      text(await api.request(`quality/journeys/${id}?target=${encodeURIComponent(targetRef)}`)),
  )
  server.registerTool(
    'quality_journey_resume',
    {
      description: 'Reconstruct runner state, expire elapsed leases, and make replacement work reclaimable.',
      inputSchema: { target, journeyId },
    },
    async ({ target: targetRef, journeyId: id }) =>
      text(
        await api.request(`quality/journeys/${id}/resume`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_command_submit',
    {
      description: 'Submit one exact-state, idempotent Appraise-owned Quality Journey lifecycle command.',
      inputSchema: { target, journeyId, command: z.record(z.string(), z.unknown()) },
    },
    async ({ target: targetRef, journeyId: id, command }) =>
      text(
        await api.request(`quality/journeys/${id}/commands`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, command }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_work_claim',
    {
      description: 'Atomically claim one eligible role work item and receive its bounded lease authority.',
      inputSchema: {
        target,
        journeyId,
        role: z.enum([
          'REQUIREMENT_ANALYZER',
          'SCOUT',
          'RESOURCE_EXPLORER',
          'TEST_SCENARIO_DESIGNER',
          'AUTOMATOR',
          'TRIAGER',
        ]),
        leaseSeconds: z.number().int().min(30).max(900).optional(),
      },
    },
    async ({ target: targetRef, journeyId: id, ...body }) =>
      text(
        await api.request(`quality/journeys/${id}/work/claim`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_work_complete',
    {
      description: 'Complete an exact claimed work attempt with a contract-bound worker result envelope.',
      inputSchema: {
        target,
        journeyId,
        workItemId: z.string().min(1),
        leaseId: z.string().min(1),
        ownerToken: z.string().min(1),
        result: z.record(z.string(), z.unknown()),
      },
    },
    async ({ target: targetRef, journeyId: id, workItemId, ...body }) =>
      text(
        await api.request(`quality/journeys/${id}/work/${workItemId}/complete`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_artifacts_list',
    {
      description: 'List revision, cycle, and artifact-link lineage for one exact Quality Journey.',
      inputSchema: { target, journeyId },
    },
    async ({ target: targetRef, journeyId: id }) =>
      text(await api.request(`quality/journeys/${id}/artifacts?target=${encodeURIComponent(targetRef)}`)),
  )
}
