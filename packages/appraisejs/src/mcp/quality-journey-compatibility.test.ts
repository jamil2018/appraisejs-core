import { expect, it, vi } from 'vitest'

import { mcpToolAnnotations } from './contract.js'
import { registerQualityJourneyCompatibilityOperations } from './domains/quality-journey-compatibility.js'
import type { McpRegistryContext } from './registry.js'

it('forwards only read-only compatibility parameters', async () => {
  const handlers = new Map<string, (input: unknown) => Promise<unknown>>()
  const request = vi.fn().mockResolvedValue({})
  registerQualityJourneyCompatibilityOperations({
    server: {
      registerTool: (name: string, _config: unknown, handler: (input: unknown) => Promise<unknown>) =>
        handlers.set(name, handler),
    },
    api: { request },
  } as unknown as McpRegistryContext)

  expect([...handlers.keys()]).toEqual(['quality_journey_compatibility_read'])
  expect(mcpToolAnnotations('quality_journey_compatibility_read')).toMatchObject({ readOnlyHint: true })
  await handlers.get('quality_journey_compatibility_read')!({
    target: 'target one',
    qualityPlanId: 'plan-1',
    revisionId: 'revision-1',
    offset: 2,
    limit: 20,
  })
  expect(request).toHaveBeenCalledWith(
    'quality/compatibility?target=target+one&qualityPlanId=plan-1&revisionId=revision-1&offset=2&limit=20',
  )
})
