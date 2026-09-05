import { z } from 'zod'
import { expect, it, vi } from 'vitest'
import { registerQualityJourneyLibraryOperations } from './domains/quality-journey-library.js'
import { mcpToolAnnotations } from './contract.js'
import type { McpRegistryContext } from './registry.js'

it('exposes scoped read-only history without closure decision authority', async () => {
  const handlers = new Map<string, (input: unknown) => Promise<unknown>>()
  const request = vi.fn().mockResolvedValue({})
  registerQualityJourneyLibraryOperations({
    server: {
      registerTool: (name: string, _config: unknown, handler: (input: unknown) => Promise<unknown>) =>
        handlers.set(name, handler),
    },
    api: { request },
  } as unknown as McpRegistryContext)
  expect([...handlers.keys()]).toEqual([
    'quality_journey_library_list',
    'quality_journey_artifact_get',
    'quality_journey_export',
  ])
  for (const name of handlers.keys()) expect(mcpToolAnnotations(name)?.readOnlyHint).toBe(true)
  await handlers.get('quality_journey_library_list')!({
    target: 'target one',
    journeyId: 'journey-1',
    kind: 'JOURNEY_CLOSURE',
    offset: 10,
    limit: 20,
  })
  expect(request).toHaveBeenLastCalledWith(
    'quality/journeys/journey-1/library?target=target+one&kind=JOURNEY_CLOSURE&offset=10&limit=20',
  )
  await handlers.get('quality_journey_artifact_get')!({
    target: 'target',
    journeyId: 'journey-1',
    entryId: 'artifact:receipt',
  })
  expect(request).toHaveBeenLastCalledWith('quality/journeys/journey-1/library/artifact%3Areceipt?target=target')
  await handlers.get('quality_journey_export')!({ target: 'target', journeyId: 'journey-1' })
  expect(request).toHaveBeenLastCalledWith('quality/journeys/journey-1/export?target=target')
})

it('accepts library identities formed from maximum length report and finding IDs', () => {
  let schema: z.ZodRawShape | undefined
  registerQualityJourneyLibraryOperations({
    server: {
      registerTool: (name: string, config: { inputSchema: z.ZodRawShape }) => {
        if (name === 'quality_journey_artifact_get') schema = config.inputSchema
      },
    },
    api: { request: vi.fn() },
  } as unknown as McpRegistryContext)
  const input = {
    target: 'target',
    journeyId: 'j'.repeat(200),
    entryId: `TRIAGE_FINDING:${'r'.repeat(200)}:${'f'.repeat(200)}`,
  }
  expect(z.object(schema!).parse(input)).toEqual(input)
  expect(z.object(schema!).safeParse({ ...input, entryId: 'x'.repeat(513) }).success).toBe(false)
})
